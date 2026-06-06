import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Action loggée dans `activity_log`.
 *
 * - Actions CRUD génériques : "create" | "update" | "delete".
 * - Actions métier namespacées sous la forme `<resource>.<verb>` (string
 *   libre) pour distinguer un événement métier d'un simple UPDATE
 *   (ex : `question.scoring_corrected` E1-S10 V1).
 */
type AuditAction = "create" | "update" | "delete" | string;

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
