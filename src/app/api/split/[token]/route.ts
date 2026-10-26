import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { createSnapTransaction } from "@/lib/midtrans";

import { reconcilePayment } from "@/lib/payment-reconciliation";
import { requestBudget } from "@/lib/request-security";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ token: string }> };
type Part = { id: string; label: string; amount: number; status: string; snap_token: string | null; midtrans_order_id: string | null };
async function lookup(token: string) {
  const hash = createHash("sha256").update(token).digest("hex");
  return supabaseAdmin.from("split_bills")
    .select("id,order_id,total_amount,status,expires_at,parts:split_bill_parts(id,label,amount,status,snap_token,midtrans_order_id,paid_at)")
    .eq("invite_token_hash", hash).maybeSingle();
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
    const limited=await requestBudget(request,"split-refresh",12,60,data.id);
    if(limited)return limited;
    const parts = (data.parts || []) as Part[];
    for (const part of parts) {
      if (part.status !== "pending" || !part.midtrans_order_id) continue;
      try {
        await reconcilePayment(part.midtrans_order_id);
      } catch {
        // Keep the last known state; a transient status API failure should not invalidate the invite.
      }
    }

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

  let reservedReference: string | null = null;
  try {
    const externalId = `SPLIT-${part.id.replace(/-/g, "").slice(0, 25)}-${randomBytes(8).toString("hex")}`;
    const {data:reserved,error:reserveError}=await supabaseAdmin.rpc("reserve_split_attempt",{p_part:part.id,p_reference:externalId});
    if(reserveError || !reserved)return NextResponse.json({error:"Pembayaran sedang disiapkan atau perlu diperiksa."},{status:409});
    reservedReference=externalId;
    const transaction = await createSnapTransaction({
      orderId: externalId,
      amount: Number(part.amount),
      items: [{ id: part.id, name: part.label, price: Number(part.amount), quantity: 1 }],
      finishUrl: new URL(`/split/${encodeURIComponent(token)}`, request.nextUrl.origin).toString(),
    });
    const {error:attemptError}=await supabaseAdmin.from("split_bill_payment_attempts").update({snap_token:transaction.token}).eq("midtrans_order_id",externalId);
    if (attemptError) throw new Error("Riwayat pembayaran gagal disimpan");
    const { data: updated, error } = await supabaseAdmin.from("split_bill_parts")
      .update({ creation_state:"ready", snap_token: transaction.token, midtrans_order_id: externalId, paid_at: null })
      .eq("id", part.id).eq("creation_state","creating").eq("midtrans_order_id",externalId).select("id").maybeSingle();
    if (error || !updated) throw new Error("Status pembayaran berubah");
    return NextResponse.json({ data: { token: transaction.token } });
  } catch (error) {
    if(reservedReference)await supabaseAdmin.from("split_bill_parts").update({creation_state:"uncertain"}).eq("id",part.id).eq("midtrans_order_id",reservedReference).eq("creation_state","creating");
    console.error("Split bill Snap token creation failed:", error);
    return NextResponse.json({ error: "Snap belum bisa dibuat. Coba lagi sebentar." }, { status: 502 });
  }
}
