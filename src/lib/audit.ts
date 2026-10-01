import { supabaseAdmin } from "@/lib/supabase-server";
import type { DecodedToken } from "@/lib/auth";

export async function writeAudit(user: DecodedToken, storeId: string | null, action: string, entityType: string, entityId?: string, beforeData?: unknown, afterData?: unknown) {
  const { error } = await supabaseAdmin.from("audit_logs").insert({ store_id: storeId, actor_id: user.userId, actor_role: user.role, action, entity_type: entityType, entity_id: entityId || null, before_data: beforeData ?? null, after_data: afterData ?? null });
  if (error) console.error("Audit log write failed:", error.message);
}
