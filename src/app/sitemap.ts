import type {MetadataRoute} from 'next';
import {getPublicSite} from '@/lib/public-site';
export const dynamic='force-dynamic';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
 const site=await getPublicSite();
 if(!site.indexingEnabled||!site.publicUrl||process.env.VERCEL_ENV==='preview')return [];
 return ['/menu','/help','/about'].map(path=>({url:site.publicUrl+path}));
}
