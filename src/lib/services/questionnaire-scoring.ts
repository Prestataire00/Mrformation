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
