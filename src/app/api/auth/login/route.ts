import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

import { supabaseAdmin } from "@/lib/supabase-server";
import { AUTH_COOKIE, createToken, type DecodedToken } from "@/lib/auth";
import { boundedJson, requestBudget, sameOrigin } from "@/lib/request-security";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Asal permintaan tidak valid" }, { status: 403 });
  try {
    const limited = await requestBudget(request, "login", 60, 60); if (limited) return limited;
    const { supabaseUid } = await boundedJson(request, 4096);
    const accessToken = request.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!accessToken) return NextResponse.json({ error: "Sesi Supabase diperlukan" }, { status: 401 });
    const verified = await supabaseAdmin.auth.getUser(accessToken);
    const identity = verified.data.user;
    if (verified.error || !identity || identity.id !== supabaseUid) return NextResponse.json({ error: "Sesi Supabase tidak valid" }, { status: 401 });
    // Only trusted identity fields are copied; signup metadata never chooses role/store.
    const provision=await supabaseAdmin.from("users").upsert({id:identity.id,email:identity.email || null,name:String(identity.user_metadata?.name || "Pelanggan").slice(0,120),role:"user",is_active:true},{onConflict:"id",ignoreDuplicates:true});
    if(provision.error)return NextResponse.json({error:"Profil belum dapat disiapkan"},{status:503});
    const { data: profile, error } = await supabaseAdmin.from("users").select("id,email,name,role,store_id,is_active,auth_version").eq("id", identity.id).maybeSingle();
    if (error || !profile) return NextResponse.json({ error: "Profil belum tersedia. Hubungi petugas." }, { status: 503 });
    if (!profile.is_active) return NextResponse.json({ error: "Akun dinonaktifkan. Hubungi admin." }, { status: 403 });
    // getUser already verified the Supabase token; bind revocation to its session,
    // so deleting the app cookie cannot resurrect a revoked Supabase session.
    const accessClaims=jwt.decode(accessToken);
    const sessionId=typeof accessClaims==="object" && accessClaims ? accessClaims.session_id : null;
    if(typeof sessionId!=="string" || !/^[0-9a-f-]{36}$/i.test(sessionId))return NextResponse.json({error:"Sesi tidak memiliki identitas yang valid"},{status:401});
    const {data:existing,error:lookupError}=await supabaseAdmin.from("app_sessions").select("id,user_id,auth_version,expires_at,revoked_at").eq("id",sessionId).maybeSingle();
    if(lookupError)return NextResponse.json({error:"Sesi belum dapat diperiksa"},{status:503});
    if(existing && (existing.user_id!==identity.id || existing.revoked_at || existing.auth_version!==profile.auth_version || Date.parse(existing.expires_at)<=Date.now()))return NextResponse.json({error:"Sesi telah dicabut. Silakan masuk kembali."},{status:401});
    const { error: sessionError } = await supabaseAdmin.from("app_sessions").upsert({
      id: sessionId, user_id: identity.id, auth_version: profile.auth_version,
      device: (request.headers.get("user-agent") || "Browser").slice(0, 180),
    }, { onConflict: "id", ignoreDuplicates: true });
    if (sessionError) return NextResponse.json({ error: "Sesi belum bisa dibuat. Pastikan migrasi keamanan terpasang." }, { status: 503 });
    const token = createToken({ id: profile.id, email: profile.email || "", role: profile.role, storeId: profile.store_id || undefined, version: profile.auth_version, sessionId });
    const { auth_version: _, ...safeProfile } = profile;
    const response = NextResponse.json({ data: { token: "session", user: safeProfile } }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(AUTH_COOKIE, token, { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "strict", path: "/", maxAge: 7 * 86400 });
    return response;
  } catch {
    return NextResponse.json({ error: "Sesi belum dapat dibuat. Coba lagi." }, { status: 503 });
  }
}
