import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { createSnapTransaction } from "@/lib/midtrans";
import { getAuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let claimedOrder: string | null = null;
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
    const { data: activeSplit } = await supabaseAdmin.from("split_bills").select("id").eq("order_id", orderId).eq("status", "active").maybeSingle();
    if (activeSplit) return NextResponse.json({ error: "Pembayaran penuh dinonaktifkan karena pesanan menggunakan split bill" }, { status: 409 });

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

    const {data:claimed,error:claimError}=await supabaseAdmin.from("orders")
      .update({payment_attempt_state:"creating",payment_method:"snap"})
      .eq("id",orderId).eq("payment_status","pending").neq("status","cancelled").eq("payment_attempt_state","idle")
      .is("snap_token",null).select("id").maybeSingle();
    if(claimError || !claimed)return NextResponse.json({error:"Pembayaran sedang disiapkan atau perlu diperiksa. Buka halaman pesanan."},{status:409});
    claimedOrder=orderId;
    // One authoritative total avoids item rounding and option/loyalty discrepancies.
    const midtransItems=[{id:orderId,name:`Pesanan #${order.order_number}`,price:Math.round(order.total_amount),quantity:1}];
    const transaction = await createSnapTransaction({
      orderId: orderId, // Midtrans order_id = our order UUID
      amount: Math.round(order.total_amount), // Verified from DB
      items: midtransItems,
      customerName: order.customer_name ?? "Customer",
      customerEmail: order.customer_email ?? "",
      customerPhone: order.customer_phone ?? "",
      // Use the host that received checkout so Midtrans returns to the
      // correct production/preview deployment even if APP_URL is stale.
      finishUrl: new URL(`/payment/finish?orderId=${encodeURIComponent(orderId)}`, request.nextUrl.origin).toString(),
    });

    // Store snap token in order
    const {error:saveError}=await supabaseAdmin
      .from("orders")
      .update({
        payment_attempt_state: "ready",
        snap_token: transaction.token,
        redirect_url: transaction.redirectUrl,
        payment_method: "snap",
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if(saveError)throw new Error("Token pembayaran belum berhasil disimpan");
    claimedOrder=null;
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
    if(claimedOrder)await supabaseAdmin.from("orders").update({payment_attempt_state:"uncertain"}).eq("id",claimedOrder).eq("payment_attempt_state","creating");
    const msg = error instanceof Error ? error.message : "Payment initialization failed";
    console.error("Payment Midtrans error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
