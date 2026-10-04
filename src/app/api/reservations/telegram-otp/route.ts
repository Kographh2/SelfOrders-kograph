import { NextRequest, NextResponse } from "next/server";
import { normalizePhone } from "@/lib/reservation-phone";
import { supabaseAdmin } from "@/lib/supabase-server";
import { TelegramGatewayError, telegramGatewayCall } from "@/lib/telegram-gateway";

type GatewayRequest = { request_id: string };

function gatewayErrorResponse(error: unknown) {
  const code = error instanceof TelegramGatewayError ? error.code : "UNKNOWN";
  if (code === "TOKEN_NOT_CONFIGURED") {
    return NextResponse.json({ error: "Telegram Gateway belum dikonfigurasi di server." }, { status: 503 });
  }
  if (["PHONE_NUMBER_INVALID", "PHONE_NUMBER_NOT_FOUND", "USER_NOT_FOUND", "USER_CANNOT_RECEIVE_MESSAGES"].includes(code)) {
    return NextResponse.json({ error: "Telegram tidak dapat mengirim kode ke nomor ini. Pastikan nomor benar dan terdaftar di Telegram." }, { status: 400 });
  }
  if (code === "NETWORK_ERROR" || code === "INVALID_RESPONSE") {
    return NextResponse.json({ error: "Layanan Telegram Gateway sedang tidak dapat dijangkau. Coba lagi sebentar." }, { status: 502 });
  }
  return NextResponse.json({ error: "Telegram Gateway gagal mengirim kode. Periksa nomor dan saldo Gateway, lalu coba lagi." }, { status: 502 });
}

export async function POST(request: NextRequest) {
  let challengeId = "";
  try {
    const body = await request.json();
    if (body.consent !== true) {
      return NextResponse.json({ error: "Setujui pengiriman kode verifikasi melalui Telegram terlebih dahulu." }, { status: 400 });
    }
    const phone = normalizePhone(String(body.phone || ""));
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      return NextResponse.json({ error: "Format nomor HP tidak valid." }, { status: 400 });
    }

    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { count, error: countError } = await supabaseAdmin.from("telegram_reservation_otps")
      .select("id", { count: "exact", head: true }).eq("phone", phone).gte("created_at", since);
    if (countError) throw countError;
    if ((count || 0) >= 3) {
      return NextResponse.json({ error: "Batas permintaan kode tercapai. Coba lagi dalam 15 menit." }, { status: 429 });
    }

    const { error: cancelError } = await supabaseAdmin.from("telegram_reservation_otps").update({ status: "cancelled" })
      .eq("phone", phone).in("status", ["awaiting_confirmation", "awaiting_link", "awaiting_contact", "gateway_pending", "sent"]);
    if (cancelError) throw cancelError;

    const { data: challenge, error: insertError } = await supabaseAdmin.from("telegram_reservation_otps").insert({
      phone,
      telegram_chat_id: null,
      telegram_user_id: null,
      gateway_consent_at: new Date().toISOString(),
      status: "gateway_pending",
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    }).select("id").single();
    if (insertError || !challenge) throw new Error("Gagal membuat permintaan verifikasi.");
    challengeId = challenge.id;

    const sent = await telegramGatewayCall<GatewayRequest>("sendVerificationMessage", {
      phone_number: phone,
      code_length: 6,
      ttl: 300,
      payload: challenge.id,
    });
    if (!sent.request_id) throw new TelegramGatewayError("REQUEST_ID_MISSING");

    const { data: updated, error: updateError } = await supabaseAdmin.from("telegram_reservation_otps")
      .update({
        status: "sent",
        gateway_request_id: sent.request_id,
        otp_hash: "",
        attempts: 0,
        expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      })
      .eq("id", challenge.id).eq("status", "gateway_pending").select("id").maybeSingle();
    if (updateError || !updated) throw new Error("Kode terkirim, tetapi gagal menyimpan status verifikasi. Coba kirim ulang.");

    return NextResponse.json({
      data: { sent: true, expiresInSeconds: 300 },
      message: "Kode verifikasi dikirim oleh Telegram ke chat Verification Codes.",
    });
  } catch (error) {
    if (challengeId) {
      await supabaseAdmin.from("telegram_reservation_otps").update({ status: "failed" })
        .eq("id", challengeId).in("status", ["gateway_pending", "sent"]);
    }
    if (error instanceof TelegramGatewayError) return gatewayErrorResponse(error);
    console.error("Reservation Telegram Gateway send failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Gagal meminta kode verifikasi. Coba lagi." }, { status: 500 });
  }
}
