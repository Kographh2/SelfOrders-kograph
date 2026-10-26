import { NextResponse } from "next/server";
export function POST() {
  return NextResponse.json({ error: "Gunakan sesi tamu aplikasi atau lanjutkan tanpa akun." }, { status: 410 });
}
