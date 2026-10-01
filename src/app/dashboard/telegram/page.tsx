"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Activity, AlertCircle, CheckCircle2, Power, RefreshCw, Send } from "lucide-react";
import { getAuthHeaders, useAuth } from "@/contexts/AuthContext";

type Chat = {
  id: string;
  telegram_chat_id: number;
  username?: string;
  topic: string;
  status: string;
  updated_at: string;
  messages: { id: string; sender_type: string; message: string; created_at: string }[];
  store?: { name: string } | { name: string }[];
};

type ActivityRow = {
  id: string;
  event_type: string;
  actor_type: string;
  actor_user_id?: string | null;
  telegram_chat_id?: number | null;
  telegram_user_id?: number | null;
  username?: string | null;
  details: Record<string, unknown>;
  created_at: string;
  store?: { name: string } | { name: string }[] | null;
  actor?: { name?: string; email?: string } | { name?: string; email?: string }[] | null;
};

type BotState = {
  configured: boolean;
  tokenConfigured: boolean;
  secretConfigured: boolean;
  webhookInfo: { url?: string; pending_update_count?: number; last_error_message?: string; last_error_date?: number } | null;
  telegramError: string | null;
  activities: ActivityRow[];
  eventCounts: Record<string, number>;
};

const eventLabels: Record<string, string> = {
  command_start: "/start",
  store_selected: "Pilih cabang",
  topic_selected: "Pilih topik",
  message_received: "Pesan masuk",
  admin_reply: "Balasan admin",
  webhook_activated: "Webhook diaktifkan",
};

const relation = <T,>(value?: T | T[] | null): T | null => Array.isArray(value) ? value[0] || null : value || null;

