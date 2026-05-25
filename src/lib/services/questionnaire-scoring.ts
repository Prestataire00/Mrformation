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
    // correct_answer = index 0-3, user response = index ou label
    // Note : bug latent (label non géré) reporté à Chantier 2 — voir deep-dive §3.6
    return Number(userAnswer) === Number(correct);
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
