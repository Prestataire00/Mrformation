import { describe, it, expect } from "vitest";
import { isCriterionEmpty, findEmptyCriteria, validateSequenceSteps } from "../builder-validation";
import type {
  SelectCriterion,
  TextCriterion,
  RangeCriterion,
  DateRangeCriterion,
  TagsCriterion,
  TrainingCriterion,
  SegmentCriterion,
} from "@/lib/types";

// ─── Helpers pour construire des critères de test ───────────────────────────

const selectBase: Omit<SelectCriterion, "values"> = {
  id: "c1",
  type: "prospect_status",
  operator: "in",
};

const textBase: Omit<TextCriterion, "value"> = {
  id: "c2",
  type: "client_sector",
  operator: "contains",
};

const rangeBase: Omit<RangeCriterion, "min" | "max"> = {
  id: "c3",
  type: "prospect_score",
  operator: "between",
};

const dateBase: Omit<DateRangeCriterion, "dateFrom" | "dateTo"> = {
  id: "c4",
  type: "prospect_created_at",
  operator: "between",
};

const tagsBase: Omit<TagsCriterion, "tagIds"> = {
  id: "c5",
  type: "tags",
  operator: "any",
};

const trainingBase: Omit<TrainingCriterion, "trainingIds"> = {
  id: "c6",
  type: "prospect_training",
  operator: "in",
};

// ─── isCriterionEmpty ───────────────────────────────────────────────────────

describe("isCriterionEmpty — SelectCriterion (prospect_status)", () => {
  it("vide quand values = []", () => {
    const c: SelectCriterion = { ...selectBase, values: [] };
    expect(isCriterionEmpty(c)).toBe(true);
  });

  it("non vide quand values contient un élément", () => {
    const c: SelectCriterion = { ...selectBase, values: ["prospect"] };
    expect(isCriterionEmpty(c)).toBe(false);
  });

  it("type client_status également couvert", () => {
    const c: SelectCriterion = { id: "cx", type: "client_status", operator: "in", values: [] };
    expect(isCriterionEmpty(c)).toBe(true);
  });

  it("type prospect_source non vide", () => {
    const c: SelectCriterion = { id: "cy", type: "prospect_source", operator: "in", values: ["web"] };
    expect(isCriterionEmpty(c)).toBe(false);
  });
});

describe("isCriterionEmpty — TextCriterion (client_sector / client_city)", () => {
  it("vide quand value est chaîne vide", () => {
    const c: TextCriterion = { ...textBase, value: "" };
    expect(isCriterionEmpty(c)).toBe(true);
  });

  it("vide quand value est uniquement des espaces", () => {
    const c: TextCriterion = { ...textBase, value: "   " };
    expect(isCriterionEmpty(c)).toBe(true);
  });

  it("non vide quand value contient du texte", () => {
    const c: TextCriterion = { ...textBase, value: "Industrie" };
    expect(isCriterionEmpty(c)).toBe(false);
  });

  it("client_city non vide", () => {
    const c: TextCriterion = { id: "cz", type: "client_city", operator: "equals", value: "Paris" };
    expect(isCriterionEmpty(c)).toBe(false);
  });
});

describe("isCriterionEmpty — RangeCriterion (prospect_score)", () => {
  it("vide quand min et max sont undefined", () => {
    const c: RangeCriterion = { ...rangeBase };
    expect(isCriterionEmpty(c)).toBe(true);
  });

  it("vide quand min et max sont null (via cast)", () => {
    const c = { ...rangeBase, min: null as unknown as undefined, max: null as unknown as undefined } as RangeCriterion;
    expect(isCriterionEmpty(c)).toBe(true);
  });

  it("non vide quand min est défini", () => {
    const c: RangeCriterion = { ...rangeBase, min: 0 };
    expect(isCriterionEmpty(c)).toBe(false);
  });

  it("non vide quand max est défini", () => {
    const c: RangeCriterion = { ...rangeBase, max: 100 };
    expect(isCriterionEmpty(c)).toBe(false);
  });

  it("non vide quand min et max sont tous les deux définis", () => {
    const c: RangeCriterion = { ...rangeBase, min: 10, max: 80 };
    expect(isCriterionEmpty(c)).toBe(false);
  });
});

