import { randomBytes, createHash } from "crypto";
import {NextRequest,NextResponse} from "next/server";
import {getAuthUser} from "@/lib/auth";
import {supabaseAdmin} from "@/lib/supabase-server";
type Context={params:Promise<{orderId:string}>};
export async function POST(request:NextRequest,{params}:Context){
 const {orderId}=await params,body=await request.json(),user=await getAuthUser(request),sessionId=String(body.sessionId||"");
 const {data:order}=await supabaseAdmin.from("orders").select("id,user_id,anonymous_session_id,store_id,total_amount,payment_status,order_items(id,name_snapshot,quantity,subtotal)").eq("id",orderId).maybeSingle();
 if(!order)return NextResponse.json({error:"Pesanan tidak ditemukan"},{status:404});
 if(!(user?.userId&&user.userId===order.user_id)&&!(sessionId&&sessionId===order.anonymous_session_id))return NextResponse.json({error:"Hanya pemilik pesanan yang dapat membuat undangan split bill"},{status:403});
 if(order.payment_status!=="pending")return NextResponse.json({error:"Split bill hanya tersedia untuk pesanan yang belum dibayar"},{status:409});
 const count=Math.trunc(Number(body.count));if(count<2||count>10)return NextResponse.json({error:"Jumlah peserta harus 2–10"},{status:400});
 const mode=String(body.mode||"equal"),total=Math.round(Number(order.total_amount));let amounts:number[]=[];
 if(!Number.isSafeInteger(total)||total<count)return NextResponse.json({error:"Total pesanan tidak cukup untuk jumlah peserta"},{status:400});
 if(mode==="equal"){const base=Math.floor(total/count);amounts=Array.from({length:count},(_,i)=>base+(i<total%count?1:0));}
 else if(mode==="custom"){amounts=Array.isArray(body.amounts)?body.amounts.map(Number):[];if(amounts.length!==count||amounts.some(n=>!Number.isInteger(n)||n<=0)||amounts.reduce((a,b)=>a+b,0)!==total)return NextResponse.json({error:"Nominal peserta harus positif dan jumlahnya sama dengan total tagihan"},{status:400});}
 else if(mode==="items"){const assignments=Array.isArray(body.assignments)?body.assignments:[];if(assignments.length!==count)return NextResponse.json({error:"Pembagian item tidak valid"},{status:400});const owned=(order.order_items||[]) as {id:string;name_snapshot:string;quantity:number;subtotal:number}[];const seen=new Set<string>();for(const assignment of assignments){if(!Array.isArray(assignment.itemIds)||assignment.itemIds.length===0)return NextResponse.json({error:"Setiap peserta harus mendapat setidaknya satu item"},{status:400});for(const itemId of assignment.itemIds){if(seen.has(itemId)||!owned.some(item=>item.id===itemId))return NextResponse.json({error:"Setiap item harus dibagikan tepat satu kali"},{status:400});seen.add(itemId)}}if(seen.size!==owned.length)return NextResponse.json({error:"Masih ada item yang belum dibagikan"},{status:400});const subtotal=owned.reduce((n,item)=>n+Number(item.subtotal),0);if(!subtotal||total<count)return NextResponse.json({error:"Total pesanan tidak cukup untuk jumlah peserta"},{status:400});amounts=assignments.map((a:{itemIds:string[]})=>Math.round(owned.filter(item=>a.itemIds.includes(item.id)).reduce((n,item)=>n+Number(item.subtotal),0)*total/subtotal));amounts[amounts.length-1]+=total-amounts.reduce((a,b)=>a+b,0);if(amounts.some(amount=>amount<=0))return NextResponse.json({error:"Setiap peserta harus mendapat nominal positif"},{status:400});}
 else return NextResponse.json({error:"Mode pembagian tidak dikenal"},{status:400});
 const token=randomBytes(32).toString("base64url"),hash=createHash("sha256").update(token).digest("hex");
 const {data:bill,error}=await supabaseAdmin.from("split_bills").insert({order_id:orderId,created_by:user?.userId||null,invite_token_hash:hash,total_amount:total}).select("id").single();
 if(error)return NextResponse.json({error:error.code==="23505"?"Split bill sudah dibuat":"Gagal membuat split bill"},{status:409});
 const parts=amounts.map((amount,index)=>({split_bill_id:bill.id,label:`Peserta ${index+1}`,amount}));const {error:partError}=await supabaseAdmin.from("split_bill_parts").insert(parts);
 if(partError){await supabaseAdmin.from("split_bills").delete().eq("id",bill.id);return NextResponse.json({error:partError.message},{status:500});}
 await supabaseAdmin.from("orders").update({payment_method:"split"}).eq("id",orderId);
 return NextResponse.json({data:{url:new URL(`/split/${token}`,request.nextUrl.origin).toString(),token,amounts}});
}
