import { type NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user?.email) return NextResponse.json({ error: "Login akun diperlukan" }, { status: 401 });
  const body = await request.json(); const amount = Math.round(Number(body.amount));
  if (!Number.isFinite(amount) || amount < 10000 || !body.bankName || !body.accountNumber || !body.accountName) return NextResponse.json({ error: "Data penarikan belum lengkap" }, { status: 400 });
  const { data, error } = await supabaseAdmin.rpc("wallet_request_withdrawal", { p_user_id: user.userId, p_amount: amount, p_bank_name: String(body.bankName), p_account_number: String(body.accountNumber), p_account_name: String(body.accountName) });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data: { id: data, status: "pending" } });
}
