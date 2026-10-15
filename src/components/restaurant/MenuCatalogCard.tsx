"use client";
import { Minus, Plus, UtensilsCrossed } from "lucide-react";
import type { MenuItem } from "@/types";
export default function MenuCatalogCard({ item, quantity, add, subtract }: { item: MenuItem; quantity: number; add: () => void; subtract: () => void }) {
  return <article className={`restaurant-product ${item.is_available ? "" : "is-unavailable"}`}>
    <div className="restaurant-product-image">{item.image ? <img src={item.image} alt={item.name} loading="lazy" onError={event => { event.currentTarget.style.display = "none"; }}/> : <UtensilsCrossed size={34}/>}<div className="restaurant-product-tags">{item.is_featured && <span>PILIHAN RESTORAN</span>}{!item.is_available && <span className="sold-out">Habis</span>}</div></div>
    <div className="restaurant-product-copy"><h4>{item.name}</h4><p>{item.description || "Temukan pilihan untuk menemani momen makan Anda."}</p>{item.dietary_tags?.length ? <div className="restaurant-diet">{item.dietary_tags.slice(0, 2).map(tag => <span key={tag}>{tag}</span>)}</div> : null}<div className="restaurant-product-bottom"><strong><small>Rp</small> {Number(item.price).toLocaleString("id-ID")}</strong>{item.is_available ? quantity > 0 ? <div className="restaurant-stepper"><button aria-label={`Kurangi ${item.name}`} onClick={subtract}><Minus size={15}/></button><output>{quantity}</output><button aria-label={`Tambah ${item.name}`} onClick={add}><Plus size={15}/></button></div> : <button className="restaurant-add" aria-label={`Tambah ${item.name}`} onClick={add}><Plus size={16}/><span>Tambah</span></button> : <span className="restaurant-unavailable-label">Belum tersedia</span>}</div></div>
  </article>;
}
