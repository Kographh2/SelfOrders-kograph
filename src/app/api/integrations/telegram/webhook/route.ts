import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomInt } from "crypto";
import { normalizePhone } from "@/lib/reservation-phone";
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

      if (data.startsWith("reserve:yes:") || data.startsWith("reserve:no:")) {
        const [, choice, challengeId] = data.split(":");
        const { data: challenge } = await supabaseAdmin.from("telegram_reservation_otps")
          .select("id,phone,otp_hash,status,expires_at")
          .eq("id", challengeId).eq("telegram_chat_id", chatId).eq("telegram_user_id", userId)
          .in("status", ["awaiting_confirmation", "sent"]).gt("expires_at", new Date().toISOString()).maybeSingle();
        if (!challenge) {
          await sendMessage(chatId, "Permintaan ini sudah kedaluwarsa atau tidak valid. Silakan minta OTP baru dari halaman reservasi.");
          return NextResponse.json({ ok: true });
        }
        if (challenge.status === "sent" && choice === "yes") {
          await sendMessage(chatId, "Kode OTP sudah dikirim sebelumnya. Periksa chat ini untuk melihatnya.");
          return NextResponse.json({ ok: true });
        }
        if (choice === "no") {
          await supabaseAdmin.from("telegram_reservation_otps").update({ status: "cancelled" }).eq("id", challenge.id).eq("status", challenge.status);
          await sendMessage(chatId, "Permintaan dibatalkan. Jika ini bukan Anda, abaikan pesan ini dan jangan bagikan kode apa pun.");
          return NextResponse.json({ ok: true });
        }
        const codeSecret = process.env.TELEGRAM_OTP_SECRET || process.env.JWT_SECRET;
        if (!codeSecret) throw new Error("TELEGRAM_OTP_SECRET atau JWT_SECRET belum dikonfigurasi");
        const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
        const otpHash = createHmac("sha256", codeSecret).update(`${challenge.id}:${code}`).digest("hex");
        const { data: updated } = await supabaseAdmin.from("telegram_reservation_otps")
          .update({ status: "sent", otp_hash: otpHash, expires_at: new Date(Date.now() + 5 * 60_000).toISOString() }).eq("id", challenge.id).eq("status", "awaiting_confirmation")
          .select("id").maybeSingle();
        if (!updated) {
          await sendMessage(chatId, "Permintaan ini sudah diproses. Silakan minta OTP baru jika perlu.");
          return NextResponse.json({ ok: true });
        }
        await writeTelegramActivity({ eventType: "reservation_otp_confirmed", actorType: "customer", chatId, telegramUserId: userId, username, details: { phoneLast4: challenge.phone.slice(-4) }, updateId });
        await sendMessage(chatId, `Kode OTP reservasi Anda: ${code}\nBerlaku 5 menit. Jangan bagikan kode ini kepada siapa pun.`);
        return NextResponse.json({ ok: true });
      } else if (data.startsWith("store:")) {
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
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
        const menuUrl = new URL(`/menu?store=${encodeURIComponent(session.store_id)}`, appUrl).toString();
        const reservationUrl = new URL(`/reservations/new?store=${encodeURIComponent(session.store_id)}`, appUrl).toString();
        const prompt = topic === "menu"
          ? "Berikut menu cabang. Jika perlu bantuan tentang menu, tulis pertanyaan Anda di chat ini."
          : topic === "reservation"
            ? "Untuk membuat reservasi, buka halaman reservasi. Untuk bertanya tentang DP atau jadwal, tulis pesan Anda di chat ini."
            : topic === "order"
              ? "Untuk bantuan pesanan, tulis nomor pesanan dan kendalanya di chat ini agar admin cabang dapat memeriksa."
              : "Jelaskan kebutuhan Anda di chat ini. Pesan akan masuk ke admin cabang.";
        const keyboard = topic === "menu"
          ? { inline_keyboard: [[{ text: "Buka menu cabang", url: menuUrl }], [{ text: "Tulis ke admin", callback_data: "support:menu" }]] }
          : topic === "reservation"
            ? { inline_keyboard: [[{ text: "Buat reservasi", url: reservationUrl }], [{ text: "Tanya admin", callback_data: "support:reservation" }]] }
            : { inline_keyboard: [[{ text: "Kirim pesan ke admin", callback_data: `support:${topic}` }]] };
        await sendMessage(chatId, prompt, keyboard);
      } else if (data.startsWith("support:")) {
        const topic = data.slice(8);
        const { data: session } = await supabaseAdmin.from("telegram_user_sessions").select("store_id").eq("telegram_chat_id", chatId).maybeSingle();
        if (!session?.store_id) {
          await sendMessage(chatId, "Mulai dengan /start, lalu pilih cabang dan topik chat.");
          return NextResponse.json({ ok: true });
        }
        const { error } = await supabaseAdmin.from("telegram_user_sessions").update({ state: "awaiting_message", topic, updated_at: new Date().toISOString() }).eq("telegram_chat_id", chatId);
        if (error) throw error;
        await sendMessage(chatId, topic === "order" ? "Sekarang kirim nomor pesanan dan kendalanya." : "Sekarang tulis pertanyaan Anda; pesan akan diteruskan ke admin cabang.");
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

    const otpStart = text.match(/^\/start(?:@\w+)?\s+rvotp-([0-9a-f-]{36})$/i);
    if (otpStart) {
      if (message.chat?.type !== "private") {
        await sendMessage(chatId, "Buka tautan verifikasi di chat pribadi dengan bot ini.");
        return NextResponse.json({ ok: true });
      }
      const { data: challenge } = await supabaseAdmin.from("telegram_reservation_otps")
        .select("id").eq("id", otpStart[1]).eq("status", "awaiting_link")
        .is("telegram_chat_id", null).gt("expires_at", new Date().toISOString()).maybeSingle();
      if (!challenge) {
        await sendMessage(chatId, "Tautan verifikasi sudah kedaluwarsa atau tidak valid. Kembali ke halaman reservasi dan minta OTP baru.");
        return NextResponse.json({ ok: true });
      }
      const { data: claimed, error } = await supabaseAdmin.from("telegram_reservation_otps")
        .update({ status: "awaiting_contact", telegram_chat_id: chatId, telegram_user_id: userId })
        .eq("id", challenge.id).eq("status", "awaiting_link").is("telegram_chat_id", null)
        .select("id").maybeSingle();
      if (error) throw error;
      if (!claimed) {
        await sendMessage(chatId, "Tautan ini sudah digunakan. Minta OTP baru dari halaman reservasi.");
        return NextResponse.json({ ok: true });
      }
      await sendMessage(chatId, "Untuk memastikan OTP dikirim ke pemilik nomor yang benar, bagikan kontak Anda sendiri. Bot akan mencocokkan nomor dan langsung mengirim OTP.", {
        keyboard: [[{ text: "Bagikan nomor HP saya", request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      });
      return NextResponse.json({ ok: true });
    }

    if (/^\/link(?:@\w+)?(?:\s|$)/.test(text)) {
      if (message.chat?.type !== "private") {
        await sendMessage(chatId, "Untuk menautkan nomor, buka chat pribadi dengan bot lalu kirim /link.");
        return NextResponse.json({ ok: true });
      }
      await sendMessage(chatId, "Untuk menautkan nomor HP reservasi, tekan tombol di bawah dan bagikan kontak Anda sendiri.", {
        keyboard: [[{ text: "Bagikan nomor HP saya", request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      });
      return NextResponse.json({ ok: true });
    }

    if (message.contact) {
      const contact = message.contact;
      if (Number(contact.user_id) !== userId || message.chat?.type !== "private") {
        await sendMessage(chatId, "Demi keamanan, bagikan kontak Anda sendiri langsung ke chat pribadi bot.", { remove_keyboard: true });
        return NextResponse.json({ ok: true });
      }
      const phone = normalizePhone(String(contact.phone_number || ""));
      if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
        await sendMessage(chatId, "Nomor kontak tidak valid. Coba bagikan kontak Anda lagi.", { remove_keyboard: true });
        return NextResponse.json({ ok: true });
      }
      const { data: challenge } = await supabaseAdmin.from("telegram_reservation_otps")
        .select("id,phone").eq("telegram_chat_id", chatId).eq("telegram_user_id", userId)
        .eq("status", "awaiting_contact").gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (challenge) {
        if (phone !== normalizePhone(challenge.phone)) {
          await supabaseAdmin.from("telegram_reservation_otps").update({ status: "failed" })
            .eq("id", challenge.id).eq("status", "awaiting_contact");
          await sendMessage(chatId, "Nomor kontak tidak cocok dengan nomor yang dimasukkan di halaman reservasi. Kembali ke halaman tersebut dan coba lagi dengan nomor yang sama.", { remove_keyboard: true });
          return NextResponse.json({ ok: true });
        }

        await supabaseAdmin.from("telegram_phone_links").delete().eq("telegram_chat_id", chatId).neq("phone", phone);
        const { error: linkError } = await supabaseAdmin.from("telegram_phone_links").upsert({
          phone, telegram_chat_id: chatId, telegram_user_id: userId, username,
          confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }, { onConflict: "phone" });
        if (linkError) throw linkError;

        const codeSecret = process.env.TELEGRAM_OTP_SECRET || process.env.JWT_SECRET;
        if (!codeSecret) throw new Error("TELEGRAM_OTP_SECRET atau JWT_SECRET belum dikonfigurasi");
        const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
        const otpHash = createHmac("sha256", codeSecret).update(`${challenge.id}:${code}`).digest("hex");
        const { data: updated, error: updateError } = await supabaseAdmin.from("telegram_reservation_otps")
          .update({ status: "sent", otp_hash: otpHash, expires_at: new Date(Date.now() + 5 * 60_000).toISOString(), confirmed_at: new Date().toISOString() })
          .eq("id", challenge.id).eq("status", "awaiting_contact").select("id").maybeSingle();
        if (updateError) throw updateError;
        if (!updated) {
          await sendMessage(chatId, "Permintaan OTP sudah diproses atau kedaluwarsa. Minta OTP baru dari halaman reservasi.", { remove_keyboard: true });
          return NextResponse.json({ ok: true });
        }
        await writeTelegramActivity({ eventType: "reservation_otp_sent", actorType: "customer", chatId, telegramUserId: userId, username, details: { phoneLast4: phone.slice(-4) }, updateId });
        try {
          await sendMessage(chatId, `Nomor berhasil diverifikasi. Kode OTP reservasi Anda: ${code}\nBerlaku 5 menit. Jangan bagikan kode ini kepada siapa pun.`, { remove_keyboard: true });
        } catch (sendError) {
          await supabaseAdmin.from("telegram_reservation_otps").update({ status: "failed" }).eq("id", challenge.id).eq("status", "sent");
          throw sendError;
        }
        return NextResponse.json({ ok: true });
      }

      await supabaseAdmin.from("telegram_phone_links").delete().eq("telegram_chat_id", chatId).neq("phone", phone);
      const { error } = await supabaseAdmin.from("telegram_phone_links").upsert({
        phone, telegram_chat_id: chatId, telegram_user_id: userId, username,
        confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: "phone" });
      if (error) throw error;
      await writeTelegramActivity({ eventType: "reservation_phone_linked", actorType: "customer", chatId, telegramUserId: userId, username, details: { phoneLast4: phone.slice(-4) }, updateId });
      await sendMessage(chatId, `Nomor ${phone} sudah ditautkan. Anda dapat meminta OTP reservasi dengan nomor ini.`, { remove_keyboard: true });
      return NextResponse.json({ ok: true });
    }

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
