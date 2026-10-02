import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, hasStoreAccess, isOwnerOrAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-server";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function GET(request: NextRequest) {
  const storeId = request.nextUrl.searchParams.get("storeId") || "";
  const user = await getAuthUser(request);
  if (!storeId) return fail("storeId wajib diisi");
  const { data: rewards, error } = await supabaseAdmin.from("loyalty_rewards").select("id,store_id,name,description,points_cost,discount_amount,min_purchase,is_active")
    .eq("store_id", storeId).eq("is_active", true).order("points_cost");
  if (error) return fail(error.message, 500);
  if (user?.role !== "user") return NextResponse.json({ data: { points: 0, rewards: rewards || [], transactions: [], redemptions: [] } });
  const [account, transactions, redemptions] = await Promise.all([
    supabaseAdmin.from("loyalty_accounts").select("points").eq("user_id", user.userId).maybeSingle(),
    supabaseAdmin.from("loyalty_transactions").select("id,points,description,created_at,order_id").eq("user_id", user.userId).order("created_at", { ascending: false }).limit(50),
    supabaseAdmin.from("loyalty_redemptions").select("id,code,status,expires_at,created_at,reward:loyalty_rewards(name,discount_amount,min_purchase,store_id)").eq("user_id", user.userId).eq("status", "available").gte("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(50),
  ]);
  const redemptionsForStore = (redemptions.data || []).filter(row => {
    const reward = Array.isArray(row.reward) ? row.reward[0] : row.reward;
    return reward?.store_id === storeId;
  });
  return NextResponse.json({ data: { points: account.data?.points || 0, rewards: rewards || [], transactions: transactions.data || [], redemptions: redemptionsForStore } });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  const body = await request.json().catch(() => ({}));
  if (body.action === "create_reward") {
    const storeId = String(body.storeId || user?.storeId || "");
    if (!isOwnerOrAdmin(user) || !storeId || !hasStoreAccess(user, storeId)) return fail("Akses owner/admin diperlukan", 403);
    const name = String(body.name || "").trim().slice(0, 120);
    const pointsCost = Math.floor(Number(body.pointsCost));
    const discountAmount = Math.floor(Number(body.discountAmount));
    const minPurchase = Math.max(0, Math.floor(Number(body.minPurchase) || 0));
    if (!name || pointsCost < 1 || discountAmount < 1) return fail("Nama reward, biaya poin, dan diskon wajib valid");
    const { data, error } = await supabaseAdmin.from("loyalty_rewards").insert({ store_id: storeId, name, description: String(body.description || "").trim().slice(0, 500) || null, points_cost: pointsCost, discount_amount: discountAmount, min_purchase: minPurchase, is_active: true }).select().single();
    if (error) return fail(error.message, 500);
    await writeAudit(user!, storeId, "loyalty_reward.create", "loyalty_reward", data.id, null, data);
    return NextResponse.json({ data }, { status: 201 });
  }
  if (body.action === "redeem") {
    if (!user || user.role !== "user") return fail("Login sebagai pelanggan diperlukan", 401);
    const rewardId = String(body.rewardId || "");
    const { data: reward } = await supabaseAdmin.from("loyalty_rewards").select("id,store_id").eq("id", rewardId).eq("is_active", true).maybeSingle();
    if (!reward) return fail("Reward tidak tersedia", 404);
    const { data, error } = await supabaseAdmin.rpc("redeem_loyalty_reward", { p_user_id: user.userId, p_reward_id: rewardId });
    if (error) return fail(error.message, 409);
    return NextResponse.json({ data }, { status: 201 });
  }
  return fail("Aksi loyalti tidak dikenali");
}
