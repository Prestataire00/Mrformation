/**
 * Pédagogie V2 Epic 2.5 — Helpers pour les emails synthétiques apprenants.
 *
 * Un apprenant sans email réel reçoit un email synthétique non-routable au
 * format `<username>@learner.<entity_slug>.local`. Le TLD `.local` (RFC 6762,
 * mDNS) n'est jamais résolu sur internet, ce qui garantit qu'aucun email ne
 * sera envoyé accidentellement. Cf. garde-fou anti-envoi (Task 7).
 *
 * Pourquoi un email synthétique : Supabase Auth requiert un email pour
 * `createUser`. Plutôt que de forker l'auth (cf. design B éliminé), on
 * fabrique un email de domaine non-routable, jamais affiché à l'apprenant
 * (qui se logge avec son username, pas son email).
 *
 * Spec : bmad_output/planning-artifacts/spec-restructuration-pedagogique-2026-06-04.md
 */

const SYNTHETIC_EMAIL_REGEX = /^[a-z0-9.-]+@learner\.[a-z0-9-]+\.local$/;

/**
 * Construit un email synthétique pour un apprenant.
 *
 * @param username slugifié (lowercase, [a-z0-9.-])
 * @param entitySlug slugifié (lowercase, ex: "mr-formation", "c3v-formation")
 */
export function buildSyntheticEmail(username: string, entitySlug: string): string {
  return `${username}@learner.${entitySlug}.local`;
}

/**
 * Reconnaît un email synthétique apprenant à son format.
 *
 * Utilisé pour :
 *  (a) filtrer les apprenants sans email réel dans les vues admin
 *  (b) garde-fou anti-envoi sur ce domaine (cf. Task 7)
 *  (c) marquer `learners.synthetic_email_used = true` à la création
 *
 * Case-insensitive (RFC 5321 §2.4 : les domaines email sont insensibles à la
 * casse). On lowercase l'input avant le test pour matcher un email saisi
 * manuellement avec une casse mixte (ex: `Pierre@LEARNER.mr-formation.local`).
 * Fix M1 review adversariale Phase B Epic 2.5.
 */
export function isSyntheticEmail(email: string): boolean {
  if (typeof email !== "string" || email.length === 0) return false;
  return SYNTHETIC_EMAIL_REGEX.test(email.toLowerCase());
}
