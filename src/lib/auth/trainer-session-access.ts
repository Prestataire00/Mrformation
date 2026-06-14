import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Détermine si le formateur identifié par `profileId` (= auth.uid()) est assigné
 * à la session `sessionId`.
 *
 * Source de vérité : la table de liaison `formation_trainers` (assignation
 * canonique — cf. cadrage espace formateur, décision #2 du 2026-06-14).
 * `sessions.trainer_id` n'est PAS fiable (rarement peuplé : l'assignation admin
 * passe par `formation_trainers`) et ne doit pas servir à cette vérification.
 *
 * Invariant anti-bug : `profile_id` (auth.users) ≠ `trainers.id`. On résout donc
 * d'abord `trainers.id` depuis `profile_id` avant de filtrer `formation_trainers`.
 */
export async function isTrainerAssignedToSession(
  supabase: SupabaseClient,
  profileId: string,
  sessionId: string,
): Promise<boolean> {
  const { data: trainer } = await supabase
    .from("trainers")
    .select("id")
    .eq("profile_id", profileId)
    .single();

  if (!trainer) return false;

  const { data: assignment } = await supabase
    .from("formation_trainers")
    .select("id")
    .eq("session_id", sessionId)
    .eq("trainer_id", (trainer as { id: string }).id)
    .maybeSingle();

  return Boolean(assignment);
}
