"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChefHat, ChevronRight, Clock3, Coffee, CreditCard, Home, Loader2, MapPin, Minus, Plus, RefreshCw, Search, ShieldCheck, ShoppingBag, ShoppingBasket, Utensils, X } from "lucide-react";
import type { MenuItem } from "@/types";
import { kioskTotals, linePrice, type KioskCatalog, type KioskCheckout, type KioskLine, type KioskOrder } from "@/lib/kiosk/contracts";
import { loadMidtransSnap } from "@/lib/midtrans-client";
import KioskDialog from "./KioskDialog";
import styles from "./kiosk.module.css";

type Step = "welcome" | "menu" | "cart" | "checkout" | "payment" | "confirmation";
type CartLine = KioskLine & { key: string; item: MenuItem };
const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const RECOVERY = "selforder_kiosk_checkout";
const statusLabels: Record<string, string> = { pending: "Menunggu pembayaran", confirmed: "Pesanan diterima", preparing: "Sedang disiapkan", ready: "Siap diambil", completed: "Pesanan selesai", cancelled: "Pesanan dibatalkan" };
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/kiosk/${path}`, { method, cache: "no-store", credentials: "same-origin", headers: method === "GET" ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(25000) });
  const result = await response.json();
  if (!response.ok) throw new ApiError(result.error || "Layanan belum tersedia. Coba lagi.", response.status);
  return result.data;
}
function MenuImage({ item, hero = false }: { item?: MenuItem; hero?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item?.image]);
  if (!item?.image || failed) return <div className={styles.imageFallback}><Coffee aria-hidden="true" /><span>{item?.name || "Dibuat untuk momen Anda"}</span></div>;
  // Menu images are supplied by the existing catalog, with a graceful fallback.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={item.image} alt={item.name} onError={() => setFailed(true)} loading={hero ? "eager" : "lazy"} className={styles.menuImage} />;
}
function StoreIdentity({ name, logo }: { name: string; logo?: string | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [logo]);
  return <span className={styles.brandMark}>{logo && !failed ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo} alt="" onError={() => setFailed(true)} />
  ) : name.trim().slice(0, 1).toUpperCase()}</span>;
}

export default function KioskExperience() {
  const [catalog, setCatalog] = useState<KioskCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [step, setStep] = useState<Step>("welcome");
  const [mode, setMode] = useState<"dine_in" | "takeaway">("dine_in");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [tableId, setTableId] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<KioskOrder | null>(null);
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [policy, setPolicy] = useState<KioskCatalog["policies"][number] | null>(null);
  const [resetPrompt, setResetPrompt] = useState(false);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [online, setOnline] = useState(true);
  const station = useRef<string | null>(null);
  const requestedStation = useRef<string | null>(null);
  const requestBody = useRef<KioskCheckout | null>(null);
  const busyRef = useRef(false);
  const lastActivity = useRef(Date.now());
  const heading = useRef<HTMLHeadingElement>(null);
  const reducedMotion = useReducedMotion();
  const activeStep = useRef(step);
  const sessionGeneration = useRef(0);
  activeStep.current = step;
  useEffect(() => {
    document.title = catalog?.store.name ? `${catalog.store.name} · KIOSK` : "Self-Order KIOSK";
  }, [catalog?.store.name]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await api<KioskCatalog>(`catalog${requestedStation.current ? `?station=${encodeURIComponent(requestedStation.current)}` : ""}`);
      station.current = data.station.id;
      setCatalog(data);
      setCart(previous => previous.map(line => ({ ...line, item: data.items.find(item => item.id === line.menu_item_id) || line.item })));
      return data;
    } catch (e) { setError(e instanceof Error ? e.message : "Menu belum dapat dimuat."); return null; }
    finally { setLoading(false); }
  }, []);

  const reset = useCallback(async () => {
    if (busyRef.current) return;
    sessionGeneration.current++;
    busyRef.current = true; setBusy(true);
    window.snap?.hide();
    try { await api("session", "DELETE"); }
    catch { /* A new start always replaces the old signed cookie. */ }
    try { sessionStorage.removeItem(RECOVERY); } catch { /* no persistent customer data */ }
    requestBody.current = null;
    setOrder(null); setCart([]); setAccepted(false); setSearch(""); setCategory("all"); setTableId("");
    setSelected(null); setPolicy(null); setResetPrompt(false); setSeconds(null); setError(""); setAnnouncement(""); setStep("welcome");
    lastActivity.current = Date.now();
    busyRef.current = false; setBusy(false);
    void load();
  }, [load]);

  useEffect(() => {
    const generation = sessionGeneration.current;
    requestedStation.current = new URLSearchParams(window.location.search).get("station");
    station.current = requestedStation.current;
    void load().then(async data => {
      if (!data) return;
      try {
        const raw = sessionStorage.getItem(RECOVERY);
        if (!raw) return;
        const recovery = JSON.parse(raw) as { stationId: string; checkout: KioskCheckout; expires: number };
        if (recovery.stationId !== data.station.id || recovery.expires < Date.now()) { sessionStorage.removeItem(RECOVERY); return; }
        requestBody.current = recovery.checkout;
        const recovered = await api<KioskOrder | null>("order");
        if (sessionGeneration.current !== generation) return;
        setMode(recovery.checkout.mode);
        if (recovered) { setOrder(recovered); setStep(recovered.payment_status === "paid" ? "confirmation" : "payment"); }
        else { setStep("checkout"); setError("Pengiriman sebelumnya belum terkonfirmasi. Tekan Coba kirim kembali untuk memeriksa pesanan yang sama."); }
      } catch (e) { if (sessionGeneration.current === generation) setError(e instanceof Error ? e.message : "Sesi belum dapat dipulihkan."); }
    });
    const connectivity = () => setOnline(navigator.onLine);
    connectivity();
    window.addEventListener("online", connectivity); window.addEventListener("offline", connectivity);
    return () => { window.removeEventListener("online", connectivity); window.removeEventListener("offline", connectivity); };
  }, [load]);

  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); lastActivity.current = Date.now(); }, [step]);

  useEffect(() => {
    if (step === "welcome") return;
    const activity = () => { if (seconds === null) lastActivity.current = Date.now(); };
    window.addEventListener("pointerdown", activity); window.addEventListener("keydown", activity);
    const timer = window.setInterval(() => {
      if (busyRef.current) { lastActivity.current = Date.now(); return; }
      const duration = step === "confirmation" ? 60000 : step === "payment" ? 600000 : 120000;
      const remaining = Math.ceil((duration - (Date.now() - lastActivity.current)) / 1000);
      setSeconds(remaining <= 30 ? Math.max(0, remaining) : null);
      if (remaining <= 0) void reset();
    }, 1000);
    return () => { window.clearInterval(timer); window.removeEventListener("pointerdown", activity); window.removeEventListener("keydown", activity); };
  }, [step, seconds, reset]);

  const refreshOrder = useCallback(async (provider = false) => {
    const generation = sessionGeneration.current;
    if (provider) await api("payment", "PUT");
    const latest = await api<KioskOrder | null>("order");
    if (latest && sessionGeneration.current === generation) {
      setOrder(latest);
      if (latest.payment_status === "paid") { window.snap?.hide(); setStep("confirmation"); }
    }
  }, []);

  useEffect(() => {
    if (!order?.id || !["payment", "confirmation"].includes(step)) return;
    let running = false;
    const timer = window.setInterval(async () => {
      if (running || busyRef.current || document.hidden) return;
      running = true;
      try { await refreshOrder(); } catch { /* Keep last verified status; manual check reports errors. */ }
      finally { running = false; }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [order?.id, step, refreshOrder]);

  const execute = async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Koneksi terganggu. Silakan coba lagi."); }
    finally { busyRef.current = false; setBusy(false); lastActivity.current = Date.now(); }
  };
  const start = (nextMode: "dine_in" | "takeaway") => void execute(async () => {
    sessionGeneration.current++;
    const data = await load();
    if (!data?.operating.is_open) return;
    await api("session", "POST", { station: data.station.id });
    requestBody.current = null;
    setMode(nextMode); setStep("menu");
  });
  const totals = kioskTotals(cart.reduce((sum, line) => sum + linePrice(line.item, line.option_ids) * line.quantity, 0), catalog?.store || {});
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  const availableItems = useMemo(() => (catalog?.items || []).filter(item => catalog?.categories.some(c => c.id === item.category_id)), [catalog]);
  const filtered = availableItems.filter(item => (category === "all" || item.category_id === category) && `${item.name} ${item.description || ""}`.toLocaleLowerCase("id").includes(search.toLocaleLowerCase("id")));
  const hero = availableItems.find(item => item.is_featured && item.image) || availableItems.find(item => item.image);
  const unavailable = (item: MenuItem) => !item.is_available || (item.track_stock && Number(item.stock_quantity || 0) <= 0);
  const openItem = (item: MenuItem) => { setSelected(item); setOptionIds([]); setNote(""); setError(""); };
  const addItem = () => {
    if (!selected) return;
    for (const group of selected.option_groups || []) {
      const n = group.options.filter(o => optionIds.includes(o.id)).length;
      if (n < group.min_select || n > group.max_select) { setAnnouncement(`Pilih ${group.name} sesuai jumlah yang diminta.`); return; }
    }
    const inCart = cart.filter(line => line.menu_item_id === selected.id).reduce((sum, line) => sum + line.quantity, 0);
    if (selected.track_stock && inCart >= Number(selected.stock_quantity || 0)) { setAnnouncement("Jumlah melebihi stok yang tersedia."); return; }
    if (count >= 100 || cart.length >= 40) { setAnnouncement("Batas pesanan tercapai. Silakan lanjutkan pembayaran."); return; }
    const key = `${selected.id}:${[...optionIds].sort().join(",")}:${note.trim()}`;
    const existing = cart.find(line => line.key === key);
    if (existing && existing.quantity >= 20) { setAnnouncement("Maksimal 20 item per pilihan."); return; }
    setCart(previous => existing ? previous.map(line => line.key === key ? { ...line, quantity: line.quantity + 1 } : line) : [...previous, { key, item: selected, menu_item_id: selected.id, quantity: 1, option_ids: optionIds, notes: note.trim() }]);
    setAnnouncement(`${selected.name} ditambahkan ke pesanan.`); setSelected(null);
  };
  const changeQuantity = (line: CartLine, delta: number) => {
    const totalItem = cart.filter(c => c.menu_item_id === line.menu_item_id).reduce((sum, c) => sum + c.quantity, 0);
    if (delta > 0 && (line.quantity >= 20 || count >= 100 || (line.item.track_stock && totalItem >= Number(line.item.stock_quantity || 0)))) { setAnnouncement("Jumlah maksimum atau stok tersedia telah tercapai."); return; }
    setCart(previous => previous.map(c => c.key === line.key ? { ...c, quantity: c.quantity + delta } : c).filter(c => c.quantity > 0));
  };
  const submit = () => void execute(async () => {
    if (!catalog) return;
    if (!requestBody.current) {
      if (!cart.length || (mode === "dine_in" && !tableId) || (catalog.policies.length > 0 && !accepted)) throw new Error("Lengkapi meja dan persetujuan sebelum melanjutkan.");
      requestBody.current = { requestId: crypto.randomUUID(), tableId: mode === "dine_in" ? tableId : null, mode, items: cart.map(({ menu_item_id, quantity, option_ids, notes }) => ({ menu_item_id, quantity, option_ids, notes })), policyIds: catalog.policies.map(p => p.id), expectedTotal: totals.total };
      // Persist BEFORE sending. Reload/network retry must retain the same key.
      try { sessionStorage.setItem(RECOVERY, JSON.stringify({ stationId: catalog.station.id, checkout: requestBody.current, expires: Date.now() + 25 * 60000 })); }
      catch { requestBody.current = null; throw new Error("Penyimpanan sesi tidak tersedia. Hubungi petugas sebelum memesan."); }
    }
    let created: KioskOrder;
    try { created = await api<KioskOrder>("order", "POST", requestBody.current); }
    catch (error) {
      // Only a definitive server rejection can unlock this cart. Network errors
      // retain the same body/key, even when an immediate GET cannot see it yet.
      if (error instanceof ApiError && [400, 409].includes(error.status)) {
        const recovered = await api<KioskOrder | null>("order");
        if (recovered) { setOrder(recovered); setStep("payment"); return; }
        requestBody.current = null; sessionStorage.removeItem(RECOVERY); setAccepted(false);
        await load(); setStep(cart.length ? "cart" : "menu");
      }
      throw error;
    }
    setOrder(created); setStep(created.payment_status === "paid" ? "confirmation" : "payment");
  });
  const pay = () => void execute(async () => {
    const sdk = await loadMidtransSnap();
    const payment = await api<{ token: string }>("payment", "POST");
    const checked = () => { if (activeStep.current === "payment") void execute(async () => { await refreshOrder(true); }); };
    sdk.pay(payment.token, { onSuccess: checked, onPending: checked, onClose: checked, onError: () => { setError("Pembayaran belum selesai. Periksa status atau buka kembali pembayaran yang sama."); checked(); } });
  });

  const renderLines = () => <div className={styles.cartLines}>{cart.map(line => <article key={line.key} className={styles.cartLine}>
    <div className={styles.cartThumb}><MenuImage item={line.item} /></div>
    <div className={styles.cartLineBody}><h3>{line.item.name}</h3><p>{(line.item.option_groups || []).flatMap(g => g.options).filter(o => line.option_ids.includes(o.id)).map(o => o.name).join(" · ")}</p>{line.notes && <p>{line.notes}</p>}<strong>{money(linePrice(line.item, line.option_ids) * line.quantity)}</strong></div>
    <div className={styles.quantity}><button aria-label={`Kurangi ${line.item.name}`} onClick={() => changeQuantity(line, -1)}><Minus size={17} /></button><span>{line.quantity}</span><button aria-label={`Tambah ${line.item.name}`} onClick={() => changeQuantity(line, 1)}><Plus size={17} /></button></div>
  </article>)}</div>;
  const renderTotals = () => <dl className={styles.totals}><div><dt>Subtotal</dt><dd>{money(totals.subtotal)}</dd></div><div><dt>Pajak ({Number(catalog?.store.tax_rate || 0) * 100}%)</dt><dd>{money(totals.tax)}</dd></div><div><dt>Biaya layanan</dt><dd>{money(totals.service)}</dd></div><div className={styles.total}><dt>Total pembayaran</dt><dd>{money(totals.total)}</dd></div></dl>;

  return <main className={styles.kiosk}>
    <div className={styles.live} role="status" aria-live="polite">{announcement}</div>
    <header className={styles.header}>
      <div className={styles.brand}><StoreIdentity name={catalog?.store.name || "KIOSK"} logo={catalog?.store.logo} /><div><strong>{catalog?.store.name || "Selamat datang"}</strong><span>SELF-ORDER KIOSK</span></div></div>
      <div className={styles.location}><MapPin size={17} /><span>{catalog?.store.address || catalog?.store.name || "Pesan langsung di toko"}</span></div>
      {step !== "welcome" && <button className={styles.quietButton} disabled={busy} onClick={() => setResetPrompt(true)}><Home size={18} /><span>Mulai ulang</span></button>}
    </header>
    {!online && <div className={styles.alert} role="alert">Koneksi terputus. Pesanan tidak akan dikirim ulang secara otomatis. Sambungkan jaringan lalu coba kembali.</div>}
    {error && <div className={styles.alert} role="alert"><span>{error}</span><button aria-label="Tutup pemberitahuan" onClick={() => setError("")}><X size={18} /></button></div>}
    {loading && !catalog ? <div className={styles.loading} aria-label="Memuat menu" aria-busy="true"><div className={styles.skeletonHero} /><div className={styles.skeletonGrid}>{Array.from({ length: 6 }, (_, i) => <div key={i} />)}</div></div> : !catalog ? <section className={styles.empty}><Coffee size={48} /><h1 ref={heading} tabIndex={-1}>Kami sedang menyiapkan KIOSK</h1><p>Silakan hubungi petugas atau coba muat kembali.</p><button className={styles.primary} onClick={() => void load()}><RefreshCw size={20} />Muat kembali</button></section> : <>
      {step !== "welcome" && <nav className={styles.steps} aria-label="Tahap pemesanan">{["Menu", "Keranjang", "Checkout", "Pembayaran", "Selesai"].map((label, i) => {
        const index = ["menu", "cart", "checkout", "payment", "confirmation"].indexOf(step);
        return <span key={label} className={i <= index ? styles.stepActive : ""} aria-current={i === index ? "step" : undefined}><b>{i < index ? <Check size={14} /> : String(i + 1).padStart(2, "0")}</b><span>{label}</span>{i < 4 && <ChevronRight size={14} />}</span>;
      })}</nav>}
      <AnimatePresence mode="wait" initial={false}><motion.div key={step} initial={{ opacity: 0, y: reducedMotion ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : .18 }} onAnimationComplete={() => heading.current?.focus({ preventScroll: true })}>
        {step === "welcome" && <section className={styles.welcome}>
          <div className={styles.welcomeCopy}><span className={styles.welcomeLabel}><span />SELAMAT DATANG DI {catalog.store.name}</span><h1 ref={heading} tabIndex={-1}>Momen enak,<br /><em>mulai di sini.</em></h1><p>Pilih favorit Anda dari {catalog.store.name}. Dibuat sesuai selera, disiapkan dengan sepenuh hati.</p>
            {!catalog.operating.is_open ? <div className={styles.closed}><Clock3 /><h2>Cabang sedang tutup</h2><p>{catalog.operating.next_open_label ? `Buka kembali ${catalog.operating.next_open_label}.` : "Silakan hubungi petugas untuk informasi jam buka."}</p><button className={styles.secondary} onClick={() => void load()}>Periksa kembali</button></div> : <div className={styles.modeChoices}>
              <button disabled={busy || !online} onClick={() => start("dine_in")}><Utensils size={28} /><strong>Makan di sini</strong><span>Nikmati tanpa terburu-buru</span><ArrowRight /></button>
              <button disabled={busy || !online} onClick={() => start("takeaway")}><ShoppingBag size={28} /><strong>Bawa pulang</strong><span>Kebaikan untuk dibawa pergi</span><ArrowRight /></button>
            </div>}
            <span className={styles.welcomeHint}>{busy ? <Loader2 className={styles.spin} size={18} /> : <ShieldCheck size={18} />}{busy ? "Menyiapkan sesi Anda…" : "Tanpa login · Pembayaran digital"}</span>
            <div className={styles.welcomeJourney} aria-label="Cara memesan"><span><b>01</b>Pilih menu</span><span><b>02</b>Bayar digital</span><span><b>03</b>Ambil pesanan</span></div>
          </div>
          <div className={styles.welcomeVisual}><MenuImage item={hero} hero /><div className={styles.visualCaption}><span>PILIHAN DARI {catalog.store.name}</span><strong>{hero?.name || catalog.store.name}</strong><p>{hero ? "Temukan favorit Anda hari ini." : "Pilihan dari dapur kami, untuk Anda."}</p></div><div className={styles.visualSeal}>DARI<br />DAPUR KAMI</div></div>
        </section>}
        {step === "menu" && <div className={styles.menuLayout}><section className={styles.menuSection}>
          <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>{mode === "dine_in" ? "MAKAN DI SINI" : "BAWA PULANG"}</span><h1 ref={heading} tabIndex={-1}>Ada rasa untuk setiap selera.</h1></div><span className={styles.itemCount}>{availableItems.length} pilihan</span></div>
          <label className={styles.search}><Search size={22} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari kopi, makanan, atau favorit Anda" aria-label="Cari menu" />{search && <button aria-label="Hapus pencarian" onClick={() => setSearch("")}><X size={20} /></button>}</label>
          <nav className={styles.categories} aria-label="Kategori menu"><button aria-pressed={category === "all"} onClick={() => setCategory("all")}><Coffee size={18} />Semua menu</button>{catalog.categories.map(c => <button key={c.id} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>{c.name}</button>)}</nav>
          {filtered.length ? <div className={styles.productGrid}>{filtered.map(item => <button key={item.id} className={styles.product} disabled={unavailable(item)} onClick={() => openItem(item)} aria-label={`${item.name}, ${money(Number(item.price))}${unavailable(item) ? ", habis" : ""}`}>
            <div className={styles.productVisual}><MenuImage item={item} />{item.is_featured && <span className={styles.productBadge}>Pilihan kami</span>}{unavailable(item) && <span className={styles.soldOut}>Sedang habis</span>}</div>
            <div className={styles.productBody}><h2>{item.name}</h2><p>{item.description || catalog.categories.find(c => c.id === item.category_id)?.name}</p><div><strong>{money(Number(item.price))}</strong><span className={styles.addIcon}><Plus size={20} /></span></div></div>
          </button>)}</div> : <div className={styles.empty}><Search size={36} /><h2>{search ? "Belum menemukan yang cocok?" : "Menu belum tersedia"}</h2><p>{search ? "Coba kata lain atau lihat semua kategori." : "Petugas sedang menyiapkan pilihan untuk cabang ini."}</p><button className={styles.secondary} onClick={() => { setCategory("all"); setSearch(""); void load(); }}>Lihat semua menu</button></div>}
        </section><aside className={styles.orderPanel}><div className={styles.panelHeading}><ShoppingBasket size={23} /><h2>Pesanan Anda</h2><span>{count}</span></div><div className={styles.modeTag}>{mode === "dine_in" ? <Utensils size={15} /> : <ShoppingBag size={15} />}{mode === "dine_in" ? "Makan di sini" : "Bawa pulang"}</div>
          {cart.length ? <>{renderLines()}{renderTotals()}<button className={styles.primary} onClick={() => setStep("cart")}>Periksa pesanan<ArrowRight size={20} /></button></> : <div className={styles.emptyCart}><ShoppingBag size={40} strokeWidth={1.2} /><h3>Mulai dengan favorit Anda</h3><p>Sentuh menu untuk menambahkannya ke pesanan.</p></div>}
          <div className={styles.panelFooter}><ShieldCheck size={16} />Dibuat segar setelah Anda memesan</div>
        </aside><button className={styles.mobileCart} disabled={!cart.length} onClick={() => setStep("cart")}><ShoppingBasket /><span>{count} item · Lihat pesanan</span><strong>{money(totals.total)}</strong><ArrowRight size={20} /></button></div>}
        {step === "cart" && <section className={styles.flowPage}><button className={styles.back} onClick={() => setStep("menu")}><ArrowLeft size={19} />Tambah menu lain</button><span className={styles.eyebrow}>PILIHAN YANG MENYENANGKAN</span><h1 ref={heading} tabIndex={-1}>Sudah sesuai selera?</h1><p className={styles.subtitle}>Periksa pilihan dan jumlah sebelum melanjutkan.</p><div className={styles.reviewGrid}><div className={styles.paper}>{cart.length ? renderLines() : <div className={styles.empty}><ShoppingBag /><h2>Keranjang masih kosong</h2><button className={styles.primary} onClick={() => setStep("menu")}>Pilih menu</button></div>}</div><aside className={styles.paper}><h2>Ringkasan pesanan</h2>{renderTotals()}<button className={styles.primary} disabled={!cart.length} onClick={() => { setAccepted(false); setStep("checkout"); }}>Lanjut checkout<ArrowRight size={20} /></button><p className={styles.finePrint}>Harga dan ketersediaan diperiksa kembali saat checkout.</p></aside></div></section>}
        {step === "checkout" && <section className={styles.flowPage}>{!requestBody.current && <button className={styles.back} onClick={() => setStep("cart")}><ArrowLeft size={19} />Kembali ke pesanan</button>}<span className={styles.eyebrow}>TINGGAL SELANGKAH LAGI</span><h1 ref={heading} tabIndex={-1}>Biar kami siapkan.</h1><p className={styles.subtitle}>Pesanan untuk {mode === "dine_in" ? "dinikmati di sini" : "dibawa pulang"}.</p>
          <div className={styles.reviewGrid}><div className={styles.paper}>{mode === "dine_in" ? <><h2><Utensils size={22} />Pilih nomor meja</h2><p className={styles.finePrint}>Gunakan nomor meja tempat Anda duduk.</p><div className={styles.tables}>{catalog.tables.map(table => <button key={table.id} aria-pressed={tableId === table.id} disabled={!!requestBody.current} onClick={() => setTableId(table.id)}>{table.number}</button>)}</div>{!catalog.tables.length && <p role="alert">Belum ada meja aktif. Hubungi petugas atau mulai ulang untuk dibawa pulang.</p>}</> : <div className={styles.takeaway}><ShoppingBag size={40} /><h2>Kami bungkus untuk Anda</h2><p>Ambil pesanan di konter saat nomor antrean dipanggil.</p></div>}
          <div className={styles.paymentChoice}><CreditCard /><div><h3>Pembayaran digital</h3><p>QRIS dan metode digital yang tersedia melalui Midtrans.</p></div><CheckCircle2 size={22} /></div>
          {catalog.policies.length > 0 && <div className={styles.consent}><label><input type="checkbox" checked={accepted} disabled={!!requestBody.current} onChange={e => setAccepted(e.target.checked)} /><span>Saya telah membaca dan menyetujui kebijakan pemesanan.</span></label><div>{catalog.policies.map(doc => <button key={doc.id} onClick={() => setPolicy(doc)}>{doc.title}</button>)}</div></div>}</div>
          <aside className={styles.paper}><h2>Total pesanan</h2>{requestBody.current ? <p className={styles.resumeTotal}>{money(requestBody.current.expectedTotal)}</p> : renderTotals()}<button className={styles.primary} disabled={busy || !online || (!requestBody.current && (!cart.length || (mode === "dine_in" && !tableId) || (catalog.policies.length > 0 && !accepted)))} onClick={submit}>{busy ? <Loader2 className={styles.spin} /> : <ShieldCheck size={20} />}{busy ? "Memeriksa pesanan…" : requestBody.current ? "Coba kirim kembali" : "Buat pesanan & lanjut bayar"}</button><p className={styles.finePrint}>Pembayaran baru dimulai pada langkah berikutnya. Nomor antrean berasal dari sistem cabang.</p>{requestBody.current && <button className={styles.secondary} disabled={busy} onClick={() => void execute(async () => { const recovered = await api<KioskOrder | null>("order"); if (recovered) { setOrder(recovered); setStep("payment"); } else { throw new Error("Status pengiriman belum pasti. Gunakan Coba kirim kembali untuk melanjutkan pesanan yang sama."); } })}>Periksa pengiriman sebelumnya</button>}</aside></div>
        </section>}
        {step === "payment" && order && <section className={styles.paymentPage}><div className={styles.paymentIcon}><CreditCard size={40} /></div><span className={styles.eyebrow}>PEMBAYARAN AMAN</span><h1 ref={heading} tabIndex={-1}>{order.payment_status === "pending" ? "Selesaikan pembayaran Anda." : "Pembayaran belum berhasil."}</h1><p className={styles.subtitle}>Pesanan #{String(order.order_number).padStart(3, "0")} · {catalog.store.name}</p><div className={styles.paymentCard}><span>Total pembayaran</span><strong>{money(Number(order.total_amount))}</strong><div className={styles.paymentStatus}><Clock3 size={18} />{order.payment_status === "pending" ? "Menunggu konfirmasi pembayaran" : order.payment_status === "expired" ? "Pembayaran kedaluwarsa" : "Pembayaran gagal / dibatalkan"}</div>{order.payment_status === "pending" && order.status !== "cancelled" && <button className={styles.primary} disabled={busy || !online} onClick={pay}>{busy ? <Loader2 className={styles.spin} /> : <CreditCard size={20} />}Buka pembayaran</button>}<button className={styles.secondary} disabled={busy || !online} onClick={() => void execute(() => refreshOrder(true))}><RefreshCw size={18} />Periksa status</button><p className={styles.finePrint}>Sudah membayar? Jangan membuat pesanan baru. Tunggu konfirmasi atau minta bantuan petugas dengan nomor pesanan di atas.</p></div><button className={styles.back} disabled={busy} onClick={() => setResetPrompt(true)}>Selesai menggunakan KIOSK<ArrowRight size={18} /></button></section>}
        {step === "confirmation" && order && <section className={styles.confirmation}><div className={styles.successIcon}><Check size={38} /></div><span className={styles.eyebrow}>TERIMA KASIH SUDAH MEMESAN</span><h1 ref={heading} tabIndex={-1}>Kami siapkan dengan hati.</h1><p className={styles.subtitle}>Pembayaran terkonfirmasi. Simpan atau foto nomor antrean Anda.</p><div className={styles.ticket}><span>NOMOR ANTREAN</span><strong>{String(order.order_number).padStart(3, "0")}</strong><div><ChefHat size={20} />{statusLabels[order.status] || order.status}</div><p>{catalog.store.name}</p><p>{mode === "dine_in" ? "Makan di sini" : "Bawa pulang"} · {money(Number(order.total_amount))}</p></div><p className={styles.subtitle}>Perhatikan panggilan petugas saat pesanan siap.</p><button className={styles.primary} onClick={() => void reset()}>Selesai · Pelanggan berikutnya<ArrowRight size={20} /></button><span className={styles.finePrint}>Layar kembali ke awal setelah 60 detik tanpa aktivitas.</span></section>}
      </motion.div></AnimatePresence>
    </>}
    <footer className={styles.footer}><span>GOOD FOOD. GOOD MOMENTS.</span><span>{catalog?.store.name || "KIOSK"} · {online ? "Terhubung" : "Offline"}</span></footer>
    {selected && <KioskDialog title={selected.name} onClose={() => setSelected(null)}><div className={styles.optionIntro}><div><MenuImage item={selected} /></div><p>{selected.description}<strong>{money(linePrice(selected, optionIds))}</strong>{!!selected.allergens?.length && <span>Alergen: {selected.allergens.join(", ")}</span>}</p></div>{(selected.option_groups || []).map(group => <fieldset key={group.id} className={styles.optionGroup}><legend>{group.name}<small>{group.min_select > 0 ? `Wajib · pilih ${group.min_select}–${group.max_select}` : `Opsional · maks. ${group.max_select}`}</small></legend>{group.options.map(option => <label key={option.id}><input type={group.max_select === 1 && group.min_select > 0 ? "radio" : "checkbox"} name={group.id} checked={optionIds.includes(option.id)} onChange={() => setOptionIds(previous => {
      if (previous.includes(option.id)) return previous.filter(id => id !== option.id);
      const groupIds = group.options.map(o => o.id);
      if (group.max_select === 1) return [...previous.filter(id => !groupIds.includes(id)), option.id];
      if (previous.filter(id => groupIds.includes(id)).length >= group.max_select) return previous;
      return [...previous, option.id];
    })} /><span>{option.name}</span><strong>{Number(option.price_delta) > 0 ? `+${money(Number(option.price_delta))}` : "Termasuk"}</strong></label>)}</fieldset>)}<label className={styles.note}>Catatan untuk dapur <span>(opsional)</span><textarea maxLength={200} value={note} onChange={e => setNote(e.target.value)} placeholder="Contoh: tanpa es" /></label><p role="status" className={styles.finePrint}>{announcement}</p><button className={styles.primary} onClick={addItem}><Plus size={20} />Tambah ke pesanan · {money(linePrice(selected, optionIds))}</button></KioskDialog>}
    {policy && <KioskDialog title={policy.title} onClose={() => setPolicy(null)}><div className={styles.policyContent}>{policy.content}</div><button className={styles.primary} onClick={() => setPolicy(null)}>Selesai membaca</button></KioskDialog>}
    {resetPrompt && <KioskDialog title="Akhiri sesi pemesanan?" onClose={() => setResetPrompt(false)}><p className={styles.dialogCopy}>{order ? `Simpan nomor pesanan #${order.order_number}. Mengakhiri sesi tidak membatalkan pesanan atau pembayaran yang sedang berjalan. Hubungi petugas jika sudah membayar.` : "Isi keranjang akan dihapus agar KIOSK siap untuk pelanggan berikutnya."}</p><button className={styles.primary} disabled={busy} onClick={() => void reset()}>Ya, akhiri sesi</button><button className={styles.secondary} onClick={() => setResetPrompt(false)}>Lanjutkan pesanan</button></KioskDialog>}
    {seconds !== null && !resetPrompt && <KioskDialog title="Masih ingin melanjutkan?" onClose={() => { lastActivity.current = Date.now(); setSeconds(null); }}><p className={styles.dialogCopy}>Untuk menjaga privasi, sesi berakhir dalam <strong>{seconds} detik</strong>.{order && ` Simpan nomor pesanan #${order.order_number}; pembayaran yang berjalan tidak dibatalkan.`}</p><button className={styles.primary} onClick={() => { lastActivity.current = Date.now(); setSeconds(null); }}>Ya, lanjutkan sesi</button><button className={styles.secondary} onClick={() => void reset()}>Akhiri sesi sekarang</button></KioskDialog>}
  </main>;
}