describe("isCriterionEmpty — DateRangeCriterion (prospect_created_at / client_created_at)", () => {
  it("vide quand dateFrom et dateTo sont undefined", () => {
    const c: DateRangeCriterion = { ...dateBase };
    expect(isCriterionEmpty(c)).toBe(true);
  });

  it("vide quand dateFrom et dateTo sont chaînes vides", () => {
    const c: DateRangeCriterion = { ...dateBase, dateFrom: "", dateTo: "" };
    expect(isCriterionEmpty(c)).toBe(true);
  });

  it("non vide quand dateFrom est renseignée", () => {
    const c: DateRangeCriterion = { ...dateBase, dateFrom: "2024-01-01" };
    expect(isCriterionEmpty(c)).toBe(false);
  });

  it("non vide quand dateTo est renseignée", () => {
    const c: DateRangeCriterion = { ...dateBase, dateTo: "2024-12-31" };
    expect(isCriterionEmpty(c)).toBe(false);
  });

  it("client_created_at non vide", () => {
    const c: DateRangeCriterion = { id: "cd", type: "client_created_at", operator: "after", dateFrom: "2024-06-01" };
    expect(isCriterionEmpty(c)).toBe(false);
  });
});

describe("isCriterionEmpty — TagsCriterion (tags)", () => {
  it("vide quand tagIds = []", () => {
    const c: TagsCriterion = { ...tagsBase, tagIds: [] };
    expect(isCriterionEmpty(c)).toBe(true);
  });

  it("non vide quand tagIds contient un tag", () => {
    const c: TagsCriterion = { ...tagsBase, tagIds: ["tag-uuid-1"] };
    expect(isCriterionEmpty(c)).toBe(false);
  });
});

describe("isCriterionEmpty — TrainingCriterion (prospect_training / training_participation)", () => {
  it("vide quand trainingIds = []", () => {
    const c: TrainingCriterion = { ...trainingBase, trainingIds: [] };
    expect(isCriterionEmpty(c)).toBe(true);
  });

  it("non vide quand trainingIds contient une formation", () => {
    const c: TrainingCriterion = { ...trainingBase, trainingIds: ["training-uuid-1"] };
    expect(isCriterionEmpty(c)).toBe(false);
  });

  it("training_participation vide", () => {
    const c: TrainingCriterion = { id: "ct", type: "training_participation", operator: "in", trainingIds: [] };
    expect(isCriterionEmpty(c)).toBe(true);
  });
});

// ─── findEmptyCriteria ──────────────────────────────────────────────────────

describe("findEmptyCriteria", () => {
  it("renvoie tableau vide si tous les critères sont remplis", () => {
    const criteria: SegmentCriterion[] = [
      { id: "a", type: "prospect_status", operator: "in", values: ["prospect"] } as SelectCriterion,
      { id: "b", type: "client_sector", operator: "contains", value: "Tech" } as TextCriterion,
    ];
    expect(findEmptyCriteria(criteria)).toHaveLength(0);
  });

  it("renvoie les critères vides uniquement", () => {
    const empty: SelectCriterion = { id: "e1", type: "prospect_status", operator: "in", values: [] };
    const full: TextCriterion = { id: "e2", type: "client_sector", operator: "contains", value: "Santé" };
    const emptyText: TextCriterion = { id: "e3", type: "client_city", operator: "equals", value: "" };
    const result = findEmptyCriteria([empty, full, emptyText]);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.id)).toEqual(["e1", "e3"]);
  });

  it("renvoie tous les critères si tous sont vides", () => {
    const criteria: SegmentCriterion[] = [
      { id: "x1", type: "tags", operator: "any", tagIds: [] } as TagsCriterion,
      { id: "x2", type: "prospect_score", operator: "between" } as RangeCriterion,
    ];
    expect(findEmptyCriteria(criteria)).toHaveLength(2);
  });

  it("fonctionne avec un tableau vide", () => {
    expect(findEmptyCriteria([])).toHaveLength(0);
  });
});

// ─── validateSequenceSteps ──────────────────────────────────────────────────

