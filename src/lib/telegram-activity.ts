import { supabaseAdmin } from "@/lib/supabase-server";

export type TelegramActivity = {
  eventType: string;
  actorType: "system" | "bot" | "customer" | "admin";
  actorUserId?: string | null;
  chatId?: number | null;
  telegramUserId?: number | null;
  username?: string | null;
  storeId?: string | null;
  details?: Record<string, unknown>;
  updateId?: number | null;
};

export async function writeTelegramActivity(activity: TelegramActivity) {
  const { error } = await supabaseAdmin.from("telegram_bot_activity").insert({
    event_type: activity.eventType,
    actor_type: activity.actorType,
    actor_user_id: activity.actorUserId ?? null,
    telegram_chat_id: activity.chatId ?? null,
    telegram_user_id: activity.telegramUserId ?? null,
    username: activity.username ?? null,
    store_id: activity.storeId ?? null,
    details: activity.details ?? {},
    telegram_update_id: activity.updateId ?? null,
  });
  // Telegram retries webhook updates. The unique update id makes this write
  // idempotent; logging failures must not turn a successful bot action into a retry.
  if (error && error.code !== "23505") console.error("Telegram activity log failed:", error.message);
}
