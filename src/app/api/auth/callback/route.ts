import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Callback Supabase SSR — échange le code OAuth retourné par Supabase
 * (après vérification OTP du magic link) contre une session cookie côté
 * app. Sans ce handler, le magic link convocation redirige l'apprenant
 * vers /login car la session Supabase est posée sur supabase.co (pas
 * sur le domaine app).
 *
 * Flow appelant :
 *   /access/[token]/page.tsx → generateLink avec redirectTo =
 *   ${APP_URL}/api/auth/callback?next=/learner
 *
 * Cf spec docs/superpowers/specs/2026-05-17-fix-magic-link-callback-design.md
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/learner";

  // Sécurité : "next" doit être un path interne (anti open-redirect).
  // Bloque les schémas `//evil.com/x` (qui sont des URLs absolues protocole-relatives).
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") ? next : "/learner";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", origin));
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchange failed:", error.message);
    return NextResponse.redirect(
      new URL("/login?error=auth_callback_failed", origin),
    );
  }

  return NextResponse.redirect(new URL(safeNext, origin));
}
