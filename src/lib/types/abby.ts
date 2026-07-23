// Types partagés de l'intégration Abby (feature facturation électronique).

/**
 * États dérivés de la connexion Abby d'une entité (AD-4 + précision 1.2) :
 * - non_configuree : aucune ligne abby_connections
 * - testee : ligne présente, is_active=false, connected_at NULL (testée, jamais activée)
 * - active : is_active=true, sans erreur
 * - en_erreur : is_active=true avec last_error (inatteignable avant la story 1.3)
 * - desactivee : is_active=false, connected_at non nul (désactivée après activation)
 */
export type AbbyConnectionStatus =
  | "non_configuree"
  | "testee"
  | "active"
  | "en_erreur"
  | "desactivee";

/** État renvoyé par GET /api/abby/connections — jamais de colonne chiffrée. */
export interface AbbyConnectionState {
  status: AbbyConnectionStatus;
  companyName: string | null;
  companySiret: string | null;
  isActive: boolean;
  connectedAt: string | null;
  lastUsedAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

/** Réponse de POST /api/abby/connections (test de clé réussi). */
export interface AbbyTestConnectionResult {
  companyName: string | null;
  companySiret: string;
  isInTestMode: boolean;
}

// ─── Résolution des clients facturés (Epic 2) ────────────────────────────

export type AbbyRecipientType = "learner" | "company" | "financier";

/** Référence polymorphe d'un destinataire de facture LMS. */
export interface AbbyRecipientRef {
  type: AbbyRecipientType;
  id: string;
}

/**
 * Données normalisées d'un destinataire, lues depuis sa table source.
 * `email` est null pour les entreprises (la table clients n'en a pas —
 * la story 2.2 tranche : contact principal ou omission).
 */
export interface AbbyRecipientData {
  kind: "contact" | "organization";
  name: string;
  siret: string | null;
  email: string | null;
  firstName?: string;
  lastName?: string;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
}

/**
 * Issue de la résolution d'un destinataire vers un client Abby (FR-5/FR-6).
 * `auto_linkable` n'est PAS persisté par la résolution : l'unique écrivain
 * de la liaison est l'étape 1 de la saga (AD-10/AD-21).
 */
export type AbbyCustomerResolution =
  | {
      outcome: "linked";
      abbyCustomerId: string;
      abbyCustomerType: "contact" | "organization";
    }
  | {
      outcome: "auto_linkable";
      abbyCustomerId: string;
      abbyCustomerType: "organization";
    }
  | { outcome: "to_create"; recipient: AbbyRecipientData };

// ─── Prévisualisation du push (Epic 3, story 3.2) ─────────────────────────

/**
 * Réponse de GET /api/abby/invoices/[id]/preview (AD-21 — schéma fixé en
 * story 3.2, ex-Deferred du spine). Read-only : la préview est INDICATIVE,
 * la saga refait sa propre résolution. Jamais d'`abbyCustomerId` exposé.
 */
export interface AbbyInvoicePreview {
  invoice: { id: string; displayRef: string; isAvoir: boolean };
  /** Nom résolu côté SERVEUR (garde-fou anti-inversion) — la couleur reste côté client. */
  entity: { name: string };
  recipient: {
    /** = formation_invoices.recipient_name — jamais dérivé de la résolution. */
    name: string;
    type: AbbyRecipientType;
    /** Sort affiché : to_create → « sera créé dans Abby ». */
    outcome: "linked" | "auto_linkable" | "to_create";
  };
  lines: Array<{
    description: string;
    quantity: number;
    unitPriceHT: number;
    totalHT: number;
  }>;
  totals: {
    totalHT: number;
    vatExempt: boolean;
    /** Taux unique d'entité (0 si exonérée) — colonne « TVA » du tableau. */
    tvaRate: number;
    tvaAmount: number;
    totalTTC: number;
    /** footerNote QO-1 si exonérée, sinon null. */
    exonerationMention: string | null;
  };
  /** Reprise d'un push interrompu (3.4) : prochaine étape, sinon null. */
  resume: { fromStep: number } | null;
  /** Avoir (5.3) : facture parente rattachée (bandeau UX-DR8). null = facture. */
  parent: { displayRef: string; abbyNumber: string | null } | null;
}

/**
 * Erreur de preview — enrichie de `missingFields` (blocage FR-7), que le
 * `ServiceResult` standard `{message, code?}` ne porte pas.
 */
export interface AbbyPreviewError {
  message: string;
  code?: string;
  missingFields?: string[];
}

export type AbbyPreviewResult =
  | { ok: true; preview: AbbyInvoicePreview }
  | { ok: false; error: AbbyPreviewError };

// ─── Saga de push (Epic 3, story 3.3) ─────────────────────────────────────

/** Curseur de saga — union du CHECK SQL `abby_push_state` (AD-6). */
export type AbbyPushState =
  | "pushing"
  | "draft_created"
  | "lines_set"
  | "details_set"
  | "finalized";

/**
 * Résultat d'UNE étape d'avance-saga (AD-8 — schéma fixé en 3.3, ex-Deferred).
 * `state` = curseur APRÈS l'étape ; le client boucle tant que `!done`.
 * Les libellés d'étape vivent côté UI.
 */
export interface AbbyPushStepOutcome {
  state: AbbyPushState;
  done: boolean;
  abbyInvoiceNumber?: string;
}
