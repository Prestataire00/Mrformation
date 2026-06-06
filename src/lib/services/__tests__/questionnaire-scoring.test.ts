import { describe, it, expect } from "vitest";
import { computeResponseScore, isCorrect, normalize } from "@/lib/services/questionnaire-scoring";

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

    it("utilise obj.choices quand obj.options est absent (Format A variante choices)", () => {
      // Couvre la branche `obj.options ?? obj.choices` → chemin obj.choices
      const question = {
        id: "q1",
        type: "multiple_choice",
        options: { choices: ["X", "Y", "Z"], correct_answer: 0 },
      };
      expect(isCorrect(question, "X")).toBe(true);
    });

    it("retourne null quand correctIdx reste null (pas de correct_answer numérique)", () => {
      // correct_answer est une string, pas un number → correctIdx = null → return null ligne 54
      const question = {
        id: "q1",
        type: "multiple_choice",
        options: { options: ["A", "B", "C"], correct_answer: "A" },
      };
      expect(isCorrect(question, "A")).toBe(null);
    });

    it("retourne null quand options est un array sans correct_answer (early guard)", () => {
      // Couvre l'early guard ligne ~26 : opts.correct_answer === undefined
      // (["A","B","C"] as {correct_answer?}).correct_answer === undefined → return null immédiatement)
      const question = {
        id: "q1",
        type: "multiple_choice",
        options: ["A", "B", "C"] as unknown,
      };
      expect(isCorrect(question, "A")).toBe(null);
    });

    it("retourne null quand options est un array mixte sans correct_answer (early guard)", () => {
      // Couvre l'early guard ligne ~26 : opts.correct_answer === undefined
      // La branche Format B Array.isArray n'existe plus — ce test valide uniquement le guard.
      const question = {
        id: "q1",
        type: "multiple_choice",
        options: ["A", 2, "C"] as unknown,
      };
      expect(isCorrect(question, "A")).toBe(null);
    });

    it("retourne null quand userAnswer n'est ni string ni number (multiple_choice)", () => {
      // correctIdx est résolu (2) mais userAnswer est un objet → branche null finale
      const question = {
        id: "q1",
        type: "multiple_choice",
        options: { options: ["A", "B", "C"], correct_answer: 2 },
      };
      expect(isCorrect(question, { label: "C" })).toBe(null);
    });
  });

  describe("autres branches scoring", () => {
    it("retourne null pour le type 'rating' (non scorable)", () => {
      const question = {
        id: "q1",
        type: "rating",
        options: { correct_answer: 5 },
      };
      expect(isCorrect(question, 4)).toBe(null);
    });

    it("retourne null pour un type inconnu (default fallback)", () => {
      const question = {
        id: "q1",
        type: "type_inexistant",
        options: { correct_answer: "x" },
      };
      expect(isCorrect(question, "x")).toBe(null);
    });

    it("retourne null quand options est null (pas de scoring possible)", () => {
      const question = {
        id: "q1",
        type: "yes_no",
        options: null,
      };
      expect(isCorrect(question, "oui")).toBe(null);
    });

    it("retourne null quand opts.correct_answer est undefined", () => {
      const question = {
        id: "q1",
        type: "yes_no",
        options: {},  // pas de correct_answer
      };
      expect(isCorrect(question, "oui")).toBe(null);
    });
  });

  describe("normalize() helper (tests directs)", () => {
    it("normalise input null/undefined en chaîne vide", () => {
      expect(normalize(null)).toBe("");
      expect(normalize(undefined)).toBe("");
    });

    it("normalise espaces multiples + casse + accents", () => {
      expect(normalize("  Élève  ")).toBe("eleve");
      expect(normalize("CAFÉ")).toBe("cafe");
    });
  });
});

/**
 * Tests E1-S10 V1 : computeResponseScore — recalcul à la volée.
 *
 * Scoring rétroactif sans migration DB : la fonction prend une réponse JSONB
 * et la liste courante des questions, retourne { correct, total_scorable,
 * score_percent }. Pure function, aucune mutation.
 */
