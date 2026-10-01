import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getAuthUser, isStaff, isOwnerOrAdmin, hasStoreAccess } from "@/lib/auth";
import { notifyOrderStatus } from "@/lib/push-notifications";
import { writeAudit } from "@/lib/audit";

type Params = { params: Promise<{ orderId: string }> };

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready"],
  ready: ["completed"],
  completed: [],
  cancelled: [],
};

export async function GET(request: NextRequest, { params }: Params) {
    const { orderId } = await params;
  try {
    const user = await getAuthUser(request);

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("*, table:tables(id,number,store_id), order_items(*, menu_item:menu_items(id,name,price)), payments(*)")
      .eq("id", orderId)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Auth check: staff with store access, or customer who owns this order
    const isOwner = user?.userId === order.user_id;
    const hasAccess = isStaff(user) && hasStoreAccess(user, order.store_id);

    if (!isOwner && !hasAccess) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    return NextResponse.json({ data: order }, { status: 200 });
  } catch (error: unknown) {
    console.error("Order GET error:", error);
    return NextResponse.json({ error: "Failed to fetch order" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
    const { orderId } = await params;
  try {
    const user = await getAuthUser(request);

    // Only staff can update orders
    if (!isStaff(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Fetch current order first
    const { data: current, error: fetchError } = await supabaseAdmin
      .from("orders")
      .select("id, store_id, status, payment_status, total_amount, notes")
      .eq("id", orderId)
      .single();

    if (fetchError || !current) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Check store access
    if (!hasStoreAccess(user, current.store_id)) {
      return NextResponse.json({ error: "Access denied for this store" }, { status: 403 });
    }

    const body = await request.json();
    const { status, notes } = body;

    // Validate status transition
    if (status && status !== current.status) {
      const allowed = VALID_STATUS_TRANSITIONS[current.status] ?? [];
      if (!allowed.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status transition: ${current.status} → ${status}` },
          { status: 400 }
        );
      }
    }

    // Only owner/admin can cancel
    if (status === "cancelled" && !isOwnerOrAdmin(user)) {
      return NextResponse.json({ error: "Only owner/admin can cancel orders" }, { status: 403 });
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (status) updatePayload.status = status;
    if (notes !== undefined) updatePayload.notes = notes;
    if (status === "ready") Object.assign(updatePayload, { call_active: true, called_at: new Date().toISOString(), call_acknowledged_at: null });
    if (status === "completed") Object.assign(updatePayload, { completed_at: new Date().toISOString(), completed_by: user!.userId, call_active: false });

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .update(updatePayload)
      .eq("id", orderId)
      .select()
      .single();

    if (error) throw error;

    if (status || notes !== undefined) await writeAudit(user!, current.store_id, status === "cancelled" ? "order.cancel" : status ? "order.status_change" : "order.notes_change", "order", orderId, current, order);

    if (status) await notifyOrderStatus(orderId, status);

    return NextResponse.json({ data: order }, { status: 200 });
  } catch (error: unknown) {
    console.error("Order PUT error:", error);
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
    const { orderId } = await params;
  try {
    const user = await getAuthUser(request);

    // Only owner can delete orders
    if (!isOwnerOrAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("store_id")
      .eq("id", orderId)
      .single();

    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    if (!hasStoreAccess(user, order.store_id)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from("orders")
      .delete()
      .eq("id", orderId);

    if (error) throw error;

    return NextResponse.json({ message: "Order deleted" }, { status: 200 });
  } catch (error: unknown) {
    console.error("Order DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete order" }, { status: 500 });
  }
}
