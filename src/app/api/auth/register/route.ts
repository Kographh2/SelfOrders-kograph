import { NextResponse } from "next/server";
// Supabase signUp in AuthContext owns registration and email confirmation.
export function POST() {
  return NextResponse.json({ error: "Gunakan halaman pendaftaran untuk membuat akun.", url: "/register" }, { status: 410 });
}
