import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-server";

export function normalizePhone(value: string) {
  const compact = value.trim().replace(/[\s().-]/g, "");
  const digits = compact.replace(/\D/g, "");
  if (!digits) return "";
  if (compact.startsWith("+")) return `+${digits}`;
  if (digits.startsWith("0")) return `+62${digits.slice(1)}`;
  if (digits.startsWith("62")) return `+${digits}`;
  return `+${digits}`;
}

export async function getVerifiedReservationPhone(accessToken: string) {
  if (!accessToken) return null;

  if (accessToken.split(".").length === 3) {
    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
    const authPhone = data?.user?.phone;
    if (!error && authPhone && data.user?.phone_confirmed_at) return normalizePhone(authPhone);
  }

  const tokenHash = createHash("sha256").update(accessToken).digest("hex");
  const { data: verification } = await supabaseAdmin
    .from("telegram_reservation_otps")
    .select("phone")
    .eq("access_token_hash", tokenHash)
    .eq("status", "verified")
    .gt("access_token_expires_at", new Date().toISOString())
    .maybeSingle();
  return verification?.phone ? normalizePhone(verification.phone) : null;
}
