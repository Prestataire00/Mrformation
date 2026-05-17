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

export interface SystemTemplate {
  html: string;
  footer: string;
  /** Owner type attendu — pour validation côté caller. */
  ownerType: "learner" | "company" | "trainer" | "session";
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
  },
  certificat_realisation: {
    html: CERTIFICAT_REALISATION_HTML,
    footer: CERTIFICAT_REALISATION_FOOTER_TEMPLATE,
    ownerType: "learner",
  },
  attestation_assiduite: {
    html: ATTESTATION_ASSIDUITE_HTML,
    footer: ATTESTATION_ASSIDUITE_FOOTER_TEMPLATE,
    ownerType: "learner",
  },
  feuille_emargement: {
    html: EMARGEMENT_INDIVIDUEL_HTML,
    footer: EMARGEMENT_INDIVIDUEL_FOOTER_TEMPLATE,
    ownerType: "learner",
  },
  feuille_emargement_collectif: {
    html: EMARGEMENT_COLLECTIF_HTML,
    footer: EMARGEMENT_FOOTER_TEMPLATE,
    ownerType: "company",
  },
  convention_entreprise: {
    html: CONVENTION_ENTREPRISE_HTML,
    footer: CONVENTION_FOOTER_TEMPLATE,
    ownerType: "company",
  },
  convention_intervention: {
    html: CONVENTION_INTERVENTION_HTML,
    footer: CONVENTION_INTERVENTION_FOOTER_TEMPLATE,
    ownerType: "trainer",
  },
  contrat_sous_traitance: {
    // Réutilise le template convention-intervention (même structure légale)
    html: CONVENTION_INTERVENTION_HTML,
    footer: CONVENTION_INTERVENTION_FOOTER_TEMPLATE,
    ownerType: "trainer",
  },
  programme_formation: {
    html: PROGRAMME_FORMATION_HTML,
    footer: PROGRAMME_FORMATION_FOOTER_TEMPLATE,
    ownerType: "session",
  },
  cgv: {
    html: CGV_HTML,
    footer: CGV_FOOTER_TEMPLATE,
    ownerType: "session",
  },
  reglement_interieur: {
    html: REGLEMENT_INTERIEUR_HTML,
    footer: REGLEMENT_INTERIEUR_FOOTER_TEMPLATE,
    ownerType: "session",
  },
  politique_confidentialite: {
    html: POLITIQUE_RGPD_HTML,
    footer: POLITIQUE_RGPD_FOOTER_TEMPLATE,
    ownerType: "session",
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
  magicLinkUrl?: string;
  qrCodeDataUrl?: string;
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
    extranetQrDataUrl: data.qrCodeDataUrl,
  };

  // Résout HTML + footer + concatène (le footer Puppeteer est géré séparément
  // par l'endpoint server-side qui appelle DGS ; ici on injecte le footer
  // inline pour les rendus client/preview).
  const html = resolveDocumentVariables(template.html, ctx);
  return html;
}

