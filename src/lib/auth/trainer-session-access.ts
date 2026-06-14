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

/**
 * Retourne les `session_id` (dédupliqués) auxquels le formateur (`profileId` =
 * auth.uid()) est assigné, via `formation_trainers` (source canonique).
 *
 * À utiliser pour filtrer les listes de sessions du formateur (dashboard,
 * planning, « mes sessions », contrats) avec `.in("id", ids)` — et NON
 * `sessions.trainer_id`, souvent NULL. Renvoie `[]` si pas de fiche formateur
 * ou aucune assignation (la page affiche alors un état vide).
 */
export async function resolveTrainerSessionIds(
  supabase: SupabaseClient,
  profileId: string,
): Promise<string[]> {
  const { data: trainer } = await supabase
    .from("trainers")
    .select("id")
    .eq("profile_id", profileId)
    .single();

  if (!trainer) return [];

  const { data: links } = await supabase
    .from("formation_trainers")
    .select("session_id")
    .eq("trainer_id", (trainer as { id: string }).id);

  const ids = ((links as Array<{ session_id: string }> | null) ?? []).map((l) => l.session_id);
  return [...new Set(ids)];
}
