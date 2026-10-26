"use client";
import {useEffect,useState} from "react";
import LuuMascot from "./LuuMascot";
export default function MenuLoading(){
  const [waiting,setWaiting]=useState(false);
  useEffect(()=>{const timer=setTimeout(()=>setWaiting(true),700);return()=>clearTimeout(timer);},[]);
  return <main className="grid min-h-screen place-items-center bg-[#f7f8fa] p-6 text-navy-900 dark:bg-[#0c1828] dark:text-white" aria-busy="true"><div className="text-center">{waiting&&<LuuMascot pose="thinking"/>}<p role="status" className="mt-4 text-sm">Sedang menyiapkan menu…</p></div></main>;
}
