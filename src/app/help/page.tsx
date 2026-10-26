import type {Metadata} from 'next';
import {supabaseAdmin} from '@/lib/supabase-server';
import {getPublicSite} from '@/lib/public-site';
import HelpContent from './HelpContent';
export const dynamic='force-dynamic';
export async function generateMetadata():Promise<Metadata>{const site=await getPublicSite();return {title:site.helpTitle,description:site.helpIntro,alternates:site.publicUrl?{canonical:site.publicUrl+'/help'}:undefined};}
export default async function HelpPage(){
 const site=await getPublicSite();
 const [docs,faqs]=await Promise.all([
  supabaseAdmin.from('store_documents').select('id,document_type,title,content,version,published_at').is('store_id',null).eq('status','published').abortSignal(AbortSignal.timeout(2000)),
  supabaseAdmin.from('store_faqs').select('id,question,answer').is('store_id',null).eq('is_published',true).order('display_order').abortSignal(AbortSignal.timeout(2000)),
 ]);
 return <HelpContent site={site} initialDocs={docs.data||[]} initialFaqs={faqs.data||[]}/>;
}
