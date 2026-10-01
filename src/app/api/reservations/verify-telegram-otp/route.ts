import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { normalizePhone } from "@/lib/reservation-phone";
import { supabaseAdmin } from "@/lib/supabase-server";

const otpHash = (id: string, code: string, secret: string) => createHmac("sha256", secret).update(`${id}:${code}`).digest("hex");

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.TELEGRAM_OTP_SECRET || process.env.JWT_SECRET;
    if (!secret) return NextResponse.json({ error: "Konfigurasi rahasia OTP belum tersedia di server." }, { status: 503 });
    const body = await request.json();
    const phone = normalizePhone(String(body.phone || ""));
    const code = String(body.code || "").trim();
    if (!/^\+[1-9]\d{7,14}$/.test(phone) || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Masukkan nomor HP dan kode OTP 6 digit yang valid." }, { status: 400 });
    }

    const { data: challenge } = await supabaseAdmin.from("telegram_reservation_otps")
      .select("id,otp_hash,attempts")
      .eq("phone", phone).eq("status", "sent")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!challenge) return NextResponse.json({ error: "Kode tidak aktif atau sudah kedaluwarsa. Minta OTP baru." }, { status: 400 });

    if (challenge.attempts >= 5) {
      await supabaseAdmin.from("telegram_reservation_otps").update({ status: "expired" }).eq("id", challenge.id);
      return NextResponse.json({ error: "Batas percobaan habis. Minta OTP baru." }, { status: 429 });
    }

    const expected = Buffer.from(challenge.otp_hash, "hex");
    const actual = Buffer.from(otpHash(challenge.id, code, secret), "hex");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      const attempts = challenge.attempts + 1;
      await supabaseAdmin.from("telegram_reservation_otps").update({ attempts, ...(attempts >= 5 ? { status: "expired" } : {}) }).eq("id", challenge.id);
      return NextResponse.json({ error: attempts >= 5 ? "Batas percobaan habis. Minta OTP baru." : `Kode OTP salah. Sisa percobaan: ${5 - attempts}.` }, { status: 400 });
    }

    const accessToken = randomBytes(32).toString("base64url");
    const { data: verified, error } = await supabaseAdmin.from("telegram_reservation_otps")
      .update({ status: "verified", confirmed_at: new Date().toISOString(), access_token_hash: createHash("sha256").update(accessToken).digest("hex"), access_token_expires_at: new Date(Date.now() + 30 * 60_000).toISOString() })
      .eq("id", challenge.id).eq("status", "sent").select("id").maybeSingle();
    if (error || !verified) return NextResponse.json({ error: "OTP sudah digunakan. Minta kode baru." }, { status: 409 });
    return NextResponse.json({ data: { accessToken, phone, expiresInSeconds: 1800 }, message: "Nomor HP berhasil diverifikasi lewat Telegram." });
  } catch {
    return NextResponse.json({ error: "Gagal memverifikasi OTP." }, { status: 500 });
  }
}
