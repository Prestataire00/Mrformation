import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Pédagogie V2 Epic 2 — Helpers de snapshot et auto-enrôlement.
 *
 * Spec : bmad_output/planning-artifacts/spec-restructuration-pedagogique-2026-06-04.md
 * Décision Phase 3 (option B) : la session est l'instance, le programme le template.
 * À la création d'une session avec program_id, on COPY les e-learning par défaut
 * du programme vers session_elearning_courses (snapshot). La session devient
 * ensuite indépendante du programme (modifications programme ne propagent pas).
 */

export type CopyProgramElearningResult = {
  copied: number;
  alreadyExists: boolean;
};

/**
 * Copy les `program_elearning_courses` du programme vers `session_elearning_courses`
 * pour la session donnée. Idempotent : si la session a déjà des entrées (snapshot
 * déjà fait, ou ajouts manuels antérieurs), no-op.
 *
 * Conversion : is_mandatory_before_session_default → is_mandatory_before_session,
 * allow_free_progress_default → allow_free_progress.
 *
 * Le client supabase doit être server-side (RLS appliqués via le user appelant,
 * ou service_role en mode cron — le helper ne fait pas l'auth).
 */
export async function copyProgramElearningToSession(
  supabase: SupabaseClient,
  params: { sessionId: string; programId: string },
): Promise<CopyProgramElearningResult> {
  const { sessionId, programId } = params;

  // 1. Idempotence : si la session a déjà des e-learning attachés, no-op.
  const { data: existing } = await supabase
    .from("session_elearning_courses")
    .select("elearning_course_id")
    .eq("session_id", sessionId);

  if (existing && existing.length > 0) {
    return { copied: 0, alreadyExists: true };
  }

  // 2. Charge les defaults du programme.
  const { data: defaults } = await supabase
    .from("program_elearning_courses")
    .select(
      "elearning_course_id, order_index, is_mandatory_before_session_default, allow_free_progress_default",
    )
    .eq("program_id", programId);

  if (!defaults || defaults.length === 0) {
    return { copied: 0, alreadyExists: false };
  }

  // 3. Insert le snapshot.
  type DefaultRow = {
    elearning_course_id: string;
    order_index: number;
    is_mandatory_before_session_default: boolean;
    allow_free_progress_default: boolean;
  };
  const rowsToInsert = (defaults as DefaultRow[]).map((d) => ({
    session_id: sessionId,
    elearning_course_id: d.elearning_course_id,
    order_index: d.order_index,
    is_mandatory_before_session: d.is_mandatory_before_session_default,
    allow_free_progress: d.allow_free_progress_default,
  }));

  await supabase.from("session_elearning_courses").insert(rowsToInsert);

  return { copied: rowsToInsert.length, alreadyExists: false };
}

export type AutoEnrollResult = {
  enrolled: number;
  skippedOptOut: number;
};

/**
 * Crée les `elearning_enrollments` pour un apprenant sur tous les e-learning
 * attachés à une session, en respectant la liste opt-out.
 *
 * Idempotent via upsert : ré-enrôler ne crée pas de doublon. Suppose une
 * UNIQUE constraint sur elearning_enrollments(learner_id, elearning_course_id).
 * Si la contrainte n'existe pas (à vérifier dans le schema), le upsert insert
 * quand même mais des doublons peuvent apparaître sur re-run multiples.
 */
export async function autoEnrollLearnerToSessionElearning(
  supabase: SupabaseClient,
  params: { sessionId: string; learnerId: string; optOutElearningCourseIds: string[] },
): Promise<AutoEnrollResult> {
  const { sessionId, learnerId, optOutElearningCourseIds } = params;

  // 1. Liste les e-learning de la session.
  const { data: sessionEl } = await supabase
    .from("session_elearning_courses")
    .select("elearning_course_id")
    .eq("session_id", sessionId);

  if (!sessionEl || sessionEl.length === 0) {
    return { enrolled: 0, skippedOptOut: 0 };
  }

  // 2. Filtre opt-out.
  const optOutSet = new Set(optOutElearningCourseIds);
  type SessionElRow = { elearning_course_id: string };
  const toEnroll = (sessionEl as SessionElRow[]).filter(
    (r) => !optOutSet.has(r.elearning_course_id),
  );
  const skipped = sessionEl.length - toEnroll.length;

  if (toEnroll.length === 0) {
    return { enrolled: 0, skippedOptOut: skipped };
  }

  // 3. Upsert idempotent.
  const rows = toEnroll.map((r) => ({
    learner_id: learnerId,
    elearning_course_id: r.elearning_course_id,
    enrolled_at: new Date().toISOString(),
  }));

  await supabase
    .from("elearning_enrollments")
    .upsert(rows, { onConflict: "learner_id,elearning_course_id" });

  return { enrolled: toEnroll.length, skippedOptOut: skipped };
}
