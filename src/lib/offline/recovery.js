function bootRecovery(){
 const byId=id=>document.getElementById(id);
 let config={};try{config=JSON.parse(byId('recovery-config').textContent);}catch{}
 const embedded=Boolean(config.embedded&&parent!==window);
 const mode=config.mode||document.documentElement.dataset.recoveryMode||'offline';
 const origin=location.origin==='null'?parent.location.origin:location.origin;
 let reduced=false;try{reduced=localStorage.getItem('selforder_reduce_motion')==='1';const theme=localStorage.getItem('selforder_theme');document.documentElement.classList.toggle('dark',theme==='dark'||((!theme||theme==='system')&&matchMedia('(prefers-color-scheme: dark)').matches));}catch{}
 const rig=createLuu(byId('mascot').querySelector('svg'),{pose:'drained',reducedMotion:reduced});
 const stopGame=mountGame(byId);
 byId('draft').replaceChildren();byId('saved').hidden=true;byId('empty-draft').hidden=false;
 try{
  const saved=JSON.parse(sessionStorage.getItem('selforder_order_draft')||'null');
  const age=Date.now()-saved?.savedAt;
  const items=saved?.version===1&&Number.isFinite(age)&&age>=-60000&&age<43200000&&Array.isArray(saved.cart)?saved.cart.filter(item=>typeof item.name==='string'&&Number.isInteger(item.quantity)&&item.quantity>0&&item.quantity<=100).slice(0,50):[];
  if(items.length){
   byId('saved').hidden=false;byId('empty-draft').hidden=true;
   byId('draft-updated').textContent='Draf tersimpan · '+new Date(saved.savedAt).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'});
   for(const item of items){const li=document.createElement('li'),name=document.createElement('strong');name.textContent=item.quantity+' × '+item.name.slice(0,120);li.append(name);if(typeof item.notes==='string'&&item.notes){const note=document.createElement('small');note.textContent=item.notes.slice(0,200);li.append(note);}byId('draft').append(li);}
  }
 }catch{}
 const paint=state=>{
  const busy=state.status==='checking';byId('retry').disabled=busy||state.status==='online';byId('retry').textContent=busy?'Memeriksa koneksi…':state.status==='online'?'Melanjutkan…':'Coba lagi';
  byId('network').textContent=({offline:'Koneksi terputus',unavailable:'Layanan belum siap',checking:'Sedang memeriksa',online:'Sudah tersambung'})[state.status]||'Koneksi terputus';
  if(state.status!=='checking'&&state.status!=='online'){
   const service=state.status==='unavailable';byId('heading').textContent=service?'Ada kendala sementara':'Koneksi lagi terputus';
   byId('description').textContent=service?'Halaman ini belum bisa dilanjutkan. Tunggu sebentar, lalu coba lagi.':'Luu ikut kehabisan energi. Coba sambungkan internet untuk melanjutkan.';
  }
  byId('feedback').textContent=state.message||(busy?'Tunggu sebentar, kami sedang memeriksa sambungannya.':config.automatic===false?'Tekan Coba lagi untuk memeriksa sambungan.':'Kami akan melanjutkan setelah koneksi siap.');
  if(state.checkedAt)byId('last-check').textContent='Terakhir diperiksa '+new Date(state.checkedAt).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
 };
 let monitor;
 const destination=()=>{
  const candidate=new URL(new URLSearchParams(location.search).get('returnTo')||location.href,origin);
  if(candidate.origin!==origin||['/offline','/offline.html'].includes(candidate.pathname))return '/menu';
  return candidate.pathname+candidate.search+candidate.hash;
 };
 if(!embedded)monitor=createConnectionMonitor({mode,onState:paint,onRecovered:()=>location.replace(destination()),verify:async signal=>{
  const r=await fetch(destination(),{cache:'no-store',signal,headers:{Accept:'text/html'}});
  return r.ok&&r.headers.get('content-type')?.includes('text/html')&&!r.headers.get('X-SelfOrder-Recovery');
 }});
 const retry=()=>{if(embedded)parent.postMessage({type:'luu:retry'},origin);else void monitor.check();};
 const message=event=>{if(embedded&&event.source===parent&&event.origin===origin&&event.data?.type==='luu:state')paint(event.data.state);};
 byId('retry').addEventListener('click',retry);window.addEventListener('message',message);
 if(embedded){paint({status:mode==='error'?'unavailable':'offline'});parent.postMessage({type:'luu:ready'},origin);}
 byId('heading').focus({preventScroll:true});
 return()=>{rig.destroy();monitor?.dispose();stopGame();byId('retry').removeEventListener('click',retry);window.removeEventListener('message',message);};
}
let disposeRecovery=bootRecovery();
window.addEventListener('pagehide',()=>disposeRecovery());
window.addEventListener('pageshow',event=>{if(event.persisted)disposeRecovery=bootRecovery();});
