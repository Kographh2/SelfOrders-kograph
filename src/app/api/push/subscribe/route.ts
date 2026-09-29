import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { endpoint, p256dh, auth, userId, anonymousSessionId, storeId } = body;

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: "endpoint, p256dh, and auth are required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("push_subscriptions")
      .upsert(
        {
          endpoint,
          p256dh,
          auth,
          user_id: userId ?? null,
          anonymous_session_id: anonymousSessionId ?? null,
          store_id: storeId ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 200 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to save subscription";
    console.error("Push subscribe error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { endpoint } = body;
    if (!endpoint) return NextResponse.json({ error: "endpoint is required" }, { status: 400 });
    await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", endpoint);
    return NextResponse.json({ message: "Unsubscribed" }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to unsubscribe" }, { status: 500 });
  }
}
