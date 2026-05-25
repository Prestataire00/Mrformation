/**
 * Registry centralisé des templates HTML système (les "beaux" templates avec
 * mise en page Loris : header, logo, couleurs, footer SIRET/NDA).
 *
 * Utilisé par `/api/documents/generate-from-template` pour récupérer le HTML
 * + footer template à passer à Puppeteer/CloudConvert, au lieu d'appeler
 * `getDefaultTemplate()` (qui retourne des templates basiques non stylés).
 *
 * Mapping doc_type → { html, footer } pour les 11 doc_types couverts.
 */

import {
  CONVOCATION_APPRENANT_HTML,
  CONVOCATION_APPRENANT_FOOTER_TEMPLATE,
} from "./convocation-apprenant";
import {
  CERTIFICAT_REALISATION_HTML,
  CERTIFICAT_REALISATION_FOOTER_TEMPLATE,
} from "./certificat-realisation";
import {
  ATTESTATION_ASSIDUITE_HTML,
  ATTESTATION_ASSIDUITE_FOOTER_TEMPLATE,
} from "./attestation-assiduite";
import {
  EMARGEMENT_INDIVIDUEL_HTML,
  EMARGEMENT_INDIVIDUEL_FOOTER_TEMPLATE,
} from "./emargement-individuel";
import {
  EMARGEMENT_COLLECTIF_HTML,
  EMARGEMENT_FOOTER_TEMPLATE,
} from "./emargement-collectif";
import {
  CONVENTION_ENTREPRISE_HTML,
  CONVENTION_FOOTER_TEMPLATE,
} from "./convention-entreprise";
import {
  CONVENTION_INTERVENTION_HTML,
  CONVENTION_INTERVENTION_FOOTER_TEMPLATE,
} from "./convention-intervention";
import {
  PROGRAMME_FORMATION_HTML,
  PROGRAMME_FORMATION_FOOTER_TEMPLATE,
} from "./programme-formation";
import { CGV_HTML, CGV_FOOTER_TEMPLATE } from "./cgv";
import {
  REGLEMENT_INTERIEUR_HTML,
  REGLEMENT_INTERIEUR_FOOTER_TEMPLATE,
} from "./reglement-interieur";
import {
  POLITIQUE_RGPD_HTML,
  POLITIQUE_RGPD_FOOTER_TEMPLATE,
} from "./politique-rgpd";
import {
  FEUILLE_EMARGEMENT_VIERGE_HTML,
  FEUILLE_EMARGEMENT_VIERGE_FOOTER_TEMPLATE,
} from "./feuille-emargement-vierge";
import {
  PLANNING_HEBDO_SIGNE_HTML,
  PLANNING_HEBDO_SIGNE_FOOTER_TEMPLATE,
} from "./planning-hebdo-signe";

