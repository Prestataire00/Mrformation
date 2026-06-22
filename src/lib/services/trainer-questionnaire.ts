import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Logique des questionnaires créés par le formateur (demande 5).
 * Multi-entité : un profile_id peut avoir plusieurs fiches trainers → on résout
 * TOUTES les fiches (pas `.single()`), cohérent avec trainer-session-access.ts.
 */

export interface OwnedQuestionnaire {
  id: string;
  created_by_trainer_id: string | null;
  entity_id: string;
}

/** Ids de toutes les fiches formateur de `profileId`. */
export async function resolveTrainerIds(
  supabase: SupabaseClient,
  profileId: string,
): Promise<string[]> {
  const { data } = await supabase.from("trainers").select("id").eq("profile_id", profileId);
  return ((data as Array<{ id: string }> | null) ?? []).map((t) => t.id);
}

/** Le questionnaire si une fiche du formateur en est l'auteur, sinon null. */
export async function getOwnedQuestionnaire(
  supabase: SupabaseClient,
  profileId: string,
  questionnaireId: string,
): Promise<OwnedQuestionnaire | null> {
  const { data: q } = await supabase
    .from("questionnaires")
    .select("id, created_by_trainer_id, entity_id")
    .eq("id", questionnaireId)
    .maybeSingle();
  if (!q) return null;

  const trainerIds = await resolveTrainerIds(supabase, profileId);
  const qq = q as OwnedQuestionnaire;
  return qq.created_by_trainer_id && trainerIds.includes(qq.created_by_trainer_id) ? qq : null;
}
