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
 * Rattache une entreprise à une session via `formation_companies` (Story 3.2).
 * Le helper INSERT — si la liaison existe déjà, l'erreur Supabase (unique constraint
 * sur session_id + client_id) sera propagée au caller pour gestion UI.
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
  return { ok: true };
}

/**
 * Détache une entreprise d'une session (suppression de la ligne formation_companies).
 * Le filtre par `sessionId` est défense en profondeur : la RLS Supabase devrait déjà
 * empêcher la suppression cross-session, mais la double-check est cheap.
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
  return { ok: true };
}
