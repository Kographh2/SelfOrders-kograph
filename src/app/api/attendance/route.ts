import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, hasStoreAccess, isStaff, isOwnerOrAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-server";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
function getLocalDate(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(lat2 - lat1), dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!isStaff(user)) return fail("Login staf diperlukan", 401);
  const storeId = request.nextUrl.searchParams.get("storeId") || user?.storeId || "";
  if (!storeId || !hasStoreAccess(user, storeId)) return fail("Akses cabang ditolak", 403);
  const { data: store } = await supabaseAdmin.from("stores").select("timezone").eq("id", storeId).maybeSingle();
  if (!store) return fail("Cabang tidak ditemukan", 404);
  const workDate = request.nextUrl.searchParams.get("date") || getLocalDate(new Date(), store.timezone || "Asia/Jakarta");
  let query = supabaseAdmin.from("staff_attendance").select("*,staff:users!staff_attendance_staff_id_fkey(id,name,email)").eq("store_id", storeId).eq("work_date", workDate).order("server_timestamp", { ascending: false });
  if (!isOwnerOrAdmin(user)) query = query.eq("staff_id", user!.userId);
  const [rows, settings] = await Promise.all([query, supabaseAdmin.from("store_attendance_settings").select("*").eq("store_id", storeId).maybeSingle()]);
  if (rows.error || settings.error) return fail(rows.error?.message || settings.error?.message || "Gagal memuat absensi", 500);
  const attendance = await Promise.all((rows.data || []).map(async row => {
    if (!row.selfie_path) return row;
    const { data } = await supabaseAdmin.storage.from("attendance-selfies").createSignedUrl(row.selfie_path, 15 * 60);
    return { ...row, selfie_url: data?.signedUrl || null };
  }));
  return NextResponse.json({ data: { workDate, attendance, settings: settings.data || { radius_meters: 200, require_location: true, require_selfie: true, allow_outside_geofence: false } } });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!isStaff(user)) return fail("Login staf diperlukan", 401);
  const form = await request.formData();
  const storeId = String(form.get("storeId") || user?.storeId || "");
  const eventType = String(form.get("eventType") || "");
  if (!storeId || !hasStoreAccess(user, storeId)) return fail("Akses cabang ditolak", 403);
  if (!["clock_in", "clock_out"].includes(eventType)) return fail("Jenis absensi tidak valid");
  const { data: store } = await supabaseAdmin.from("stores").select("timezone").eq("id", storeId).maybeSingle();
  if (!store) return fail("Cabang tidak ditemukan", 404);
  const { data: settingsRow } = await supabaseAdmin.from("store_attendance_settings").select("*").eq("store_id", storeId).maybeSingle();
  const settings = settingsRow || { latitude: null, longitude: null, radius_meters: 200, require_location: true, require_selfie: true, allow_outside_geofence: false };
  const latitudeRaw = form.get("latitude"), longitudeRaw = form.get("longitude");
  const latitude = latitudeRaw == null || latitudeRaw === "" ? null : Number(latitudeRaw);
  const longitude = longitudeRaw == null || longitudeRaw === "" ? null : Number(longitudeRaw);
  const accuracy = Number(form.get("accuracy"));
  const hasLocation = Number.isFinite(latitude) && Number.isFinite(longitude) && latitude! >= -90 && latitude! <= 90 && longitude! >= -180 && longitude! <= 180;
  if (settings.require_location && !hasLocation) return fail("Izin/lokasi GPS diperlukan untuk absen", 400);
  if (settings.require_location && Number.isFinite(accuracy) && accuracy > 500) return fail("Akurasi GPS terlalu rendah. Coba di area terbuka lalu ulangi.", 400);

  const now = new Date();
  const workDate = getLocalDate(now, store.timezone || "Asia/Jakarta");
  const { data: clockIn } = await supabaseAdmin.from("staff_attendance").select("id").eq("store_id", storeId).eq("staff_id", user!.userId).eq("work_date", workDate).eq("event_type", "clock_in").maybeSingle();
  const { data: clockOut } = await supabaseAdmin.from("staff_attendance").select("id").eq("store_id", storeId).eq("staff_id", user!.userId).eq("work_date", workDate).eq("event_type", "clock_out").maybeSingle();
  if (eventType === "clock_in" && clockIn) return fail("Kamu sudah absen masuk hari ini", 409);
  if (eventType === "clock_out" && !clockIn) return fail("Absen masuk terlebih dahulu", 409);
  if (eventType === "clock_out" && clockOut) return fail("Kamu sudah absen pulang hari ini", 409);

  let distance: number | null = null;
  let geofencePassed: boolean | null = null;
  if (hasLocation && settings.latitude != null && settings.longitude != null) {
    distance = Math.round(distanceMeters(latitude!, longitude!, Number(settings.latitude), Number(settings.longitude)));
    geofencePassed = distance <= Number(settings.radius_meters);
    if (!geofencePassed && !settings.allow_outside_geofence) return fail(`Kamu berada di luar radius cabang (${distance} m; batas ${settings.radius_meters} m)`, 403);
  }

  const selfie = form.get("selfie");
  if (settings.require_selfie && !(selfie instanceof File)) return fail("Selfie kamera wajib diambil saat absen", 400);
  if (selfie instanceof File && (!new Set(["image/jpeg", "image/webp"]).has(selfie.type) || selfie.size < 1024 || selfie.size > 5 * 1024 * 1024)) return fail("Selfie harus JPEG/WebP, 1 KB–5 MB", 400);
  let selfiePath: string | null = null;
  if (selfie instanceof File) {
    const extension = selfie.type === "image/webp" ? "webp" : "jpg";
    selfiePath = `${storeId}/${workDate}/${user!.userId}/${randomUUID()}.${extension}`;
    const { error } = await supabaseAdmin.storage.from("attendance-selfies").upload(selfiePath, await selfie.arrayBuffer(), { contentType: selfie.type, upsert: false });
    if (error) return fail("Foto absensi belum bisa disimpan. Pastikan migrasi/bucket absensi sudah diterapkan.", 503);
  }

  const scheduleId = String(form.get("scheduleId") || "") || null;
  if (scheduleId) {
    const { data: schedule } = await supabaseAdmin.from("staff_schedules").select("id").eq("id", scheduleId).eq("store_id", storeId).eq("staff_id", user!.userId).eq("work_date", workDate).maybeSingle();
    if (!schedule) return fail("Jadwal absensi tidak valid untuk staf/cabang/tanggal ini", 403);
  }
  const clientTimestampValue = String(form.get("clientTimestamp") || "");
  const parsedClientTimestamp = clientTimestampValue ? new Date(clientTimestampValue) : null;
  const clientTimestamp = parsedClientTimestamp && Number.isFinite(parsedClientTimestamp.getTime()) ? parsedClientTimestamp.toISOString() : null;
  const { data, error } = await supabaseAdmin.from("staff_attendance").insert({
    store_id: storeId, staff_id: user!.userId, schedule_id: scheduleId, work_date: workDate, event_type: eventType,
    client_timestamp: clientTimestamp,
    latitude: hasLocation ? latitude : null, longitude: hasLocation ? longitude : null,
    location_accuracy_meters: Number.isFinite(accuracy) ? Math.max(0, accuracy) : null,
    distance_from_store_meters: distance, geofence_passed: geofencePassed, selfie_path: selfiePath,
  }).select().single();
  if (error) {
    if (selfiePath) await supabaseAdmin.storage.from("attendance-selfies").remove([selfiePath]);
    return fail(error.code === "23505" ? "Absensi untuk waktu ini sudah tercatat" : error.message, 409);
  }
  await writeAudit(user!, storeId, `attendance.${eventType}`, "staff_attendance", data.id, null, { workDate, serverTimestamp: data.server_timestamp, geofencePassed, distance });
  return NextResponse.json({ data: { ...data, selfie_path: undefined, distance_from_store_meters: distance, geofence_passed: geofencePassed } }, { status: 201 });
}
