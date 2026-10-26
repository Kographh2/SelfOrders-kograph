import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, getAuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-server";
import { sameOrigin } from "@/lib/request-security";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Silakan masuk kembali" }, { status: 401 });
  const { data, error } = await supabaseAdmin.from("app_sessions").select("id,device,created_at,expires_at").eq("user_id", user.userId).is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: "Sesi belum bisa dimuat" }, { status: 503 });
  return NextResponse.json({ data: (data || []).map(row => ({ ...row, current: row.id === user.sessionId })) }, { headers: { "Cache-Control": "no-store" } });
}
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Asal permintaan tidak valid" }, { status: 403 });
  const user = await getAuthUser(request);
  const body = await request.json().catch(() => ({}));
  if (user) {
    let query = supabaseAdmin.from("app_sessions").update({ revoked_at: new Date().toISOString() }).eq("user_id", user.userId);
    if (body.all !== true) query = query.eq("id", body.id || user.sessionId);
    const { error } = await query;
    if (error) return NextResponse.json({ error: "Sesi belum berhasil dicabut" }, { status: 503 });
  }
  const response = NextResponse.json({ success: true });
  if (!user || body.all === true || !body.id || body.id === user.sessionId) response.cookies.set(AUTH_COOKIE, "", { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
