"use client";
import {useEffect,useState} from "react";
import LuuMascot from "./LuuMascot";
import LuuLogo from "./LuuLogo";
export default function MenuLoading({stage="Sedang menyiapkan menu…"}:{stage?:string}){
  const [waiting,setWaiting]=useState(false);
  useEffect(()=>{const timer=setTimeout(()=>setWaiting(true),700);return()=>clearTimeout(timer);},[]);
  return <section className="menu-loading" aria-label="Memuat menu" aria-busy="true"><div className="menu-loading-copy"><LuuLogo width={240} loop/>{waiting&&<LuuMascot pose="thinking" size={150}/>}<p role="status" aria-live="polite">{stage}</p><small>Menu akan tampil begitu siap.</small></div></section>;
}
