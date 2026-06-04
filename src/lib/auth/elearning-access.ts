import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/require-role";

/**
 * Garde de sécurité partagé du sous-système e-learning.
 * Centralise : rôle, isolation multi-tenant (entity_id), propriété apprenant.
 * Cf. spec docs/superpowers/specs/2026-05-22-solidification-workflow-elearning-design.md §3.
 */

type Profile = { id: string; role: string; entity_id: string };

interface CourseRow {
  id: string;
  entity_id: string;
  [k: string]: unknown;
}

export type ElearningCourseAccess =
  | { ok: true; supabase: SupabaseClient; profile: Profile; userId: string; course: CourseRow }
  | { ok: false; error: NextResponse };

export type ElearningEnrollmentAccess =
  | { ok: true; supabase: SupabaseClient; profile: Profile; userId: string; enrollment: { id: string; course_id: string; learner_id: string } }
  | { ok: false; error: NextResponse };

const forbidden = (diag?: string) =>
  NextResponse.json({ error: "Accès refusé", _diag: diag ?? "forbidden" }, { status: 403 });
const notFound = (what: string, diag?: string) =>
  NextResponse.json({ error: `${what} introuvable`, _diag: diag ?? "not-found" }, { status: 404 });

/**
 * Vérifie le rôle, charge le cours e-learning et contrôle l'isolation
 * multi-tenant (course.entity_id === profile.entity_id).
 */
export async function requireElearningCourse(
  courseId: string,
  allowedRoles: string[],
): Promise<ElearningCourseAccess> {
  const auth = await requireRole(allowedRoles);
  if (auth.error) return { ok: false, error: auth.error };

  const { data: course, error } = await auth.supabase
    .from("elearning_courses")
    .select("*")
    .eq("id", courseId)
    .maybeSingle();

  if (error) {
    console.error("[requireElearningCourse] DB error", { courseId, message: error.message, code: error.code, details: error.details, hint: error.hint });
    return { ok: false, error: NextResponse.json({ error: "Erreur de chargement du cours", _diag: { stage: "require-course-select", msg: error.message, code: error.code, hint: error.hint } }, { status: 500 }) };
  }
  if (!course) {
    console.error("[requireElearningCourse] course not found", { courseId });
    return { ok: false, error: notFound("Cours", `course-not-found id=${courseId}`) };
  }
  if (course.entity_id !== auth.profile.entity_id) {
    console.error("[requireElearningCourse] entity mismatch", { courseId, courseEntity: course.entity_id, profileEntity: auth.profile.entity_id });
    return { ok: false, error: forbidden(`entity-mismatch course=${course.entity_id} profile=${auth.profile.entity_id}`) };
  }
  return { ok: true, supabase: auth.supabase, profile: auth.profile, userId: auth.user.id, course };
}

/**
 * Vérifie le rôle, charge l'inscription, contrôle l'isolation entité ET,
 * pour un rôle `learner`, la propriété (l'inscription est la sienne via
 * la chaîne learner_id → learners.profile_id = auth.uid()).
 */
export async function requireElearningEnrollment(
  enrollmentId: string,
  allowedRoles: string[],
): Promise<ElearningEnrollmentAccess> {
  const auth = await requireRole(allowedRoles);
  if (auth.error) return { ok: false, error: auth.error };

  const { data: enrollment, error } = await auth.supabase
    .from("elearning_enrollments")
    .select("id, course_id, learner_id, elearning_courses(entity_id), learners(profile_id)")
    .eq("id", enrollmentId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: NextResponse.json({ error: "Erreur de chargement de l'inscription" }, { status: 500 }) };
  }
  if (!enrollment) return { ok: false, error: notFound("Inscription") };

  const courseEntity = (enrollment.elearning_courses as unknown as { entity_id: string } | null)?.entity_id;
  if (courseEntity !== auth.profile.entity_id) {
    return { ok: false, error: forbidden() };
  }
  if (auth.profile.role === "learner") {
    const learnerProfileId = (enrollment.learners as unknown as { profile_id: string | null } | null)?.profile_id;
    if (learnerProfileId !== auth.user.id) {
      return { ok: false, error: forbidden() };
    }
  }
  return {
    ok: true,
    supabase: auth.supabase,
    profile: auth.profile,
    userId: auth.user.id,
    enrollment: {
      id: enrollment.id as string,
      course_id: enrollment.course_id as string,
      learner_id: enrollment.learner_id as string,
    },
  };
}
