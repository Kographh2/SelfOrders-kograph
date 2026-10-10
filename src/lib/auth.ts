import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

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
}

export async function getAuthUser(
  request: NextRequest
): Promise<DecodedToken | null> {
  if (!SECRET) return null;
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, SECRET) as DecodedToken;
    return decoded;
  } catch {
    return null;
  }
}

export function createToken(user: {
  id: string;
  email: string;
  role: string;
  storeId?: string;
}) {
  if (!SECRET) throw new Error("JWT_SECRET is required for authentication");
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      storeId: user.storeId,
    },
    SECRET,
    { expiresIn: "7d" }
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
