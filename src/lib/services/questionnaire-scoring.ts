/**
 * Helpers de scoring pour les réponses à un questionnaire (évaluation).
 *
 * Extrait de `load-evaluation-results.ts` et `load-session-aggregates.ts` pour
 * éviter la duplication (cf final code review Chantier 1 issue #1). Le bug P0-4
 * `Boolean("non") === Boolean("oui") === true` ne peut plus survivre dans une
 * seule des 2 copies.
 *
 * Source : docs/superpowers/specs/2026-05-25-questionnaires-solidification-p0-design.md §6.2
 */

export interface QuestionRow {
  id: string;
  type: string;
  options: unknown;
}

/** Normalise une réponse pour comparaison : trim + lowercase + suppression accents (NFD). */
export const normalize = (v: unknown): string =>
  String(v ?? "").trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Détermine si la réponse de l'apprenant matche la correct_answer de la question. */
export function isCorrect(question: QuestionRow, userAnswer: unknown): boolean | null {
  const opts = question.options as { correct_answer?: unknown } | null;
  if (!opts || opts.correct_answer === undefined) return null; // pas scorable
  const correct = opts.correct_answer;

  if (question.type === "multiple_choice") {
    // Fix bug label vs index : le frontend submit la label string mais
    // correct_answer est stocké comme index numérique (format OpenAI).
    // → résoudre l'index via question.options.options.findIndex(label).
    const opts = question.options as unknown;
    let choices: string[] = [];
    let correctIdx: number | null = null;

    // Format A (généré OpenAI) : { options: [...], correct_answer: N }
    if (typeof opts === "object" && opts !== null && !Array.isArray(opts)) {
      const obj = opts as { options?: unknown; choices?: unknown; correct_answer?: unknown };
      const rawChoices = obj.options ?? obj.choices;
      if (Array.isArray(rawChoices) && rawChoices.every((o) => typeof o === "string")) {
        choices = rawChoices as string[];
      }
      if (typeof obj.correct_answer === "number") {
        correctIdx = obj.correct_answer;
      }
    }

    if (correctIdx === null) return null;

    // userAnswer = label string → résoudre l'index via choices
    if (typeof userAnswer === "string" && choices.length > 0) {
      const userIdx = choices.findIndex((o) => normalize(o) === normalize(userAnswer));
      if (userIdx < 0) return false;
      return userIdx === correctIdx;
    }

    // userAnswer = index numérique (legacy ou test)
    if (typeof userAnswer === "number") {
      return userAnswer === correctIdx;
    }

    return null;
  }
  if (question.type === "yes_no" || question.type === "true_false") {
    // Fix P0-4 : comparaison string normalisée (avant : Boolean(userAnswer) === Boolean(correct)
    // qui faisait Boolean("non") === Boolean("oui") === true → 100% scoring bug)
    return normalize(userAnswer) === normalize(correct);
  }
  if (question.type === "text" || question.type === "short_answer") {
    // Fix P0-4 : guard null/undefined avant normalisation
    // (avant : String(null) === "null" → si user dit "null", matche faussement)
    if (correct === null || correct === undefined) return null;
    return normalize(userAnswer) === normalize(correct);
  }
  if (question.type === "rating") {
    // rating n'est pas vraiment scorable au sens "bonne/mauvaise réponse" ;
    // on l'exclut du calcul.
    return null;
  }
  return null;
}

/**
 * Résultat de scoring agrégé pour un questionnaire (réponse complète).
 *
 * - correct : nombre de questions répondues correctement.
 * - total_scorable : nombre de questions dont la `correct_answer` est définie
 *   ET dont le type est scorable (yes_no, true_false, text, short_answer,
 *   multiple_choice). Exclut rating et program_objectives (non scorables).
 * - score_percent : entier 0-100 ou `null` si total_scorable === 0
 *   (questionnaire purement qualitatif, ex : satisfaction).
 */
export type ScoreSummary = {
  correct: number;
  total_scorable: number;
  score_percent: number | null;
};

/**
 * Recalcule le score d'une réponse à la volée à partir des questions
 * courantes (E1-S10 V1 — scoring rétroactif sans persistance DB).
 *
 * Pure function : aucune mutation DB, aucun side-effect. Réutilise
 * `isCorrect()` pour la comparaison par type. Quand l'admin corrige
 * la `correct_answer` d'une question, l'appel suivant à cette fonction
 * renvoie le score à jour pour les réponses passées (recalcul implicite).
 *
 * Conventions :
 * - `response` est un dict { [question_id]: answer_value } (cf. format
 *   `questionnaire_responses.responses` JSONB en DB).
 * - Une question est "scorable" ssi `isCorrect()` retourne un booléen
 *   (pas `null`). Les questions où `isCorrect` retourne `null` sont
 *   exclues du dénominateur.
 * - Si `response` est null/undefined : on retourne `correct: 0` mais on
 *   COMPTE quand même `total_scorable` (questions scorables non répondues
 *   = mauvaises réponses dans le ratio).
 *
 * @param response Dict question_id → answer_value (ou null si aucune réponse).
 * @param questions Liste des questions courantes du questionnaire.
 * @returns ScoreSummary { correct, total_scorable, score_percent }.
 */
export function computeResponseScore(
  response: Record<string, unknown> | null | undefined,
  questions: QuestionRow[],
): ScoreSummary {
  let correct = 0;
  let totalScorable = 0;

  for (const question of questions) {
    const userAnswer = response ? response[question.id] : undefined;
    const verdict = isCorrect(question, userAnswer);
    if (verdict === null) {
      // Question non scorable (type rating, pas de correct_answer, etc.) : ignore.
      continue;
    }
    totalScorable += 1;
    if (verdict === true) {
      correct += 1;
    }
  }

  const score_percent =
    totalScorable === 0 ? null : Math.round((100 * correct) / totalScorable);

  return { correct, total_scorable: totalScorable, score_percent };
}
