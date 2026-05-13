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
