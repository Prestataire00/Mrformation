/**
 * Helper : charge tous les agrégats session pour le doc "Réponses satisfaction
 * apprenants" (vue admin) :
 *
 * 1. Satisfaction aggregates (par question des questionnaires type='satisfaction')
 * 2. KPIs Qualiopi (taux complétion / satisfaction / acquisition)
 * 3. Évaluations aggregates (par questionnaire type='evaluation')
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface SatisfactionQuestionAggregate {
  questionText: string;
  questionType: string;
  averageRating: number | null;
  distribution: { value: string; count: number }[];
  responseCount: number;
}

export interface QualiopiIndicators {
  totalLearners: number;
  signedLearnersCount: number;
  completionRate: number; // % apprenants présents (au moins 1 signature)
  satisfactionRate: number | null; // moyenne % satisfaction (rating × 20 → %)
  satisfactionResponses: number;
  acquisitionRate: number | null; // % d'apprenants ACQUIS aux évaluations
  evaluationCount: number;
}

export interface EvaluationAggregate {
  title: string;
  responseCount: number;
  totalEnrolled: number;
  averageScorePct: number | null; // % moyen
  acquisRate: number | null; // % d'apprenants ayant ACQUIS (≥70%)
}

interface QuestionRow {
  id: string;
  text: string;
  type: string;
  options: unknown;
}

interface ResponseRow {
  learner_id: string | null;
  responses: Record<string, unknown> | null;
}

const PASSING_SCORE_PCT = 70;

function isCorrect(question: QuestionRow, userAnswer: unknown): boolean | null {
  const opts = question.options as { correct_answer?: unknown } | null;
  if (!opts || opts.correct_answer === undefined) return null;
  const correct = opts.correct_answer;

  if (question.type === "multiple_choice") {
    return Number(userAnswer) === Number(correct);
  }
  if (question.type === "yes_no" || question.type === "true_false") {
    return Boolean(userAnswer) === Boolean(correct);
  }
  if (question.type === "text" || question.type === "short_answer") {
    return String(userAnswer ?? "").trim().toLowerCase() === String(correct).trim().toLowerCase();
  }
  return null;
}

/**
 * Calcule les agrégats satisfaction par question. Format :
 * - rating : averageRating = moyenne, distribution = compte par valeur
 * - multiple_choice : averageRating = null, distribution = compte par option
 * - yes_no : averageRating = null, distribution = oui/non counts
 */
