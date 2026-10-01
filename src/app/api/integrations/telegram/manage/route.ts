import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-server";
import { writeTelegramActivity } from "@/lib/telegram-activity";

export const dynamic = "force-dynamic";

function ownerOnly(request: NextRequest) {
  return getAuthUser(request);
}

async function telegramRequest(token: string, method: string, payload?: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: payload ? "POST" : "GET",
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.description || `Telegram ${method} gagal`);
  return result.result;
}

export async function GET(request: NextRequest) {
  const user = await ownerOnly(request);
  if (user?.role !== "owner") return NextResponse.json({ error: "Akses khusus owner" }, { status: 403 });

  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  let webhookInfo: Record<string, unknown> | null = null;
  let telegramError: string | null = null;
  if (token) {
    try {
      webhookInfo = await telegramRequest(token, "getWebhookInfo");
    } catch (error) {
      telegramError = error instanceof Error ? error.message : "Gagal menghubungi Telegram";
    }
  }

  const { data: activities, error } = await supabaseAdmin
    .from("telegram_bot_activity")
    .select("id,event_type,actor_type,actor_user_id,telegram_chat_id,telegram_user_id,username,store_id,details,created_at,store:stores(name),actor:users(name,email)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: "Gagal memuat aktivitas Telegram. Pastikan migrasi advanced sudah dijalankan." }, { status: 500 });

  const eventCounts = (activities || []).reduce<Record<string, number>>((counts, activity) => {
    counts[activity.event_type] = (counts[activity.event_type] || 0) + 1;
    return counts;
  }, {});
  return NextResponse.json({
    data: {
      configured: Boolean(token && secret),
      tokenConfigured: Boolean(token),
      secretConfigured: Boolean(secret),
      webhookInfo,
      telegramError,
      activities: activities || [],
      eventCounts,
    },
  });
}

export async function POST(request: NextRequest) {
  const user = await ownerOnly(request);
  if (user?.role !== "owner") return NextResponse.json({ error: "Akses khusus owner" }, { status: 403 });
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  if (!token || !secret) {
    return NextResponse.json({ error: "Atur TELEGRAM_BOT_TOKEN dan TELEGRAM_WEBHOOK_SECRET di environment hosting terlebih dahulu." }, { status: 503 });
  }

  try {
    const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL || new URL("/api/integrations/telegram/webhook", request.nextUrl.origin).toString();
    if (new URL(webhookUrl).protocol !== "https:") return NextResponse.json({ error: "Webhook Telegram harus menggunakan HTTPS." }, { status: 400 });
    await telegramRequest(token, "setWebhook", {
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    });
    await writeTelegramActivity({ eventType: "webhook_activated", actorType: "system", actorUserId: user.userId, details: { url: webhookUrl } });
    const webhookInfo = await telegramRequest(token, "getWebhookInfo");
    return NextResponse.json({ data: { webhookInfo } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal mengaktifkan webhook Telegram";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
