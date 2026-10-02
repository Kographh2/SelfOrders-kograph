import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomInt } from "crypto";
import { normalizePhone } from "@/lib/reservation-phone";
import { supabaseAdmin } from "@/lib/supabase-server";
import { writeTelegramActivity } from "@/lib/telegram-activity";

const otpSecret = () => process.env.TELEGRAM_OTP_SECRET || process.env.JWT_SECRET || "";

async function telegramCall(method: string, payload: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Bot Telegram belum dikonfigurasi.");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.description || `Telegram ${method} gagal.`);
  return result.result;
}

function createCode(challengeId: string) {
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const hash = createHmac("sha256", otpSecret()).update(`${challengeId}:${code}`).digest("hex");
  return { code, hash };
}

export async function POST(request: NextRequest) {
  let challengeId = "";
  try {
    if (!otpSecret()) return NextResponse.json({ error: "Konfigurasi rahasia OTP belum tersedia di server." }, { status: 503 });
    const body = await request.json();
    const phone = normalizePhone(String(body.phone || ""));
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) return NextResponse.json({ error: "Format nomor HP tidak valid." }, { status: 400 });

    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { count, error: countError } = await supabaseAdmin.from("telegram_reservation_otps")
      .select("id", { count: "exact", head: true }).eq("phone", phone).gte("created_at", since);
    if (countError) throw countError;
    if ((count || 0) >= 3) return NextResponse.json({ error: "Batas permintaan OTP tercapai. Coba lagi dalam 15 menit." }, { status: 429 });

    const { data: link, error: linkError } = await supabaseAdmin.from("telegram_phone_links")
      .select("telegram_chat_id,telegram_user_id").eq("phone", phone).maybeSingle();
    if (linkError) throw linkError;

    await supabaseAdmin.from("telegram_reservation_otps").update({ status: "cancelled" })
      .eq("phone", phone).in("status", ["awaiting_confirmation", "awaiting_link", "awaiting_contact", "sent"]);

    if (!link) {
      const { data: challenge, error } = await supabaseAdmin.from("telegram_reservation_otps").insert({
        phone,
        telegram_chat_id: null,
        telegram_user_id: null,
        status: "awaiting_link",
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      }).select("id").single();
      if (error || !challenge) throw new Error("Gagal membuat permintaan verifikasi Telegram.");
      challengeId = challenge.id;

      const bot = await telegramCall("getMe", {}) as { username?: string };
      if (!bot.username) throw new Error("Username bot Telegram belum tersedia.");
      const telegramLink = `https://t.me/${bot.username}?start=rvotp-${challenge.id}`;
      return NextResponse.json({
        data: { sent: false, delivery: "contact_required", telegramLink, expiresInSeconds: 600 },
        message: "Buka bot dan bagikan kontak Anda sendiri sekali. Setelah nomor cocok, bot akan langsung mengirim OTP.",
      });
    }

    const { data: challenge, error } = await supabaseAdmin.from("telegram_reservation_otps").insert({
      phone,
      telegram_chat_id: link.telegram_chat_id,
      telegram_user_id: link.telegram_user_id,
      status: "awaiting_link",
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    }).select("id").single();
    if (error || !challenge) throw new Error("Gagal membuat permintaan OTP.");
    challengeId = challenge.id;

    const { code, hash } = createCode(challenge.id);
    const { data: updated, error: updateError } = await supabaseAdmin.from("telegram_reservation_otps")
      .update({ status: "sent", otp_hash: hash, expires_at: new Date(Date.now() + 5 * 60_000).toISOString() })
      .eq("id", challenge.id).eq("status", "awaiting_link").select("id").maybeSingle();
    if (updateError || !updated) throw new Error("Gagal menyiapkan OTP.");
    await telegramCall("sendMessage", {
      chat_id: Number(link.telegram_chat_id),
      text: `Kode OTP reservasi Anda: ${code}\nBerlaku 5 menit. Jangan bagikan kode ini kepada siapa pun.`,
    });
    await writeTelegramActivity({
      eventType: "reservation_otp_sent", actorType: "customer", chatId: Number(link.telegram_chat_id),
      telegramUserId: Number(link.telegram_user_id), details: { phoneLast4: phone.slice(-4) },
    });
    return NextResponse.json({ data: { sent: true, delivery: "direct", otpExpiresInSeconds: 300 }, message: "Kode OTP langsung dikirim melalui bot Telegram." });
  } catch (error) {
    if (challengeId) await supabaseAdmin.from("telegram_reservation_otps").update({ status: "failed" }).eq("id", challengeId).in("status", ["awaiting_link", "sent"]);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal mengirim OTP." }, { status: 500 });
  }
}
