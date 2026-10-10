import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { createToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login
 *
 * Hanya menerima mode internal: { supabaseUid, email }
 * Dipanggil setelah Supabase auth berhasil di client.
 * Menggunakan service role key → bisa baca public.users tanpa RLS.
 *
 * TIDAK menerima email+password langsung (itu dilakukan di client via Supabase SDK).
 * Ini mencegah bypass auth dengan mengirim request langsung ke endpoint ini.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { supabaseUid, email: bodyEmail } = body;
    const accessToken = request.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!accessToken) return NextResponse.json({ error: "Sesi Supabase diperlukan" }, { status: 401 });
    const verified = await supabaseAdmin.auth.getUser(accessToken);
    if (verified.error || !verified.data.user || verified.data.user.id !== supabaseUid) {
      return NextResponse.json({ error: "Sesi Supabase tidak valid" }, { status: 401 });
    }

    if (!supabaseUid) {
      return NextResponse.json({ error: "supabaseUid required" }, { status: 400 });
    }

    // Verifikasi uid benar-benar ada di auth.users (pakai service role)
    const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.getUserById(supabaseUid);
    if (authErr || !authUser?.user) {
      return NextResponse.json({ error: "User tidak ditemukan di auth" }, { status: 404 });
    }

    const supabaseUser = authUser.user;

    // Cari profil di public.users
    let { data: profile, error: profileErr } = await supabaseAdmin
      .from("users")
      .select("id, email, name, role, store_id, is_active")
      .eq("id", supabaseUid)
      .single();

    // Jika belum ada (trigger belum jalan / race condition) → buat sekarang
    if (profileErr || !profile) {
      const displayName =
        supabaseUser.user_metadata?.name ??
        supabaseUser.email?.split("@")[0] ??
        "User";

      const { data: created, error: createErr } = await supabaseAdmin
        .from("users")
        .insert({
          id: supabaseUid,
          email: supabaseUser.email ?? bodyEmail ?? "",
          name: displayName,
          role: "user",       // SELALU user — tidak bisa di-override
          is_active: true,
        })
        .select("id, email, name, role, store_id, is_active")
        .single();

      if (createErr || !created) {
        console.error("[login] create profile error:", createErr);
        // Tetap buat token dengan role user agar app tidak crash total
        const fallbackToken = createToken({
          id: supabaseUid,
          email: supabaseUser.email ?? "",
          role: "user",
        });
        return NextResponse.json({
          data: {
            token: fallbackToken,
            user: {
              id: supabaseUid,
              email: supabaseUser.email ?? "",
              name: displayName,
              role: "user",
              store_id: null,
            },
          },
        });
      }

      profile = created;
    }

    // Jika user dinonaktifkan → tolak
    if (profile.is_active === false) {
      return NextResponse.json({ error: "Akun dinonaktifkan. Hubungi admin." }, { status: 403 });
    }

    // Buat JWT — role SELALU dari DB, tidak pernah dari request body
    const token = createToken({
      id: profile.id,
      email: profile.email ?? supabaseUser.email ?? "",
      role: profile.role,              // dari DB
      storeId: profile.store_id ?? undefined,
    });

    return NextResponse.json({
      data: {
        token,
        user: {
          id: profile.id,
          email: profile.email,
          name: profile.name,
          role: profile.role,
          store_id: profile.store_id,
          is_active: profile.is_active,
        },
      },
    });
  } catch (err: unknown) {
    console.error("[login route] unexpected error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
