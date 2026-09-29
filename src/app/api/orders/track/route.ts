import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getAuthUser, hasStoreAccess, isStaff } from "@/lib/auth";
export const dynamic = "force-dynamic";

export async function GET(request:NextRequest){
  try{
    const orderId=request.nextUrl.searchParams.get("orderId");
    const sessionId=request.nextUrl.searchParams.get("sessionId");
    if(!orderId) return NextResponse.json({error:"orderId required"},{status:400});
    const {data:order,error}=await supabaseAdmin.from("orders").select("*, store:stores(id,name,address,phone,email,logo), table:tables(id,number), order_items(id,name_snapshot,price_snapshot,quantity,subtotal,notes), payments(id,method,status,transaction_id,paid_at)").eq("id",orderId).single();
    if(error||!order) return NextResponse.json({error:"Order not found"},{status:404});
    const user=await getAuthUser(request);
    const allowedBySession=Boolean(sessionId&&order.anonymous_session_id&&sessionId===order.anonymous_session_id);
    const allowedByUser=Boolean(user?.userId&&user.userId===order.user_id);
    const allowedByStaff=Boolean(isStaff(user)&&hasStoreAccess(user,order.store_id));
    if(!allowedBySession&&!allowedByUser&&!allowedByStaff) return NextResponse.json({error:"Unauthorized"},{status:403});
    const {data:settings}=await supabaseAdmin.from("store_settings").select("key,value").eq("store_id",order.store_id).in("key",["promo_name","promo_description","promo_qr_url","promo_active"]);
    const promo=Object.fromEntries((settings||[]).map(row=>[row.key,row.value]));
    const {anonymous_session_id:_,snap_token:__,...safe}=order;
    return NextResponse.json({data:{...safe,cash_code:order.payment_method==="cash"?`CASH-${order.id}`:null,promo}});
  }catch(error){console.error("Track order error",error);return NextResponse.json({error:"Failed to track order"},{status:500});}
}
