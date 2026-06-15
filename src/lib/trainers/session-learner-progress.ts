/**
 * Agrège, pour une session, le suivi des apprenants : présence (signatures) et
 * complétion du questionnaire. Fonction pure → testable, sans dépendance React
 * ni Supabase (les données sont fournies par le composant appelant).
 *
 * ⚠️ Les signatures apprenant stockent `signer_id = profile_id` (pas
 * `learners.id`) — on matche donc sur `learner.profile_id`.
 */
export interface ProgressEnrollment {
  learner: {
    id: string;
    profile_id: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
}

export interface ProgressSignature {
  signer_id: string | null;
  time_slot_id?: string | null;
}

export interface ProgressResponse {
  learner_id: string | null;
}

export interface LearnerProgressRow {
  learnerId: string;
  name: string;
  signedCount: number;
  slotsCount: number;
  questionnaireDone: boolean;
}

export function computeSessionLearnerProgress(
  enrollments: ProgressEnrollment[],
  signatures: ProgressSignature[],
  slotsCount: number,
  responses: ProgressResponse[],
): LearnerProgressRow[] {
  const respondedLearnerIds = new Set(
    responses.map((r) => r.learner_id).filter((id): id is string => Boolean(id)),
  );

  const seen = new Set<string>();
  const rows: LearnerProgressRow[] = [];

  for (const enrollment of enrollments) {
    const learner = enrollment.learner;
    if (!learner || seen.has(learner.id)) continue;
    seen.add(learner.id);

    const signedCount = learner.profile_id
      ? signatures.filter((s) => s.signer_id === learner.profile_id).length
      : 0;

    rows.push({
      learnerId: learner.id,
      name: `${(learner.last_name ?? "").toUpperCase()} ${learner.first_name ?? ""}`.trim(),
      signedCount,
      slotsCount,
      questionnaireDone: respondedLearnerIds.has(learner.id),
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  return rows;
}
