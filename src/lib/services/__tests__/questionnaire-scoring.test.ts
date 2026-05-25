import { describe, it, expect } from "vitest";
import { isCorrect } from "@/lib/services/questionnaire-scoring";

/**
 * Tests régression P0-4 (deep-dive 2026-05-25) :
 * - yes_no : Boolean("non") === Boolean("oui") === true (faux positif 100% scoring)
 * - text : pas de normalisation accents + pas de guard null/undefined
 *
 * Fichier renommé depuis load-evaluation-results.test.ts suite au refactor
 * DRY (final code review Chantier 1 issue #1) : isCorrect vit maintenant dans
 * questionnaire-scoring.ts, partagé entre load-evaluation-results et
 * load-session-aggregates.
 */
describe("isCorrect — scoring questionnaire (P0-4 régression)", () => {
  describe("yes_no / true_false", () => {
    it("retourne true quand 'oui' == 'oui'", () => {
      const question = { id: "q1", type: "yes_no", options: { correct_answer: "oui" } };
      expect(isCorrect(question, "oui")).toBe(true);
    });

    it("retourne false quand 'non' != 'oui' (régression bug Boolean)", () => {
      // Avant le fix : Boolean("non") === Boolean("oui") === true === true → TRUE (bug)
      // Après le fix : normalize("non") === normalize("oui") → "non" === "oui" → FALSE
      const question = { id: "q1", type: "yes_no", options: { correct_answer: "oui" } };
      expect(isCorrect(question, "non")).toBe(false);
    });

    it("retourne true insensible à la casse 'OUI' == 'oui'", () => {
      const question = { id: "q1", type: "yes_no", options: { correct_answer: "oui" } };
      expect(isCorrect(question, "OUI")).toBe(true);
    });
  });

  describe("text / short_answer", () => {
    it("retourne true avec normalisation accents 'élève' == 'eleve'", () => {
      const question = { id: "q1", type: "text", options: { correct_answer: "eleve" } };
      expect(isCorrect(question, "élève")).toBe(true);
    });

    it("retourne null quand correct_answer est null (guard)", () => {
      // Avant le fix : String(null).trim().toLowerCase() === "null" → si user dit "null", true (bug)
      // Après le fix : guard explicite → null (non scorable)
      const question = { id: "q1", type: "text", options: { correct_answer: null } };
      expect(isCorrect(question, "null")).toBe(null);
    });

    it("retourne true après trim '  Hello  ' == 'hello'", () => {
      const question = { id: "q1", type: "text", options: { correct_answer: "hello" } };
      expect(isCorrect(question, "  Hello  ")).toBe(true);
    });
  });

  describe("multiple_choice (régression bug label vs index)", () => {
    it("retourne true quand userAnswer label match l'option à correct_answer index", () => {
      // Format Task 0 Investigation : { options: [...], correct_answer: N } (généré par OpenAI)
      const question = {
        id: "q1",
        type: "multiple_choice",
        options: { options: ["Lyon", "Marseille", "Paris", "Nice"], correct_answer: 2 },
      };
      expect(isCorrect(question, "Paris")).toBe(true);
    });

    it("retourne false quand userAnswer label ne match aucune option", () => {
      const question = {
        id: "q1",
        type: "multiple_choice",
        options: { options: ["Lyon", "Marseille", "Paris"], correct_answer: 2 },
      };
      expect(isCorrect(question, "Bordeaux")).toBe(false);
    });

    it("retourne true en mode legacy quand userAnswer est l'index numérique", () => {
      const question = {
        id: "q1",
        type: "multiple_choice",
        options: { options: ["A", "B", "C"], correct_answer: 1 },
      };
      expect(isCorrect(question, 1)).toBe(true);
    });
  });
});
