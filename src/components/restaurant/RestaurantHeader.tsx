"use client";
import Link from "next/link";
import { MapPin, Search, UtensilsCrossed, ShoppingBag } from "lucide-react";

type Store = { id: string; name: string; address: string; logo?: string };
type Props = { store: Store | null; stores: Store[]; storeId: string; lockedStore: boolean; table: string; language: "id" | "en"; setLanguage: (value: "id" | "en") => void; orderType: "dine_in" | "pickup"; setOrderType: (value: "dine_in" | "pickup") => void; changeStore: (value: string) => void };
export default function RestaurantHeader(props: Props) {
  const en = props.language === "en";
  return <header className="restaurant-header">
    <div className="restaurant-masthead">
      <div className="restaurant-topbar">
        <div className="restaurant-brand"><span>{props.store?.logo ? <img src={props.store.logo} alt=""/> : <UtensilsCrossed size={22}/>}</span><div><h1>{props.store?.name || "SelfOrder"}</h1><p>{props.table ? `${en ? "Table" : "Meja"} ${props.table}` : en ? "Order here" : "Pesan dari sini"}</p></div></div>
        <div className="restaurant-languages" aria-label="Bahasa menu"><button aria-pressed={!en} onClick={() => props.setLanguage("id")}>ID</button><button aria-pressed={en} onClick={() => props.setLanguage("en")}>EN</button></div>
      </div>
      <div className="restaurant-greeting"><h2>{en ? "What would you like?" : "Mau pesan apa?"}</h2><p>{en ? "Choose a dish or drink to get started." : "Pilih makanan atau minuman yang Anda suka."}</p></div>
      <Link className="restaurant-search" href="/search"><Search size={20}/><span>{en ? "Search food or drinks" : "Cari makanan atau minuman"}</span></Link>
      {props.store?.address && <p className="restaurant-location"><MapPin size={14}/><span>{props.store.address}</span></p>}
    </div>
    <div className="restaurant-orderbar">
      <div className="restaurant-order-modes"><button aria-pressed={props.orderType === "dine_in"} onClick={() => props.setOrderType("dine_in")}><UtensilsCrossed size={16}/>{en ? "Dine in" : "Makan di tempat"}</button><button aria-pressed={props.orderType === "pickup"} onClick={() => props.setOrderType("pickup")}><ShoppingBag size={16}/>{en ? "Pickup" : "Ambil sendiri"}</button></div>
      <div className="restaurant-order-context">{props.orderType === "dine_in" ? props.table ? `Meja ${props.table}` : "Scan QR untuk pilih meja" : "Waktu pengambilan dipilih di keranjang"}</div>
      {!props.lockedStore && props.stores.length > 1 && <select aria-label="Pilih cabang restoran" value={props.storeId} onChange={event => props.changeStore(event.target.value)}>{props.stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select>}
    </div>
  </header>;
}
