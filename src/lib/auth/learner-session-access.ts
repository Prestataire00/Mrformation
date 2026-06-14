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
 */
export async function isLearnerEnrolledInSession(
  supabase: SupabaseClient,
  profileId: string,
  sessionId: string,
): Promise<boolean> {
  const { data: learner } = await supabase
    .from("learners")
    .select("id")
    .eq("profile_id", profileId)
    .single();

  if (!learner) return false;

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("session_id", sessionId)
    .eq("learner_id", (learner as { id: string }).id)
    .in("status", SIGNABLE_ENROLLMENT_STATUSES as unknown as string[])
    .maybeSingle();

  return Boolean(enrollment);
}
