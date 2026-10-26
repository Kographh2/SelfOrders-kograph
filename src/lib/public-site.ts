import {unstable_cache} from 'next/cache';
import {supabaseAdmin} from '@/lib/supabase-server';
import {PUBLIC_SITE_DEFAULTS,validatePublicSite} from './public-site-config';
export const getPublicSite=unstable_cache(async()=>{
 try{
  const {data,error}=await supabaseAdmin.from('public_site_settings').select('settings').eq('id',true).abortSignal(AbortSignal.timeout(2000)).maybeSingle();
  if(error||!data)return {...PUBLIC_SITE_DEFAULTS};
  return validatePublicSite(data.settings);
 }catch{return {...PUBLIC_SITE_DEFAULTS};}
},['luujaaa-public-site-v1'],{revalidate:60,tags:['public-site']});
