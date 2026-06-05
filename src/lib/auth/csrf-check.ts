/**
 * Pédagogie V2 Epic 2.5 — TASK 10 — Helper CSRF (vérification Origin/Referer)
 *
 * Vérifie qu'une requête mutative (POST/PUT/DELETE) provient bien d'une page
 * de notre application (et pas d'un site tiers via formulaire CSRF caché).
 *
 * Stratégie :
 *  1. `Origin` header : valeur de référence en CSRF (envoyée par tous les
 *     navigateurs modernes sur cross-origin requests). Comparée à la racine
 *     `NEXT_PUBLIC_APP_URL` (ex: `https://lms.mrformation.fr`).
 *  2. `Referer` header : fallback si pas d'Origin (rare, mais certains
 *     clients/tests peuvent l'omettre). Vérifie que le Referer démarre bien
 *     par notre origin.
 *  3. En dev (pas de `NEXT_PUBLIC_APP_URL` configuré) : retourne `false`
 *     (pas de mismatch) — on ne bloque pas les tests en local et les
 *     environnements préview Netlify sans env explicite. La sécurité prod
 *     repose sur l'env var configurée.
 *
 * Pattern d'usage côté route :
 * ```ts
 * import { isCsrfMismatch } from "@/lib/auth/csrf-check";
 *
 * export async function POST(req: NextRequest) {
 *   if (isCsrfMismatch(req)) {
 *     return NextResponse.json({ error: "csrf_mismatch" }, { status: 403 });
 *   }
 *   // …
 * }
 * ```
 *
 * Sécurité : ne pas confondre avec un token CSRF synchroniser (double
 * submit). Origin-check seul est largement suffisant pour les routes
 * fetch JSON (le navigateur attaque ne peut PAS forger Origin).
 */

/**
 * Récupère l'origin attendu depuis l'env. Retourne `null` si non configuré
 * (dev ou env oubliée — caller décide alors du comportement).
 *
 * Tolère un trailing slash en supprimant les éventuels suffixes.
 */
function getExpectedOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    // Normalise : protocole + host (pas de path, pas de trailing slash).
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/**
 * Header-getter abstrait : accepte un `NextRequest` réel ou un objet de
 * test avec un `headers.get()` ou `headers` Map-like.
 *
 * On évite de typer en `NextRequest` strict pour faciliter le mock en test
 * (Vitest n'a pas besoin de tirer la dépendance Next).
 */
type HeaderLike = {
  headers: { get(name: string): string | null };
};

/**
 * Retourne `true` si la requête NE provient PAS de notre origin attendu
 * (= mismatch CSRF détecté → caller doit répondre 403).
 *
 * Retourne `false` si :
 *  - Origin (ou Referer fallback) matche l'env `NEXT_PUBLIC_APP_URL`
 *  - ou en dev (env non configurée) : on ne bloque pas
 */
export function isCsrfMismatch(req: HeaderLike): boolean {
  const expected = getExpectedOrigin();
  // Dev / env non configurée → pas de mismatch (on n'a pas de référence).
  if (!expected) return false;

  const origin = req.headers.get("origin");
  if (origin) {
    // Normalise pareillement pour éviter de fausser sur "https://x.com/"
    // vs "https://x.com" (Origin envoyé par le navigateur n'a jamais de
    // trailing slash mais on est défensif).
    try {
      const u = new URL(origin);
      const normalized = `${u.protocol}//${u.host}`;
      return normalized !== expected;
    } catch {
      // Origin malformé → suspect → mismatch.
      return true;
    }
  }

  // Fallback : Referer (rare, navigateurs envoient Origin sur POST cross-origin
  // depuis ~2018, mais certains clients minimalistes ou tests omettent Origin).
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      const u = new URL(referer);
      const normalized = `${u.protocol}//${u.host}`;
      return normalized !== expected;
    } catch {
      return true;
    }
  }

  // Ni Origin ni Referer → suspect → mismatch.
  return true;
}
