"use client";
import Link from "next/link";
import { Search, UtensilsCrossed } from "lucide-react";

type Store = { id: string; name: string; address: string; logo?: string };
type Props = { store: Store | null; stores: Store[]; storeId: string; lockedStore: boolean; table: string; language: "id" | "en"; setLanguage: (value: "id" | "en") => void; orderType: "dine_in" | "pickup"; setOrderType: (value: "dine_in" | "pickup") => void; changeStore: (value: string) => void };
export default function RestaurantHeader(props: Props) {
  const en = props.language === "en";
  return <header className="restaurant-header">
    <div className="restaurant-masthead">
      <div className="restaurant-topbar">
        <div className="restaurant-brand"><span>{props.store?.logo ? <img src={props.store.logo} alt=""/> : <UtensilsCrossed size={22}/>}</span><div><h1>{props.store?.name || "Luujaaa.id"}</h1><p>{props.table ? `${en ? "Table" : "Meja"} ${props.table}` : en ? "Order here" : "Pesan dari sini"}</p></div></div>
        <div className="restaurant-languages" aria-label="Bahasa menu"><button aria-pressed={!en} onClick={() => props.setLanguage("id")}>ID</button><button aria-pressed={en} onClick={() => props.setLanguage("en")}>EN</button></div>
      </div>
      <Link className="restaurant-search" href="/search"><Search size={20}/><span>{en ? "Search food or drinks" : "Cari makanan atau minuman"}</span></Link>
    </div>
  </header>;
}
