// Only the self-contained recovery document is cached. Never cache account,
// order, payment, API, or authenticated page responses.
const RECOVERY_CACHE = "selforder-recovery-v2-luu-decb1a474116";
const RECOVERY_URL = "/offline.html";

self.addEventListener("install", event => {
  event.waitUntil(caches.open(RECOVERY_CACHE).then(async cache => {
    const response = await fetch(RECOVERY_URL, { cache: "reload" });
    if (!response.ok) throw new Error("Recovery document unavailable");
    await cache.put(RECOVERY_URL, response);
  }));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key === "selforder-v1" || (key.startsWith("selforder-recovery-") && key !== RECOVERY_CACHE))
      .map(key => caches.delete(key))
  )));
});

async function recovery(mode) {
  const cached = await caches.match(RECOVERY_URL, { cacheName: RECOVERY_CACHE });
  if (!cached) return new Response("Koneksi terputus. Sambungkan internet lalu muat ulang halaman.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const html = (await cached.text()).replace('<html lang="id">', `<html lang="id" data-recovery-mode="${mode}">`);
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-SelfOrder-Recovery": mode } });
}

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode !== "navigate") return;
  event.respondWith((async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(request, { signal: controller.signal });
      return response.status >= 500 ? recovery("error") : response;
    } catch {
      return recovery("offline");
    } finally { clearTimeout(timeout); }
  })());
});
