"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

type Session = { id:string; device:string; current:boolean; created_at:string; expires_at:string };
export default function AccountSessions() {
  const { user, logout }=useAuth();
  const [sessions,setSessions]=useState<Session[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const refresh=useCallback(async()=>{
    setBusy(true);setError("");
    try{const response=await fetch("/api/auth/sessions",{cache:"no-store"});const result=await response.json();if(!response.ok)throw new Error(result.error||"Sesi belum dapat dimuat");setSessions(result.data||[]);}
    catch(e){setError(e instanceof Error?e.message:"Sesi belum dapat dimuat");}finally{setBusy(false);}
  },[]);
  useEffect(()=>{if(user)void refresh();},[user,refresh]);
  if(!user)return null;
  const revoke=async(session:Session)=>{
    setBusy(true);setError("");
    try{if(session.current){await logout();return;}const response=await fetch("/api/auth/sessions",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:session.id})});if(!response.ok)throw new Error("Sesi belum berhasil dicabut");await refresh();}
    catch(e){setError(e instanceof Error?e.message:"Coba lagi");}finally{setBusy(false);}
  };
  return <><h2 className="group-label">AKUN & KEAMANAN</h2><section className="settings-group"><div className="settings-body"><h3 className="setting-title">Perangkat yang masuk</h3><p className="setting-note">Keluar dari sesi yang tidak Anda kenali. Perubahan hak akses langsung mencabut sesi lama.</p></div>{sessions.map(session=><div className="session-row" key={session.id}><div><strong>{session.current?"Perangkat ini":session.device.includes("Mobile")?"Browser ponsel":"Browser komputer"}</strong><p title={session.device}>Masuk {new Date(session.created_at).toLocaleString("id-ID")}</p></div><button className="action-secondary" disabled={busy} onClick={()=>void revoke(session)}>Keluar</button></div>)}{busy&&<p role="status" className="settings-body setting-note">Memuat sesi…</p>}{error&&<div role="alert" className="settings-body"><p>{error}</p><button className="subtle-link" onClick={()=>void refresh()}>Coba lagi</button></div>}</section></>;
}
