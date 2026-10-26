"use client";
import Link from 'next/link';
import {useEffect,useState} from 'react';
import type {PublicSiteConfig} from '@/lib/public-site-config';
type Doc={id:string;document_type:string;title:string;content:string;version:number;published_at:string|null};
type Faq={id:string;question:string;answer:string};
const labels:Record<string,string>={terms:'Ketentuan pemesanan',privacy:'Kebijakan privasi',refund:'Pembatalan & pengembalian dana'};
export default function HelpContent({site,initialDocs,initialFaqs}:{site:PublicSiteConfig;initialDocs:Doc[];initialFaqs:Faq[]}){
 const [docs,setDocs]=useState(initialDocs),[faqs,setFaqs]=useState(initialFaqs),[loading,setLoading]=useState(true),[error,setError]=useState(''),[storeName,setStoreName]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);let active=true;
  const read=async(url:string)=>{const r=await fetch(url,{cache:'no-store',signal:controller.signal});if(!r.ok)throw new Error('Informasi bantuan belum dapat diperbarui. Silakan coba lagi.');return r.json();};
  async function load(){setLoading(true);setError('');try{
   let preferred=new URLSearchParams(location.search).get('store')||'';if(!preferred)try{preferred=localStorage.getItem('selforder_store_id')||'';}catch{}
   const result=await read('/api/stores');const stores=result.data||[];
   const selected=preferred?stores.find((s:{id:string})=>s.id===preferred):stores[0];
   const policies=await read('/api/policies'+(selected?`?storeId=${encodeURIComponent(selected.id)}`:''));
   if(active){setStoreName(selected?.name||'');setDocs(policies.data.documents||[]);setFaqs(policies.data.faqs||[]);}
  }catch(e){if(active)setError(e instanceof Error&&e.name!=='AbortError'?e.message:'Pemuatan terlalu lama. Silakan coba lagi.');}finally{clearTimeout(timer);if(active)setLoading(false);}}
  void load();return()=>{active=false;clearTimeout(timer);controller.abort();};
 },[retry]);
 return <main className="public-page"><div className="public-wrap"><Link href="/menu" className="public-link w-fit">Kembali ke menu</Link><header className="public-heading"><p>{storeName||'Luujaaa.id'}</p><h1>{site.helpTitle}</h1><p>{site.helpIntro}</p></header>
 {error&&<div className="public-notice" role="alert"><p>{error}</p><button className="public-button mt-3" onClick={()=>setRetry(n=>n+1)}>Coba lagi</button></div>}
 <nav aria-label="Bagian bantuan" className="public-actions mt-0">{Object.entries(labels).map(([key,label])=><a key={key} href={'#'+key} className="public-link">{label}</a>)}<a href="#faq" className="public-link">FAQ</a></nav>
 {Object.entries(labels).map(([kind,label])=>{const doc=docs.find(d=>d.document_type===kind);return <article className="public-card scroll-mt-6" key={kind} id={kind}><h2>{doc?.title||label}</h2>{doc?<><p className="public-muted">Versi {doc.version}{doc.published_at?` · ${new Date(doc.published_at).toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta'})}`:''}</p><div className="public-doc">{doc.content}</div></>:<p>{loading?'Memuat ketentuan…':'Ketentuan belum dipublikasikan. Hubungi petugas cabang sebelum memesan.'}</p>}</article>;})}
 <section id="faq" className="scroll-mt-6"><h2 className="text-xl font-semibold mb-4">Pertanyaan umum</h2>{faqs.length?faqs.map(faq=><details className="public-card" key={faq.id}><summary>{faq.question}</summary><p className="whitespace-pre-wrap">{faq.answer}</p></details>):<div className="public-card"><p>{loading?'Memuat pertanyaan umum…':'FAQ belum dipublikasikan.'}</p></div>}</section>
 <section className="public-card"><h2>Bantuan pesanan</h2><p>{site.supportText}</p>{site.supportEmail&&<p><a className="public-link" href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a></p>}{site.supportPhone&&<p>{site.supportPhone}</p>}<div className="public-actions"><Link href="/orders" className="public-button">Riwayat pesanan</Link><Link href="/about" className="public-link">Tentang Luujaaa.id</Link></div></section></div></main>;
}
