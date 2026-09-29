import { type NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user?.email) return NextResponse.json({ error: "Silakan login untuk membuka saldo" }, { status: 401 });
  await supabaseAdmin.from("wallets").upsert({ user_id: user.userId }, { onConflict: "user_id", ignoreDuplicates: true });
  const [{ data: wallet }, { data: transactions }, { data: withdrawals }] = await Promise.all([
    supabaseAdmin.from("wallets").select("balance,updated_at").eq("user_id", user.userId).single(),
    supabaseAdmin.from("wallet_transactions").select("id,type,direction,amount,description,created_at").eq("user_id", user.userId).order("created_at", { ascending: false }).limit(30),
    supabaseAdmin.from("withdrawal_requests").select("id,amount,bank_name,status,created_at").eq("user_id", user.userId).order("created_at", { ascending: false }).limit(10),
  ]);
  return NextResponse.json({ data: { balance: Number(wallet?.balance ?? 0), transactions: transactions ?? [], withdrawals: withdrawals ?? [] } });
}
