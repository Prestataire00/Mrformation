/**
 * Calcul du score Qualiopi d'une formation.
 *
 * Source de vérité unique remplaçant la double implémentation (composant inline +
 * fonction "for list views" exportée, fantôme — confirmé non utilisée en runtime
 * le 2026-05-25 par grep).
 *
 * 8 items de base + 2 items sous-traitance si is_subcontracted. Le score est
 * (sum_achieved / count_items) * 100 où achieved = 1 pour les booléens vrais et
 * percent/100 pour les auto_percent.
 *
 * Consumers :
 *  - TabQualiopi.tsx : passe { responseCounts, manualChecks } pour un score exact
 *  - qualiopi-snapshots.ts : idem (après chargement des counts en BDD)
 *  - listes formations : lisent directement sessions.qualiopi_score (colonne BDD
 *    persistée par TabQualiopi). Pas d'appel runtime à cette lib.
 */

import type { ConventionDocType, FormationConventionDocument, Session } from "@/lib/types";

export type QualiopiCategory = "documents" | "evaluations" | "sous_traitance";
export type QualiopiItemType = "auto" | "auto_percent" | "manual";

export interface QualiopiScoreItem {
  id: string;
  label: string;
  category: QualiopiCategory;
  type: QualiopiItemType;
  value: boolean;
  percent?: number;
  subLabel?: string;
}

export interface ComputeOptions {
  /**
   * Counts de réponses par clé : eval_preformation, eval_postformation, satisfaction.
   * Quand absent ou que la clé n'est pas fournie, l'item auto_percent vaut 0%.
   */
  responseCounts?: Record<string, { total: number; done: number }>;
  /** Lu pour les checks manuels (sous-traitance). Sinon false. */
  manualChecks?: Record<string, boolean>;
}

function getPercent(
  key: string,
  responseCounts?: ComputeOptions["responseCounts"],
): number {
  const c = responseCounts?.[key];
  if (!c || c.total === 0) return 0;
  return Math.round((c.done / c.total) * 100);
}

function hasAnySigned(docs: FormationConventionDocument[], docType: ConventionDocType): boolean {
  return docs.some(d => d.doc_type === docType && d.is_signed === true);
}

function allSent(docs: FormationConventionDocument[], docType: ConventionDocType): boolean {
  const typeDocs = docs.filter(d => d.doc_type === docType);
  return typeDocs.length > 0 && typeDocs.every(d => d.is_sent === true);
}

function countByType(
  docs: FormationConventionDocument[],
  docType: ConventionDocType,
): { sent: number; total: number } {
  const typeDocs = docs.filter(d => d.doc_type === docType);
  return {
    sent: typeDocs.filter(d => d.is_sent === true).length,
    total: typeDocs.length,
  };
}

export function buildQualiopiItems(
  formation: Session,
  opts: ComputeOptions = {},
): QualiopiScoreItem[] {
  const docs = formation.formation_convention_documents ?? [];
  const elearningAssignments = formation.formation_elearning_assignments || [];
  const isSubcontracted = formation.is_subcontracted === true;
  const manualChecks = opts.manualChecks || {};
  const responseCounts = opts.responseCounts;

  const convocCounts = countByType(docs, "convocation");
  const certifCounts = countByType(docs, "certificat_realisation");

  const evalPrePercent = getPercent("eval_preformation", responseCounts);
  const evalPostPercent = getPercent("eval_postformation", responseCounts);
  const satisPercent = getPercent("satisfaction", responseCounts);

  const items: QualiopiScoreItem[] = [
    { id: "convention_signed", label: "Convention signée", category: "documents", type: "auto",
      value: hasAnySigned(docs, "convention_entreprise") },
    { id: "convocation_sent", label: "Convocation envoyée", category: "documents", type: "auto",
      value: allSent(docs, "convocation"),
      subLabel: `${convocCounts.sent}/${convocCounts.total}` },
    { id: "convention_intervention_signed", label: "Contrat intervention formateur signé",
      category: "documents", type: "auto",
      value: hasAnySigned(docs, "convention_intervention") },
    { id: "eval_preformation", label: "Questionnaire positionnement rempli",
      category: "evaluations", type: "auto_percent",
      value: evalPrePercent === 100, percent: evalPrePercent },
    { id: "eval_postformation", label: "Questionnaire fin de formation rempli",
      category: "evaluations", type: "auto_percent",
      value: evalPostPercent === 100, percent: evalPostPercent },
    { id: "satisfaction_learner", label: "Questionnaire satisfaction apprenant rempli",
      category: "evaluations", type: "auto_percent",
      value: satisPercent === 100, percent: satisPercent },
    { id: "certificat_sent", label: "Certificat de réalisation envoyé",
      category: "documents", type: "auto",
      value: allSent(docs, "certificat_realisation"),
      subLabel: `${certifCounts.sent}/${certifCounts.total}` },
    { id: "support_cours", label: "Support de cours déposé", category: "documents", type: "auto",
      value: elearningAssignments.length > 0 },
  ];

  if (isSubcontracted) {
    items.push(
      { id: "docs_formation_sent", label: "Documents formation envoyés au formateur",
        category: "sous_traitance", type: "auto",
        value: docs.filter(d => d.owner_type === "trainer" && d.is_sent).length > 0 },
      { id: "docs_post_formation_received", label: "Documents post-formation reçus",
        category: "sous_traitance", type: "manual",
        value: manualChecks["docs_post_formation_received"] === true },
    );
  }

  return items;
}

/**
 * Score (0-100) à partir d'items déjà construits. Permet aux consumers (TabQualiopi)
 * qui ont déjà appelé `buildQualiopiItems` d'éviter une seconde construction.
 */
export function scoreFromItems(items: QualiopiScoreItem[]): number {
  if (items.length === 0) return 0;
  let achieved = 0;
  for (const item of items) {
    if (item.type === "auto_percent") achieved += (item.percent || 0) / 100;
    else if (item.value) achieved += 1;
  }
  return Math.round((achieved / items.length) * 100);
}

export function computeQualiopiScore(
  formation: Session,
  opts: ComputeOptions = {},
): number {
  return scoreFromItems(buildQualiopiItems(formation, opts));
}
