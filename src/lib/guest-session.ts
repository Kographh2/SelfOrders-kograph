import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
export const GUEST_COOKIE = "selforder_guest";
export function guestSession(request: NextRequest): string | null {
  try {
    const value = jwt.verify(request.cookies.get(GUEST_COOKIE)?.value || "", process.env.JWT_SECRET!, { algorithms: ["HS256"], audience: "selforder-guest", issuer: "selforder" });
    return typeof value !== "string" && typeof value.sub === "string" ? value.sub : null;
  } catch { return null; }
}
export function newGuestSession() {
  const id = randomUUID();
  if (!process.env.JWT_SECRET) throw new Error("Sesi belum dikonfigurasi");
  return { id, token: jwt.sign({}, process.env.JWT_SECRET, { subject: id, algorithm: "HS256", audience: "selforder-guest", issuer: "selforder", expiresIn: "30d" }) };
}
