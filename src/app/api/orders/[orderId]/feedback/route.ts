import { type NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-server";

type Params = { params: Promise<{ orderId: string }> };
export async function POST(request: NextRequest, { params }: Params) {
  const user = await getAuthUser(request); if (!user?.email) return NextResponse.json({ error: "Login akun diperlukan" }, { status: 401 });
  const { orderId } = await params; const body = await request.json();
  const rating = Math.round(Number(body.rating)); const tip = Math.round(Number(body.tip ?? 0)); const note = String(body.note ?? "").slice(0, 500);
  if (rating < 1 || rating > 5 || tip < 0 || tip > 1000000) return NextResponse.json({ error: "Rating atau tip tidak valid" }, { status: 400 });
  const { error } = await supabaseAdmin.rpc("wallet_submit_feedback", { p_user_id: user.userId, p_order_id: orderId, p_rating: rating, p_note: note, p_tip: tip });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data: { rating, tip, note } });
}
