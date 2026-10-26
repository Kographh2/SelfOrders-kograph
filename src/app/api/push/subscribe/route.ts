import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getAuthUser } from "@/lib/auth";
import { guestSession } from "@/lib/guest-session";
import { validPushEndpoint, validPushKeys } from "@/lib/push-security";
import { boundedJson, requestBudget, sameOrigin } from "@/lib/request-security";
export const dynamic = "force-dynamic";
async function save(request: NextRequest, remove = false) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Asal permintaan tidak valid" }, { status: 403 });
  const user = await getAuthUser(request), guest = guestSession(request);
  if (!user && !guest) return NextResponse.json({ error: "Sesi diperlukan" }, { status: 401 });
  const limited = await requestBudget(request, "push", 10, 60, user?.userId || guest!); if (limited) return limited;
  try {
    const body = await boundedJson(request, 4096);
    if (!validPushEndpoint(body.endpoint) || (!remove && !validPushKeys(body.p256dh, body.auth))) return NextResponse.json({ error: "Subscription tidak valid" }, { status: 400 });
    if (remove) {
      let query = supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", body.endpoint);
      query = user ? query.eq("user_id", user.userId) : query.is("user_id", null).eq("anonymous_session_id", guest);
      const { error } = await query; if (error) throw error;
    } else {
      const { data: store } = await supabaseAdmin.from("stores").select("id").eq("id", String(body.storeId || "")).eq("is_active", true).maybeSingle();
      if (!store) return NextResponse.json({ error: "Pilih cabang sebelum mengaktifkan notifikasi" }, { status: 400 });
      const { error } = await supabaseAdmin.rpc("save_push_subscription", { p_endpoint: body.endpoint, p_key: body.p256dh, p_auth: body.auth, p_user: user?.userId || null, p_guest: guest, p_store: store.id });
      if (error) return NextResponse.json({ error: "Subscription tidak dapat diikat ke sesi ini" }, { status: 409 });
    }
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: "Subscription belum berhasil disimpan" }, { status: 503 }); }
}
export const POST = (request: NextRequest) => save(request);
export const DELETE = (request: NextRequest) => save(request, true);