// h-22 (2026-05-19) : 23 templates secondaires branchés au registry. Code des
// templates existant depuis avant mais ils n'étaient pas attribuables aux
// sessions (ni dans le registry, ni dans CHECK, ni dans UI). Voir story
// bmad_output/implementation-artifacts/h-22-documents-secondaires-attribuables-loris.md
import {
  AVIS_HABILITATION_ELECTRIQUE_HTML,
  AVIS_HABILITATION_ELECTRIQUE_FOOTER_TEMPLATE,
} from "./avis-habilitation-electrique";
import {
  AVIS_HABILITATION_ELECTRIQUE_B0_BF_BS_HTML,
  AVIS_HABILITATION_ELECTRIQUE_B0_BF_BS_FOOTER_TEMPLATE,
} from "./avis-habilitation-electrique-b0-bf-bs";
import {
  AVIS_HABILITATION_ELECTRIQUE_B1V_B2V_BR_HTML,
  AVIS_HABILITATION_ELECTRIQUE_B1V_B2V_BR_FOOTER_TEMPLATE,
} from "./avis-habilitation-electrique-b1v-b2v-br";
import {
  AVIS_HABILITATION_ELECTRIQUE_BF_HF_HTML,
  AVIS_HABILITATION_ELECTRIQUE_BF_HF_FOOTER_TEMPLATE,
} from "./avis-habilitation-electrique-bf-hf";
import {
  AVIS_HABILITATION_ELECTRIQUE_BT_HT_HTML,
  AVIS_HABILITATION_ELECTRIQUE_BT_HT_FOOTER_TEMPLATE,
} from "./avis-habilitation-electrique-bt-ht";
import {
  AVIS_HABILITATION_ELECTRIQUE_BT_HTML,
  AVIS_HABILITATION_ELECTRIQUE_BT_FOOTER_TEMPLATE,
} from "./avis-habilitation-electrique-bt";
import {
  AVIS_HABILITATION_ELECTRIQUE_H0_B0_HTML,
  AVIS_HABILITATION_ELECTRIQUE_H0_B0_FOOTER_TEMPLATE,
} from "./avis-habilitation-electrique-h0-b0";
import {
  AVIS_HABILITATION_ELECTRIQUE_H0_B0_BF_HF_BS_HTML,
  AVIS_HABILITATION_ELECTRIQUE_H0_B0_BF_HF_BS_FOOTER_TEMPLATE,
} from "./avis-habilitation-electrique-h0-b0-bf-hf-bs";
import {
  AVIS_HABILITATION_ELECTRIQUE_H0_B0_INITIAL_HTML,
  AVIS_HABILITATION_ELECTRIQUE_H0_B0_INITIAL_FOOTER_TEMPLATE,
} from "./avis-habilitation-electrique-h0-b0-initial";
import {
  ATTESTATION_AIPR_HTML,
  ATTESTATION_AIPR_FOOTER_TEMPLATE,
} from "./attestation-aipr";
import {
  ATTESTATION_COMPETENCES_HTML,
  ATTESTATION_COMPETENCES_FOOTER_TEMPLATE,
} from "./attestation-competences";
import {
  ATTESTATION_ABANDON_FORMATION_HTML,
  ATTESTATION_ABANDON_FORMATION_FOOTER_TEMPLATE,
} from "./attestation-abandon-formation";
import {
  CERTIFICAT_TRAVAIL_HAUTEUR_HTML,
  CERTIFICAT_TRAVAIL_HAUTEUR_FOOTER_TEMPLATE,
} from "./certificat-travail-hauteur";
import {
  CERTIFICAT_DIPLOME_HTML,
  CERTIFICAT_DIPLOME_FOOTER_TEMPLATE,
} from "./certificat-diplome";
import {
  AUTORISATION_IMAGE_HTML,
  AUTORISATION_IMAGE_FOOTER_TEMPLATE,
} from "./autorisation-image";
import {
  DECHARGE_RESPONSABILITE_HTML,
  DECHARGE_RESPONSABILITE_FOOTER_TEMPLATE,
} from "./decharge-responsabilite";
import {
  LETTRE_DECHARGE_RESPONSABILITE_HTML,
  LETTRE_DECHARGE_RESPONSABILITE_FOOTER_TEMPLATE,
} from "./lettre-decharge-responsabilite";
import {
  CHARTE_FORMATEUR_HTML,
  CHARTE_FORMATEUR_FOOTER_TEMPLATE,
} from "./charte-formateur";
import {
  CONTRAT_ENGAGEMENT_STAGIAIRE_HTML,
  CONTRAT_ENGAGEMENT_STAGIAIRE_FOOTER_TEMPLATE,
} from "./contrat-engagement-stagiaire";
import {
  BILAN_POE_HTML,
  BILAN_POE_FOOTER_TEMPLATE,
} from "./bilan-poe";
import {
  REPONSES_EVALUATIONS_HTML,
  REPONSES_EVALUATIONS_FOOTER_TEMPLATE,
} from "./reponses-evaluations";
// Note : reponses-satisfaction-session.ts exporte REPONSES_SATISFACTION_* (sans suffixe SESSION)
import {
  REPONSES_SATISFACTION_HTML,
  REPONSES_SATISFACTION_FOOTER_TEMPLATE,
} from "./reponses-satisfaction-session";
import {
  RESULTATS_EVALUATIONS_HTML,
  RESULTATS_EVALUATIONS_FOOTER_TEMPLATE,
} from "./resultats-evaluations";

export interface SystemTemplate {
  html: string;
  footer: string;
  /** Owner type attendu — pour validation côté caller. */
  ownerType: "learner" | "company" | "trainer" | "session";
  /**
   * Si true, la route generate-from-template retourne 422
   * (INCOMPLETE_DATA) plutôt que de générer un PDF avec des
   * placeholders `[Xxx]` visibles. Réservé aux docs Qualiopi
   * (conventions, attestations, feuilles d'émargement).
   */
  qualiopiBlocking: boolean;
}

/**
 * Mapping doc_type → template système beau (HTML + footer).
 * Si un doc_type n'est PAS dans ce registry → fallback vers
 * `getDefaultTemplate()` (templates basiques de document-templates-defaults.ts).
 */
