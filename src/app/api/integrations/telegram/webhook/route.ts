import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { writeTelegramActivity } from "@/lib/telegram-activity";

const botToken = () => process.env.TELEGRAM_BOT_TOKEN || "";

async function telegramCall(method: string, payload: Record<string, unknown>) {
  const token = botToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN belum dikonfigurasi");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.description || `Telegram ${method} gagal`);
  return result.result;
}

async function sendMessage(chatId: number, text: string, replyMarkup?: unknown) {
  return telegramCall("sendMessage", { chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
}

export async function POST(request: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ error: "Unauthorized webhook" }, { status: 401 });
  }

  try {
    const update = await request.json();
    const updateId = Number.isSafeInteger(update.update_id) ? Number(update.update_id) : null;
    const callback = update.callback_query;

    if (callback) {
      const chatId = Number(callback.message?.chat?.id);
      const userId = Number(callback.from?.id);
      const username = callback.from?.username || null;
      const data = String(callback.data || "");
      if (!Number.isSafeInteger(chatId) || !Number.isSafeInteger(userId)) return NextResponse.json({ ok: true });
      await telegramCall("answerCallbackQuery", { callback_query_id: callback.id });

      if (data.startsWith("store:")) {
        const storeId = data.slice(6);
        const { data: store } = await supabaseAdmin.from("stores").select("id,name,address").eq("id", storeId).eq("is_active", true).maybeSingle();
        if (!store) return NextResponse.json({ ok: true });
        const { error } = await supabaseAdmin.from("telegram_user_sessions").upsert({
          telegram_chat_id: chatId, telegram_user_id: userId, username, store_id: store.id,
          state: "choose_topic", updated_at: new Date().toISOString(),
        });
        if (error) throw error;
        await writeTelegramActivity({ eventType: "store_selected", actorType: "customer", chatId, telegramUserId: userId, username, storeId: store.id, details: { storeName: store.name }, updateId });
        await sendMessage(chatId, `Cabang dipilih: ${store.name}\n${store.address || "Alamat belum tersedia"}\n\nPilih keperluan chat:`, {
          inline_keyboard: [
            [{ text: "Menu & produk", callback_data: "topic:menu" }, { text: "Reservasi / DP", callback_data: "topic:reservation" }],
            [{ text: "Pesanan", callback_data: "topic:order" }, { text: "Lainnya", callback_data: "topic:other" }],
          ],
        });
      } else if (data.startsWith("topic:")) {
        const topic = data.slice(6);
        const validTopics = ["menu", "reservation", "order", "other"];
        if (!validTopics.includes(topic)) return NextResponse.json({ ok: true });
        const { data: session } = await supabaseAdmin.from("telegram_user_sessions").select("store_id").eq("telegram_chat_id", chatId).maybeSingle();
        if (!session?.store_id) {
          await sendMessage(chatId, "Mulai dengan /start, lalu pilih cabang dan topik chat.");
          return NextResponse.json({ ok: true });
        }
        const { error } = await supabaseAdmin.from("telegram_user_sessions").update({ state: "awaiting_message", topic, updated_at: new Date().toISOString() }).eq("telegram_chat_id", chatId);
        if (error) throw error;
        await writeTelegramActivity({ eventType: "topic_selected", actorType: "customer", chatId, telegramUserId: userId, username, storeId: session.store_id, details: { topic }, updateId });
        await sendMessage(chatId, "Silakan tulis pesan Anda. Pesan ini akan diteruskan ke admin cabang.");
      }
      return NextResponse.json({ ok: true });
    }

    const message = update.message;
    if (!message?.chat?.id) return NextResponse.json({ ok: true });
    const chatId = Number(message.chat.id);
    const userId = Number(message.from?.id);
    const username = message.from?.username || null;
    const text = String(message.text || "").trim().slice(0, 4000);
    if (!Number.isSafeInteger(chatId) || !Number.isSafeInteger(userId)) return NextResponse.json({ ok: true });

    if (text.startsWith("/start") || text.startsWith("/cabang")) {
      const { data: stores, error } = await supabaseAdmin.from("stores").select("id,name,address").eq("is_active", true).order("name");
      if (error) throw error;
      const { error: sessionError } = await supabaseAdmin.from("telegram_user_sessions").upsert({
        telegram_chat_id: chatId, telegram_user_id: userId, username, state: "choose_store",
        store_id: null, topic: null, updated_at: new Date().toISOString(),
      });
      if (sessionError) throw sessionError;
      await writeTelegramActivity({ eventType: "command_start", actorType: "customer", chatId, telegramUserId: userId, username, details: { storeCount: stores?.length || 0 }, updateId });
      if (!stores?.length) await sendMessage(chatId, "Belum ada cabang yang tersedia.");
      else await sendMessage(chatId, "Pilih cabang yang ingin Anda hubungi:", {
        inline_keyboard: stores.map(store => [{ text: `${store.name} · ${(store.address || "Alamat belum diatur").slice(0, 35)}`, callback_data: `store:${store.id}` }]),
      });
      return NextResponse.json({ ok: true });
    }

    const { data: session } = await supabaseAdmin.from("telegram_user_sessions").select("store_id,state,topic").eq("telegram_chat_id", chatId).maybeSingle();
    if (!session?.store_id || session.state !== "awaiting_message") {
      await sendMessage(chatId, "Mulai dengan /start, lalu pilih cabang dan topik chat.");
      return NextResponse.json({ ok: true });
    }
    if (!text) {
      await sendMessage(chatId, "Kirim pesan dalam bentuk teks, ya.");
      return NextResponse.json({ ok: true });
    }

    const { data: store } = await supabaseAdmin.from("stores").select("name").eq("id", session.store_id).maybeSingle();
    let { data: conversation } = await supabaseAdmin.from("telegram_conversations").select("id")
      .eq("telegram_chat_id", chatId).eq("store_id", session.store_id).in("status", ["open", "replied"])
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (!conversation) {
      const created = await supabaseAdmin.from("telegram_conversations").insert({
        telegram_chat_id: chatId, telegram_user_id: userId, username, store_id: session.store_id, topic: session.topic || "other",
      }).select("id").single();
      if (created.error) throw created.error;
      conversation = created.data;
    }
    const { error: messageError } = await supabaseAdmin.from("telegram_messages").insert({
      conversation_id: conversation.id, sender_type: "customer", message: text, telegram_message_id: message.message_id,
    });
    if (messageError && messageError.code !== "23505") throw messageError;
    if (!messageError) {
      await supabaseAdmin.from("telegram_conversations").update({ status: "open", updated_at: new Date().toISOString() }).eq("id", conversation.id);
      await writeTelegramActivity({ eventType: "message_received", actorType: "customer", chatId, telegramUserId: userId, username, storeId: session.store_id, details: { topic: session.topic || "other", messageLength: text.length }, updateId });
      await sendMessage(chatId, `Pesan Anda sudah diteruskan ke inbox cabang ${store?.name || "pilihan Anda"}.`);
    } else {
      await sendMessage(chatId, `Pesan Anda sudah diteruskan ke inbox cabang ${store?.name || "pilihan Anda"}.`);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error", error);
    return NextResponse.json({ error: "Gagal memproses update Telegram" }, { status: 500 });
  }
}
