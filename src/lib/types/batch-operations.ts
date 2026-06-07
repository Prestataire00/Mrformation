/**
 * Types partagés pour les batch operations (E3-S06).
 * Utilisés par les helpers documents-store et les handlers TabConventionDocs.
 */

/**
 * Erreur détaillée d'un item dans une batch operation.
 * Utilisée pour logging structuré + reporting UI.
 */
export interface BatchError {
  itemId: string;
  itemLabel?: string;
  error: string;
  code?: string;
  timestamp?: string;
}

/**
 * Résultat standardisé d'une batch operation.
 * Utilisé par tous les helpers (send, signature, confirm, assign).
 */
export interface BatchResult {
  success: boolean;
  totalRequested: number;
  successCount: number;
  failureCount: number;
  errors: BatchError[];
  latencyMs?: number;
  refetchLatencyMs?: number;
}
