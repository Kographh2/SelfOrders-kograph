"use client";
import {useEffect,useRef} from 'react';
import {usePreferences} from '@/contexts/PreferencesContext';
import {createLuuLogo} from '@/lib/mascot/logo-runtime';

export default function LuuLogo({width=120,loop=false}:{width?:number;loop?:boolean}){
  const ref=useRef<HTMLSpanElement>(null);
  const {preferences}=usePreferences();
  useEffect(()=>{
    const element=ref.current;if(!element)return;
    const rig=createLuuLogo(element,{loop,reducedMotion:preferences.reduceMotion});
    return()=>rig.destroy();
  },[loop,preferences.reduceMotion]);
  return <span className="luu-logo" data-brand-logo data-speed="1" style={{width,maxWidth:'100%'}}>
    <span ref={ref} role="img" aria-label="Luujaaa" style={{display:'block',width:'100%',aspectRatio:'2172/724'}}>
      {/* Original source is PNG; keep it visible before hydration. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/luujaaa-logo.webp" alt="" width={2172} height={724} style={{width:'100%',height:'auto'}}/>
    </span>
  </span>;
}
