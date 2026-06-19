import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Data-access des 2 registres Qualiopi (amélioration continue & incidents).
 * Toutes les requêtes filtrent par entity_id (multi-tenant, règle projet).
 * Colonnes explicites, jamais `*`. Chaque fonction renvoie { data, error }.
 */

// ---------- Amélioration continue (critère Qualiopi n°32) ----------

export interface QualityImprovement {
  id: string;
  entity_id: string;
  date: string;
  description: string;
  action_taken: string | null;
  result: string | null;
  responsible: string | null;
  created_at: string;
  updated_at: string;
}

export type QualityImprovementInput = {
  date: string;
  description: string;
  action_taken?: string | null;
  result?: string | null;
  responsible?: string | null;
};

const IMPROVEMENT_COLUMNS =
  "id, entity_id, date, description, action_taken, result, responsible, created_at, updated_at";

export async function listImprovements(supabase: SupabaseClient, entityId: string) {
  return supabase
    .from("quality_improvements")
    .select(IMPROVEMENT_COLUMNS)
    .eq("entity_id", entityId)
    .order("date", { ascending: false });
}

export async function createImprovement(
  supabase: SupabaseClient,
  entityId: string,
  input: QualityImprovementInput
) {
  return supabase
    .from("quality_improvements")
    .insert({ ...input, entity_id: entityId })
    .select(IMPROVEMENT_COLUMNS)
    .single();
}

export async function updateImprovement(
  supabase: SupabaseClient,
  entityId: string,
  id: string,
  input: QualityImprovementInput
) {
  return supabase
    .from("quality_improvements")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("entity_id", entityId)
    .eq("id", id)
    .select(IMPROVEMENT_COLUMNS)
    .single();
}

export async function removeImprovement(
  supabase: SupabaseClient,
  entityId: string,
  id: string
) {
  return supabase
    .from("quality_improvements")
    .delete()
    .eq("entity_id", entityId)
    .eq("id", id);
}

// ---------- Incidents / réclamations qualité ----------

export interface QualityIncident {
  id: string;
  entity_id: string;
  date: string;
  nom: string | null;
  description: string | null;
  statut: string | null;
  source: string | null;
  sujet: string | null;
  gravite: string | null;
  formation: string | null;
  action_menee: string | null;
  date_cloture: string | null;
  created_at: string;
  updated_at: string;
}

export type QualityIncidentInput = {
  date: string;
  nom?: string | null;
  description?: string | null;
  statut?: string | null;
  source?: string | null;
  sujet?: string | null;
  gravite?: string | null;
  formation?: string | null;
  action_menee?: string | null;
  date_cloture?: string | null;
};

const INCIDENT_COLUMNS =
  "id, entity_id, date, nom, description, statut, source, sujet, gravite, formation, action_menee, date_cloture, created_at, updated_at";

export async function listIncidents(supabase: SupabaseClient, entityId: string) {
  return supabase
    .from("quality_incidents")
    .select(INCIDENT_COLUMNS)
    .eq("entity_id", entityId)
    .order("date", { ascending: false });
}

export async function createIncident(
  supabase: SupabaseClient,
  entityId: string,
  input: QualityIncidentInput
) {
  return supabase
    .from("quality_incidents")
    .insert({ ...input, entity_id: entityId })
    .select(INCIDENT_COLUMNS)
    .single();
}

export async function updateIncident(
  supabase: SupabaseClient,
  entityId: string,
  id: string,
  input: QualityIncidentInput
) {
  return supabase
    .from("quality_incidents")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("entity_id", entityId)
    .eq("id", id)
    .select(INCIDENT_COLUMNS)
    .single();
}

export async function removeIncident(
  supabase: SupabaseClient,
  entityId: string,
  id: string
) {
  return supabase
    .from("quality_incidents")
    .delete()
    .eq("entity_id", entityId)
    .eq("id", id);
}
