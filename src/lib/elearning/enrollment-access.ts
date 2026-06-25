import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Indique si l'apprenant (`profileId` = auth.uid()) est inscrit au cours
 * e-learning `courseId`. Sert à interdire l'ouverture du lecteur sans
 * inscription (décision produit 2026-06-15 : pas de preview avant inscription).
 *
 * Invariant anti-bug : `profile_id` ≠ `learners.id`. On résout d'abord
 * `learners.id` depuis `profile_id`, puis on vérifie `elearning_enrollments`
 * (dont `learner_id` référence `learners.id`).
 *
 * Multi-fiche : `profile_id` n'est PAS unique sur `learners` (compte partagé
 * « apprenant sans email »). `.maybeSingle()` lèverait une erreur à ≥ 2 fiches
 * → `learner` null → « non inscrit » à tort → lecteur e-learning inaccessible.
 * On résout TOUTES les fiches du profil et on teste l'inscription par `.in()` :
 * inscrit si l'UNE de ses fiches l'est. Mono-fiche → comportement inchangé.
 */
export async function isLearnerEnrolledInCourse(
  supabase: SupabaseClient,
  profileId: string,
  courseId: string,
): Promise<boolean> {
  const { data: learners } = await supabase
    .from("learners")
    .select("id")
    .eq("profile_id", profileId);

  const learnerIds = ((learners as Array<{ id: string }> | null) ?? []).map((l) => l.id);
  if (learnerIds.length === 0) return false;

  const { data: enrollment } = await supabase
    .from("elearning_enrollments")
    .select("id")
    .eq("course_id", courseId)
    .in("learner_id", learnerIds)
    .limit(1);

  return Boolean(enrollment && (enrollment as Array<unknown>).length > 0);
}