describe("computeResponseScore — recalcul à la volée (E1-S10 V1)", () => {
  it("quiz tout correct (3/3) → 100%", () => {
    const questions = [
      { id: "q1", type: "yes_no", options: { correct_answer: "oui" } },
      { id: "q2", type: "text", options: { correct_answer: "paris" } },
      {
        id: "q3",
        type: "multiple_choice",
        options: { options: ["A", "B", "C"], correct_answer: 1 },
      },
    ];
    const response = { q1: "oui", q2: "Paris", q3: "B" };
    expect(computeResponseScore(response, questions)).toEqual({
      correct: 3,
      total_scorable: 3,
      score_percent: 100,
    });
  });

  it("quiz partiellement correct (2/3) → 67%", () => {
    const questions = [
      { id: "q1", type: "yes_no", options: { correct_answer: "oui" } },
      { id: "q2", type: "text", options: { correct_answer: "paris" } },
      {
        id: "q3",
        type: "multiple_choice",
        options: { options: ["A", "B", "C"], correct_answer: 1 },
      },
    ];
    // q1 OK, q2 OK, q3 KO (réponse "C" alors que correct_answer = index 1 → "B")
    const response = { q1: "oui", q2: "Paris", q3: "C" };
    expect(computeResponseScore(response, questions)).toEqual({
      correct: 2,
      total_scorable: 3,
      score_percent: 67, // Math.round(100 * 2/3) = 67
    });
  });

  it("quiz tout faux (0/3) → 0%", () => {
    const questions = [
      { id: "q1", type: "yes_no", options: { correct_answer: "oui" } },
      { id: "q2", type: "text", options: { correct_answer: "paris" } },
      {
        id: "q3",
        type: "multiple_choice",
        options: { options: ["A", "B", "C"], correct_answer: 1 },
      },
    ];
    const response = { q1: "non", q2: "Lyon", q3: "A" };
    expect(computeResponseScore(response, questions)).toEqual({
      correct: 0,
      total_scorable: 3,
      score_percent: 0,
    });
  });

  it("quiz vide (response = {}) compte total_scorable mais 0 correct", () => {
    const questions = [
      { id: "q1", type: "yes_no", options: { correct_answer: "oui" } },
      { id: "q2", type: "text", options: { correct_answer: "paris" } },
    ];
    expect(computeResponseScore({}, questions)).toEqual({
      correct: 0,
      total_scorable: 2,
      score_percent: 0,
    });
  });

  it("questionnaire avec questions non-scorables (rating + text qualitatif) → total_scorable < total", () => {
    const questions = [
      { id: "q1", type: "yes_no", options: { correct_answer: "oui" } }, // scorable
      { id: "q2", type: "rating", options: { correct_answer: 5 } }, // non scorable (rating)
      { id: "q3", type: "text", options: null }, // non scorable (pas de correct_answer)
    ];
    const response = { q1: "oui", q2: 4, q3: "ma réponse libre" };
    expect(computeResponseScore(response, questions)).toEqual({
      correct: 1,
      total_scorable: 1, // seule q1 est scorable
      score_percent: 100,
    });
  });

  it("correct_answer manquant → question exclue du total", () => {
    const questions = [
      { id: "q1", type: "yes_no", options: { correct_answer: "oui" } },
      { id: "q2", type: "yes_no", options: {} }, // pas de correct_answer
      { id: "q3", type: "text", options: { correct_answer: undefined } }, // explicite undefined
    ];
    const response = { q1: "oui", q2: "oui", q3: "test" };
    expect(computeResponseScore(response, questions)).toEqual({
      correct: 1,
      total_scorable: 1,
      score_percent: 100,
    });
  });

  it("response = null → { correct: 0, total_scorable: N, score_percent: 0 }", () => {
    const questions = [
      { id: "q1", type: "yes_no", options: { correct_answer: "oui" } },
      { id: "q2", type: "text", options: { correct_answer: "paris" } },
    ];
    expect(computeResponseScore(null, questions)).toEqual({
      correct: 0,
      total_scorable: 2,
      score_percent: 0,
    });
  });

  it("response = undefined → { correct: 0, total_scorable: N, score_percent: 0 }", () => {
    const questions = [
      { id: "q1", type: "yes_no", options: { correct_answer: "oui" } },
    ];
    expect(computeResponseScore(undefined, questions)).toEqual({
      correct: 0,
      total_scorable: 1,
      score_percent: 0,
    });
  });

  it("questionnaire 100% non scorable (rating only) → score_percent = null", () => {
    const questions = [
      { id: "q1", type: "rating", options: { correct_answer: 5 } },
      { id: "q2", type: "rating", options: { correct_answer: 4 } },
    ];
    const response = { q1: 5, q2: 4 };
    expect(computeResponseScore(response, questions)).toEqual({
      correct: 0,
      total_scorable: 0,
      score_percent: null,
    });
  });

  it("recalcul rétroactif : changer correct_answer en aval change le score", () => {
    // Simule le flow E1-S10 : admin corrige correct_answer "non" → "oui".
    // Une ancienne réponse "oui" devient correcte après recalcul.
    const responseStored = { q1: "oui" };
    const questionsBeforeFix = [
      { id: "q1", type: "yes_no", options: { correct_answer: "non" } },
    ];
    const questionsAfterFix = [
      { id: "q1", type: "yes_no", options: { correct_answer: "oui" } },
    ];
    expect(computeResponseScore(responseStored, questionsBeforeFix).score_percent).toBe(0);
    expect(computeResponseScore(responseStored, questionsAfterFix).score_percent).toBe(100);
  });
});
