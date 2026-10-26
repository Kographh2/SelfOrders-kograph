"use client";
import {usePathname} from 'next/navigation';
import LuuLogo from './LuuLogo';
export default function SiteBrandHeader(){
  const path=usePathname();
  // These layouts own their brand placement; avoid doubling the header.
  if(path==='/'||path.startsWith('/kiosk')||path==='/offline')return null;
  return <div className={`site-brand-header${path.startsWith('/dashboard')?' site-brand-dashboard':''}`}><LuuLogo/></div>;
}
