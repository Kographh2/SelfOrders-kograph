import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getAuthUser, isOwnerOrAdmin } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user || !isOwnerOrAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const storeId = searchParams.get("storeId");
    if (user.role === "admin" && (!user.storeId || (storeId && storeId !== user.storeId))) return NextResponse.json({ error: "Akses cabang ditolak" }, { status: 403 });

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
      .select("role,store_id,is_active")
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

    await writeAudit(user,target.store_id,"user.deactivate","user",userId,{is_active:target.is_active},{is_active:false});
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
      if (typeof name!=="string" || !name.trim() || name.trim().length>120) {
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
    if (user.role !== "owner") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Prevent privilege escalation to owner unless caller is owner
    if (role === "owner" && user.role !== "owner") {
      return NextResponse.json({ error: "Only owners can assign owner role" }, { status: 403 });
    }

    const { data: target, error: targetError } = await supabaseAdmin.from("users").select("id,role,store_id,is_active,name").eq("id", userId).maybeSingle();
    if (targetError || !target) return NextResponse.json({ error: "Pengguna tidak ditemukan" }, { status: 404 });
    if (target.role === "owner" && (role !== undefined || storeId !== undefined || isActive !== undefined)) return NextResponse.json({ error: "Hak dan status owner tidak dapat diubah melalui jalur ini" }, { status: 403 });
    if (role !== undefined && !["user", "kasir", "admin", "owner"].includes(role)) return NextResponse.json({ error: "Role tidak valid" }, { status: 400 });
    if (isActive !== undefined && typeof isActive !== "boolean") return NextResponse.json({ error: "Status tidak valid" }, { status: 400 });
    if (name !== undefined && (typeof name !== "string" || !name.trim() || name.length > 120)) return NextResponse.json({ error: "Nama tidak valid" }, { status: 400 });
    const nextStore = storeId === undefined ? target.store_id : storeId;
    if (["kasir", "admin"].includes(role ?? target.role) && !nextStore) return NextResponse.json({ error: "Staf wajib memiliki cabang" }, { status: 400 });
    if (nextStore) {
      const { data: store } = await supabaseAdmin.from("stores").select("id").eq("id", nextStore).eq("is_active", true).maybeSingle();
      if (!store) return NextResponse.json({ error: "Cabang tidak valid" }, { status: 400 });
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
    await writeAudit(user, data.store_id, "user.update", "user", userId, target, data);
    return NextResponse.json({ data }, { status: 200 });
  } catch (error: unknown) {
    console.error("Users PATCH error:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
