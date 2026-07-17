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
