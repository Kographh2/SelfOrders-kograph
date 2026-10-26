import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const hostname = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  const kioskHost = (process.env.KIOSK_HOSTNAME || "kiosk.luujaaa.my.id").toLowerCase();
  if (hostname === kioskHost && request.nextUrl.pathname === "/") {
    const target = request.nextUrl.clone();
    target.pathname = "/kiosk";
    const response=NextResponse.rewrite(target);response.headers.set('X-Robots-Tag','noindex, nofollow');return response;
  }
  const response=NextResponse.next();
  const publicPage=['/','/menu','/help','/about','/robots.txt','/sitemap.xml'].includes(request.nextUrl.pathname);
  const privateQuery=['table','reservation','token','orderId','order_id'].some(key=>request.nextUrl.searchParams.has(key));
  if(!publicPage||privateQuery||hostname===kioskHost||process.env.VERCEL_ENV==='preview')response.headers.set('X-Robots-Tag','noindex, nofollow');
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|.*\\.(?:png|webp|svg|ico|js|css)$).*)'] };
