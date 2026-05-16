/**
 * Helper : génère un code d'identification déterministe pour un certificat
 * (diplôme de fin de formation). Hash SHA-256 tronqué à 13 caractères hex.
 *
 * Déterministe : même (learnerId, sessionId) → même code. Donc régénérer
 * le certificat plusieurs fois donne le même code (cache PDF stable).
 */

import { createHash } from "crypto";

export function generateCertificateCode(learnerId: string, sessionId: string): string {
  return createHash("sha256")
    .update(`${learnerId}-${sessionId}-certificat`)
    .digest("hex")
    .slice(0, 13);
}
