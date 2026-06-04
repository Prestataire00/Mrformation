/**
 * Feature flags du chantier Pédagogie V2 (cf. spec
 * bmad_output/planning-artifacts/spec-restructuration-pedagogique-2026-06-04.md).
 *
 * Convention : 1 flag par epic, dépendances explicites entre flags.
 * Le code doit checker `isPedagogieV2EpicNEnabled()` à chaque point de
 * branchement du nouveau comportement, et faire un fallback explicite
 * vers l'ancien comportement quand le flag est OFF.
 *
 * Stockage : variables d'env Netlify (process.env.FEATURE_PEDAGOGIE_V2_EPIC_<N>).
 * Acceptée comme TRUE uniquement la valeur littérale "true" (strict, pour
 * éviter les confusions "1", "yes", etc.).
 */

function flagOn(name: string): boolean {
  return process.env[name] === "true";
}

/**
 * Epic 1 — Fondations data : nouvelles tables session_elearning_courses
 * et program_elearning_courses actives, suppression du chemin UI legacy
 * "Nouveau cours" du hub (programs.content.type='elearning').
 *
 * Pré-requis activation : migrations Task 1, 2, 3 exécutées en prod.
 */
export function isPedagogieV2Epic1Enabled(): boolean {
  return flagOn("FEATURE_PEDAGOGIE_V2_EPIC_1");
}
