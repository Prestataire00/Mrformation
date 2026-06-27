import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Recherche prospects assouplie (quick-dev 2026-06-27).
 *
 * Appelle la RPC `search_crm_prospect_ids` (pg_trgm + unaccent) qui renvoie les
 * ids des prospects correspondants — tolérante aux accents et aux fautes de
 * frappe. Les call-sites font ensuite `.in("id", ids)` en gardant leur filtre
 * `entity_id`, pagination et count. La requête est paramétrée (RPC) → plus de
 * risque d'injection dans le DSL `.or()` de PostgREST.
 */

export type ServiceResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: { message: string; code?: string } };

export async function searchProspectIds(
  supabase: SupabaseClient,
  entityId: string,
  query: string,
  limit?: number,
): Promise<ServiceResult<{ ids: string[] }>> {
  const trimmed = query.trim();
  if (!trimmed || !entityId) {
    return { ok: true, ids: [] };
  }

  const params: { p_entity_id: string; p_query: string; p_limit?: number } = {
    p_entity_id: entityId,
    p_query: trimmed,
  };
  if (typeof limit === "number") params.p_limit = limit;

  const { data, error } = await supabase.rpc("search_crm_prospect_ids", params);

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }

  // La fonction renvoie un SETOF uuid → tableau de scalaires (ou d'objets selon
  // la version PostgREST). On normalise vers string[].
  const ids = Array.isArray(data)
    ? data
        .map((row: unknown) =>
          typeof row === "string"
            ? row
            : (row as { search_crm_prospect_ids?: string; id?: string })
                ?.search_crm_prospect_ids ??
              (row as { id?: string })?.id ??
              null,
        )
        .filter((v): v is string => typeof v === "string")
    : [];

  return { ok: true, ids };
}
