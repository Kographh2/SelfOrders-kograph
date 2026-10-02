import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, hasStoreAccess, isOwnerOrAdmin, isStaff } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-server";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  const storeId = request.nextUrl.searchParams.get("storeId") || user?.storeId || "";
  if (!isStaff(user) || !storeId || !hasStoreAccess(user, storeId)) return fail("Akses cabang ditolak", 403);
  const from = request.nextUrl.searchParams.get("from") || new Date().toISOString().slice(0, 10);
  const to = request.nextUrl.searchParams.get("to") || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const manager = isOwnerOrAdmin(user);
  const [schedules, attendance, users, settings] = await Promise.all([
    supabaseAdmin.from("staff_schedules").select("*,staff:users!staff_schedules_staff_id_fkey(id,name,email,role)").eq("store_id", storeId).gte("work_date", from).lte("work_date", to).order("work_date").order("starts_at"),
    supabaseAdmin.from("staff_attendance").select("*,staff:users!staff_attendance_staff_id_fkey(id,name,email)").eq("store_id", storeId).gte("work_date", from).lte("work_date", to).order("server_timestamp", { ascending: false }).limit(500),
    manager ? supabaseAdmin.from("users").select("id,name,email,role").eq("store_id", storeId).in("role", ["admin", "kasir"]).eq("is_active", true).order("name") : Promise.resolve({ data: [], error: null }),
    manager ? supabaseAdmin.from("store_attendance_settings").select("*").eq("store_id", storeId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  const error = schedules.error || attendance.error || users.error || settings.error;
  if (error) return fail(error.message, 500);
  const rows = await Promise.all((attendance.data || []).map(async row => {
    if (!row.selfie_path) return row;
    const { data } = await supabaseAdmin.storage.from("attendance-selfies").createSignedUrl(row.selfie_path, 15 * 60);
    return { ...row, selfie_url: data?.signedUrl || null };
  }));
  return NextResponse.json({ data: { schedules: schedules.data || [], attendance: rows, users: users.data || [], settings: settings.data || null, manager } });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!isOwnerOrAdmin(user)) return fail("Akses owner/admin diperlukan", 403);
  const body = await request.json().catch(() => ({}));
  const storeId = String(body.storeId || user?.storeId || "");
  if (!storeId || !hasStoreAccess(user, storeId)) return fail("Cabang tidak valid", 403);

  if (body.action === "schedule") {
    const staffId = String(body.staffId || "");
    const workDate = String(body.workDate || "");
    const startsAt = String(body.startsAt || "");
    const endsAt = String(body.endsAt || "");
    if (!staffId || !/^\d{4}-\d{2}-\d{2}$/.test(workDate) || !/^\d{2}:\d{2}$/.test(startsAt) || !/^\d{2}:\d{2}$/.test(endsAt) || startsAt >= endsAt) return fail("Tanggal atau waktu shift tidak valid");
    const { data: staff } = await supabaseAdmin.from("users").select("id,role").eq("id", staffId).eq("store_id", storeId).eq("is_active", true).maybeSingle();
    if (!staff || !["kasir", "admin"].includes(staff.role)) return fail("Staf tidak ditemukan di cabang ini", 404);
    const { data: overlaps } = await supabaseAdmin.from("staff_schedules").select("id").eq("store_id", storeId).eq("staff_id", staffId).eq("work_date", workDate).lt("starts_at", endsAt).gt("ends_at", startsAt).limit(1);
    if (overlaps?.length) return fail("Jadwal staf bertabrakan dengan shift lain", 409);
    const { data, error } = await supabaseAdmin.from("staff_schedules").insert({ store_id: storeId, staff_id: staffId, work_date: workDate, starts_at: startsAt, ends_at: endsAt, role_label: String(body.roleLabel || "").trim().slice(0, 80) || null, notes: String(body.notes || "").trim().slice(0, 500) || null, created_by: user!.userId }).select().single();
    if (error) return fail(error.message, 500);
    await writeAudit(user!, storeId, "staff_schedule.create", "staff_schedule", data.id, null, data);
    return NextResponse.json({ data }, { status: 201 });
  }

  if (body.action === "attendance_settings") {
    const latitude = body.latitude === "" || body.latitude == null ? null : Number(body.latitude);
    const longitude = body.longitude === "" || body.longitude == null ? null : Number(body.longitude);
    const radius = Math.floor(Number(body.radiusMeters || 200));
    if ((latitude == null) !== (longitude == null) || (latitude != null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) || (longitude != null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) || radius < 20 || radius > 5000) return fail("Lokasi cabang atau radius tidak valid");
    const { data, error } = await supabaseAdmin.from("store_attendance_settings").upsert({ store_id: storeId, latitude, longitude, radius_meters: radius, require_location: body.requireLocation !== false, require_selfie: body.requireSelfie !== false, allow_outside_geofence: body.allowOutsideGeofence === true, updated_by: user!.userId, updated_at: new Date().toISOString() }).select().single();
    if (error) return fail(error.message, 500);
    await writeAudit(user!, storeId, "attendance.settings", "store_attendance_settings", storeId, null, data);
    return NextResponse.json({ data });
  }
  return fail("Aksi jadwal tidak dikenali");
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!isOwnerOrAdmin(user)) return fail("Akses owner/admin diperlukan", 403);
  const id = request.nextUrl.searchParams.get("id") || "";
  const { data: schedule } = await supabaseAdmin.from("staff_schedules").select("id,store_id").eq("id", id).maybeSingle();
  if (!schedule || !hasStoreAccess(user, schedule.store_id)) return fail("Jadwal tidak ditemukan", 404);
  const { error } = await supabaseAdmin.from("staff_schedules").delete().eq("id", id);
  if (error) return fail(error.message, 500);
  await writeAudit(user!, schedule.store_id, "staff_schedule.delete", "staff_schedule", id);
  return NextResponse.json({ success: true });
}
