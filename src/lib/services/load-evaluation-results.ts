/**
 * Helper : charge les résultats d'évaluations d'un apprenant pour une session.
 *
 * Stratégie de calcul de score :
 * 1. Récupère les questionnaires de type='evaluation' attachés à la session
 *    via `questionnaire_sessions`.
 * 2. Pour chaque, cherche la réponse de l'apprenant dans
 *    `questionnaire_responses`.
 * 3. Si réponse trouvée + questions ont des `correct_answer` (dans options
 *    JSONB) : compute score = (correct / total questions scorables) × 100.
 *    Sinon : status="complete" sans score.
 * 4. Pas de réponse trouvée : status="non_complete".
 *
 * Passing score par défaut : 70% (acquis) — sera configurable plus tard via
 * un champ entity / questionnaire.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isCorrect, type QuestionRow } from "@/lib/services/questionnaire-scoring";

// Re-export isCorrect so existing callers of load-evaluation-results can keep their import.
export { isCorrect } from "@/lib/services/questionnaire-scoring";

const PASSING_SCORE_PCT = 70;

export interface EvaluationResult {
  title: string;
  completedAt: string | null;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  status: "acquis" | "non_acquis" | "complete" | "non_complete";
}

interface ResponseRow {
  questionnaire_id: string;
  submitted_at: string | null;
  responses: Record<string, unknown> | null;
}

interface QuestionnaireRow {
  id: string;
  title: string;
}

export async function loadEvaluationResults(
  supabase: SupabaseClient,
  sessionId: string,
  learnerId: string,
): Promise<EvaluationResult[]> {
  // 1. Questionnaires de type='evaluation' attachés à la session
  const { data: qSessions } = await supabase
    .from("questionnaire_sessions")
    .select("questionnaire_id, questionnaires:questionnaires!inner(id, title, type)")
    .eq("session_id", sessionId);

  if (!qSessions || qSessions.length === 0) return [];

  const evalQuestionnaires = (qSessions as unknown as {
    questionnaire_id: string;
    questionnaires: { id: string; title: string; type: string };
  }[]).filter((qs) => qs.questionnaires?.type === "evaluation");

  if (evalQuestionnaires.length === 0) return [];

  // 2. Pour chaque questionnaire, charge questions + réponse de l'apprenant en parallèle
  const tasks = evalQuestionnaires.map(async (qs) => {
    const questionnaire = qs.questionnaires;

    const [{ data: questions }, { data: response }] = await Promise.all([
      supabase
        .from("questions")
        .select("id, type, options")
        .eq("questionnaire_id", questionnaire.id),
      supabase
        .from("questionnaire_responses")
        .select("questionnaire_id, submitted_at, responses")
        .eq("questionnaire_id", questionnaire.id)
        .eq("session_id", sessionId)
        .eq("learner_id", learnerId)
        .maybeSingle(),
    ]);

    const respTyped = response as ResponseRow | null;
    if (!respTyped) {
      return {
        title: questionnaire.title,
        completedAt: null,
        score: null,
        maxScore: null,
        percentage: null,
        status: "non_complete" as const,
      };
    }

    const userResponses = (respTyped.responses ?? {}) as Record<string, unknown>;
    const questionsTyped = (questions ?? []) as QuestionRow[];

    let scorableCount = 0;
    let correctCount = 0;
    for (const q of questionsTyped) {
      const verdict = isCorrect(q, userResponses[q.id]);
      if (verdict === null) continue;
      scorableCount += 1;
      if (verdict) correctCount += 1;
    }

    if (scorableCount === 0) {
      // Aucune question scorable (ex: questionnaire 100% rating) → juste "complété"
      return {
        title: questionnaire.title,
        completedAt: respTyped.submitted_at,
        score: null,
        maxScore: null,
        percentage: null,
        status: "complete" as const,
      };
    }

    const percentage = (correctCount / scorableCount) * 100;
    const passed = percentage >= PASSING_SCORE_PCT;
    return {
      title: questionnaire.title,
      completedAt: respTyped.submitted_at,
      score: correctCount,
      maxScore: scorableCount,
      percentage,
      status: (passed ? "acquis" : "non_acquis") as "acquis" | "non_acquis",
    };
  });

  return Promise.all(tasks);
}