describe("validateSequenceSteps — étapes email", () => {
  it("email valide avec objet rempli et corps vide", () => {
    const result = validateSequenceSteps([
      { action_type: "email", email_subject: "Bonjour", email_body: null, task_title: null },
    ]);
    expect(result.ok).toBe(true);
  });

  it("email valide avec corps rempli et objet vide", () => {
    const result = validateSequenceSteps([
      { action_type: "email", email_subject: "", email_body: "Corps du message", task_title: null },
    ]);
    expect(result.ok).toBe(true);
  });

  it("email valide avec objet et corps tous deux remplis", () => {
    const result = validateSequenceSteps([
      { action_type: "email", email_subject: "Sujet", email_body: "Corps", task_title: null },
    ]);
    expect(result.ok).toBe(true);
  });

  it("email invalide quand objet et corps sont vides", () => {
    const result = validateSequenceSteps([
      { action_type: "email", email_subject: "", email_body: "", task_title: null },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.index).toBe(1);
      expect(result.message).toContain("Étape 1");
    }
  });

  it("email invalide quand objet et corps sont null", () => {
    const result = validateSequenceSteps([
      { action_type: "email", email_subject: null, email_body: null, task_title: null },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Étape 1");
      expect(result.message).toContain("objet");
    }
  });

  it("email invalide quand objet et corps ne sont que des espaces", () => {
    const result = validateSequenceSteps([
      { action_type: "email", email_subject: "   ", email_body: "  ", task_title: null },
    ]);
    expect(result.ok).toBe(false);
  });

  it("détecte la 2ème étape invalide (index 1-based = 2)", () => {
    const result = validateSequenceSteps([
      { action_type: "email", email_subject: "OK", email_body: null, task_title: null },
      { action_type: "email", email_subject: "", email_body: "", task_title: null },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.index).toBe(2);
      expect(result.message).toContain("Étape 2");
    }
  });
});

describe("validateSequenceSteps — étapes task", () => {
  it("task valide avec titre rempli", () => {
    const result = validateSequenceSteps([
      { action_type: "task", email_subject: null, email_body: null, task_title: "Appeler le client" },
    ]);
    expect(result.ok).toBe(true);
  });

  it("task invalide quand titre est vide", () => {
    const result = validateSequenceSteps([
      { action_type: "task", email_subject: null, email_body: null, task_title: "" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.index).toBe(1);
      expect(result.message).toContain("Étape 1");
      expect(result.message).toContain("intitulé");
    }
  });

  it("task invalide quand titre est null", () => {
    const result = validateSequenceSteps([
      { action_type: "task", email_subject: null, email_body: null, task_title: null },
    ]);
    expect(result.ok).toBe(false);
  });

  it("task invalide quand titre ne contient que des espaces", () => {
    const result = validateSequenceSteps([
      { action_type: "task", email_subject: null, email_body: null, task_title: "   " },
    ]);
    expect(result.ok).toBe(false);
  });
});

describe("validateSequenceSteps — étapes wait", () => {
  it("wait toujours valide", () => {
    const result = validateSequenceSteps([
      { action_type: "wait", email_subject: null, email_body: null, task_title: null },
    ]);
    expect(result.ok).toBe(true);
  });

  it("wait valide même sans aucun contenu supplémentaire", () => {
    const result = validateSequenceSteps([
      { action_type: "wait", email_subject: "", email_body: "", task_title: "" },
    ]);
    expect(result.ok).toBe(true);
  });
});

describe("validateSequenceSteps — séquences mixtes", () => {
  it("séquence valide : wait → email rempli → task remplie", () => {
    const result = validateSequenceSteps([
      { action_type: "wait", email_subject: null, email_body: null, task_title: null },
      { action_type: "email", email_subject: "Bienvenue", email_body: null, task_title: null },
      { action_type: "task", email_subject: null, email_body: null, task_title: "Relancer" },
    ]);
    expect(result.ok).toBe(true);
  });

  it("séquence invalide : email OK puis task sans titre → signale étape 2", () => {
    const result = validateSequenceSteps([
      { action_type: "email", email_subject: "Bonjour", email_body: "Corps", task_title: null },
      { action_type: "task", email_subject: null, email_body: null, task_title: "" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.index).toBe(2);
  });

  it("renvoie la première erreur (pas la dernière)", () => {
    const result = validateSequenceSteps([
      { action_type: "email", email_subject: "", email_body: "", task_title: null },
      { action_type: "task", email_subject: null, email_body: null, task_title: "" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.index).toBe(1);
  });

  it("tableau vide → valide", () => {
    const result = validateSequenceSteps([]);
    expect(result.ok).toBe(true);
  });
});
