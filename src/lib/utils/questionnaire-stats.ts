/**
 * Helpers de stats pour TabQuestionnaires (Volet D UX pilotage).
 *
 * - computeStageStats : agrégats par stage (attribués/envoyés/répondus/taux)
 * - computeLearnerStatuses : matrice apprenants × questionnaires (Task 2)
 *
 * Source : docs/superpowers/specs/2026-05-26-questionnaires-volet-d-ux-design.md §3.2
 */

export interface StageStats {
  attributed: number;
  sent: number;
  expectedSent: number;
  answered: number;
  rate: number;
}

interface Stage {
  id: string;
  itemTypes: Array<{
    category: "evaluation" | "satisfaction";
    type: string;
    target: "learner" | "company";
  }>;
}

interface AssignmentRow {
  questionnaire_id?: string;
  evaluation_type?: string;
  satisfaction_type?: string;
  [key: string]: unknown;
}

interface TokenRow {
  questionnaire_id?: string;
  learner_id?: string;
  [key: string]: unknown;
}

interface ResponseRow {
  questionnaire_id?: string;
  learner_id?: string;
  [key: string]: unknown;
}

interface EnrollmentRow {
  learner?: { id?: string };
  [key: string]: unknown;
}

interface CompanyRow {
  [key: string]: unknown;
}

export function computeStageStats(
  stage: Stage,
  evalAssignments: AssignmentRow[],
  satisAssignments: AssignmentRow[],
  tokens: TokenRow[],
  responses: ResponseRow[],
  learners: EnrollmentRow[],
  companies: CompanyRow[],
): StageStats {
  // 1. Identifier les questionnaires attribués pour ce stage
  const questionnaireIdsByItem = stage.itemTypes.map((item) => {
    const source = item.category === "evaluation" ? evalAssignments : satisAssignments;
    const typeKey = item.category === "evaluation" ? "evaluation_type" : "satisfaction_type";
    return {
      item,
      qids: source
        .filter((a) => a[typeKey] === item.type)
        .map((a) => a.questionnaire_id)
        .filter((id): id is string => typeof id === "string"),
    };
  });

  // 2. attributed = nb d'items du stage avec ≥ 1 questionnaire
  const attributed = questionnaireIdsByItem.filter((row) => row.qids.length > 0).length;

  // 3. expectedSent = attributions × destinataires concernés
  let expectedSent = 0;
  for (const row of questionnaireIdsByItem) {
    const recipientsCount = row.item.target === "learner" ? learners.length : companies.length;
    expectedSent += row.qids.length * recipientsCount;
  }

  // 4. Set des questionnaire_ids du stage
  const stageQids = new Set(questionnaireIdsByItem.flatMap((r) => r.qids));

  // 5. sent = nb tokens pour ces questionnaire_ids
  const sent = tokens.filter((t) => typeof t.questionnaire_id === "string" && stageQids.has(t.questionnaire_id)).length;

  // 6. answered = nb réponses distinctes (par paire q_id + learner_id) pour ces questionnaires
  const answeredKeys = new Set<string>();
  for (const r of responses) {
    if (typeof r.questionnaire_id === "string" && stageQids.has(r.questionnaire_id) && typeof r.learner_id === "string") {
      answeredKeys.add(`${r.questionnaire_id}::${r.learner_id}`);
    }
  }
  const answered = answeredKeys.size;

  // 7. Taux = answered / sent (arrondi). Si sent=0, rate=0.
  const rate = sent === 0 ? 0 : Math.round((answered / sent) * 100);

  return { attributed, sent, expectedSent, answered, rate };
}
