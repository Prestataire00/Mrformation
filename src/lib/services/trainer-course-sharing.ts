import type { SupabaseClient } from "@supabase/supabase-js";
import type { UploadedFile } from "@/components/trainer/types";

/**
 * Logique de partage des supports de cours formateur (`trainer_courses`) vers
 * les sessions (`trainer_course_sessions`) et de leur consultation apprenant.
 *
 * Multi-entité : un `profile_id` peut avoir plusieurs fiches `trainers` (1/entité).
 * On résout donc TOUTES les fiches (pas `.single()`), cohérent avec
 * `src/lib/auth/trainer-session-access.ts`.
 */

export interface OwnedCourse {
  id: string;
  status: string;
  trainer_id: string;
  entity_id: string | null;
}

export interface SharedSupport {
  link_id: string;
  session_id: string;
  course: { id: string; title: string; description: string | null; files: UploadedFile[] };
}

/** Ids de tous les supports appartenant aux fiches formateur de `profileId`. */
export async function resolveTrainerCourseIds(
  supabase: SupabaseClient,
  profileId: string,
): Promise<string[]> {
  const { data: trainers } = await supabase
    .from("trainers")
    .select("id")
    .eq("profile_id", profileId);
  const trainerIds = ((trainers as Array<{ id: string }> | null) ?? []).map((t) => t.id);
  if (trainerIds.length === 0) return [];

  const { data: courses } = await supabase
    .from("trainer_courses")
    .select("id")
    .in("trainer_id", trainerIds);
  return ((courses as Array<{ id: string }> | null) ?? []).map((c) => c.id);
}

/** Retourne le support si une fiche du formateur le possède, sinon null. */
export async function getOwnedCourse(
  supabase: SupabaseClient,
  profileId: string,
  courseId: string,
): Promise<OwnedCourse | null> {
  const { data: course } = await supabase
    .from("trainer_courses")
    .select("id, status, trainer_id, entity_id")
    .eq("id", courseId)
    .maybeSingle();
  if (!course) return null;

  const { data: trainers } = await supabase
    .from("trainers")
    .select("id")
    .eq("profile_id", profileId);
  const trainerIds = ((trainers as Array<{ id: string }> | null) ?? []).map((t) => t.id);

  const c = course as OwnedCourse;
  return trainerIds.includes(c.trainer_id) ? c : null;
}

/** Supports PUBLIÉS liés aux sessions fournies (vue apprenant). */
export async function getSharedSupportsForLearner(
  supabase: SupabaseClient,
  sessionIds: string[],
): Promise<SharedSupport[]> {
  if (sessionIds.length === 0) return [];

  const { data } = await supabase
    .from("trainer_course_sessions")
    .select("id, session_id, course:trainer_courses(id, title, description, files, status)")
    .in("session_id", sessionIds);

  type Row = {
    id: string;
    session_id: string;
    course: { id: string; title: string; description: string | null; files: UploadedFile[] | null; status: string } | null;
  };
  return ((data as unknown as Row[] | null) ?? [])
    .filter((r) => r.course && r.course.status === "published")
    .map((r) => ({
      link_id: r.id,
      session_id: r.session_id,
      course: {
        id: r.course!.id,
        title: r.course!.title,
        description: r.course!.description,
        files: r.course!.files ?? [],
      },
    }));
}
