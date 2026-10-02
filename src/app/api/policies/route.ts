import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getAuthUser, hasStoreAccess, isOwnerOrAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-server";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const types = ["privacy", "terms", "refund"] as const;

export async function GET(request: NextRequest) {
  const storeId = request.nextUrl.searchParams.get("storeId") || "";
  const user = await getAuthUser(request);
  const includeDraft = request.nextUrl.searchParams.get("includeDraft") === "1" && isOwnerOrAdmin(user) && (!storeId || hasStoreAccess(user, storeId));
  const [globalDocs, localDocs, globalFaq, localFaq] = await Promise.all([
    supabaseAdmin.from("store_documents").select("id,store_id,document_type,version,title,content,status,published_at,created_at").is("store_id", null).order("version", { ascending: false }),
    storeId ? supabaseAdmin.from("store_documents").select("id,store_id,document_type,version,title,content,status,published_at,created_at").eq("store_id", storeId).order("version", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    supabaseAdmin.from("store_faqs").select("id,store_id,question,answer,display_order,is_published,updated_at").is("store_id", null).eq("is_published", true).order("display_order"),
    storeId ? supabaseAdmin.from("store_faqs").select("id,store_id,question,answer,display_order,is_published,updated_at").eq("store_id", storeId).eq("is_published", true).order("display_order") : Promise.resolve({ data: [], error: null }),
  ]);
  const error = globalDocs.error || localDocs.error || globalFaq.error || localFaq.error;
  if (error) return fail(error.message, 500);
  let documents = [...(localDocs.data || []), ...(globalDocs.data || [])].filter(row => includeDraft || row.status === "published");
  documents = documents.filter((row, index, all) => all.findIndex(candidate => candidate.document_type === row.document_type && candidate.store_id === row.store_id) === index);
  const faqs = [...(localFaq.data || []), ...(globalFaq.data || [])];
  return NextResponse.json({ data: { documents, faqs } });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  const body = await request.json().catch(() => ({}));
  if (body.action === "accept") {
    const type = String(body.documentType || "");
    const storeId = String(body.storeId || "") || null;
    const sessionId = String(body.sessionId || "");
    if (!types.includes(type as (typeof types)[number]) || (!user?.userId && sessionId.length < 16)) return fail("Persetujuan tidak valid");
    const scope = supabaseAdmin.from("store_documents").select("id,version").eq("document_type", type).eq("status", "published");
    const { data: doc } = storeId ? await scope.eq("store_id", storeId).maybeSingle() : await scope.is("store_id", null).maybeSingle();
    if (!doc) return fail("Dokumen belum dipublikasikan", 404);
    const anonymousSessionHash = user?.userId ? null : createHash("sha256").update(sessionId).digest("hex");
    const { error } = await supabaseAdmin.from("policy_acceptances").insert({ user_id: user?.userId || null, anonymous_session_hash: anonymousSessionHash, store_id: storeId, document_id: doc.id, document_version: doc.version });
    if (error && error.code !== "23505") return fail(error.message, 500);
    return NextResponse.json({ accepted: true, version: doc.version });
  }

  if (!isOwnerOrAdmin(user)) return fail("Akses owner/admin diperlukan", 403);
  const storeId = String(body.storeId || user?.storeId || "") || null;
  if (storeId && !hasStoreAccess(user, storeId)) return fail("Cabang tidak valid", 403);

  if (body.action === "document") {
    const type = String(body.documentType || "");
    const title = String(body.title || "").trim().slice(0, 160);
    const content = String(body.content || "").trim().slice(0, 30000);
    const publish = body.publish === true;
    if (!types.includes(type as (typeof types)[number]) || title.length < 3 || content.length < 50) return fail("Judul dan isi dokumen (minimal 50 karakter) wajib dilengkapi");
    let versionQuery = supabaseAdmin.from("store_documents").select("version").eq("document_type", type).order("version", { ascending: false }).limit(1);
    const { data: versions } = storeId ? await versionQuery.eq("store_id", storeId) : await versionQuery.is("store_id", null);
    const version = Number(versions?.[0]?.version || 0) + 1;
    const { data: created, error } = await supabaseAdmin.from("store_documents").insert({ store_id: storeId, document_type: type, version, title, content, status: "draft", created_by: user!.userId }).select().single();
    if (error) return fail(error.message, 500);
    if (publish) {
      let currentQuery = supabaseAdmin.from("store_documents").update({ status: "archived" }).eq("document_type", type).eq("status", "published");
      if (storeId) currentQuery = currentQuery.eq("store_id", storeId); else currentQuery = currentQuery.is("store_id", null);
      const archived = await currentQuery;
      if (archived.error) return fail(archived.error.message, 500);
      const { data, error: publishError } = await supabaseAdmin.from("store_documents").update({ status: "published", published_at: new Date().toISOString() }).eq("id", created.id).select().single();
      if (publishError) return fail(publishError.message, 500);
      await writeAudit(user!, storeId, "policy.publish", "store_document", created.id, null, { type, version });
      return NextResponse.json({ data });
    }
    await writeAudit(user!, storeId, "policy.draft", "store_document", created.id, null, { type, version });
    return NextResponse.json({ data: created }, { status: 201 });
  }

  if (body.action === "faq") {
    const question = String(body.question || "").trim().slice(0, 300);
    const answer = String(body.answer || "").trim().slice(0, 4000);
    if (question.length < 5 || answer.length < 5) return fail("FAQ harus berisi pertanyaan dan jawaban");
    const payload = { store_id: storeId, question, answer, display_order: Math.max(0, Math.floor(Number(body.displayOrder) || 0)), is_published: body.publish === true, updated_at: new Date().toISOString() };
    let result;
    if (body.id) {
      const { data: existing } = await supabaseAdmin.from("store_faqs").select("id,store_id").eq("id", String(body.id)).maybeSingle();
      if (!existing || existing.store_id !== storeId) return fail("FAQ tidak ditemukan", 404);
      result = await supabaseAdmin.from("store_faqs").update(payload).eq("id", existing.id).select().single();
    } else result = await supabaseAdmin.from("store_faqs").insert({ ...payload, created_by: user!.userId }).select().single();
    if (result.error) return fail(result.error.message, 500);
    await writeAudit(user!, storeId, "faq.save", "store_faq", result.data.id, null, result.data);
    return NextResponse.json({ data: result.data }, { status: body.id ? 200 : 201 });
  }
  return fail("Aksi kebijakan tidak dikenali");
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!isOwnerOrAdmin(user)) return fail("Akses owner/admin diperlukan", 403);
  const id = request.nextUrl.searchParams.get("faqId") || "";
  const { data: faq } = await supabaseAdmin.from("store_faqs").select("id,store_id").eq("id", id).maybeSingle();
  if (!faq || (faq.store_id && !hasStoreAccess(user, faq.store_id))) return fail("FAQ tidak ditemukan", 404);
  const { error } = await supabaseAdmin.from("store_faqs").delete().eq("id", id);
  if (error) return fail(error.message, 500);
  return NextResponse.json({ success: true });
}
