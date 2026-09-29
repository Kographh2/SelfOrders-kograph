import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { createSnapTransaction } from "@/lib/midtrans";
import { getAuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, sessionId } = body;

    if (!orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }

    // Fetch order from DB — DO NOT trust any amounts from client
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("*, order_items(id, name_snapshot, price_snapshot, quantity)")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const requester = await getAuthUser(request);
    const ownsOrder = (requester?.userId && requester.userId === order.user_id) ||
      (sessionId && sessionId === order.anonymous_session_id);
    if (!ownsOrder) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Only allow payment for pending orders
    if (order.payment_status !== "pending") {
      return NextResponse.json(
        { error: `Order payment status is already: ${order.payment_status}` },
        { status: 400 }
      );
    }

    if (order.status === "cancelled") {
      return NextResponse.json({ error: "Cannot pay for a cancelled order" }, { status: 400 });
    }

    // Re-use existing snap_token if present (avoid duplicate Midtrans transactions)
    if (order.snap_token) {
      return NextResponse.json(
        {
          data: {
            token: order.snap_token,
            redirectUrl: order.redirect_url,
          },
        },
        { status: 200 }
      );
    }

    // Build item details from DB snapshots — NO client prices
    const midtransItems = (order.order_items ?? []).map((item: {
      id: string;
      name_snapshot: string;
      price_snapshot: number;
      quantity: number;
    }) => ({
      id: item.id,
      name: item.name_snapshot,
      price: Math.round(item.price_snapshot),
      quantity: item.quantity,
    }));

    // Add tax & service as line items if > 0
    if (order.tax_amount > 0) {
      midtransItems.push({
        id: "tax",
        name: "Pajak (PPN 11%)",
        price: Math.round(order.tax_amount),
        quantity: 1,
      });
    }
    if (order.service_charge > 0) {
      midtransItems.push({
        id: "service",
        name: "Service Charge",
        price: Math.round(order.service_charge),
        quantity: 1,
      });
    }
    if (Number(order.promo_discount) > 0) {
      midtransItems.push({
        id: "promo-discount",
        name: "Diskon Promo",
        price: -Math.round(Number(order.promo_discount)),
        quantity: 1,
      });
    }

    const transaction = await createSnapTransaction({
      orderId: orderId, // Midtrans order_id = our order UUID
      amount: Math.round(order.total_amount), // Verified from DB
      items: midtransItems,
      customerName: order.customer_name ?? "Customer",
      customerEmail: order.customer_email ?? "",
      customerPhone: order.customer_phone ?? "",
    });

    // Store snap token in order
    await supabaseAdmin
      .from("orders")
      .update({
        snap_token: transaction.token,
        redirect_url: transaction.redirectUrl,
        payment_method: "snap",
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    // Update payment record
    await supabaseAdmin
      .from("payments")
      .update({
        method: "snap",
        transaction_id: transaction.token,
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", orderId);

    return NextResponse.json(
      {
        data: {
          token: transaction.token,
          redirectUrl: transaction.redirectUrl,
        },
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Payment initialization failed";
    console.error("Payment Midtrans error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
