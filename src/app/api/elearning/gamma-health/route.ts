/**
 * GET /api/elearning/gamma-health
 *
 * Endpoint de diagnostic pour vérifier que l'API Gamma est joignable et
 * que la clé GAMMA_API_KEY est correctement configurée.
 *
 * Retourne :
 *   - { ok: true, themes_count: N, sample_theme: { id, name } } si tout fonctionne
 *   - { ok: false, reason: "missing_key" | "auth_failed" | "network" | "..." } sinon
 *
 * Usage : ouvre /api/elearning/gamma-health dans le navigateur (connecté
 * en admin/super_admin) après avoir ajouté GAMMA_API_KEY dans
 * .env.local + Netlify.
 */

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { listGammaThemes } from "@/lib/services/gamma";

export async function GET() {
  const auth = await requireRole(["admin", "super_admin"]);
  if (auth.error) return auth.error;

  // 1. Clé présente ?
  if (!process.env.GAMMA_API_KEY) {
    return NextResponse.json(
      {
        ok: false,
        reason: "missing_key",
        message:
          "GAMMA_API_KEY non définie. Ajoutez la variable dans .env.local (dev) ou Netlify Dashboard > Environment variables (prod), puis redémarrez le serveur.",
      },
      { status: 503 },
    );
  }

  // 2. Appel API Gamma (liste des thèmes — endpoint le moins coûteux).
  try {
    const themes = await listGammaThemes();
    if (themes.length === 0) {
      return NextResponse.json({
        ok: true,
        themes_count: 0,
        warning:
          "API joignable mais aucun thème retourné. Vérifiez votre plan Gamma ou créez un thème dans votre compte Gamma.",
      });
    }
    return NextResponse.json({
      ok: true,
      themes_count: themes.length,
      sample_theme: {
        id: themes[0].id,
        name: themes[0].name,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    // Heuristique : 401/403 dans le message → clé invalide.
    const isAuthError = /401|403|unauthor/i.test(message);
    return NextResponse.json(
      {
        ok: false,
        reason: isAuthError ? "auth_failed" : "network",
        message: isAuthError
          ? "Clé GAMMA_API_KEY rejetée par l'API (401/403). Vérifiez la clé dans votre compte Gamma."
          : `Appel API Gamma échoué : ${message}`,
      },
      { status: 502 },
    );
  }
}
