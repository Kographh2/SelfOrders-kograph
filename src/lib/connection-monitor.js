// Shared by the React host and the standalone recovery document.
export function createConnectionMonitor(options) {
  const env=options.env||window, now=()=>Date.now();
  let disposed=false,flight=null,controller=null,timer=null,attempt=0,lastStart=-Infinity;
  const started=now();
  let state={status:options.mode==='error'?'unavailable':'offline',message:'',checkedAt:null};
  const publish=(status,message='')=>{if(disposed)return;state={status,message,checkedAt:status==='checking'?state.checkedAt:now()};options.onState({...state});};
  const pause=(ms,signal)=>new Promise((resolve,reject)=>{
    const cancel=()=>{env.clearTimeout(id);signal.removeEventListener('abort',cancel);reject(new Error('cancelled'));};
    const id=env.setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},ms);
    signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
  });
  function schedule(ms){env.clearTimeout(timer);if(!disposed&&!env.document.hidden&&options.automatic!==false)timer=env.setTimeout(()=>void check(),ms);}
  async function probe(signal){const r=await env.fetch('/api/connection',{cache:'no-store',credentials:'same-origin',signal});if(!r.ok||(await r.json()).reachable!==true)throw new Error('unavailable');}
  function check(){
    if(disposed)return Promise.resolve(false);if(flight)return flight;
    if(now()-lastStart<2500){schedule(2500-(now()-lastStart));return Promise.resolve(false);}
    env.clearTimeout(timer);lastStart=now();controller=new AbortController();const signal=controller.signal;publish('checking');
    flight=(async()=>{
      const timeout=env.setTimeout(()=>controller?.abort(),6000);
      try{
        await probe(signal);await pause(900,signal);await probe(signal);
        if(options.verify&&!(await options.verify(signal)))throw new Error('page unavailable');
        await pause(Math.max(0,1200-(now()-started)),signal);
        if(disposed||signal.aborted)return false;
        attempt=0;publish('online','Sudah tersambung. Melanjutkan halaman Anda…');options.onRecovered();return true;
      }catch{
        if(disposed)return false;
        const offline=env.navigator.onLine===false;
        publish(offline?'offline':'unavailable',offline?'Masih belum terhubung. Periksa Wi-Fi atau data seluler Anda.':options.automatic===false?'Halaman belum bisa dilanjutkan. Tunggu sebentar, lalu coba lagi.':'Sambungan ke halaman ini belum siap. Kami akan mencoba lagi.');
        schedule(Math.min(30000,5000*2**Math.min(attempt++,3)));return false;
      }finally{env.clearTimeout(timeout);flight=null;controller=null;}
    })();return flight;
  }
  const online=()=>schedule(Math.max(200,2500-(now()-lastStart)));
  const offline=()=>{if(!flight)publish('offline','Koneksi terputus. Draf Anda tetap di perangkat ini.');schedule(5000);};
  const visible=()=>{if(!env.document.hidden)online();else env.clearTimeout(timer);};
  env.addEventListener('online',online);env.addEventListener('offline',offline);env.document.addEventListener('visibilitychange',visible);
  options.onState({...state});schedule(1200);
  return {check,getState:()=>({...state}),dispose(){disposed=true;env.clearTimeout(timer);controller?.abort();env.removeEventListener('online',online);env.removeEventListener('offline',offline);env.document.removeEventListener('visibilitychange',visible);}};
}
