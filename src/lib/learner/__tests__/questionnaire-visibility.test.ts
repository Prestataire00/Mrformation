import { describe, it, expect } from "vitest";
import { isLearnerQuestionnaireVisible } from "@/lib/learner/questionnaire-visibility";

describe("isLearnerQuestionnaireVisible", () => {
  it("cache le bilan formateur (quest_formateurs) même session terminée", () => {
    expect(isLearnerQuestionnaireVisible("quest_formateurs", true)).toBe(false);
    expect(isLearnerQuestionnaireVisible("quest_formateurs", false)).toBe(false);
  });

  it("cache les questionnaires entreprise / manager / financeur", () => {
    expect(isLearnerQuestionnaireVisible("quest_entreprises", true)).toBe(false);
    expect(isLearnerQuestionnaireVisible("quest_managers", true)).toBe(false);
    expect(isLearnerQuestionnaireVisible("quest_financeurs", true)).toBe(false);
  });

  it("affiche toujours le positionnement pré (auto_eval_pre)", () => {
    expect(isLearnerQuestionnaireVisible("auto_eval_pre", false)).toBe(true);
    expect(isLearnerQuestionnaireVisible("auto_eval_pre", true)).toBe(true);
  });

  it("masque l'auto-éval post tant que la session n'est pas terminée, l'affiche après", () => {
    expect(isLearnerQuestionnaireVisible("auto_eval_post", false)).toBe(false);
    expect(isLearnerQuestionnaireVisible("auto_eval_post", true)).toBe(true);
  });

  it("masque la satisfaction à chaud/froid avant la fin, l'affiche après", () => {
    expect(isLearnerQuestionnaireVisible("satisfaction_chaud", false)).toBe(false);
    expect(isLearnerQuestionnaireVisible("satisfaction_chaud", true)).toBe(true);
    expect(isLearnerQuestionnaireVisible("satisfaction_froid", false)).toBe(false);
    expect(isLearnerQuestionnaireVisible("satisfaction_froid", true)).toBe(true);
  });

  it("affiche l'éval pendant la formation (eval_pendant)", () => {
    expect(isLearnerQuestionnaireVisible("eval_pendant", false)).toBe(true);
  });

  it("préserve les questionnaires legacy (quality_indicator_type null) → visible", () => {
    expect(isLearnerQuestionnaireVisible(null, false)).toBe(true);
    expect(isLearnerQuestionnaireVisible(undefined, false)).toBe(true);
  });
});
