import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getAuthUser, isStaff, hasStoreAccess, isOwnerOrAdmin } from "@/lib/auth";
import { notifyOrderStatus } from "@/lib/push-notifications";
import { finalizeLoyaltyRedemption } from "@/lib/loyalty-order";

type Params = { params: Promise<{ orderId: string }> };

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:   ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready"],
  ready:     ["completed"],
  completed: [],
  cancelled: [],
};

export async function PUT(request: NextRequest, { params }: Params) {
    const { orderId } = await params;
  try {
    const user = await getAuthUser(request);
    if (!isStaff(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { status } = await request.json();
    if (!status) {
      return NextResponse.json({ error: "status is required" }, { status: 400 });
    }

    const { data: order, error: fetchErr } = await supabaseAdmin
      .from("orders")
      .select("id, store_id, status")
      .eq("id", orderId)
      .single();

    if (fetchErr || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (!hasStoreAccess(user, order.store_id)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const allowed = VALID_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(status)) {
      return NextResponse.json(
        { error: `Cannot transition ${order.status} → ${status}` },
        { status: 400 }
      );
    }

    if (status === "cancelled" && !isOwnerOrAdmin(user)) {
      return NextResponse.json({ error: "Only owner/admin can cancel orders" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("orders")
      .update({
        status,
        ...(status === "ready" ? { call_active: true, called_at: new Date().toISOString(), call_acknowledged_at: null } : {}),
        ...(status === "completed" ? { completed_at: new Date().toISOString() } : {}),
        ...(status === "completed" ? { completed_by: user!.userId, call_active: false } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .select()
      .single();

    if (error) throw error;

    await notifyOrderStatus(orderId, status);
    if (status === "cancelled") await finalizeLoyaltyRedemption(orderId, "failed");

    return NextResponse.json({ data }, { status: 200 });
  } catch (error: unknown) {
    console.error("Order status error:", error);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}
