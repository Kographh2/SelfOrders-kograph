import { NextRequest, NextResponse } from "next/server";
import { verifyMidtransSignature } from "@/lib/midtrans";
import { reconcilePayment } from "@/lib/payment-reconciliation";
import { boundedJson } from "@/lib/request-security";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    const body = await boundedJson(request, 65536);
    if (![body.order_id,body.status_code,body.gross_amount,body.signature_key].every(value => typeof value === "string" && value.length > 0 && value.length <= 256))
      return NextResponse.json({ error: "Signature dan referensi diperlukan" }, { status: 403 });
    if (!await verifyMidtransSignature(body.order_id,body.status_code,body.gross_amount,body.signature_key))
      return NextResponse.json({ error: "Signature tidak valid" }, { status: 403 });
    const data = await reconcilePayment(body.order_id);
    return NextResponse.json({ data });
  } catch {
    // Non-2xx lets Midtrans retry after transient outages. No unverified write.
    return NextResponse.json({ error: "Pembayaran belum dapat direkonsiliasi" }, { status: 503 });
  }
}
