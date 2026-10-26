import {NextRequest,NextResponse} from 'next/server';
import {revalidateTag} from 'next/cache';
import {supabaseAdmin} from '@/lib/supabase-server';
import {getAuthUser} from '@/lib/auth';
import {boundedJson,sameOrigin} from '@/lib/request-security';
import {PUBLIC_SITE_DEFAULTS,validatePublicSite} from '@/lib/public-site-config';
export async function GET(){
 const {data,error}=await supabaseAdmin.from('public_site_settings').select('settings').eq('id',true).maybeSingle();
 if(error)return NextResponse.json({error:"Pengaturan belum dapat dimuat. Pastikan MIGRATION_PUBLIC_CONTENT_20261026.sql sudah dijalankan.",configured:false},{status:503});
 try{return NextResponse.json({data:validatePublicSite(data?.settings||PUBLIC_SITE_DEFAULTS),configured:Boolean(data)});}catch{return NextResponse.json({data:PUBLIC_SITE_DEFAULTS,configured:false});}
}
export async function PUT(request:NextRequest){
 const user=await getAuthUser(request);
 if(user?.role!=='owner')return NextResponse.json({error:'Pengaturan publik hanya dapat diubah owner'},{status:403});
 if(!sameOrigin(request))return NextResponse.json({error:'Asal permintaan tidak valid'},{status:403});
 let settings;
 try{settings=validatePublicSite(await boundedJson(request,12000));}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Pengaturan tidak valid'},{status:400});}
 const {error}=await supabaseAdmin.from('public_site_settings').upsert({id:true,settings,updated_at:new Date().toISOString(),updated_by:user.userId});
 if(error)return NextResponse.json({error:'Pengaturan belum tersimpan. Pastikan MIGRATION_PUBLIC_CONTENT_20261026.sql sudah dijalankan.'},{status:503});
 revalidateTag('public-site');
 return NextResponse.json({data:settings,configured:true});
}
