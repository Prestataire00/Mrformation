import { SupabaseClient } from "@supabase/supabase-js";
import type { CommercialActionType } from "@/lib/types";

interface LogCommercialActionParams {
  supabase: SupabaseClient;
  entityId: string;
  authorId: string;
  actionType: CommercialActionType;
  prospectId?: string | null;
  clientId?: string | null;
  subject?: string | null;
  content?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget commercial action logger.
 * Inserts a record into crm_commercial_actions without blocking the caller.
 */
export function logCommercialAction(params: LogCommercialActionParams): void {
  params.supabase
    .from("crm_commercial_actions")
    .insert({
      entity_id: params.entityId,
      author_id: params.authorId,
      action_type: params.actionType,
      prospect_id: params.prospectId ?? null,
      client_id: params.clientId ?? null,
      subject: params.subject ?? null,
      content: params.content ?? null,
      metadata: params.metadata ?? {},
    })
    .then(({ error }) => {
      if (error) {
        console.error("[Commercial Action] Failed to log:", error.message);
      }
    });
}
