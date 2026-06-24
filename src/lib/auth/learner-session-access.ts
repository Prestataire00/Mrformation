import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Statuts d'inscription autorisant l'émargement : toute inscription non annulée.
 * Le CHECK SQL de `enrollments.status` est ('registered','confirmed','cancelled',
 * 'completed') — 'active' n'existe PAS (l'ancien filtre `.eq("status","active")`
 * ne matchait donc jamais : c'était le bug P0 côté apprenant).
 */
export const SIGNABLE_ENROLLMENT_STATUSES = ["registered", "confirmed", "completed"] as const;

/**
 * Détermine si l'apprenant identifié par `profileId` (= auth.uid()) est inscrit
 * (de façon non annulée) à la session `sessionId`.
 *
 * Invariant anti-bug : `profile_id` (auth.users) ≠ `learners.id`. On résout donc
 * d'abord `learners.id` depuis `profile_id` avant de filtrer `enrollments`
 * (dont `learner_id` référence `learners.id`, pas le profile_id).
 *
 * Multi-fiche : `profile_id` n'est PAS unique sur `learners` (cas « apprenant
 * sans email » → compte partagé à plusieurs fiches). On ne peut donc PAS
 * utiliser `.single()` (échoue à ≥ 2 fiches → « non inscrit » à tort). On résout
 * TOUTES les fiches du profil et on teste l'inscription par `.in()` : l'apprenant
 * est considéré inscrit si l'UNE de ses fiches l'est (sémantique correcte pour
 * une vérification d'autorisation). Mono-fiche → comportement inchangé.
 */
export async function isLearnerEnrolledInSession(
  supabase: SupabaseClient,
  profileId: string,
  sessionId: string,
): Promise<boolean> {
  const { data: learners } = await supabase
    .from("learners")
    .select("id")
    .eq("profile_id", profileId);

  const learnerIds = ((learners as Array<{ id: string }> | null) ?? []).map((l) => l.id);
  if (learnerIds.length === 0) return false;

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("session_id", sessionId)
    .in("learner_id", learnerIds)
    .in("status", SIGNABLE_ENROLLMENT_STATUSES as unknown as string[])
    .limit(1);

  return Boolean(enrollment && (enrollment as Array<unknown>).length > 0);
}
