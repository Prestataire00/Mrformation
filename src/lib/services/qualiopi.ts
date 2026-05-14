import type { SupabaseClient } from "@supabase/supabase-js";

export type ServiceResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: { message: string; code?: string } };

export type QualiopiAudit = {
  session_id: string;
  score: number;
  manual_checks: Record<string, boolean>;
  audited_at: string | null;
  audited_by: string | null;
};

/**
 * Lit l'audit Qualiopi d'une session depuis formation_qualiopi_audits (Story 5.1).
 * Retourne `{ ok: true, audit: null }` si aucun audit n'existe encore (pas une erreur).
 */
export async function getQualiopiAudit(
  supabase: SupabaseClient,
  sessionId: string
): Promise<ServiceResult<{ audit: QualiopiAudit | null }>> {
  const { data, error } = await supabase
    .from("formation_qualiopi_audits")
    .select("session_id, score, manual_checks, audited_at, audited_by")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }
  return { ok: true, audit: (data as QualiopiAudit | null) ?? null };
}

export type UpsertQualiopiAuditInput = {
  sessionId: string;
  entityId: string;
  score: number;
  manualChecks: Record<string, boolean>;
  auditedBy?: string | null;
};

/**
 * Crée ou met à jour l'audit Qualiopi d'une session (modèle single-row, upsert sur session_id).
 * `audited_at` et `updated_at` sont rafraîchis à chaque appel.
 */
export async function upsertQualiopiAudit(
  supabase: SupabaseClient,
  input: UpsertQualiopiAuditInput
): Promise<ServiceResult<Record<never, never>>> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("formation_qualiopi_audits")
    .upsert(
      {
        session_id: input.sessionId,
        entity_id: input.entityId,
        score: input.score,
        manual_checks: input.manualChecks,
        audited_by: input.auditedBy ?? null,
        audited_at: now,
        updated_at: now,
      },
      { onConflict: "session_id" }
    );

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }
  return { ok: true };
}
