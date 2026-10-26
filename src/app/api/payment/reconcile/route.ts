import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, hasStoreAccess, isOwnerOrAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-server";
import { reconcilePayment } from "@/lib/payment-reconciliation";
import { boundedJson, requestBudget, sameOrigin } from "@/lib/request-security";
import { writeAudit } from "@/lib/audit";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origin tidak valid" }, { status: 403 });
  const user = await getAuthUser(request);
  if (!isOwnerOrAdmin(user)) return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  const limited = await requestBudget(request, "payment-reconcile", 10, 60, user!.userId);
  if (limited) return limited;
  let body;
  try { body = await boundedJson(request, 2048); }
  catch { return NextResponse.json({ error: "Permintaan tidak valid" }, { status: 400 }); }
  const { data: order } = await supabaseAdmin.from("orders")
    .select("id,store_id,payment_method,payment_status")
    .eq("id", String(body.orderId || "")).maybeSingle();
  if (!order || !hasStoreAccess(user, order.store_id)) return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
  if (order.payment_method !== "snap") return NextResponse.json({ error: "Pemeriksaan ini hanya untuk pembayaran Snap" }, { status: 409 });
  try {
    await reconcilePayment(order.id);
    await writeAudit(user!, order.store_id, "payment.reconcile", "order", order.id);
    return NextResponse.json({ message: "Status diperiksa ke Midtrans. Muat ulang untuk melihat hasilnya." });
  } catch {
    return NextResponse.json({ error: "Status belum dapat dipastikan dari Midtrans. Periksa referensi transaksi di dashboard provider sebelum mengambil tindakan." }, { status: 502 });
  }
}
