import type { SupabaseClient } from "@supabase/supabase-js";
import { searchProspectIds, type ServiceResult } from "./prospect-search";

/**
 * Recherche globale du header (Objectif B, 2026-06-27).
 *
 * Interroge en parallèle les entreprises clientes (ilike `company_name`), les
 * prospects CRM (moteur fuzzy `searchProspectIds` → fetch des lignes), les
 * apprenants (ilike prénom/nom) et les formations (ilike titre) — audit 24/07 :
 * la barre ne cherchait qu'entreprises + prospects, taper un nom d'apprenant ou
 * de formation ne donnait rien. Tout est filtré par l'entité active. Pensé pour
 * un popover de saut rapide (limite courte).
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

export interface GlobalSearchLearner {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
}

export interface GlobalSearchSession {
  id: string;
  title: string;
  status: string | null;
}

export interface GlobalSearchResults {
  clients: GlobalSearchClient[];
  prospects: GlobalSearchProspect[];
  learners: GlobalSearchLearner[];
  sessions: GlobalSearchSession[];
}

export const GLOBAL_SEARCH_MIN_CHARS = 2;

const EMPTY_RESULTS: ServiceResult<GlobalSearchResults> = {
  ok: true,
  clients: [],
  prospects: [],
  learners: [],
  sessions: [],
};

export async function globalSearchEntities(
  supabase: SupabaseClient,
  entityId: string | null,
  query: string,
  limit = 6,
): Promise<ServiceResult<GlobalSearchResults>> {
  const q = query.trim();
  if (!entityId || q.length < GLOBAL_SEARCH_MIN_CHARS) {
    return { ...EMPTY_RESULTS };
  }

  // Échappe les wildcards LIKE (% _ \) pour que `100%` ne matche pas n'importe quoi.
  const likeEscaped = q.replace(/[\\%_]/g, "\\$&");
  // Pour `.or()` PostgREST, les caractères spéciaux (virgules, parenthèses,
  // quotes) cassent la syntaxe → on les retire (même approche que la palette
  // Cmd+K, éprouvée en prod).
  const orSanitized = q.replace(/[%_,.()"'\\]/g, "");

  // Les sources sont indépendantes → en parallèle (latence d'une frappe).
  const [clientsRes, idsRes, learnersRes, sessionsRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, company_name")
      .eq("entity_id", entityId)
      .ilike("company_name", `%${likeEscaped}%`)
      .order("company_name")
      .limit(limit),
    // Prospects — moteur fuzzy (accents + fautes) → ids ordonnés par pertinence.
    searchProspectIds(supabase, entityId, q, limit),
    // Apprenants — prénom OU nom. Skip si la sanitisation a tout retiré.
    orSanitized.length >= GLOBAL_SEARCH_MIN_CHARS
      ? supabase
          .from("learners")
          .select("id, first_name, last_name, email")
          .eq("entity_id", entityId)
          .or(`first_name.ilike.%${orSanitized}%,last_name.ilike.%${orSanitized}%`)
          .order("last_name")
          .limit(limit)
      : Promise.resolve({ data: [], error: null }),
    // Formations — titre de session.
    supabase
      .from("sessions")
      .select("id, title, status")
      .eq("entity_id", entityId)
      .ilike("title", `%${likeEscaped}%`)
      .order("start_date", { ascending: false })
      .limit(limit),
  ]);

  if (clientsRes.error) {
    return { ok: false, error: { message: clientsRes.error.message, code: clientsRes.error.code } };
  }
  if (!idsRes.ok) return idsRes;
  if (learnersRes.error) {
    return { ok: false, error: { message: learnersRes.error.message, code: learnersRes.error.code } };
  }
  if (sessionsRes.error) {
    return { ok: false, error: { message: sessionsRes.error.message, code: sessionsRes.error.code } };
  }

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
    learners: (learnersRes.data as GlobalSearchLearner[]) ?? [],
    sessions: (sessionsRes.data as GlobalSearchSession[]) ?? [],
  };
}
