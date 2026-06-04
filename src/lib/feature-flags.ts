/**
 * Feature flags du chantier Pédagogie V2 (cf. spec
 * bmad_output/planning-artifacts/spec-restructuration-pedagogique-2026-06-04.md).
 *
 * Convention : 1 flag par epic, dépendances explicites entre flags.
 * Le code doit checker `isPedagogieV2EpicNEnabled()` à chaque point de
 * branchement du nouveau comportement, et faire un fallback explicite
 * vers l'ancien comportement quand le flag est OFF.
 *
 * Stockage : variables d'env Netlify (process.env.NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_<N>).
 *
 * ⚠ Préfixe `NEXT_PUBLIC_` obligatoire : ces flags doivent être lisibles
 * dans les Client Components Next.js (le hub /admin/elearning est marqué
 * "use client"). Sans NEXT_PUBLIC_, la variable n'est pas injectée dans
 * le bundle client et `process.env[name]` est `undefined` au runtime.
 * Le flag n'est pas un secret (boolean fonctionnel), l'exposition dans
 * le bundle client est acceptée.
 *
 * Acceptée comme TRUE uniquement la valeur littérale "true" (strict, pour
 * éviter les confusions "1", "yes", etc.).
 */

function flagOn(name: string): boolean {
  return process.env[name] === "true";
}

// DEBUG TEMPORAIRE — Pédagogie V2 (à retirer une fois le bug "flags ne s'appliquent
// pas côté client" résolu). Log dans la console browser la valeur lue par chaque
// flag au premier appel. Permet de diagnostiquer si le replace build time des
// NEXT_PUBLIC_* a bien injecté la valeur.
declare global {
  // eslint-disable-next-line no-var
  var __pedagogieV2DebugLogged: boolean | undefined;
}
function logFlagDebug(name: string, value: string | undefined): void {
  if (typeof window === "undefined") return;
  if (globalThis.__pedagogieV2DebugLogged) return;
  globalThis.__pedagogieV2DebugLogged = true;
  // eslint-disable-next-line no-console
  console.log(
    "[pedagogie-v2-debug]",
    name,
    "raw:",
    JSON.stringify(value),
    "typeof:",
    typeof value,
    "→ flagOn:",
    value === "true",
  );
}

/**
 * Epic 1 — Fondations data : nouvelles tables session_elearning_courses
 * et program_elearning_courses actives, suppression du chemin UI legacy
 * "Nouveau cours" du hub (programs.content.type='elearning').
 *
 * Pré-requis activation : migrations Task 1, 2, 3 exécutées en prod.
 */
export function isPedagogieV2Epic1Enabled(): boolean {
  const val = process.env.NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_1;
  logFlagDebug("NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_1", val);
  return val === "true";
}

/**
 * Epic 2 — Pipeline d'inscription enrichi : snapshot programme → session
 * (copy program_elearning_courses → session_elearning_courses à la création
 * de session) + auto-enrôlement des apprenants aux e-learning de la session.
 *
 * Pré-requis activation : Epic 1 actif + hooks Epic 2 déployés.
 */
export function isPedagogieV2Epic2Enabled(): boolean {
  return flagOn("NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_2");
}

/**
 * Epic 3 — UX admin : section "E-learning par défaut" sur la fiche programme
 * + (futur Epic 3.5) onglet E-learning attaché sur la fiche session + UI opt-out.
 */
export function isPedagogieV2Epic3Enabled(): boolean {
  return flagOn("NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_3");
}
