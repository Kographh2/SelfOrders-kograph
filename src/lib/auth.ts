import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import { supabaseAdmin } from "@/lib/supabase-server";

export const AUTH_COOKIE = "selforder_account";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn("[auth] JWT_SECRET is not set — authentication is unavailable");
}

const SECRET = JWT_SECRET;

export interface DecodedToken {
  userId: string;
  email: string;
  role: string;
  storeId?: string;
  iat?: number;
  exp?: number;
  sessionId?: string;
  version?: number;
}

export async function getAuthUser(
  request: NextRequest
): Promise<DecodedToken | null> {
  if (!SECRET) return null;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer /, "");
  const cookie = request.cookies.get(AUTH_COOKIE)?.value;
  const token = cookie || (bearer !== "session" ? bearer : undefined);
  if (!token) return null;
  if (cookie && !["GET", "HEAD", "OPTIONS"].includes(request.method) && request.headers.get("origin") !== request.nextUrl.origin) return null;
  try {
    const decoded = jwt.verify(token, SECRET, { algorithms: ["HS256"], audience: "selforder-account", issuer: "selforder" }) as DecodedToken;
    if (!decoded.userId || !decoded.sessionId || !Number.isInteger(decoded.version)) return null;
    const [{ data: profile, error }, { data: session, error: sessionError }] = await Promise.all([
      supabaseAdmin.from("users").select("id,email,role,store_id,is_active,auth_version").eq("id", decoded.userId).maybeSingle(),
      supabaseAdmin.from("app_sessions").select("id").eq("id", decoded.sessionId).eq("user_id", decoded.userId).eq("auth_version", decoded.version).is("revoked_at", null).gt("expires_at", new Date().toISOString()).maybeSingle(),
    ]);
    if (error || sessionError || !session || !profile?.is_active || profile.auth_version !== decoded.version) return null;
    return { ...decoded, email: profile.email || "", role: profile.role, storeId: profile.store_id || undefined };
  } catch {
    return null;
  }
}

export function createToken(user: {
  id: string;
  email: string;
  role: string;
  storeId?: string;
  sessionId?: string;
  version?: number;
}) {
  if (!SECRET) throw new Error("JWT_SECRET is required for authentication");
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      storeId: user.storeId,
      sessionId: user.sessionId,
      version: user.version,
    },
    SECRET,
    { expiresIn: "1h", algorithm: "HS256", audience: "selforder-account", issuer: "selforder" }
  );
}

export function hasRole(
  user: DecodedToken | null,
  roles: string[] | string
): boolean {
  if (!user) return false;
  const allowed = Array.isArray(roles) ? roles : [roles];
  return allowed.includes(user.role);
}

export function isOwnerOrAdmin(user: DecodedToken | null): boolean {
  return hasRole(user, ["owner", "admin"]);
}

export function isStaff(user: DecodedToken | null): boolean {
  return hasRole(user, ["owner", "admin", "kasir"]);
}

export function canDeleteUsers(user: DecodedToken | null): boolean {
  return hasRole(user, ["owner"]);
}

/**
 * Verify staff has access to the given store.
 * Owners can access all stores; admin/kasir only their assigned store.
 */
export function hasStoreAccess(
  user: DecodedToken | null,
  storeId: string
): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  if (user.role === "admin" || user.role === "kasir") {
    return user.storeId === storeId;
  }
  return false;
}
