"use client";
import {useEffect,useId,useMemo,useRef} from "react";
import art from "@/lib/mascot/luu-art.json";
import {createLuu,type LuuPose} from "@/lib/mascot/luu-runtime";
import {usePreferences} from "@/contexts/PreferencesContext";

export default function LuuMascot({pose,size=180,label}: {pose:LuuPose;size?:number;label?:string}) {
  const id=useId().replace(/[^a-zA-Z0-9_-]/g,"_");
  const ref=useRef<HTMLSpanElement>(null);
  const {preferences}=usePreferences();
  const markup=useMemo(()=>art[pose].replace('<svg ','<svg style="width:100%;height:auto;display:block;overflow:visible" ').replace(/id="([^"]+)"/g,(_,key)=>`id="${id}-${key}"`).replace(/url\(#([^)]+)\)/g,(_,key)=>`url(#${id}-${key})`).replace('aria-labelledby="luuTitle luuDesc"',`aria-labelledby="${id}-luuTitle ${id}-luuDesc"`),[pose,id]);
  useEffect(()=>{const svg=ref.current?.querySelector("svg");if(!svg)return;const rig=createLuu(svg,{pose,reducedMotion:preferences.reduceMotion});return()=>rig.destroy();},[pose,preferences.reduceMotion]);
  return <span ref={ref} data-luu-pose={pose} role={label?"img":undefined} aria-label={label} aria-hidden={label?undefined:true} style={{display:"block",width:size,maxWidth:"100%",marginInline:"auto",filter:pose==="drained"?"grayscale(1)":undefined}} dangerouslySetInnerHTML={{__html:markup}}/>;
}
