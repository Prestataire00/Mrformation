import type { SupabaseClient } from "@supabase/supabase-js";

export type ServiceResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: { message: string; code?: string } };

export type AddCompanyInput = {
  sessionId: string;
  clientId: string;
  amount?: number | null;
  email?: string | null;
  reference?: string | null;
};

/**
 * Recalcule la somme des amounts de toutes les `formation_companies` d'une
 * session et l'écrit dans `sessions.total_price`. Best-effort : si l'update
 * échoue (RLS ou autre), on n'interrompt pas le flow appelant — le total
 * sera resyncé au prochain add/remove.
 *
 * Appelé automatiquement après chaque addCompanyToSession et
 * removeCompanyFromSession pour garder le bloc "Infos formation" cohérent.
 */
export async function syncSessionTotalPrice(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<void> {
  try {
    const { data: companies, error: readErr } = await supabase
      .from("formation_companies")
      .select("amount")
      .eq("session_id", sessionId);
    if (readErr) {
      console.error("[syncSessionTotalPrice] read failed:", readErr);
      return;
    }
    const total = (companies ?? []).reduce(
      (sum, c) => sum + (typeof c.amount === "number" ? c.amount : 0),
      0,
    );
    const { error: updateErr } = await supabase
      .from("sessions")
      .update({ total_price: total > 0 ? total : null })
      .eq("id", sessionId);
    if (updateErr) {
      console.error("[syncSessionTotalPrice] update failed:", updateErr);
    }
  } catch (err) {
    console.error("[syncSessionTotalPrice] exception:", err);
  }
}

/**
 * Rattache une entreprise à une session via `formation_companies` (Story 3.2).
 * Le helper INSERT — si la liaison existe déjà, l'erreur Supabase (unique constraint
 * sur session_id + client_id) sera propagée au caller pour gestion UI.
 *
 * Synchronise automatiquement `sessions.total_price` avec la somme des amounts.
 */
export async function addCompanyToSession(
  supabase: SupabaseClient,
  input: AddCompanyInput
): Promise<ServiceResult<Record<never, never>>> {
  const { error } = await supabase
    .from("formation_companies")
    .insert({
      session_id: input.sessionId,
      client_id: input.clientId,
      amount: input.amount ?? null,
      email: input.email ?? null,
      reference: input.reference ?? null,
    });

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }

  // Sync total_price (best-effort, ne bloque pas la réponse)
  await syncSessionTotalPrice(supabase, input.sessionId);

  return { ok: true };
}

/**
 * Détache une entreprise d'une session (suppression de la ligne formation_companies).
 * Le filtre par `sessionId` est défense en profondeur : la RLS Supabase devrait déjà
 * empêcher la suppression cross-session, mais la double-check est cheap.
 *
 * Synchronise automatiquement `sessions.total_price` avec la somme des amounts restants.
 */
export async function removeCompanyFromSession(
  supabase: SupabaseClient,
  companyId: string,
  sessionId: string
): Promise<ServiceResult<Record<never, never>>> {
  const { error } = await supabase
    .from("formation_companies")
    .delete()
    .eq("id", companyId)
    .eq("session_id", sessionId);

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }

  // Sync total_price (best-effort)
  await syncSessionTotalPrice(supabase, sessionId);

  return { ok: true };
}
