import type {MetadataRoute} from 'next';
import {getPublicSite} from '@/lib/public-site';
export const dynamic='force-dynamic';
export default async function robots():Promise<MetadataRoute.Robots>{
 const site=await getPublicSite();
 if(!site.indexingEnabled||!site.publicUrl||process.env.VERCEL_ENV==='preview')return {rules:{userAgent:'*',disallow:'/'}};
 return {rules:{userAgent:'*',allow:'/',disallow:'/api/'},sitemap:site.publicUrl+'/sitemap.xml'};
}
