import { SupabaseClient } from "@supabase/supabase-js";

type AuditAction = "create" | "update" | "delete";

interface AuditLogParams {
  supabase: SupabaseClient;
  entityId: string;
  userId: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  details?: Record<string, unknown>;
}

/**
 * Fire-and-forget audit log writer.
 * Inserts a record into the activity_log table without blocking the caller.
 * Failures are logged to console but never thrown — audit logging should
 * never break the main application flow.
 */
export function logAudit(params: AuditLogParams): void {
  params.supabase
    .from("activity_log")
    .insert({
      entity_id: params.entityId,
      user_id: params.userId,
      action: params.action,
      resource_type: params.resourceType,
      resource_id: params.resourceId,
      details: params.details ?? {},
    })
    .then(({ error }) => {
      if (error) {
        console.error("[Audit Log] Failed to write:", error.message);
      }
    });
}
