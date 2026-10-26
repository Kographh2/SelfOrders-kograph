let pending: Promise<string> | null = null;
export function ensureGuestSession(): Promise<string> {
  if (!pending) pending = fetch("/api/guest-session", { method: "POST" }).then(async response => {
    const result = await response.json();
    if (!response.ok || !result.data?.id) throw new Error("Sesi pesanan belum bisa dibuat. Coba lagi.");
    localStorage.setItem("selforder_session_id", result.data.id);
    return result.data.id as string;
  }).finally(() => { pending = null; });
  return pending;
}