export default function TelegramInboxPage() {
  const { token, user } = useAuth();
  const isOwner = user?.role === "owner";
  const [chats, setChats] = useState<Chat[]>([]);
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [botState, setBotState] = useState<BotState | null>(null);
  const [botError, setBotError] = useState("");
  const [activating, setActivating] = useState(false);

  const loadInbox = useCallback(async () => {
    if (!token) return;
    const response = await fetch(`/api/integrations/telegram/conversations?storeId=${user?.store_id || ""}`, { headers: getAuthHeaders(token) });
    const result = await response.json();
    if (response.ok) {
      setChats(result.data || []);
      setError("");
    } else setError(result.error || "Gagal memuat inbox");
  }, [token, user?.store_id]);

  const loadBot = useCallback(async () => {
    if (!token || !isOwner) return;
    const response = await fetch("/api/integrations/telegram/manage", { headers: getAuthHeaders(token), cache: "no-store" });
    const result = await response.json();
    if (response.ok) {
      setBotState(result.data);
      setBotError("");
    } else setBotError(result.error || "Gagal memuat status bot");
  }, [token, isOwner]);

  useEffect(() => {
    void loadInbox();
    const timer = window.setInterval(() => void loadInbox(), 5000);
    return () => window.clearInterval(timer);
  }, [loadInbox]);

  useEffect(() => {
    if (!isOwner) return;
    void loadBot();
    const timer = window.setInterval(() => void loadBot(), 30000);
    return () => window.clearInterval(timer);
  }, [isOwner, loadBot]);

  const active = chats.find(chat => chat.id === selected) || chats[0];

  const activateWebhook = async () => {
    if (!token) return;
    setActivating(true);
    setBotError("");
    try {
      const response = await fetch("/api/integrations/telegram/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders(token) },
        body: JSON.stringify({ action: "activate" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal mengaktifkan webhook");
      await loadBot();
    } catch (reason) {
      setBotError(reason instanceof Error ? reason.message : "Gagal mengaktifkan webhook");
    } finally {
      setActivating(false);
    }
  };

  const reply = async (event: FormEvent) => {
    event.preventDefault();
    if (!active || !draft.trim() || !token) return;
    const response = await fetch("/api/integrations/telegram/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders(token) },
      body: JSON.stringify({ conversationId: active.id, message: draft }),
    });
    const result = await response.json();
    if (!response.ok) return setError(result.error || "Balasan gagal dikirim");
    setDraft("");
    await Promise.all([loadInbox(), loadBot()]);
  };

  return (
    <main className="p-5 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inbox Telegram</h1>
          <p className="text-sm text-slate-500">Pesan pelanggan masuk dan balasan tim cabang.</p>
        </div>
        <button onClick={() => void loadInbox()} className="rounded-xl border p-2" aria-label="Muat ulang inbox"><RefreshCw size={18} /></button>
      </div>

      {isOwner && (
        <section className="mt-5 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2"><Activity size={18} /><h2 className="font-bold">Kontrol bot & webhook</h2></div>
              <p className="mt-1 text-sm text-slate-500">Aktifkan webhook Telegram dan pantau aktivitas bot dari semua cabang.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => void loadBot()} className="rounded-xl border p-2" aria-label="Perbarui status bot"><RefreshCw size={18} /></button>
              <button onClick={() => void activateWebhook()} disabled={activating || !botState?.configured} className="flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                <Power size={16} />{activating ? "Mengaktifkan…" : "Aktifkan webhook"}
              </button>
            </div>
          </div>

          {botError && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{botError}</p>}
          {botState && (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-500">Konfigurasi</span><p className="mt-1 flex items-center gap-1 text-sm font-semibold">{botState.configured ? <><CheckCircle2 size={16} className="text-emerald-600" />Token dan secret siap</> : <><AlertCircle size={16} className="text-amber-600" />Environment belum lengkap</>}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-500">Webhook</span><p className="mt-1 text-sm font-semibold">{botState.webhookInfo?.url ? "Terhubung" : "Belum aktif"}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-500">Update menunggu</span><p className="mt-1 text-sm font-semibold">{botState.webhookInfo?.pending_update_count ?? "—"}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-500">Aktivitas tercatat</span><p className="mt-1 text-sm font-semibold">{botState.activities.length} terbaru</p></div>
              </div>
              {botState.webhookInfo?.url && <p className="mt-3 break-all text-xs text-slate-500">{botState.webhookInfo.url}</p>}
              {(botState.telegramError || botState.webhookInfo?.last_error_message) && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{botState.telegramError || botState.webhookInfo?.last_error_message}</p>}

              <div className="mt-6">
                <h3 className="font-bold">Aktivitas bot terbaru</h3>
                {botState.activities.length ? <div className="mt-3 max-h-[28rem] overflow-auto rounded-xl border">
                  <div className="min-w-[700px] divide-y">
                    {botState.activities.map(activity => {
                      const store = relation(activity.store);
                      const actor = relation(activity.actor);
                      const details = activity.details || {};
                      const description = typeof details.storeName === "string" ? details.storeName : typeof details.topic === "string" ? details.topic : typeof details.messageLength === "number" ? `${details.messageLength} karakter` : "";
                      return <div key={activity.id} className="grid grid-cols-[1.4fr_1fr_1fr_1.4fr] gap-3 p-3 text-sm">
                        <div><b>{eventLabels[activity.event_type] || activity.event_type}</b><p className="text-xs text-slate-500">{activity.username ? `@${activity.username}` : activity.telegram_chat_id ? `Chat ${activity.telegram_chat_id}` : actor?.name || actor?.email || activity.actor_type}</p></div>
                        <span className="text-slate-600">{store?.name || (activity.event_type === "webhook_activated" ? "Sistem" : "—")}</span>
                        <span className="text-slate-600">{description || "—"}</span>
                        <time className="text-xs text-slate-500">{new Date(activity.created_at).toLocaleString("id-ID")}</time>
                      </div>;
                    })}
                  </div>
                </div> : <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Belum ada aktivitas. Aktivitas akan tercatat setelah webhook menerima update.</p>}
              </div>
            </>
          )}
          {!botState && !botError && <p className="mt-4 text-sm text-slate-500">Memuat status webhook…</p>}
        </section>
      )}

      {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="mt-5 grid min-h-[65vh] overflow-hidden rounded-2xl border bg-white md:grid-cols-[280px_1fr]">
        <aside className="max-h-[65vh] overflow-y-auto border-b md:border-b-0 md:border-r">
          {chats.map(chat => <button key={chat.id} onClick={() => setSelected(chat.id)} className={`block w-full border-b p-4 text-left ${active?.id === chat.id ? "bg-navy-900 text-white" : "hover:bg-slate-50"}`}>
            <b className="block">{chat.username ? `@${chat.username}` : `Chat ${chat.telegram_chat_id}`}</b>
            <span className="text-xs">{relation(chat.store)?.name || "Cabang"} · {chat.topic} · {chat.status}</span>
          </button>)}
          {!chats.length && <p className="p-5 text-sm text-slate-500">Belum ada percakapan Telegram.</p>}
        </aside>
        <section className="flex min-h-[60vh] flex-col">
          <div className="border-b p-4"><b>{relation(active?.store)?.name || "Pilih percakapan"}</b><p className="text-xs text-slate-500">{active?.topic || "Pesan pelanggan"}</p></div>
          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
            {active?.messages?.map(message => <div key={message.id} className={`max-w-[85%] rounded-2xl p-3 text-sm ${message.sender_type === "customer" ? "bg-white" : "ml-auto bg-blue-100"}`}>
              <p className="mb-1 text-[10px] font-bold uppercase text-slate-500">{message.sender_type}</p><p className="whitespace-pre-wrap">{message.message}</p>
            </div>)}
          </div>
          <form onSubmit={reply} className="flex gap-2 border-t p-3">
            <input value={draft} onChange={event => setDraft(event.target.value)} disabled={!active} placeholder="Balas pelanggan…" className="min-w-0 flex-1 rounded-xl border p-3" />
            <button disabled={!active || !draft.trim()} className="rounded-xl bg-navy-900 px-4 text-white"><Send size={18} /></button>
          </form>
        </section>
      </div>
      <p className="mt-3 text-xs text-slate-500">Webhook: <code>/api/integrations/telegram/webhook</code>. Token dan secret tetap disimpan di environment server.</p>
    </main>
  );
}
