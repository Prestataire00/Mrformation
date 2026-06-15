import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Indique si l'apprenant (`profileId` = auth.uid()) est inscrit au cours
 * e-learning `courseId`. Sert à interdire l'ouverture du lecteur sans
 * inscription (décision produit 2026-06-15 : pas de preview avant inscription).
 *
 * Invariant anti-bug : `profile_id` ≠ `learners.id`. On résout d'abord
 * `learners.id` depuis `profile_id`, puis on vérifie `elearning_enrollments`
 * (dont `learner_id` référence `learners.id`).
 */
export async function isLearnerEnrolledInCourse(
  supabase: SupabaseClient,
  profileId: string,
  courseId: string,
): Promise<boolean> {
  const { data: learner } = await supabase
    .from("learners")
    .select("id")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (!learner) return false;

  const { data: enrollment } = await supabase
    .from("elearning_enrollments")
    .select("id")
    .eq("course_id", courseId)
    .eq("learner_id", (learner as { id: string }).id)
    .maybeSingle();

  return Boolean(enrollment);
}
