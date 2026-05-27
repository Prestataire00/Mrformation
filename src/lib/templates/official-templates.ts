/**
 * Catalogue des templates officiels système (UI metadata).
 * Source de vérité : src/lib/templates/registry.ts (set des doc_types couverts).
 *
 * Cette liste est DÉRIVÉE du registry système : pour chaque doc_type présent
 * dans SYSTEM_TEMPLATES_BY_DOC_TYPE, on associe des métadonnées UI (catégorie,
 * libellé, type, autoConfirmed).
 *
 * Si un nouveau doc_type est ajouté au registry sans métadonnées UI ici, il
 * n'apparaîtra pas dans le catalogue — détecté immédiatement par bug visible.
 * Un console.warn dev-time signale aussi l'absence.
 *
 * Les doc_types sectoriels du registry (avis_hab_elec_*, attestation_aipr,
 * certificat_travail_hauteur, etc.) ne sont PAS catalogués ici car ils
 * apparaissent par contexte (sélection manuelle dans la fiche formation).
 */

import { SYSTEM_TEMPLATES_BY_DOC_TYPE } from "./registry";
import type { DocumentType } from "./types";

export interface OfficialTemplate {
  id: string;
  name: string;
  category: "learner" | "company" | "trainer" | "common";
  categoryLabel: string;
  type: DocumentType;
  autoConfirmed: boolean;
}

// Métadonnées UI par doc_type — les clés DOIVENT correspondre aux clés du registry.
// Voir src/lib/templates/registry.ts pour la liste complète des doc_types couverts.
const OFFICIAL_TEMPLATE_META: Record<string, Omit<OfficialTemplate, "id">> = {
  // Apprenant
  convocation: {
    name: "CONVOCATION À LA FORMATION",
    category: "learner",
    categoryLabel: "Apprenant",
    type: "certificate",
    autoConfirmed: false,
  },
  certificat_realisation: {
    name: "CERTIFICAT DE RÉALISATION",
    category: "learner",
    categoryLabel: "Apprenant",
    type: "certificate",
    autoConfirmed: false,
  },
  attestation_assiduite: {
    name: "ATTESTATION D'ASSIDUITÉ",
    category: "learner",
    categoryLabel: "Apprenant",
    type: "attendance",
    autoConfirmed: false,
  },
  feuille_emargement: {
    name: "FEUILLE D'ÉMARGEMENT",
    category: "learner",
    categoryLabel: "Apprenant",
    type: "attendance",
    autoConfirmed: false,
  },
  // Entreprise
  convention_entreprise: {
    name: "CONVENTION ENTREPRISE",
    category: "company",
    categoryLabel: "Entreprise",
    type: "agreement",
    autoConfirmed: false,
  },
  feuille_emargement_collectif: {
    name: "FEUILLE D'ÉMARGEMENT COLLECTIF",
    category: "company",
    categoryLabel: "Entreprise",
    type: "attendance",
    autoConfirmed: false,
  },
  planning_semaine: {
    name: "PLANNING DE LA SEMAINE",
    category: "company",
    categoryLabel: "Entreprise",
    type: "attendance",
    autoConfirmed: false,
  },
  // Formateur
  convention_intervention: {
    name: "CONVENTION D'INTERVENTION",
    category: "trainer",
    categoryLabel: "Formateur",
    type: "agreement",
    autoConfirmed: false,
  },
  // Communs (auto-confirmés — pas besoin de signature)
  cgv: {
    name: "CGV",
    category: "common",
    categoryLabel: "Commun",
    type: "other",
    autoConfirmed: true,
  },
  politique_confidentialite: {
    name: "POLITIQUE DE CONFIDENTIALITÉ",
    category: "common",
    categoryLabel: "Commun",
    type: "other",
    autoConfirmed: true,
  },
  reglement_interieur: {
    name: "RÈGLEMENT INTÉRIEUR",
    category: "common",
    categoryLabel: "Commun",
    type: "other",
    autoConfirmed: true,
  },
  programme_formation: {
    name: "PROGRAMME DE LA FORMATION",
    category: "common",
    categoryLabel: "Commun",
    type: "other",
    autoConfirmed: true,
  },
};

/**
 * Liste dérivée des templates officiels. Pour chaque doc_type avec des
 * métadonnées UI ici, on vérifie qu'il est bien présent dans le registry
 * système avant de l'inclure (console.warn dev-time sinon).
 *
 * L'ordre est celui des clés de OFFICIAL_TEMPLATE_META (apprenant →
 * entreprise → formateur → communs).
 */
export const OFFICIAL_TEMPLATES: OfficialTemplate[] = Object.keys(OFFICIAL_TEMPLATE_META)
  .filter((docType) => {
    if (!(docType in SYSTEM_TEMPLATES_BY_DOC_TYPE)) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[official-templates] doc_type "${docType}" présent dans OFFICIAL_TEMPLATE_META mais absent du registry — entrée ignorée.`,
        );
      }
      return false;
    }
    return true;
  })
  .map((docType) => ({ id: docType, ...OFFICIAL_TEMPLATE_META[docType]! }));
