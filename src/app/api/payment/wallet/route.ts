import { type NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { notifyOrderStatus } from "@/lib/push-notifications";
import { supabaseAdmin } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user?.email) return NextResponse.json({ error: "Login akun diperlukan untuk membayar dengan saldo" }, { status: 401 });
  const orderId = String((await request.json()).orderId ?? "");
  const { data, error } = await supabaseAdmin.rpc("wallet_pay_order", { p_user_id: user.userId, p_order_id: orderId });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await notifyOrderStatus(orderId, "confirmed");
  return NextResponse.json({ data });
}
