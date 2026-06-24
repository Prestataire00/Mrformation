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
 *
 * ⚠️ Multi-entité : un même `profile_id` peut posséder PLUSIEURS fiches `trainers`
 * (une par entité — la table n'a pas de contrainte d'unicité sur `profile_id`).
 * On ne peut donc PAS utiliser `.single()` (qui échoue dès qu'il y a 2 fiches et
 * renvoyait alors une liste vide → « aucune session » / « 0h » au tableau de bord).
 * On récupère toutes les fiches du profil et on filtre `formation_trainers` par
 * l'ensemble de leurs `id` via `.in()`.
 */
export async function isTrainerAssignedToSession(
  supabase: SupabaseClient,
  profileId: string,
  sessionId: string,
): Promise<boolean> {
  const { data: trainers } = await supabase
    .from("trainers")
    .select("id")
    .eq("profile_id", profileId);

  const trainerIds = ((trainers as Array<{ id: string }> | null) ?? []).map((t) => t.id);
  if (trainerIds.length === 0) return false;

  const { data: assignment } = await supabase
    .from("formation_trainers")
    .select("id")
    .eq("session_id", sessionId)
    .in("trainer_id", trainerIds)
    .limit(1);

  return Boolean(assignment && (assignment as Array<unknown>).length > 0);
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
/**
 * Retourne les `trainers.id` (dédupliqués) du profil `profileId`.
 *
 * Un même `profile_id` peut avoir PLUSIEURS fiches `trainers` (une par entité —
 * pas de contrainte d'unicité). Résoudre la fiche via `.single()` échoue alors
 * (0 ou ≥2 lignes → erreur → data null) et casse l'espace formateur (« Formateur
 * non trouvé » / listes vides). À utiliser avec `.in("trainer_id", ids)` pour
 * lister les ressources du formateur (supports, documents, contrats…).
 */
export async function resolveTrainerIds(
  supabase: SupabaseClient,
  profileId: string,
): Promise<string[]> {
  const { data: trainers } = await supabase
    .from("trainers")
    .select("id")
    .eq("profile_id", profileId);
  const ids = ((trainers as Array<{ id: string }> | null) ?? []).map((t) => t.id);
  return [...new Set(ids)];
}

export async function resolveTrainerSessionIds(
  supabase: SupabaseClient,
  profileId: string,
): Promise<string[]> {
  // Multi-entité : un profil peut avoir plusieurs fiches trainers (1/entité).
  // Pas de `.single()` (échouerait avec 2 fiches → []). Cf. doc de tête de fichier.
  const { data: trainers } = await supabase
    .from("trainers")
    .select("id")
    .eq("profile_id", profileId);

  const trainerIds = ((trainers as Array<{ id: string }> | null) ?? []).map((t) => t.id);
  if (trainerIds.length === 0) return [];

  const { data: links } = await supabase
    .from("formation_trainers")
    .select("session_id")
    .in("trainer_id", trainerIds);

  const ids = ((links as Array<{ session_id: string }> | null) ?? []).map((l) => l.session_id);
  return [...new Set(ids)];
}
