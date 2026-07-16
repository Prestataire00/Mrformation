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
