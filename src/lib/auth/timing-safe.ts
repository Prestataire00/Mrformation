import bcrypt from "bcryptjs";

/**
 * Pédagogie V2 Epic 2.5 — Helpers timing-safe pour la route
 * `POST /api/auth/resolve-username` (résolution username → email pour
 * l'apprenant).
 *
 * Problème : la résolution SQL `username → email` peut être 1-10ms si le
 * username est inconnu (early-return PG) et 50-100ms s'il existe (jointure
 * + RLS). Cette différence de timing permet à un attaquant d'énumérer les
 * usernames valides → fuite RGPD.
 *
 * Stratégie défense en profondeur :
 *  1. Côté DB, `resolve_learner_email_by_username` retourne TOUJOURS un
 *     email bien formé (fallback synthétique fabriqué si username inconnu).
 *  2. Côté API, on fait du travail CPU constant (`dummyBcryptCompare`) +
 *     on padde le temps total à une cible fixe (`RESOLVE_USERNAME_TARGET_MS`)
 *     via `padToTarget`.
 *
 * Cf. spec restructuration pédagogique 2026-06-04 + plan
 * `docs/superpowers/plans/2026-06-04-pedagogie-v2-epic-2-5-auth-pdf.md`
 * (Task 9).
 */

/**
 * Cible (ms) du temps total de réponse `POST /api/auth/resolve-username`.
 *
 * 150ms est :
 *  - largement supérieur au coût d'une jointure PG (~50-100ms en pire cas)
 *    → on a la marge pour padder en montée
 *  - imperceptible côté UX login (l'utilisateur ne notera pas 150ms)
 *  - assez court pour ne pas bloquer un attaquant 30s mais assez stable
 *    pour brouiller le signal timing (variance DB < 30ms reste invisible
 *    derrière un pad à 150ms).
 *
 * Si la résolution prend >150ms (cas extrême : DB sous charge), la
 * réponse est simplement renvoyée immédiatement (`padToTarget` no-op).
 * L'attaquant verra alors un timing variable, mais c'est un cas pathologique
 * où la sécurité reste assurée par le fallback synthétique côté DB.
 */
export const RESOLVE_USERNAME_TARGET_MS = 150;

/**
 * Hash bcrypt factice de coût 10 (matchant le coût standard utilisé pour
 * de vrais hashes). La valeur du hash n'a aucune importance : on l'appelle
 * pour son **coût CPU**, pas pour son résultat de comparaison.
 *
 * Format `$2a$10$<53 chars>` = format bcrypt valide → bcrypt.compare ne
 * throw pas. Le payload (`a`.repeat(53)) est invalide en pratique
 * (`compare` retournera `false` ou throwra discrètement selon les versions
 * bcryptjs, voir try/catch dans `dummyBcryptCompare`).
 */
const DUMMY_HASH = "$2a$10$" + "a".repeat(53);

/**
 * Effectue un `bcrypt.compare` factice contre un hash dummy.
 *
 * Pourquoi : sur la branche "username inconnu", on n'a pas de hash réel à
 * comparer côté API (l'auth Supabase fera la vérification ailleurs). Sans
 * ce dummy, le timing CPU diffèrerait entre branches "trouvé" / "pas
 * trouvé" → fuite. Ce dummy assure ~50-80ms CPU systématiques.
 *
 * Ne throw jamais : tout enrobé dans try/catch, retourne `false` en cas
 * d'erreur (la valeur retournée n'est pas utilisée par l'appelant — c'est
 * le **coût** qui compte).
 */
export async function dummyBcryptCompare(): Promise<boolean> {
  try {
    return await bcrypt.compare("dummy", DUMMY_HASH);
  } catch {
    // Format hash invalide → swallow. Le coût CPU a quand même été payé.
    return false;
  }
}

/**
 * Attend jusqu'à atteindre `targetMs` depuis `startMs` (en `performance.now()`).
 *
 * No-op si on a déjà dépassé la cible (jamais de "voyage dans le temps").
 *
 * @param startMs timestamp `performance.now()` du début de la requête
 * @param targetMs cible (ms) depuis `startMs`
 */
export async function padToTarget(startMs: number, targetMs: number): Promise<void> {
  const elapsed = performance.now() - startMs;
  const remaining = targetMs - elapsed;
  if (remaining <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, remaining));
}
