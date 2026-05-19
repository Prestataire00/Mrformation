/**
 * Catalogue des 23 documents secondaires h-22.
 *
 * Source unique de vérité pour :
 * - Le Dialog catalogue (SecondaryDocCatalogDialog) qui groupe par catégorie
 * - Le filtre searchable
 * - Le mapping doc_type → label/icône/description
 *
 * Voir story bmad_output/implementation-artifacts/h-22-documents-secondaires-attribuables-loris.md
 */

import type { ConventionDocType } from "@/lib/types";

export type SecondaryCategory =
  | "habilitation"
  | "attestation_metier"
  | "administratif"
  | "evaluation";

export interface SecondaryTemplateMeta {
  category: SecondaryCategory;
  label: string;
  description?: string;
  /**
   * Si true, le doc supporte la signature électronique batch via
   * /api/documents/signature-request-batch (cf SIGNATURE_BATCH_SUPPORTED_DOC_TYPES).
   */
  signable?: boolean;
}

/**
 * Liste exhaustive des 23 doc_types secondaires h-22. Utilisée par le Dialog
 * catalogue. Ordre = ordre d'affichage par défaut au sein de chaque catégorie.
 */
export const SECONDARY_DOC_TYPES = [
  // Habilitation électrique
  "avis_hab_elec_generique",
  "avis_hab_elec_b0_bf_bs",
  "avis_hab_elec_b1v_b2v_br",
  "avis_hab_elec_bf_hf",
  "avis_hab_elec_bt",
  "avis_hab_elec_bt_ht",
  "avis_hab_elec_h0_b0",
  "avis_hab_elec_h0_b0_bf_hf_bs",
  "avis_hab_elec_h0_b0_initial",
  // Attestations métier
  "attestation_aipr",
  "attestation_competences",
  "attestation_abandon_formation",
  "certificat_travail_hauteur",
  "certificat_diplome",
  // Documents administratifs
  "autorisation_image",
  "decharge_responsabilite",
  "lettre_decharge_responsabilite",
  "charte_formateur",
  "contrat_engagement_stagiaire",
  // Pédagogie / Évaluation
  "bilan_poe",
  "reponses_evaluations",
  "reponses_satisfaction_session",
  "resultats_evaluations",
] as const satisfies readonly ConventionDocType[];

export type SecondaryDocType = (typeof SECONDARY_DOC_TYPES)[number];

export const SECONDARY_TEMPLATE_CATEGORIES: Record<SecondaryDocType, SecondaryTemplateMeta> = {
  // Habilitation électrique (9)
  avis_hab_elec_generique: {
    category: "habilitation",
    label: "Avis Habilitation électrique (générique)",
    description: "Template polyvalent",
  },
  avis_hab_elec_b0_bf_bs: {
    category: "habilitation",
    label: "Avis Hab. élec. B0 / BF / BS",
  },
  avis_hab_elec_b1v_b2v_br: {
    category: "habilitation",
    label: "Avis Hab. élec. B1V / B2V / BR",
  },
  avis_hab_elec_bf_hf: {
    category: "habilitation",
    label: "Avis Hab. élec. BF / HF",
  },
  avis_hab_elec_bt: {
    category: "habilitation",
    label: "Avis Hab. élec. BT",
  },
  avis_hab_elec_bt_ht: {
    category: "habilitation",
    label: "Avis Hab. élec. BT / HT",
  },
  avis_hab_elec_h0_b0: {
    category: "habilitation",
    label: "Avis Hab. élec. H0 / B0",
  },
  avis_hab_elec_h0_b0_bf_hf_bs: {
    category: "habilitation",
    label: "Avis Hab. élec. H0 / B0 / BF / HF / BS",
  },
  avis_hab_elec_h0_b0_initial: {
    category: "habilitation",
    label: "Avis Hab. élec. H0 / B0 (Initial)",
  },
  // Attestations métier (5)
  attestation_aipr: {
    category: "attestation_metier",
    label: "Attestation AIPR",
    description: "Autorisation d'Intervention à Proximité des Réseaux",
  },
  attestation_competences: {
    category: "attestation_metier",
    label: "Attestation de compétences",
  },
  attestation_abandon_formation: {
    category: "attestation_metier",
    label: "Attestation d'abandon de formation",
  },
  certificat_travail_hauteur: {
    category: "attestation_metier",
    label: "Certificat Travail en Hauteur",
  },
  certificat_diplome: {
    category: "attestation_metier",
    label: "Certificat / Diplôme",
  },
  // Documents administratifs (5, dont 5 signables)
  autorisation_image: {
    category: "administratif",
    label: "Autorisation droit à l'image",
    signable: true,
  },
  decharge_responsabilite: {
    category: "administratif",
    label: "Décharge de responsabilité",
    signable: true,
  },
  lettre_decharge_responsabilite: {
    category: "administratif",
    label: "Lettre décharge de responsabilité",
    signable: true,
  },
  charte_formateur: {
    category: "administratif",
    label: "Charte formateur",
    description: "À signer par le formateur",
    signable: true,
  },
  contrat_engagement_stagiaire: {
    category: "administratif",
    label: "Contrat d'engagement stagiaire",
    signable: true,
  },
  // Pédagogie / Évaluation (4)
  bilan_poe: {
    category: "evaluation",
    label: "Bilan POE",
    description: "Préparation Opérationnelle à l'Emploi",
  },
  reponses_evaluations: {
    category: "evaluation",
    label: "Réponses aux évaluations",
  },
  reponses_satisfaction_session: {
    category: "evaluation",
    label: "Réponses satisfaction session",
  },
  resultats_evaluations: {
    category: "evaluation",
    label: "Résultats des évaluations",
  },
};

/**
 * Méta des catégories (label + icône emoji) pour les sections du Dialog.
 */
export const SECONDARY_CATEGORY_LABELS: Record<
  SecondaryCategory,
  { label: string; icon: string; order: number }
> = {
  habilitation: { label: "Habilitation électrique", icon: "🔌", order: 1 },
  attestation_metier: { label: "Attestations métier", icon: "📜", order: 2 },
  administratif: { label: "Documents administratifs", icon: "📋", order: 3 },
  evaluation: { label: "Pédagogie / Évaluation", icon: "📊", order: 4 },
};

/**
 * Helper : retourne les doc_types d'une catégorie donnée, dans l'ordre déclaré.
 */
export function getSecondaryDocTypesByCategory(
  category: SecondaryCategory,
): SecondaryDocType[] {
  return SECONDARY_DOC_TYPES.filter(
    (key) => SECONDARY_TEMPLATE_CATEGORIES[key].category === category,
  );
}

/**
 * Helper : vrai si le doc_type est un secondaire h-22 (vs officiel).
 */
export function isSecondaryDocType(docType: string): docType is SecondaryDocType {
  return (SECONDARY_DOC_TYPES as readonly string[]).includes(docType);
}
