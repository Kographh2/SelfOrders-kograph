"use client";

import {useContext,useEffect,useMemo,useRef} from "react";
import {OfflineCoverContext} from "@/contexts/OfflineCoverContext";
import document from "../../public/offline.html";
import {createConnectionMonitor} from "@/lib/connection-monitor";

export default function RecoveryScreen({mode="offline",onRecovered,onRetry}: {mode?:"offline"|"error";onRecovered?:()=>void;onRetry?:(signal:AbortSignal)=>Promise<boolean>}) {
  const ref=useRef<HTMLIFrameElement>(null);
  const covered=useContext(OfflineCoverContext);
  const automatic=mode==='offline'||Boolean(onRetry);
  const callbacks=useRef({onRecovered,onRetry});callbacks.current={onRecovered,onRetry};
  const content=useMemo(()=>document.replace('__RECOVERY_CONFIG__',JSON.stringify({mode,embedded:true,automatic})),[mode,automatic]);
  useEffect(()=>{
    if(covered)return;
    const previous=window.document.activeElement as HTMLElement|null;
    const overflow=window.document.body.style.overflow;window.document.body.style.overflow='hidden';
    const blocked:HTMLElement[]=[];
    let node:HTMLElement|null=ref.current;
    while(node?.parentElement){
      for(const sibling of Array.from(node.parentElement.children)){
        if(sibling!==node&&sibling instanceof HTMLElement&&!sibling.inert&&!['SCRIPT','STYLE','LINK'].includes(sibling.tagName)){sibling.inert=true;blocked.push(sibling);}
      }
      if(node.parentElement===window.document.body)break;
      node=node.parentElement;
    }
    const post=(data:unknown)=>ref.current?.contentWindow?.postMessage(data,window.location.origin);
    const monitor=createConnectionMonitor({mode,automatic,
      onState:state=>post({type:'luu:state',state}),
      verify:async signal=>callbacks.current.onRetry?callbacks.current.onRetry(signal):true,
      onRecovered:()=>{if(callbacks.current.onRecovered)callbacks.current.onRecovered();else if(!callbacks.current.onRetry)window.location.assign(window.location.pathname==='/offline'?'/menu':window.location.href);},
    });
    const message=(event:MessageEvent)=>{
      if(event.source!==ref.current?.contentWindow||event.origin!==window.location.origin)return;
      if(event.data?.type==='luu:ready'){post({type:'luu:state',state:monitor.getState()});ref.current?.focus();}
      if(event.data?.type==='luu:retry')void monitor.check();
    };
    window.addEventListener('message',message);
    return()=>{monitor.dispose();window.removeEventListener('message',message);blocked.forEach(element=>{element.inert=false;});window.document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[mode,covered,automatic]);
  if(covered)return null;
  return <iframe ref={ref} title="Pemulihan koneksi bersama Luu" srcDoc={content} style={{position:'fixed',inset:0,width:'100%',height:'100dvh',border:0,zIndex:10000,background:'#f7f8fa'}}/>;
}
