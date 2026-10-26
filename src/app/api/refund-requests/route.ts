import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, hasStoreAccess, isOwnerOrAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-server";
import { writeAudit } from "@/lib/audit";

import { boundedJson, sameOrigin, requestBudget } from "@/lib/request-security";
import { guestSession } from "@/lib/guest-session";

export const dynamic = "force-dynamic";
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!isOwnerOrAdmin(user)) return fail("Akses owner/admin diperlukan", 403);
  const storeId = request.nextUrl.searchParams.get("storeId") || user?.storeId || "";
  if (!storeId || !hasStoreAccess(user, storeId)) return fail("Cabang tidak valid", 403);
  const { data, error } = await supabaseAdmin.from("refund_requests")
    .select("*,order:orders(id,order_number,customer_name,total_amount,payment_method,payment_status,status),requester:users!refund_requests_requester_id_fkey(name,email),reviewer:users!refund_requests_reviewer_id_fkey(name)")
    .eq("store_id", storeId).order("created_at", { ascending: false }).limit(200);
  if (error) return fail(error.message, 500);
  return NextResponse.json({ data: data || [] });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!sameOrigin(request)) return fail("Origin tidak valid", 403);
  const limited = await requestBudget(request, "refund", 10, 60, user?.userId || guestSession(request) || undefined);
  if (limited) return limited;
  let body;
  try { body = await boundedJson(request, 4096); } catch { return fail("Permintaan tidak valid"); }
  const orderId = String(body.orderId || "");

  if (body.action === "request") {
    if (!orderId) return fail("Order diperlukan", 400);
    const sessionId = guestSession(request);
    const { data: order } = await supabaseAdmin.from("orders").select("id,store_id,user_id,anonymous_session_id,total_amount,payment_status,payment_method,status")
      .eq("id", orderId).maybeSingle();
    const ownsOrder = Boolean(order && ((user?.userId && user.userId === order.user_id) || (sessionId && sessionId === order.anonymous_session_id)));
    if (!order || !ownsOrder || order.payment_status !== "paid") return fail("Pesanan tidak ditemukan, bukan milik sesi ini, atau belum dibayar", 404);
    const amount = Math.round(Number(body.amount || order.total_amount));
    const reason = String(body.reason || "").trim().slice(0, 1000);
    if (!reason || !Number.isSafeInteger(amount) || amount < 1 || amount > Number(order.total_amount)) return fail("Nominal dan alasan refund tidak valid");
    const { data: previousRefunds, error: historyError } = await supabaseAdmin.from("refund_requests").select("amount,status").eq("order_id", order.id).in("status", ["requested", "approved", "processing", "completed"]);
    if (historyError) return fail(historyError.message, 500);
    const alreadyRefundedOrHeld = (previousRefunds || []).reduce((sum, row) => sum + Number(row.amount), 0);
    if (amount > Number(order.total_amount) - alreadyRefundedOrHeld) return fail("Nominal melebihi sisa jumlah yang dapat direfund", 409);
    const { data, error } = await supabaseAdmin.from("refund_requests").insert({ order_id: order.id, store_id: order.store_id, requester_id: user?.userId || null, amount, reason }).select().single();
    if (error) return fail(error.code === "23505" ? "Masih ada permintaan refund aktif untuk pesanan ini" : error.message, 409);
    return NextResponse.json({ data }, { status: 201 });
  }

  if (body.action === "review") {
    if (user?.role !== "owner") return fail("Persetujuan refund hanya dapat dilakukan owner", 403);
    const requestId = String(body.requestId || "");
    const decision = String(body.decision || "");
    const reviewerNote = String(body.reviewerNote || "").trim().slice(0, 1000) || null;
    if (!requestId || !["approve", "reject", "manual_complete"].includes(decision)) return fail("Keputusan tidak valid");
    const { data: refund } = await supabaseAdmin.from("refund_requests").select("*,order:orders(id,total_amount,payment_status,payment_method)").eq("id", requestId).maybeSingle();
    if (!refund || !hasStoreAccess(user, refund.store_id)) return fail("Permintaan refund tidak ditemukan", 404);
    if (refund.status !== "requested") return fail("Permintaan refund sudah ditinjau", 409);
    const order = Array.isArray(refund.order) ? refund.order[0] : refund.order;
    if (!order) return fail("Data pesanan tidak ditemukan", 404);
    if (decision === "reject") {
      const { data, error } = await supabaseAdmin.from("refund_requests").update({ status: "rejected", reviewer_id: user!.userId, reviewer_note: reviewerNote, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", requestId).eq("status", "requested").select().maybeSingle();
      if (error || !data) return fail(error?.message || "Permintaan sudah berubah", 409);
      await writeAudit(user!, refund.store_id, "refund.reject", "refund_request", requestId, refund, { status: data.status, reviewerNote });
      return NextResponse.json({ data });
    }

    if (decision === "manual_complete") {
      if (order.payment_method === "snap") return fail("Pembayaran Snap harus diproses melalui Midtrans", 409);
      if (!reviewerNote) return fail("Catat bukti atau keterangan pengembalian dana manual");
      const { data, error } = await supabaseAdmin.rpc("complete_manual_refund", { p_refund: requestId, p_actor: user!.userId, p_note: reviewerNote });
      if (error) return fail("Refund tidak dapat diselesaikan; periksa status pesanan dan jumlah yang telah dikembalikan.", 409);
      return NextResponse.json({ data });
    }

    if (order.payment_status !== "paid" || order.payment_method !== "snap") return fail("Refund otomatis hanya tersedia untuk pembayaran Snap yang sudah lunas; arahkan pelanggan ke proses manual kasir.", 409);
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    if (!serverKey) return fail("MIDTRANS_SERVER_KEY belum diatur", 503);
    const refundKey = `RF-${requestId}`;
    const isProduction = (process.env.MIDTRANS_IS_PRODUCTION ?? process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION) === "true";
    const baseUrl = isProduction ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
    const { data: payment } = await supabaseAdmin.from("payments").select("transaction_id,midtrans_order_id").eq("order_id", refund.order_id).maybeSingle();
    const transactionTarget = payment?.transaction_id || payment?.midtrans_order_id || order.id;
    const {data:reserved,error:reserveError}=await supabaseAdmin.from("refund_requests").update({status:"processing",reviewer_id:user!.userId,reviewed_at:new Date().toISOString(),reviewer_note:reviewerNote,midtrans_refund_key:refundKey}).eq("id",requestId).eq("status","requested").select("id").maybeSingle();
    if(reserveError || !reserved)return fail("Refund sedang diproses oleh permintaan lain",409);
    let response: Response;
    try { response = await fetch(`${baseUrl}/v2/${encodeURIComponent(transactionTarget)}/refund`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refund_key: refundKey, amount: Math.round(Number(refund.amount)), reason: "other" }),
      cache: "no-store", signal:AbortSignal.timeout(15000),
    }); } catch { return fail("Status pengiriman refund belum pasti. Dana tetap ditahan untuk rekonsiliasi; jangan mengirim refund baru.",502); }
    const midtransResult = await response.json().catch(() => ({}));
    if(!response.ok)return fail("Refund perlu diperiksa ke Midtrans. Permintaan tetap berstatus processing untuk mencegah refund ganda.",502);
    const {data,error}=await supabaseAdmin.from("refund_requests").update({midtrans_response:midtransResult,updated_at:new Date().toISOString()}).eq("id",requestId).eq("status","processing").select().maybeSingle();
    if(error || !data)return fail("Refund terkirim; status lokal perlu direkonsiliasi",502);
    await writeAudit(user!, refund.store_id, "refund.approve_and_submit", "refund_request", requestId, refund, { status: data.status, refundKey, amount: refund.amount });
    return NextResponse.json({ data });
  }

  return fail("Aksi refund tidak dikenali");
}