export const SYSTEM_TEMPLATES_BY_DOC_TYPE: Record<string, SystemTemplate> = {
  convocation: {
    html: CONVOCATION_APPRENANT_HTML,
    footer: CONVOCATION_APPRENANT_FOOTER_TEMPLATE,
    ownerType: "learner",
    qualiopiBlocking: false,
  },
  certificat_realisation: {
    html: CERTIFICAT_REALISATION_HTML,
    footer: CERTIFICAT_REALISATION_FOOTER_TEMPLATE,
    ownerType: "learner",
    qualiopiBlocking: true,
  },
  attestation_assiduite: {
    html: ATTESTATION_ASSIDUITE_HTML,
    footer: ATTESTATION_ASSIDUITE_FOOTER_TEMPLATE,
    ownerType: "learner",
    qualiopiBlocking: true,
  },
  feuille_emargement: {
    html: EMARGEMENT_INDIVIDUEL_HTML,
    footer: EMARGEMENT_INDIVIDUEL_FOOTER_TEMPLATE,
    ownerType: "learner",
    qualiopiBlocking: true,
  },
  feuille_emargement_collectif: {
    html: EMARGEMENT_COLLECTIF_HTML,
    footer: EMARGEMENT_FOOTER_TEMPLATE,
    ownerType: "company",
    qualiopiBlocking: true,
  },
  convention_entreprise: {
    html: CONVENTION_ENTREPRISE_HTML,
    footer: CONVENTION_FOOTER_TEMPLATE,
    ownerType: "company",
    qualiopiBlocking: true,
  },
  convention_intervention: {
    html: CONVENTION_INTERVENTION_HTML,
    footer: CONVENTION_INTERVENTION_FOOTER_TEMPLATE,
    ownerType: "trainer",
    qualiopiBlocking: true,
  },
  // contrat_sous_traitance retiré le 2026-05-18 : c'était un doublon strict de
  // convention_intervention (même HTML, même footer, même ownerType), source de
  // confusion utilisateur. Décision Wissam : on garde uniquement
  // convention_intervention. Cf migration SQL drop_contrat_sous_traitance.sql.
  programme_formation: {
    html: PROGRAMME_FORMATION_HTML,
    footer: PROGRAMME_FORMATION_FOOTER_TEMPLATE,
    ownerType: "session",
    qualiopiBlocking: false,
  },
  cgv: {
    html: CGV_HTML,
    footer: CGV_FOOTER_TEMPLATE,
    ownerType: "session",
    qualiopiBlocking: false,
  },
  reglement_interieur: {
    html: REGLEMENT_INTERIEUR_HTML,
    footer: REGLEMENT_INTERIEUR_FOOTER_TEMPLATE,
    ownerType: "session",
    qualiopiBlocking: false,
  },
  politique_confidentialite: {
    html: POLITIQUE_RGPD_HTML,
    footer: POLITIQUE_RGPD_FOOTER_TEMPLATE,
    ownerType: "session",
    qualiopiBlocking: false,
  },
  feuille_emargement_vierge: {
    html: FEUILLE_EMARGEMENT_VIERGE_HTML,
    footer: FEUILLE_EMARGEMENT_VIERGE_FOOTER_TEMPLATE,
    ownerType: "session",
    qualiopiBlocking: false,
  },
  planning_hebdo_signe: {
    html: PLANNING_HEBDO_SIGNE_HTML,
    footer: PLANNING_HEBDO_SIGNE_FOOTER_TEMPLATE,
    ownerType: "session",
    qualiopiBlocking: false,
  },
  // Alias : planning_semaine → même template que planning_hebdo_signe
  planning_semaine: {
    html: PLANNING_HEBDO_SIGNE_HTML,
    footer: PLANNING_HEBDO_SIGNE_FOOTER_TEMPLATE,
    ownerType: "session",
    qualiopiBlocking: false,
  },

  // ====================================================================
  // h-22 — Documents secondaires (23 templates, qualiopiBlocking: false)
  // ====================================================================
  // Avis habilitation électrique (9 variantes, ownerType: learner)
  avis_hab_elec_generique: {
    html: AVIS_HABILITATION_ELECTRIQUE_HTML,
    footer: AVIS_HABILITATION_ELECTRIQUE_FOOTER_TEMPLATE,
    ownerType: "learner",
    qualiopiBlocking: false,
  },
  avis_hab_elec_b0_bf_bs: {
    html: AVIS_HABILITATION_ELECTRIQUE_B0_BF_BS_HTML,
    footer: AVIS_HABILITATION_ELECTRIQUE_B0_BF_BS_FOOTER_TEMPLATE,
    ownerType: "learner",
    qualiopiBlocking: false,
  },
  avis_hab_elec_b1v_b2v_br: {
    html: AVIS_HABILITATION_ELECTRIQUE_B1V_B2V_BR_HTML,
    footer: AVIS_HABILITATION_ELECTRIQUE_B1V_B2V_BR_FOOTER_TEMPLATE,
    ownerType: "learner",
    qualiopiBlocking: false,
  },
  avis_hab_elec_bf_hf: {
    html: AVIS_HABILITATION_ELECTRIQUE_BF_HF_HTML,
    footer: AVIS_HABILITATION_ELECTRIQUE_BF_HF_FOOTER_TEMPLATE,
    ownerType: "learner",
    qualiopiBlocking: false,
  },
  avis_hab_elec_bt_ht: {
    html: AVIS_HABILITATION_ELECTRIQUE_BT_HT_HTML,
    footer: AVIS_HABILITATION_ELECTRIQUE_BT_HT_FOOTER_TEMPLATE,
    ownerType: "learner",
    qualiopiBlocking: false,
  },
  avis_hab_elec_bt: {
    html: AVIS_HABILITATION_ELECTRIQUE_BT_HTML,
    footer: AVIS_HABILITATION_ELECTRIQUE_BT_FOOTER_TEMPLATE,
    ownerType: "learner",
    qualiopiBlocking: false,
  },
  avis_hab_elec_h0_b0: {
    html: AVIS_HABILITATION_ELECTRIQUE_H0_B0_HTML,
    footer: AVIS_HABILITATION_ELECTRIQUE_H0_B0_FOOTER_TEMPLATE,
    ownerType: "learner",
    qualiopiBlocking: false,
  },
  avis_hab_elec_h0_b0_bf_hf_bs: {
    html: AVIS_HABILITATION_ELECTRIQUE_H0_B0_BF_HF_BS_HTML,
    footer: AVIS_HABILITATION_ELECTRIQUE_H0_B0_BF_HF_BS_FOOTER_TEMPLATE,
    ownerType: "learner",
    qualiopiBlocking: false,
  },
  avis_hab_elec_h0_b0_initial: {
    html: AVIS_HABILITATION_ELECTRIQUE_H0_B0_INITIAL_HTML,
    footer: AVIS_HABILITATION_ELECTRIQUE_H0_B0_INITIAL_FOOTER_TEMPLATE,
    ownerType: "learner",
    qualiopiBlocking: false,
  },
  // Attestations métier (5 templates, ownerType: learner)
  attestation_aipr: {
    html: ATTESTATION_AIPR_HTML,
    footer: ATTESTATION_AIPR_FOOTER_TEMPLATE,
    ownerType: "learner",
    qualiopiBlocking: false,
  },
  attestation_competences: {
    html: ATTESTATION_COMPETENCES_HTML,
    footer: ATTESTATION_COMPETENCES_FOOTER_TEMPLATE,
    ownerType: "learner",
    qualiopiBlocking: false,
  },
  attestation_abandon_formation: {
    html: ATTESTATION_ABANDON_FORMATION_HTML,
    footer: ATTESTATION_ABANDON_FORMATION_FOOTER_TEMPLATE,
    ownerType: "learner",
    qualiopiBlocking: false,
  },
  certificat_travail_hauteur: {
    html: CERTIFICAT_TRAVAIL_HAUTEUR_HTML,
    footer: CERTIFICAT_TRAVAIL_HAUTEUR_FOOTER_TEMPLATE,
    ownerType: "learner",
    qualiopiBlocking: false,
  },
  certificat_diplome: {
    html: CERTIFICAT_DIPLOME_HTML,
    footer: CERTIFICAT_DIPLOME_FOOTER_TEMPLATE,
    ownerType: "learner",
    qualiopiBlocking: false,
  },
  // Documents administratifs (5 templates, signables sauf charte)
  autorisation_image: {
    html: AUTORISATION_IMAGE_HTML,
    footer: AUTORISATION_IMAGE_FOOTER_TEMPLATE,
    ownerType: "learner",
    qualiopiBlocking: false,
  },
  decharge_responsabilite: {
    html: DECHARGE_RESPONSABILITE_HTML,
    footer: DECHARGE_RESPONSABILITE_FOOTER_TEMPLATE,
    ownerType: "learner",
    qualiopiBlocking: false,
  },
  lettre_decharge_responsabilite: {
    html: LETTRE_DECHARGE_RESPONSABILITE_HTML,
    footer: LETTRE_DECHARGE_RESPONSABILITE_FOOTER_TEMPLATE,
    ownerType: "learner",
    qualiopiBlocking: false,
  },
  charte_formateur: {
    html: CHARTE_FORMATEUR_HTML,
    footer: CHARTE_FORMATEUR_FOOTER_TEMPLATE,
    ownerType: "trainer",
    qualiopiBlocking: false,
  },
  contrat_engagement_stagiaire: {
    html: CONTRAT_ENGAGEMENT_STAGIAIRE_HTML,
    footer: CONTRAT_ENGAGEMENT_STAGIAIRE_FOOTER_TEMPLATE,
    ownerType: "learner",
    qualiopiBlocking: false,
  },
  // Pédagogie / Évaluation (4 templates, ownerType: session)
  bilan_poe: {
    html: BILAN_POE_HTML,
    footer: BILAN_POE_FOOTER_TEMPLATE,
    ownerType: "session",
    qualiopiBlocking: false,
  },
  reponses_evaluations: {
    html: REPONSES_EVALUATIONS_HTML,
    footer: REPONSES_EVALUATIONS_FOOTER_TEMPLATE,
    ownerType: "session",
    qualiopiBlocking: false,
  },
  reponses_satisfaction_session: {
    html: REPONSES_SATISFACTION_HTML,
    footer: REPONSES_SATISFACTION_FOOTER_TEMPLATE,
    ownerType: "session",
    qualiopiBlocking: false,
  },
  resultats_evaluations: {
    html: RESULTATS_EVALUATIONS_HTML,
    footer: RESULTATS_EVALUATIONS_FOOTER_TEMPLATE,
    ownerType: "session",
    qualiopiBlocking: false,
  },
};

