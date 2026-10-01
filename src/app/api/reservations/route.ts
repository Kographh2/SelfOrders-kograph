import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getAuthUser, hasStoreAccess, isStaff } from "@/lib/auth";
import { getStoreOperatingStatus } from "@/lib/store-hours";
import { writeAudit } from "@/lib/audit";
import { randomBytes,createHash } from "crypto";
import { createSnapTransaction } from "@/lib/midtrans";

export async function GET(request: NextRequest) {
  const reservationId=request.nextUrl.searchParams.get("reservationId");
  if(reservationId){const accessToken=request.headers.get("x-phone-access-token")||"",{data:authData,error:authError}=accessToken?await supabaseAdmin.auth.getUser(accessToken):{data:{user:null},error:new Error("OTP required")};const phone=authData?.user?.phone;if(authError||!phone||!authData?.user?.phone_confirmed_at)return NextResponse.json({error:"Verifikasi HP diperlukan"},{status:401});const {data:reservation}=await supabaseAdmin.from("reservations").select("id,store_id,customer_name,phone,party_size,reserved_for,hold_until,table_id,deposit_status,deposit_amount,private_token_hash,table:tables(number)").eq("id",reservationId).eq("phone",phone).maybeSingle();if(!reservation)return NextResponse.json({error:"Reservasi tidak ditemukan"},{status:404});const {data:store}=await supabaseAdmin.from("stores").select("name").eq("id",reservation.store_id).maybeSingle();const rawToken=request.nextUrl.searchParams.get("privateToken")||"";const validPrivate=Boolean(rawToken&&createHash("sha256").update(rawToken).digest("hex")===reservation.private_token_hash);const privateUrl=["paid","not_required"].includes(reservation.deposit_status)&&validPrivate?new URL(`/reservations/private/${rawToken}`,request.nextUrl.origin).toString():null;return NextResponse.json({data:{...reservation,store,privateUrl}})}
  const user = await getAuthUser(request), storeId = request.nextUrl.searchParams.get("storeId") || user?.storeId;
  if (!isStaff(user) || !storeId || !hasStoreAccess(user, storeId)) return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  await supabaseAdmin.from("reservations").update({status:"no_show",updated_at:new Date().toISOString()}).eq("store_id",storeId).eq("status","confirmed").lt("hold_until",new Date().toISOString());
  const { data, error } = await supabaseAdmin.from("reservations").select("*,table:tables(number)").eq("store_id", storeId).gte("reserved_for", new Date(Date.now()-86400000).toISOString()).order("reserved_for").limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const {data:tables}=await supabaseAdmin.from("tables").select("id,number,is_active").eq("store_id",storeId).eq("is_active",true).order("number");
  return NextResponse.json({ data: data || [], tables:tables||[] });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const bearer = request.headers.get("x-phone-access-token") || "";
  const { data: authData, error: authError } = bearer ? await supabaseAdmin.auth.getUser(bearer) : { data: { user: null }, error: new Error("Phone verification required") };
  const verified = authData?.user;
  if (authError || !verified?.phone || !verified.phone_confirmed_at) return NextResponse.json({ error: "Verifikasi nomor HP diperlukan" }, { status: 401 });
  const storeId = String(body.storeId || ""), reservedFor = new Date(body.reservedFor), partySize = Number(body.partySize);
  if (!storeId || !Number.isFinite(reservedFor.getTime()) || reservedFor.getTime() < Date.now()+30*60000 || reservedFor.getTime() > Date.now()+30*86400000 || !Number.isInteger(partySize) || partySize < 1 || partySize > 30) return NextResponse.json({ error: "Waktu reservasi atau jumlah orang tidak valid" }, { status: 400 });
  const { data: store } = await supabaseAdmin.from("stores").select("id,name,is_active,manual_closed,opening_hours,timezone,reservation_deposit_per_guest").eq("id",storeId).maybeSingle();
  if (!store || !getStoreOperatingStatus(store,reservedFor).is_open) return NextResponse.json({ error: "Cabang tutup pada waktu tersebut" }, { status: 409 });
  const { count } = await supabaseAdmin.from("reservations").select("id",{count:"exact",head:true}).eq("phone",verified.phone).gte("reserved_for",new Date().toISOString()).not("status","in","(cancelled,no_show)");
  if ((count || 0) >= 2) return NextResponse.json({ error: "Maksimal dua reservasi aktif per nomor HP" }, { status: 429 });
  const customerName=String(body.customerName||"").trim();if(!customerName)return NextResponse.json({error:"Nama wajib diisi"},{status:400});
  const depositAmount=Math.max(0,Number(store.reservation_deposit_per_guest||0)*partySize);const rawPrivateToken=randomBytes(32).toString("base64url"),privateHash=createHash("sha256").update(rawPrivateToken).digest("hex");
  const { data: created, error } = await supabaseAdmin.rpc("create_reservation_atomic", {
    p_store_id: storeId,
    p_requested_table_id: body.tableId ? String(body.tableId) : null,
    p_customer_name: customerName.slice(0,100),
    p_phone: verified.phone,
    p_party_size: partySize,
    p_reserved_for: reservedFor.toISOString(),
    p_hold_until: new Date(reservedFor.getTime()+15*60000).toISOString(),
    p_deposit_amount: depositAmount,
    p_private_token_hash: privateHash,
    p_notes: String(body.notes||"").slice(0,300),
  });
  const data=Array.isArray(created)?created[0]:created;
  if (error || !data) {
    const message=error?.message||"Gagal membuat reservasi";
    const status=message.includes("Maksimal")?429:message.includes("Meja")||message.includes("meja")?409:400;
    return NextResponse.json({error:message},{status});
  }
  if(depositAmount<=0)return NextResponse.json({data:{reservation:data,privateToken:rawPrivateToken,privateUrl:new URL(`/reservations/private/${rawPrivateToken}`,request.nextUrl.origin).toString()}},{status:201});
  const externalId=`RES-${data.id}`;try{const transaction=await createSnapTransaction({orderId:externalId,amount:depositAmount,items:[{id:data.id,name:`DP Reservasi ${store.name}`,price:depositAmount,quantity:1}],customerName,customerPhone:verified.phone,finishUrl:new URL(`/reservations/new?store=${storeId}&reservation=${data.id}`,request.nextUrl.origin).toString()});await supabaseAdmin.from("reservations").update({midtrans_order_id:externalId,snap_token:transaction.token}).eq("id",data.id);return NextResponse.json({data:{reservation:data,snapToken:transaction.token,privateToken:rawPrivateToken,privateUrl:null}},{status:201});}catch(error){await supabaseAdmin.from("reservations").update({status:"cancelled",deposit_status:"failed"}).eq("id",data.id);return NextResponse.json({error:error instanceof Error?error.message:"Gagal menyiapkan pembayaran DP"},{status:502});}
}

export async function PATCH(request: NextRequest) {
  const user=await getAuthUser(request); if(!isStaff(user))return NextResponse.json({error:"Akses ditolak"},{status:403});
  const body=await request.json(), id=String(body.id||""), status=String(body.status||"");
  if(!["confirmed","arrived","seated","cancelled","no_show"].includes(status))return NextResponse.json({error:"Status tidak valid"},{status:400});
  const {data:before}=await supabaseAdmin.from("reservations").select("*").eq("id",id).maybeSingle();
  if(!before||!hasStoreAccess(user,before.store_id))return NextResponse.json({error:"Reservasi tidak ditemukan"},{status:404});
  const tableId=body.tableId===undefined?before.table_id:(body.tableId||null);
  const {data,error}=await supabaseAdmin.rpc("update_reservation_atomic",{p_reservation_id:id,p_status:status,p_table_id:tableId});
  if(error)return NextResponse.json({error:error.message},{status:error.message.toLowerCase().includes("meja")?409:400});
  await writeAudit(user!,before.store_id,`reservation.${status}`,"reservation",id,before,data); return NextResponse.json({data});
}