async function loadSatisfactionAggregates(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<SatisfactionQuestionAggregate[]> {
  const { data: qSessions } = await supabase
    .from("questionnaire_sessions")
    .select("questionnaire_id, questionnaires:questionnaires!inner(id, type)")
    .eq("session_id", sessionId);

  if (!qSessions || qSessions.length === 0) return [];

  const satisfactionQuestionnaireIds = (qSessions as unknown as {
    questionnaire_id: string;
    questionnaires: { id: string; type: string };
  }[])
    .filter((qs) => qs.questionnaires?.type === "satisfaction")
    .map((qs) => qs.questionnaire_id);

  if (satisfactionQuestionnaireIds.length === 0) return [];

  const [{ data: questions }, { data: responses }] = await Promise.all([
    supabase
      .from("questions")
      .select("id, text, type, options, questionnaire_id, order_index")
      .in("questionnaire_id", satisfactionQuestionnaireIds)
      .order("order_index", { ascending: true }),
    supabase
      .from("questionnaire_responses")
      .select("learner_id, responses")
      .in("questionnaire_id", satisfactionQuestionnaireIds)
      .eq("session_id", sessionId),
  ]);

  const questionsTyped = (questions ?? []) as (QuestionRow & { questionnaire_id: string })[];
  const responsesTyped = (responses ?? []) as ResponseRow[];

  return questionsTyped.map((q) => {
    const dist = new Map<string, number>();
    let sum = 0;
    let ratingCount = 0;
    let responseCount = 0;

    for (const r of responsesTyped) {
      const ans = r.responses?.[q.id];
      if (ans === undefined || ans === null || ans === "") continue;
      responseCount += 1;
      const ansStr = String(ans);
      dist.set(ansStr, (dist.get(ansStr) ?? 0) + 1);
      if (q.type === "rating") {
        const num = Number(ans);
        if (!isNaN(num)) {
          sum += num;
          ratingCount += 1;
        }
      }
    }

    return {
      questionText: q.text,
      questionType: q.type,
      averageRating: ratingCount > 0 ? sum / ratingCount : null,
      distribution: Array.from(dist.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count),
      responseCount,
    };
  });
}

/**
 * Calcule les KPIs Qualiopi de la session.
 *
 * Défense en profondeur multi-tenant : on commence par confirmer que la session
 * existe en chargeant son entity_id. Si la session est introuvable (caller
 * passe un sessionId invalide ou supprimé), on renvoie des valeurs neutres
 * sans accéder aux sub-tables.
 *
 * Note schéma : enrollments / signatures / questionnaire_sessions /
 * questionnaire_responses n'ont PAS de colonne entity_id propre (cf
 * supabase/schema.sql) — leur filtre multi-tenant transite par session_id
 * (FK vers sessions) qui est déjà la clé de chacune des queries downstream.
 * Le RLS de ces tables s'appuie sur la même mécanique (cf migrations
 * cleanup_allow_all_phase2b_lots24.sql : « entity_id via sessions »).
 * Ajouter ici un `.eq("entity_id", ...)` direct provoquerait un
 * PostgREST 400 « column does not exist » en runtime.
 */
export async function loadQualiopiIndicators(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<QualiopiIndicators> {
  // Récupérer l'entity_id de la session une fois pour défense en profondeur.
  // Si session introuvable, retourner des valeurs neutres (cas de session
  // supprimée entre temps).
  const { data: sessionRow } = await supabase
    .from("sessions")
    .select("entity_id")
    .eq("id", sessionId)
    .single();

  if (!sessionRow?.entity_id) {
    return {
      totalLearners: 0,
      signedLearnersCount: 0,
      completionRate: 0,
      satisfactionRate: null,
      satisfactionResponses: 0,
      acquisitionRate: null,
      evaluationCount: 0,
    };
  }

  // Apprenants inscrits (entity_id transite par session_id, cf JSDoc).
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("learner_id")
    .eq("session_id", sessionId);
  const totalLearners = (enrollments ?? []).length;

  // Signatures (présence)
  const { data: signatures } = await supabase
    .from("signatures")
    .select("signer_id")
    .eq("session_id", sessionId)
    .eq("signer_type", "learner");
  const signedLearnerIds = new Set(
    (signatures ?? [])
      .map((s) => (s as { signer_id: string | null }).signer_id)
      .filter((id): id is string => Boolean(id)),
  );

  const completionRate = totalLearners > 0
    ? (signedLearnerIds.size / totalLearners) * 100
    : 0;

  // Satisfaction globale : moyenne des rating questions × 20 pour rating /5
  const satisfactionData = await loadSatisfactionAggregates(supabase, sessionId);
  const ratingQuestions = satisfactionData.filter(
    (q) => q.questionType === "rating" && q.averageRating !== null,
  );
  let satisfactionRate: number | null = null;
  let satisfactionResponses = 0;
  if (ratingQuestions.length > 0) {
    const avgOf5 =
      ratingQuestions.reduce((s, q) => s + (q.averageRating ?? 0), 0) / ratingQuestions.length;
    satisfactionRate = (avgOf5 / 5) * 100;
    satisfactionResponses = ratingQuestions[0].responseCount;
  }

  // Acquisition (taux d'apprenants ACQUIS aux évaluations)
  const { data: qSessions } = await supabase
    .from("questionnaire_sessions")
    .select("questionnaire_id, questionnaires:questionnaires!inner(id, type)")
    .eq("session_id", sessionId);
  const evalQuestionnaireIds = ((qSessions ?? []) as unknown as {
    questionnaire_id: string;
    questionnaires: { id: string; type: string };
  }[])
    .filter((qs) => qs.questionnaires?.type === "evaluation")
    .map((qs) => qs.questionnaire_id);

  let acquisitionRate: number | null = null;
  if (evalQuestionnaireIds.length > 0 && totalLearners > 0) {
    const [{ data: evalQuestions }, { data: evalResponses }] = await Promise.all([
      supabase
        .from("questions")
        .select("id, type, options, questionnaire_id")
        .in("questionnaire_id", evalQuestionnaireIds),
      supabase
        .from("questionnaire_responses")
        .select("learner_id, responses, questionnaire_id")
        .in("questionnaire_id", evalQuestionnaireIds)
        .eq("session_id", sessionId),
    ]);

    const questionsByQuestionnaire = new Map<string, QuestionRow[]>();
    for (const q of (evalQuestions ?? []) as (QuestionRow & { questionnaire_id: string })[]) {
      if (!questionsByQuestionnaire.has(q.questionnaire_id)) {
        questionsByQuestionnaire.set(q.questionnaire_id, []);
      }
      questionsByQuestionnaire.get(q.questionnaire_id)!.push(q);
    }

    // Pour chaque (learner, evaluation) → score, pour calculer % acquis
    const learnerScores = new Map<string, number[]>(); // learner_id → liste de % par évaluation
    for (const resp of (evalResponses ?? []) as (ResponseRow & { questionnaire_id: string })[]) {
      if (!resp.learner_id) continue;
      const qs = questionsByQuestionnaire.get(resp.questionnaire_id) ?? [];
      let scorable = 0;
      let correct = 0;
      for (const q of qs) {
        const verdict = isCorrect(q, resp.responses?.[q.id]);
        if (verdict === null) continue;
        scorable += 1;
        if (verdict) correct += 1;
      }
      if (scorable > 0) {
        const pct = (correct / scorable) * 100;
        if (!learnerScores.has(resp.learner_id)) learnerScores.set(resp.learner_id, []);
        learnerScores.get(resp.learner_id)!.push(pct);
      }
    }

    if (learnerScores.size > 0) {
      let acquisCount = 0;
      for (const scores of learnerScores.values()) {
        const avg = scores.reduce((s, n) => s + n, 0) / scores.length;
        if (avg >= PASSING_SCORE_PCT) acquisCount += 1;
      }
      acquisitionRate = (acquisCount / learnerScores.size) * 100;
    }
  }

  return {
    totalLearners,
    signedLearnersCount: signedLearnerIds.size,
    completionRate,
    satisfactionRate,
    satisfactionResponses,
    acquisitionRate,
    evaluationCount: evalQuestionnaireIds.length,
  };
}

/**
 * Calcule les agrégats par évaluation (1 ligne par questionnaire type='evaluation').
 */
async function loadEvaluationAggregates(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<EvaluationAggregate[]> {
  const [{ data: qSessions }, { data: enrollments }] = await Promise.all([
    supabase
      .from("questionnaire_sessions")
      .select("questionnaire_id, questionnaires:questionnaires!inner(id, title, type)")
      .eq("session_id", sessionId),
    supabase.from("enrollments").select("learner_id").eq("session_id", sessionId),
  ]);

  const totalEnrolled = (enrollments ?? []).length;
  const evalQs = ((qSessions ?? []) as unknown as {
    questionnaire_id: string;
    questionnaires: { id: string; title: string; type: string };
  }[]).filter((qs) => qs.questionnaires?.type === "evaluation");

  if (evalQs.length === 0) return [];

  const tasks = evalQs.map(async (qs) => {
    const [{ data: questions }, { data: responses }] = await Promise.all([
      supabase.from("questions").select("id, type, options").eq("questionnaire_id", qs.questionnaire_id),
      supabase.from("questionnaire_responses").select("learner_id, responses")
        .eq("questionnaire_id", qs.questionnaire_id).eq("session_id", sessionId),
    ]);

    const questionsTyped = (questions ?? []) as QuestionRow[];
    const responsesTyped = (responses ?? []) as ResponseRow[];

    const scores: number[] = [];
    for (const r of responsesTyped) {
      let scorable = 0;
      let correct = 0;
      for (const q of questionsTyped) {
        const verdict = isCorrect(q, r.responses?.[q.id]);
        if (verdict === null) continue;
        scorable += 1;
        if (verdict) correct += 1;
      }
      if (scorable > 0) scores.push((correct / scorable) * 100);
    }

    const averageScorePct = scores.length > 0
      ? scores.reduce((s, n) => s + n, 0) / scores.length
      : null;
    const acquisRate = scores.length > 0
      ? (scores.filter((s) => s >= PASSING_SCORE_PCT).length / scores.length) * 100
      : null;

    return {
      title: qs.questionnaires.title,
      responseCount: responsesTyped.length,
      totalEnrolled,
      averageScorePct,
      acquisRate,
    };
  });

  return Promise.all(tasks);
}

/**
 * Charge tous les agrégats en parallèle.
 */
export async function loadSessionAggregates(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<{
  satisfaction: SatisfactionQuestionAggregate[];
  qualiopi: QualiopiIndicators;
  evaluations: EvaluationAggregate[];
}> {
  const [satisfaction, qualiopi, evaluations] = await Promise.all([
    loadSatisfactionAggregates(supabase, sessionId),
    loadQualiopiIndicators(supabase, sessionId),
    loadEvaluationAggregates(supabase, sessionId),
  ]);
  return { satisfaction, qualiopi, evaluations };
}
