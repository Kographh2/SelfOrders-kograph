// Preview by default. Run with --apply only after the owner approves retention.
import { createClient } from '@supabase/supabase-js';
const days=Number(process.env.ATTENDANCE_RETENTION_DAYS||90);
if(!Number.isInteger(days)||days<30)throw new Error('Retention must be at least 30 days');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw new Error('Supabase environment is required');
const db=createClient(url,key,{auth:{persistSession:false}}),apply=process.argv.includes('--apply');
const cutoff=new Date(Date.now()-days*86400000).toISOString();
let offset=0,processed=0;
while(true){
 const {data,error}=await db.from('staff_attendance').select('id,selfie_path').lt('server_timestamp',cutoff).not('selfie_path','is',null).order('id').range(offset,offset+99);
 if(error)throw new Error(error.message);if(!data?.length)break;
 if(apply){
  const removed=await db.storage.from('attendance-selfies').remove(data.map(row=>row.selfie_path));
  if(removed.error)throw new Error(removed.error.message);
  const cleared=await db.from('staff_attendance').update({selfie_path:null,latitude:null,longitude:null,location_accuracy_meters:null}).in('id',data.map(row=>row.id));
  if(cleared.error)throw new Error(cleared.error.message);
 }else offset+=data.length;
 processed+=data.length;
}
console.log(JSON.stringify({mode:apply?'applied':'preview',retentionDays:days,records:processed}));
