/**
 * Helper de détection de plateforme d'exécution (Netlify vs Railway).
 *
 * Contexte : la même base de code est déployée sur DEUX plateformes :
 *   - Netlify (branche `main` = prod historique) : serverless, timeout court
 *     (~26s). Les traitements longs sont délégués à des « Background Functions »
 *     Netlify (`/.netlify/functions/*-background`, timeout 15 min).
 *   - Railway (conteneur long-lived) : pas de `/.netlify/functions/*` (→ 502) et
 *     pas de timeout serverless → on exécute les traitements longs EN PROCESS,
 *     en fire-and-forget.
 *
 * Ce module centralise les deux décisions nécessaires au « dual-mode » :
 *   1. `isRailway()` : sait-on qu'on tourne sur Railway ?
 *   2. `getInternalBaseUrl()` : quelle URL de base utiliser pour qu'un runner
 *      serveur rappelle des SOUS-ROUTES de la MÊME app (self-call) ?
 */

/**
 * Vrai si l'app tourne sur Railway.
 *
 * Railway injecte automatiquement `RAILWAY_ENVIRONMENT` (nom de l'environnement)
 * et, pour un service exposé, `RAILWAY_PUBLIC_DOMAIN`. La présence de l'une OU
 * l'autre suffit à identifier la plateforme. Sur Netlify aucune de ces
 * variables n'est définie → `false`.
 */
export function isRailway(): boolean {
  return !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RAILWAY_PUBLIC_DOMAIN;
}

/**
 * URL de base pour les self-calls serveur (un runner qui rappelle une
 * sous-route HTTP de la MÊME application).
 *
 * - Sur Railway : on vise le loopback local du conteneur
 *   `http://127.0.0.1:${PORT}` (PORT est injecté par Railway, 3000 par défaut).
 *   Cela évite de sortir sur Internet et de dépendre du domaine public.
 * - Sinon (Netlify / dev) : on garde `process.env.URL` (fourni par Netlify), ou
 *   à défaut `http://localhost:8888` (port de `netlify dev`).
 */
export function getInternalBaseUrl(): string {
  if (isRailway()) {
    return `http://127.0.0.1:${process.env.PORT || 3000}`;
  }
  return process.env.URL || "http://localhost:8888";
}
