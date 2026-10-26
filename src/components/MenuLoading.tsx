"use client";
import LuuLogo from "./LuuLogo";
export default function MenuLoading({stage="Sedang menyiapkan menu…"}:{stage?:string}){
  return <section className="menu-loading" aria-label="Memuat menu" aria-busy="true"><div className="menu-loading-copy"><LuuLogo width={240} loop/><p className="sr-only" role="status" aria-live="polite">{stage}</p></div></section>;
}
