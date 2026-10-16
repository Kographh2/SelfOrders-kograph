"use client";
import Link from "next/link";
import { ArrowLeft, ShoppingBag, Minus, Plus, Trash2, ShieldCheck, MapPin } from "lucide-react";
import { useOrder } from "@/contexts/OrderContext";
import type { CartItem } from "@/types";
export const lineKey = (item: CartItem) => `${item.id}:${[...(item.option_ids ?? [])].sort().join(",")}`;
const money = (amount: number) => `Rp ${amount.toLocaleString("id-ID")}`;
export default function CartPageView({ storeName, onCheckout }: { storeName: string; onCheckout: () => void }) {
  const { cart, setCart, order, setOrder } = useOrder();
  const price = (item: CartItem) => Number(item.price) + (item.selected_options ?? []).reduce((total, option) => total + Number(option.price_delta), 0);
  const total = cart.reduce((sum, item) => sum + price(item) * item.quantity, 0);
  const change = (key: string, delta: number) => setCart(current => current.flatMap(item => lineKey(item) !== key ? [item] : item.quantity + delta > 0 ? [{ ...item, quantity: item.quantity + delta }] : []));
  return <main className="consumer-page"><div className="consumer-container">
    <header className="consumer-heading"><h1>Keranjang</h1><p>Periksa pilihan Anda sebelum melanjutkan.</p></header>
    {cart.length === 0 ? <section className="empty-panel"><ShoppingBag size={40}/><h2>Mulai dari yang Anda suka</h2><p>Menu yang ditambahkan akan tersimpan di sini.</p><Link className="action-primary" href="/menu">Jelajahi menu</Link></section> : <div className="cart-page-layout"><section className="settings-group cart-page-items">
      <div className="section-heading"><MapPin size={18}/><h2>{storeName || "Pesanan Anda"}</h2><Link href="/menu">Tambah menu</Link></div>
      {cart.map(item => <article key={lineKey(item)} className="cart-page-line"><div className="cart-page-thumb">{item.image ? <img src={item.image} alt=""/> : <ShoppingBag size={26}/>}</div><div className="cart-page-detail"><h3>{item.name}</h3>{item.selected_options?.map(option => <p key={`${option.group_name}-${option.option_name}`}>{option.group_name}: {option.option_name}</p>)}{item.notes && <p>{item.notes}</p>}<strong>{money(price(item))}</strong><div className="quantity-stepper"><button aria-label={`Kurangi ${item.name}`} onClick={() => change(lineKey(item), -1)}><Minus size={16}/></button><output aria-label={`Jumlah ${item.name}`}>{item.quantity}</output><button aria-label={`Tambah ${item.name}`} onClick={() => change(lineKey(item), 1)}><Plus size={16}/></button></div></div><button className="icon-button remove-line" aria-label={`Hapus ${item.name}`} onClick={() => setCart(current => current.filter(line => lineKey(line) !== lineKey(item)))}><Trash2 size={18}/></button></article>)}
    </section><aside className="cart-page-summary"><section className="settings-group"><div className="section-heading"><h2>Detail pemesanan</h2></div><div className="settings-body"><div className="segmented"><button aria-pressed={order.orderType === "dine_in"} onClick={() => setOrder(current => ({ ...current, orderType: "dine_in" }))}>Makan di tempat</button><button aria-pressed={order.orderType === "pickup"} onClick={() => setOrder(current => ({ ...current, orderType: "pickup" }))}>Ambil sendiri</button></div>{order.orderType === "dine_in" ? <p className="setting-note">{order.table ? `Meja ${order.table}` : "Scan QR meja melalui tombol di navbar sebelum membayar."}</p> : <label className="setting-label">Waktu pengambilan<input type="datetime-local" value={order.pickupAt} onChange={event => setOrder(current => ({ ...current, pickupAt: event.target.value }))}/></label>}<div className="cart-total"><span>Subtotal</span><strong>{money(total)}</strong></div><p className="setting-note">Pajak, biaya layanan, dan promo dihitung saat pembayaran.</p><button className="action-primary full-width" onClick={onCheckout}>Lanjut ke pembayaran</button><p className="secure-note"><ShieldCheck size={15}/> Harga akhir diverifikasi oleh toko.</p></div></section></aside></div>}
    <Link className="subtle-link" href="/menu"><ArrowLeft size={16}/> Kembali ke menu</Link>
  </div></main>;
}
