import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getAuthUser, isOwnerOrAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user || !isOwnerOrAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const storeId = searchParams.get("storeId");

    let query = supabaseAdmin
      .from("users")
      .select("id, email, name, role, store_id, is_active, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (user.role === "admin" && user.storeId) {
      query = query.eq("store_id", user.storeId);
    } else if (storeId) {
      query = query.eq("store_id", storeId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data ?? [] }, { status: 200 });
  } catch (error: unknown) {
    console.error("Users GET error:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user || user.role !== "owner") {
      return NextResponse.json({ error: "Only owners can deactivate users" }, { status: 403 });
    }

    const body = await request.json();
    const { userId } = body;
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
    if (userId === user.userId) {
      return NextResponse.json({ error: "Cannot deactivate yourself" }, { status: 400 });
    }

    const { data: target } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", userId)
      .single();

    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (target.role === "owner") {
      return NextResponse.json({ error: "Cannot deactivate another owner" }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from("users")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (error) throw error;

    return NextResponse.json({ message: "User deactivated" }, { status: 200 });
  } catch (error: unknown) {
    return NextResponse.json({ error: "Failed to deactivate user" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { userId, role, storeId, isActive, name } = body;

    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    // Allow users to update their own name only
    const isSelf = userId === user.userId;

    if (isSelf) {
      // Self-update: only allow name change
      if (role !== undefined || storeId !== undefined || isActive !== undefined) {
        return NextResponse.json({ error: "Cannot change own role, store, or status" }, { status: 403 });
      }
      if (!name?.trim()) {
        return NextResponse.json({ error: "Name is required" }, { status: 400 });
      }
      const { data, error } = await supabaseAdmin
        .from("users")
        .update({ name: name.trim(), updated_at: new Date().toISOString() })
        .eq("id", userId)
        .select("id, email, name, role, store_id, is_active")
        .single();
      if (error) throw error;
      return NextResponse.json({ data }, { status: 200 });
    }

    // Non-self: must be owner or admin
    if (!isOwnerOrAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Prevent privilege escalation to owner unless caller is owner
    if (role === "owner" && user.role !== "owner") {
      return NextResponse.json({ error: "Only owners can assign owner role" }, { status: 403 });
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (name     !== undefined) updatePayload.name      = name.trim();
    if (role     !== undefined) updatePayload.role      = role;
    if (storeId  !== undefined) updatePayload.store_id  = storeId || null;
    if (isActive !== undefined && user.role === "owner") {
      updatePayload.is_active = isActive;
    }

    const { data, error } = await supabaseAdmin
      .from("users")
      .update(updatePayload)
      .eq("id", userId)
      .select("id, email, name, role, store_id, is_active")
      .single();

    if (error) throw error;
    return NextResponse.json({ data }, { status: 200 });
  } catch (error: unknown) {
    console.error("Users PATCH error:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
