import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { createToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: undefined,
      password: undefined,
      // anonymous via Supabase
    });

    // Fallback: create anonymous user token with limited role
    // Anonymous users always get role 'user' — never staff
    const anonId = `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const token = createToken({
      id: anonId,
      email: "",
      role: "user",
    });

    return NextResponse.json({ data: { token, userId: anonId } }, { status: 200 });
  } catch (error: unknown) {
    console.error("Anonymous login error:", error);
    return NextResponse.json({ error: "Anonymous session failed" }, { status: 500 });
  }
}
