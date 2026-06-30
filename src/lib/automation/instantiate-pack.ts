import type { SupabaseClient } from "@supabase/supabase-js";

export interface PackStep {
  id: string;
  order_index: number;
  trigger_type: string;
  days_offset: number;
  recipient_type: string | null;
  document_type: string | null;
  template_id: string | null;
  condition_subcontracted: boolean | null;
  send_email: boolean | null;
  name: string | null;
  description: string | null;
}

export interface SessionStepRow {
  session_id: string;
  source_pack_id: string;
  order_index: number;
  trigger_type: string;
  days_offset: number;
  recipient_type: string | null;
  document_type: string | null;
  template_id: string | null;
  condition_subcontracted: boolean | null;
  send_email: boolean | null;
  name: string | null;
  description: string | null;
}

/** Mapper pur : une étape de gabarit → une ligne de snapshot (sans l'id du gabarit). */
export function packStepToSessionStepRow(step: PackStep, sessionId: string, packId: string): SessionStepRow {
  return {
    session_id: sessionId,
    source_pack_id: packId,
    order_index: step.order_index,
    trigger_type: step.trigger_type,
    days_offset: step.days_offset,
    recipient_type: step.recipient_type ?? null,
    document_type: step.document_type ?? null,
    template_id: step.template_id ?? null,
    condition_subcontracted: step.condition_subcontracted ?? null,
    send_email: step.send_email ?? true,
    name: step.name ?? null,
    description: step.description ?? null,
  };
}

/**
 * Instancie un pack en snapshot pour une session (remplaçant/idempotent).
 * Vérifie que pack et session appartiennent à la même entité.
 * Retourne le nombre d'étapes instanciées.
 */
export async function instantiatePackForSession(
  supabase: SupabaseClient,
  packId: string,
  sessionId: string,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const { data: pack, error: pErr } = await supabase
    .from("automation_packs").select("id, entity_id").eq("id", packId).maybeSingle();
  if (pErr) return { ok: false, error: pErr.message };
  if (!pack) return { ok: false, error: "Pack introuvable" };

  const { data: session, error: sErr } = await supabase
    .from("sessions").select("id, entity_id").eq("id", sessionId).maybeSingle();
  if (sErr) return { ok: false, error: sErr.message };
  if (!session) return { ok: false, error: "Session introuvable" };
  if (session.entity_id !== pack.entity_id) return { ok: false, error: "Pack et session d'entités différentes" };

  const { data: steps, error: stErr } = await supabase
    .from("automation_pack_steps").select("*").eq("pack_id", packId).order("order_index");
  if (stErr) return { ok: false, error: stErr.message };

  // Remplaçant : purge l'ancien snapshot de cette session avant réinsertion.
  const { error: delErr } = await supabase
    .from("session_automation_steps").delete().eq("session_id", sessionId);
  if (delErr) return { ok: false, error: delErr.message };

  const rows = (steps ?? []).map((s) => packStepToSessionStepRow(s as PackStep, sessionId, packId));
  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("session_automation_steps").insert(rows);
    if (insErr) return { ok: false, error: insErr.message };
  }
  return { ok: true, count: rows.length };
}
