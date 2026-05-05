/**
 * Helper pour expanser la balise "program_objectives" en N questions de
 * notation à la volée — utilisé côté admin (preview/fill), côté apprenant
 * (page de réponse), et plus tard côté analytics.
 *
 * Le principe : l'admin crée 1 question de type "program_objectives" dans
 * son questionnaire template. À l'affichage pour une formation donnée, on
 * récupère les objectifs du programme/training et on génère N questions
 * virtuelles de notation 1-5, une par objectif.
 *
 * Les IDs virtuels sont stables (`{question_id}::obj_{index}`) → permet de
 * stocker les réponses dans la même structure JSON que les autres réponses.
 */

import type { Session } from "@/lib/types";

export interface BaseQuestion {
  id: string;
  questionnaire_id: string;
  text: string;
  type: string;
  options: unknown;
  is_required: boolean;
  order_index: number;
}

export interface ExpandedQuestion extends BaseQuestion {
  /** Présent uniquement pour les questions virtuelles issues d'une expansion. */
  parent_question_id?: string;
  /** Texte original de l'objectif, persisté dans la réponse. */
  objective_text?: string;
}

/**
 * Extrait la liste d'objectifs d'une formation. Hiérarchie :
 *   1. formation.program.objectives (priorité — c'est le programme officiel)
 *   2. formation.training.objectives (fallback)
 *   3. [] (rien à expanser → on supprime la question placeholder)
 */
export function extractObjectives(formation: Pick<Session, "program" | "training"> | null | undefined): string[] {
  if (!formation) return [];
  const raw = formation.program?.objectives || formation.training?.objectives || "";
  return raw
    .split(/\r?\n|•|^-\s+/m)
    .map((s) => s.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * Expanse une liste de questions : pour chaque question de type
 * "program_objectives", génère N questions virtuelles de type "rating".
 * Si le programme n'a pas d'objectifs, la question placeholder est conservée
 * avec un message d'indication (côté UI on peut l'afficher en disabled).
 *
 * Si formation === null (preview admin sans contexte session), on remplace
 * la balise par une question textuelle d'explication.
 */
export function expandObjectivesQuestions(
  questions: BaseQuestion[],
  formation: Pick<Session, "program" | "training"> | null | undefined
): ExpandedQuestion[] {
  const objectives = extractObjectives(formation);
  const result: ExpandedQuestion[] = [];

  for (const q of questions) {
    if (q.type !== "program_objectives") {
      result.push(q);
      continue;
    }

    // Pas de contexte formation → on garde la balise (preview admin)
    // ⚠️ is_required=false sinon la validation submit bloquerait l'apprenant.
    // Les pages qui rendent les questions doivent traiter type "program_objectives"
    // comme une carte info (pas d'input à remplir).
    if (!formation) {
      result.push({
        ...q,
        is_required: false,
        text: q.text + " (les objectifs du programme s'afficheront ici à la distribution)",
      });
      continue;
    }

    // Aucun objectif sur la formation → on garde la balise pour info, sans
    // bloquer le submit. L'admin doit corriger le programme s'il veut
    // récolter ces évaluations.
    if (objectives.length === 0) {
      result.push({
        ...q,
        is_required: false,
        text: q.text + " (aucun objectif défini sur le programme de cette formation — section ignorée)",
      });
      continue;
    }

    // Expansion : 1 question virtuelle par objectif
    objectives.forEach((obj, i) => {
      result.push({
        id: `${q.id}::obj_${i}`,
        questionnaire_id: q.questionnaire_id,
        text: obj,
        type: "rating",
        options: null,
        is_required: q.is_required,
        order_index: q.order_index + i / 1000, // garde l'ordre relatif
        parent_question_id: q.id,
        objective_text: obj,
      });
    });
  }

  return result;
}

/**
 * Lors de la sauvegarde d'une réponse, on enrichit le payload avec un
 * snapshot des objectifs au moment T (pour que la review admin reste
 * lisible même si le programme est modifié plus tard).
 *
 * Format final stocké dans questionnaire_responses.responses :
 *   {
 *     "<real_question_id>": "valeur",
 *     "<placeholder_id>::obj_0": 4,
 *     "<placeholder_id>::obj_1": 5,
 *     "_objectives_snapshot": { "<placeholder_id>": ["Objectif 1", "Objectif 2"] }
 *   }
 */
export function buildResponsesPayload(
  responses: Record<string, string | number>,
  expandedQuestions: ExpandedQuestion[]
): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...responses };

  // Construit le snapshot par parent_question_id
  const snapshot: Record<string, string[]> = {};
  for (const q of expandedQuestions) {
    if (q.parent_question_id && q.objective_text) {
      if (!snapshot[q.parent_question_id]) snapshot[q.parent_question_id] = [];
      snapshot[q.parent_question_id].push(q.objective_text);
    }
  }
  if (Object.keys(snapshot).length > 0) {
    payload._objectives_snapshot = snapshot;
  }

  return payload;
}
