import type { SupabaseClient } from "@supabase/supabase-js";
import { searchProspectIds, type ServiceResult } from "./prospect-search";

/**
 * Recherche globale du header (Objectif B, 2026-06-27).
 *
 * Interroge en parallèle les entreprises clientes (ilike `company_name`) et les
 * prospects CRM (moteur fuzzy `searchProspectIds` → fetch des lignes). Tout est
 * filtré par l'entité active. Pensé pour un popover de saut rapide (limite courte).
 */

export interface GlobalSearchClient {
  id: string;
  company_name: string;
}

export interface GlobalSearchProspect {
  id: string;
  company_name: string;
  contact_name: string | null;
}

export interface GlobalSearchResults {
  clients: GlobalSearchClient[];
  prospects: GlobalSearchProspect[];
}

export const GLOBAL_SEARCH_MIN_CHARS = 2;

export async function globalSearchEntities(
  supabase: SupabaseClient,
  entityId: string | null,
  query: string,
  limit = 6,
): Promise<ServiceResult<GlobalSearchResults>> {
  const q = query.trim();
  if (!entityId || q.length < GLOBAL_SEARCH_MIN_CHARS) {
    return { ok: true, clients: [], prospects: [] };
  }

  // Échappe les wildcards LIKE (% _ \) pour que `100%` ne matche pas n'importe quoi.
  const likeEscaped = q.replace(/[\\%_]/g, "\\$&");

  // Les deux sources sont indépendantes → en parallèle (latence d'une frappe).
  const [clientsRes, idsRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, company_name")
      .eq("entity_id", entityId)
      .ilike("company_name", `%${likeEscaped}%`)
      .order("company_name")
      .limit(limit),
    // Prospects — moteur fuzzy (accents + fautes) → ids ordonnés par pertinence.
    searchProspectIds(supabase, entityId, q, limit),
  ]);

  if (clientsRes.error) {
    return { ok: false, error: { message: clientsRes.error.message, code: clientsRes.error.code } };
  }
  if (!idsRes.ok) return idsRes;

  let prospects: GlobalSearchProspect[] = [];
  if (idsRes.ids.length > 0) {
    const wantedIds = idsRes.ids.slice(0, limit);
    const prospectsRes = await supabase
      .from("crm_prospects")
      .select("id, company_name, contact_name")
      .eq("entity_id", entityId)
      .in("id", wantedIds);
    if (prospectsRes.error) {
      return { ok: false, error: { message: prospectsRes.error.message, code: prospectsRes.error.code } };
    }
    // `.in()` ne préserve pas l'ordre → on réordonne par pertinence trigram.
    const rank = new Map(wantedIds.map((id, i) => [id, i]));
    prospects = ((prospectsRes.data as GlobalSearchProspect[]) ?? []).sort(
      (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0),
    );
  }

  return {
    ok: true,
    clients: (clientsRes.data as GlobalSearchClient[]) ?? [],
    prospects,
  };
}