export function getSystemTemplate(docType: string): SystemTemplate | null {
  return SYSTEM_TEMPLATES_BY_DOC_TYPE[docType] ?? null;
}

export function hasSystemTemplate(docType: string): boolean {
  return docType in SYSTEM_TEMPLATES_BY_DOC_TYPE;
}

/**
 * Drop-in replacement pour `getDefaultTemplate()` (legacy
 * `document-templates-defaults.ts`).
 *
 * Accepte le même format `TemplateData`-like que l'ancien helper, adapte
 * vers `ResolveContext`, cherche dans le registry et résout les variables
 * `[%Var%]` du beau template système. Retourne `null` si aucun template
 * système n'existe pour ce doc_type (vs ancien helper qui retournait du
 * HTML basique moche).
 *
 * Migration pattern :
 *   AVANT : const html = getDefaultTemplate(docType, { formation, learner, ... });
 *   APRÈS : const html = renderSystemTemplate(docType, { formation, learner, ... });
 *
 * Les call sites doivent gérer le cas `null` (afficher "Template non
 * disponible" plutôt que silence).
 */

import {
  resolveDocumentVariables,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import type { Session, Learner, Client, Trainer } from "@/lib/types";

interface LegacyTemplateData {
  formation?: Session | null;
  learner?: Partial<Learner> & { first_name?: string; last_name?: string; email?: string | null };
  company?: (Partial<Client> & { id?: string; company_name?: string; address?: string | null; siret?: string | null }) | null;
  trainer?: Partial<Trainer> & { first_name?: string; last_name?: string };
  entityName?: string;
  entity?: ResolveContext["entity"];
  // Champs additionnels utilisés par certains call sites legacy
  doc?: { document_date?: string | null; confirmed_at?: string | null };
  clientSignature?: { signature_data: string; signer_name: string; signed_at: string } | null;
}

export function renderSystemTemplate(
  docType: string,
  data: LegacyTemplateData,
): string | null {
  const template = getSystemTemplate(docType);
  if (!template) return null;

  // Adapter LegacyTemplateData → ResolveContext (formation→session, company→client)
  const ctx: ResolveContext = {
    session: (data.formation ?? undefined) as Session | undefined,
    learner: data.learner as Learner | undefined,
    client: data.company as Client | undefined,
    trainer: data.trainer as Trainer | undefined,
    entity: data.entity,
  };

  // Résout HTML + footer + concatène (le footer Puppeteer est géré séparément
  // par l'endpoint server-side qui appelle DGS ; ici on injecte le footer
  // inline pour les rendus client/preview).
  const html = resolveDocumentVariables(template.html, ctx);
  return html;
}

