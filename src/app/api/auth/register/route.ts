import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { createToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password } = body;

    if (!name?.trim() || !email?.trim() || !password) {
      return NextResponse.json({ error: "name, email, and password are required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: { name: name.trim() },
    });

    if (authError) {
      if (authError.message.includes("already registered")) {
        return NextResponse.json({ error: "Email sudah terdaftar" }, { status: 409 });
      }
      throw authError;
    }

    if (!authData.user) throw new Error("Registrasi gagal");

    // Role is always 'user' for self-registration — never escalate
    await supabaseAdmin.from("users").insert({
      id: authData.user.id,
      email: email.trim(),
      name: name.trim(),
      role: "user",
      is_active: true,
    });

    const token = createToken({
      id: authData.user.id,
      email: email.trim(),
      role: "user",
    });

    return NextResponse.json({
      data: {
        token,
        user: { id: authData.user.id, email: email.trim(), name: name.trim(), role: "user" },
      },
    }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Registration failed";
    console.error("Register error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
