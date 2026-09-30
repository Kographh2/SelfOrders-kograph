import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getAuthUser, hasStoreAccess, isStaff } from "@/lib/auth";
export const dynamic = "force-dynamic";

export async function GET(request:NextRequest){
  try{
    const orderId=request.nextUrl.searchParams.get("orderId");
    const sessionId=request.nextUrl.searchParams.get("sessionId");
    if(!orderId) return NextResponse.json({error:"orderId required"},{status:400});
    const {data:order,error}=await supabaseAdmin.from("orders").select("*, store:stores(id,name,address,phone,email,logo), table:tables(id,number), order_items(id,menu_item_id,name_snapshot,price_snapshot,quantity,subtotal,notes,options_snapshot), payments(id,method,status,transaction_id,paid_at), order_feedback(id,rating,note,tip_amount)").eq("id",orderId).single();
    if(error||!order) return NextResponse.json({error:"Order not found"},{status:404});
    const user=await getAuthUser(request);
    const allowedBySession=Boolean(sessionId&&order.anonymous_session_id&&sessionId===order.anonymous_session_id);
    const allowedByUser=Boolean(user?.userId&&user.userId===order.user_id);
    const allowedByStaff=Boolean(isStaff(user)&&hasStoreAccess(user,order.store_id));
    if(!allowedBySession&&!allowedByUser&&!allowedByStaff) return NextResponse.json({error:"Unauthorized"},{status:403});
    const now=new Date().toISOString();
    const {data:promoRow}=await supabaseAdmin.from("promos").select("id,name,description,code,discount_type,discount_value").eq("store_id",order.store_id).eq("is_active",true).lte("starts_at",now).or(`ends_at.is.null,ends_at.gte.${now}`).order("created_at",{ascending:false}).limit(1).maybeSingle();
    const appUrl=process.env.NEXT_PUBLIC_APP_URL||request.nextUrl.origin;
    const promo=promoRow?{...promoRow,claim_url:`${appUrl}/promos/claim/${promoRow.id}`}:null;
    const {anonymous_session_id:_,snap_token:__,...safe}=order;
    const cashPayment=(order.payments||[]).find((payment:{id:string;method:string;transaction_id?:string})=>payment.method==="cash");
    let cashCode=cashPayment?.transaction_id||null;
    if(order.payment_method==="cash"&&cashPayment&&(!cashCode||cashCode.length>25)){
      cashCode=`CASH-${String(order.order_number).padStart(3,"0")}-${order.id.slice(0,8).toUpperCase()}`;
      await supabaseAdmin.from("payments").update({transaction_id:cashCode,updated_at:new Date().toISOString()}).eq("id",cashPayment.id);
    }
    return NextResponse.json({data:{...safe,cash_code:order.payment_method==="cash"?cashCode:null,promo}});
  }catch(error){console.error("Track order error",error);return NextResponse.json({error:"Failed to track order"},{status:500});}
}
