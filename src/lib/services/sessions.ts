import type { SupabaseClient } from "@supabase/supabase-js";

export type ServiceResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: { message: string; code?: string } };

/**
 * Retourne les session_ids liés à un client via formation_companies.
 * Source canonique unique de la liaison session ↔ entreprise (cf. Story 1.1).
 */
export async function getSessionIdsByClient(
  supabase: SupabaseClient,
  clientId: string
): Promise<ServiceResult<{ sessionIds: string[] }>> {
  const { data, error } = await supabase
    .from("formation_companies")
    .select("session_id")
    .eq("client_id", clientId);

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }

  const sessionIds = (data ?? []).map((r: { session_id: string }) => r.session_id);
  return { ok: true, sessionIds };
}

export type LinkSessionToCompanyInput = {
  sessionId: string;
  clientId: string;
  amount?: number | null;
};

/**
 * Lie (ou met à jour) une session à une entreprise via formation_companies.
 * Upsert sur la clé (session_id, client_id) : idempotent.
 */
export async function linkSessionToCompany(
  supabase: SupabaseClient,
  input: LinkSessionToCompanyInput
): Promise<ServiceResult<Record<never, never>>> {
  const { error } = await supabase
    .from("formation_companies")
    .upsert(
      {
        session_id: input.sessionId,
        client_id: input.clientId,
        amount: input.amount ?? null,
      },
      { onConflict: "session_id,client_id" }
    );

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }
  return { ok: true };
}
