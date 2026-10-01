import { NextRequest, NextResponse } from "next/server";
import { normalizePhone } from "@/lib/reservation-phone";
import { supabaseAdmin } from "@/lib/supabase-server";
import { writeTelegramActivity } from "@/lib/telegram-activity";

async function telegramSend(chatId: number, text: string, replyMarkup?: unknown) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Bot Telegram belum dikonfigurasi.");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.description || "Bot tidak dapat mengirim pesan. Buka bot lalu kirim /link.");
}

export async function POST(request: NextRequest) {
  try {
    if (!(process.env.TELEGRAM_OTP_SECRET || process.env.JWT_SECRET)) {
      return NextResponse.json({ error: "Konfigurasi rahasia OTP belum tersedia di server." }, { status: 503 });
    }
    const body = await request.json();
    const phone = normalizePhone(String(body.phone || ""));
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) return NextResponse.json({ error: "Format nomor HP tidak valid." }, { status: 400 });

    const { data: link } = await supabaseAdmin.from("telegram_phone_links")
      .select("telegram_chat_id,telegram_user_id")
      .eq("phone", phone)
      .maybeSingle();
    if (!link) return NextResponse.json({ error: "Nomor ini belum ditautkan. Buka bot Telegram SelfOrder, kirim /link, lalu bagikan kontak Anda." }, { status: 404 });

    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { count } = await supabaseAdmin.from("telegram_reservation_otps")
      .select("id", { count: "exact", head: true }).eq("phone", phone).gte("created_at", since);
    if ((count || 0) >= 3) return NextResponse.json({ error: "Batas permintaan OTP tercapai. Coba lagi dalam 15 menit." }, { status: 429 });

    await supabaseAdmin.from("telegram_reservation_otps").update({ status: "cancelled" })
      .eq("phone", phone).in("status", ["awaiting_confirmation", "sent"]);

    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const { data: challenge, error } = await supabaseAdmin.from("telegram_reservation_otps").insert({
      phone,
      telegram_chat_id: link.telegram_chat_id,
      telegram_user_id: link.telegram_user_id,
      status: "awaiting_confirmation",
      expires_at: expiresAt,
    }).select("id").single();
    if (error || !challenge) throw new Error("Gagal membuat permintaan verifikasi Telegram.");

    try {
      await telegramSend(Number(link.telegram_chat_id),
        `Ada permintaan verifikasi reservasi untuk nomor ${phone}. Apakah ini Anda?`,
        { inline_keyboard: [[
          { text: "Ya, ini saya", callback_data: `reserve:yes:${challenge.id}` },
          { text: "Bukan saya", callback_data: `reserve:no:${challenge.id}` },
        ]] });
    } catch (sendError) {
      await supabaseAdmin.from("telegram_reservation_otps").update({ status: "failed" }).eq("id", challenge.id);
      throw sendError;
    }
    await writeTelegramActivity({ eventType: "reservation_otp_requested", actorType: "customer", chatId: Number(link.telegram_chat_id), telegramUserId: Number(link.telegram_user_id), details: { phoneLast4: phone.slice(-4) } });
    return NextResponse.json({ data: { sent: true, confirmationExpiresInSeconds: 600, otpExpiresInSeconds: 300 }, message: "Konfirmasi permintaan di Telegram. Kode 6 digit akan dikirim setelah Anda menekan ‘Ya, ini saya’." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal mengirim permintaan OTP." }, { status: 500 });
  }
}
