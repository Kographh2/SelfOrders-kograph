import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getAuthUser, isStaff, hasStoreAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Simple in-memory cache: { key: { data, expiresAt } }
// Prevents hammering DB if client somehow polls fast
const cache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 5_000; // 5 seconds

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!isStaff(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const storeId = searchParams.get("storeId") ?? user?.storeId;

    if (!storeId && user?.role !== "owner") {
      return NextResponse.json({ error: "Store ID required" }, { status: 400 });
    }
    if (storeId && !hasStoreAccess(user, storeId)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // ── Cache check ──────────────────────────────────────────────
    const cacheKey = `stats:${user?.userId}:${storeId ?? "all"}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(
        { data: cached.data },
        {
          status: 200,
          headers: {
            "Cache-Control": "private, max-age=5",
            "X-Cache": "HIT",
          },
        }
      );
    }

    // ── Fetch from DB ────────────────────────────────────────────
    const storesQuery = user?.role === "owner"
      ? supabaseAdmin.from("stores").select("id, name, is_active")
      : supabaseAdmin.from("stores").select("id, name, is_active").eq("id", storeId!);

    const usersQuery = user?.role === "owner"
      ? supabaseAdmin.from("users").select("id, name, role, is_active")
      : supabaseAdmin.from("users").select("id, name, role, is_active").eq("store_id", storeId!);

    const catsQ = storeId
      ? supabaseAdmin.from("categories").select("id, name, is_active").eq("store_id", storeId)
      : supabaseAdmin.from("categories").select("id, name, is_active");

    const itemsQ = storeId
      ? supabaseAdmin.from("menu_items").select("id, name, price, is_available").eq("store_id", storeId)
      : supabaseAdmin.from("menu_items").select("id, name, price, is_available");

    const ordersQ = storeId
      ? supabaseAdmin
          .from("orders")
          .select("id, status, payment_status, total_amount, created_at")
          .eq("store_id", storeId)
          .order("created_at", { ascending: false })
          .limit(50)
      : supabaseAdmin
          .from("orders")
          .select("id, status, payment_status, total_amount, created_at")
          .order("created_at", { ascending: false })
          .limit(50);

    const tablesQ = storeId
      ? supabaseAdmin.from("tables").select("id, number, is_active").eq("store_id", storeId)
      : supabaseAdmin.from("tables").select("id, number, is_active");

    const [storesRes, usersRes, catsRes, itemsRes, ordersRes, tablesRes] = await Promise.all([
      storesQuery, usersQuery, catsQ, itemsQ, ordersQ, tablesQ,
    ]);

    const data = {
      stores:    storesRes.data  ?? [],
      users:     usersRes.data   ?? [],
      categories: catsRes.data   ?? [],
      menuItems:  itemsRes.data  ?? [],
      orders:     ordersRes.data ?? [],
      tables:     tablesRes.data ?? [],
    };

    // ── Store in cache ───────────────────────────────────────────
    cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    // Cleanup old entries to prevent memory leak
    if (cache.size > 200) {
      const now = Date.now();
      for (const [k, v] of cache.entries()) {
        if (v.expiresAt < now) cache.delete(k);
      }
    }

    return NextResponse.json(
      { data },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, max-age=5",
          "X-Cache": "MISS",
        },
      }
    );
  } catch (error: unknown) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
