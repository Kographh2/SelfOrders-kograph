import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { createSnapTransaction, snap } from "@/lib/midtrans";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ token: string }> };
type Part = { id: string; label: string; amount: number; status: string; snap_token: string | null; midtrans_order_id: string | null };
async function lookup(token: string) {
  const hash = createHash("sha256").update(token).digest("hex");
  return supabaseAdmin.from("split_bills")
    .select("id,order_id,total_amount,status,expires_at,parts:split_bill_parts(id,label,amount,status,snap_token,midtrans_order_id,paid_at)")
    .eq("invite_token_hash", hash).maybeSingle();
}
function mapStatus(status: string, fraudStatus?: string) {
  if (status === "settlement" || (status === "capture" && fraudStatus === "accept")) return "paid";
  if (status === "expire") return "expired";
  if (["deny", "failure", "cancel", "refund", "partial_refund"].includes(status)) return "failed";
  return "pending";
}
async function syncBillPaid(billId: string, orderId: string) {
  const { data: parts } = await supabaseAdmin.from("split_bill_parts").select("status").eq("split_bill_id", billId);
  if (!parts?.length || !parts.every(part => part.status === "paid")) return;
  const { data: bill } = await supabaseAdmin.from("split_bills").update({ status: "paid" }).eq("id", billId).eq("status", "active").select("id").maybeSingle();
  if (bill) {
    await supabaseAdmin.from("orders").update({ payment_status: "paid", status: "confirmed", payment_method: "split", updated_at: new Date().toISOString() }).eq("id", orderId).eq("payment_status", "pending");
    await supabaseAdmin.from("payments").update({ status: "paid", method: "split", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("order_id", orderId);
  }
}

export async function GET(request: NextRequest, { params }: Context) {
  const { token } = await params;
  const { data, error } = await lookup(token);
  if (error || !data) return NextResponse.json({ error: "Undangan split bill tidak valid" }, { status: 404 });
  if (new Date(data.expires_at) < new Date() && data.status === "active") {
    const { data: expired } = await supabaseAdmin.from("split_bills").update({ status: "expired" }).eq("id", data.id).eq("status", "active").select("id").maybeSingle();
    if (expired) data.status = "expired";
  }

  // The optional explicit check asks Midtrans directly in case its notification is delayed.
  if (request.nextUrl.searchParams.get("refresh") === "1" && data.status === "active") {
    const parts = (data.parts || []) as Part[];
    for (const part of parts) {
      if (part.status !== "pending" || !part.midtrans_order_id) continue;
      try {
        const transaction = await snap.transaction.status(part.midtrans_order_id);
        const nextStatus = mapStatus(transaction.transaction_status, transaction.fraud_status);
        if (nextStatus !== "pending") {
          await supabaseAdmin.from("split_bill_parts").update({ status: nextStatus, paid_at: nextStatus === "paid" ? new Date().toISOString() : null }).eq("id", part.id).eq("status", "pending").eq("midtrans_order_id", part.midtrans_order_id);
        }
      } catch {
        // Keep the last known state; a transient status API failure should not invalidate the invite.
      }
    }
    await syncBillPaid(data.id, data.order_id);
  }
  const { data: refreshed, error: refreshError } = await lookup(token);
  if (refreshError || !refreshed) return NextResponse.json({ error: "Status split bill gagal dimuat" }, { status: 500 });
  return NextResponse.json({ data: refreshed });
}

export async function POST(request: NextRequest, { params }: Context) {
  const { token } = await params;
  const body = await request.json().catch(() => ({}));
  const partId = String(body.partId || "");
  const { data: bill } = await lookup(token);
  if (!bill || bill.status !== "active" || new Date(bill.expires_at) < new Date()) return NextResponse.json({ error: "Split bill sudah kedaluwarsa atau ditutup" }, { status: 410 });
  const part = ((bill.parts || []) as Part[]).find(row => row.id === partId);
  if (!part || !["pending", "failed", "expired"].includes(part.status)) return NextResponse.json({ error: "Bagian tagihan tidak tersedia" }, { status: 409 });
  if (part.snap_token && part.status === "pending") return NextResponse.json({ data: { token: part.snap_token } });

  try {
    const externalId = `SPLIT-${part.id.replace(/-/g, "").slice(0, 25)}-${randomBytes(8).toString("hex")}`;
    const transaction = await createSnapTransaction({
      orderId: externalId,
      amount: Number(part.amount),
      items: [{ id: part.id, name: part.label, price: Number(part.amount), quantity: 1 }],
      finishUrl: new URL(`/split/${encodeURIComponent(token)}`, request.nextUrl.origin).toString(),
    });
    const { error: attemptError } = await supabaseAdmin.from("split_bill_payment_attempts").insert({
      split_bill_id: bill.id, split_bill_part_id: part.id, midtrans_order_id: externalId,
      snap_token: transaction.token, amount: Number(part.amount), status: "pending",
    });
    if (attemptError) return NextResponse.json({ error: "Riwayat percobaan pembayaran gagal disimpan" }, { status: 500 });
    const { data: updated, error } = await supabaseAdmin.from("split_bill_parts")
      .update({ status: "pending", snap_token: transaction.token, midtrans_order_id: externalId, paid_at: null })
      .eq("id", part.id).eq("status", part.status).select("id").maybeSingle();
    if (error || !updated) return NextResponse.json({ error: error?.message || "Status bagian tagihan berubah. Muat ulang lalu coba lagi." }, { status: 409 });
    return NextResponse.json({ data: { token: transaction.token } });
  } catch (error) {
    console.error("Split bill Snap token creation failed:", error);
    return NextResponse.json({ error: "Snap belum bisa dibuat. Coba lagi sebentar." }, { status: 502 });
  }
}
