import type {
  SegmentCriterion,
} from "@/lib/types";

/**
 * Détermine si un critère de segment est vide (sans valeur utile).
 * Utilise le narrowing TypeScript sur l'union discriminée — pas de cast `any`.
 */
export function isCriterionEmpty(c: SegmentCriterion): boolean {
  switch (c.type) {
    // SelectCriterion : prospect_status | prospect_source | client_status
    case "prospect_status":
    case "prospect_source":
    case "client_status":
      return c.values.length === 0;

    // TextCriterion : client_sector | client_city
    case "client_sector":
    case "client_city":
      return !c.value?.trim();

    // RangeCriterion : prospect_score
    case "prospect_score":
      return c.min == null && c.max == null;

    // DateRangeCriterion : prospect_created_at | client_created_at
    case "prospect_created_at":
    case "client_created_at":
      return !c.dateFrom && !c.dateTo;

    // TagsCriterion : tags
    case "tags":
      return c.tagIds.length === 0;

    // TrainingCriterion : prospect_training | training_participation
    case "prospect_training":
    case "training_participation":
      return c.trainingIds.length === 0;
  }
}

/**
 * Renvoie les critères vides parmi la liste fournie.
 */
export function findEmptyCriteria(criteria: SegmentCriterion[]): SegmentCriterion[] {
  return criteria.filter(isCriterionEmpty);
}

// ─── validateSequenceSteps ──────────────────────────────────────────────────

interface SequenceStep {
  action_type: "email" | "task" | "wait";
  email_subject: string | null;
  email_body: string | null;
  task_title: string | null;
}

type ValidationResult =
  | { ok: true }
  | { ok: false; index: number; message: string };

/**
 * Valide les étapes d'une séquence CRM.
 * Renvoie la première étape invalide (index 1-based dans le message).
 *
 * - email  : requiert email_subject OU email_body non vide
 * - task   : requiert task_title non vide
 * - wait   : toujours valide
 */
export function validateSequenceSteps(steps: SequenceStep[]): ValidationResult {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const humanIndex = i + 1;

    if (step.action_type === "email") {
      const hasSubject = Boolean(step.email_subject?.trim());
      const hasBody = Boolean(step.email_body?.trim());
      if (!hasSubject && !hasBody) {
        return {
          ok: false,
          index: humanIndex,
          message: `Étape ${humanIndex} : l'email doit avoir un objet ou un corps.`,
        };
      }
    } else if (step.action_type === "task") {
      if (!step.task_title?.trim()) {
        return {
          ok: false,
          index: humanIndex,
          message: `Étape ${humanIndex} : la tâche doit avoir un intitulé.`,
        };
      }
    }
    // wait : toujours valide, rien à vérifier
  }

  return { ok: true };
}
