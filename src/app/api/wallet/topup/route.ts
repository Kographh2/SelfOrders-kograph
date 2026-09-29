import { randomUUID } from "crypto";
import { type NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createSnapTransaction } from "@/lib/midtrans";
import { supabaseAdmin } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user?.email) return NextResponse.json({ error: "Login akun diperlukan" }, { status: 401 });
    const amount = Math.round(Number((await request.json()).amount));
    if (!Number.isFinite(amount) || amount < 10000 || amount > 10000000) return NextResponse.json({ error: "Top up Rp10.000 sampai Rp10.000.000" }, { status: 400 });
    const id = randomUUID(); const midtransOrderId = `TOPUP-${id}`;
    const { error } = await supabaseAdmin.from("wallet_topups").insert({ id, user_id: user.userId, amount, midtrans_order_id: midtransOrderId });
    if (error) throw error;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const snap = await createSnapTransaction({ orderId: midtransOrderId, amount, items: [{ id: "wallet-topup", name: "Top up saldo SelfOrder", price: amount, quantity: 1 }], customerName: user.email.split("@")[0], customerEmail: user.email, finishUrl: appUrl ? `${appUrl}/wallet?topup=${id}` : undefined });
    await supabaseAdmin.from("wallet_topups").update({ snap_token: snap.token, redirect_url: snap.redirectUrl }).eq("id", id);
    return NextResponse.json({ data: { id, token: snap.token, redirectUrl: snap.redirectUrl } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Top up gagal dibuat" }, { status: 500 }); }
}
