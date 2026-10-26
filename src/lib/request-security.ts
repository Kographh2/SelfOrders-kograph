import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

export function sameOrigin(request: NextRequest) {
  return request.headers.get("origin") === request.nextUrl.origin;
}
export async function requestBudget(request: NextRequest, scope: string, limit: number, seconds = 60, identity?: string) {
  // Only trust platform-populated headers on the matching deployment platform.
  const ip = process.env.VERCEL ? request.headers.get("x-vercel-forwarded-for") : process.env.TRUST_PROXY_IP === "true" ? request.headers.get("x-forwarded-for") : null;
  const key = createHash("sha256").update(`${scope}:${identity || ip?.split(",")[0].trim() || "shared"}`).digest("hex");
  const { data, error } = await supabaseAdmin.rpc("consume_request_budget", { p_key: key, p_limit: limit, p_seconds: seconds });
  if (error) return NextResponse.json({ error: "Layanan belum siap. Coba lagi sebentar." }, { status: 503 });
  if (!data) return NextResponse.json({ error: "Terlalu banyak permintaan. Coba lagi sebentar." }, { status: 429, headers: { "Retry-After": String(seconds) } });
  return null;
}
async function boundedBytes(request: NextRequest, maxBytes: number) {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new Error("Payload terlalu besar");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Body diperlukan");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new Error("Payload terlalu besar"); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export async function boundedJson(request:NextRequest,maxBytes=65536){return JSON.parse((await boundedBytes(request,maxBytes)).toString("utf8"));}
export async function boundedFormData(request:NextRequest){const bytes=await boundedBytes(request,6*1024*1024);return new Response(new Uint8Array(bytes),{headers:{"Content-Type":request.headers.get("content-type")||""}}).formData();}
