import { NextRequest, NextResponse } from "next/server";
import { guestSession, newGuestSession, GUEST_COOKIE } from "@/lib/guest-session";
import { sameOrigin } from "@/lib/request-security";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Asal permintaan tidak valid" }, { status: 403 });
  const existing = guestSession(request);
  if (existing) return NextResponse.json({ data: { id: existing } }, { headers: { "Cache-Control": "no-store" } });
  try {
    const session = newGuestSession();
    const response = NextResponse.json({ data: { id: session.id } }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(GUEST_COOKIE, session.token, { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: 30 * 86400 });
    return response;
  } catch { return NextResponse.json({ error: "Sesi belum tersedia" }, { status: 503 }); }
}
