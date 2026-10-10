import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const hostname = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  const kioskHost = (process.env.KIOSK_HOSTNAME || "kiosk.kographh.web.id").toLowerCase();
  if (hostname === kioskHost && request.nextUrl.pathname === "/") {
    const target = request.nextUrl.clone();
    target.pathname = "/kiosk";
    return NextResponse.rewrite(target);
  }
  return NextResponse.next();
}
export const config = { matcher: ["/"] };
