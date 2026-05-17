"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, AlertCircle } from "lucide-react";

/**
 * Callback Supabase implicit flow — parse les tokens depuis le #fragment
 * de l'URL et pose la session côté browser via setSession() (qui écrit
 * les cookies que le middleware Next.js va voir au prochain request).
 *
 * Pourquoi page client et pas route handler API :
 *   Supabase magic link utilise par défaut le flow IMPLICIT qui place
 *   access_token + refresh_token dans le #fragment de l'URL (et non
 *   dans le ?query). Les fragments ne sont JAMAIS envoyés au serveur
 *   (le browser les garde locaux), donc impossible à lire dans une
 *   route handler. Il faut JS côté client pour parser window.location.hash.
 *
 * Flow appelant :
 *   /access/[token]/page.tsx → generateLink avec redirectTo =
 *   ${APP_URL}/auth/callback?next=/learner
 *   → Supabase verify OTP, redirige vers
 *   ${APP_URL}/auth/callback?next=/learner#access_token=...&refresh_token=...
 *   → cette page parse + setSession + redirige vers next
 *
 * Cf spec docs/superpowers/specs/2026-05-17-fix-magic-link-callback-design.md
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      // Parse "next" depuis le query (path interne après login)
      const nextParam = searchParams.get("next") ?? "/learner";
      const safeNext =
        nextParam.startsWith("/") && !nextParam.startsWith("//")
          ? nextParam
          : "/learner";

      // Parse les tokens depuis le #fragment (Supabase implicit flow)
      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const hashError = params.get("error_description");

      if (hashError) {
        setError(hashError);
        return;
      }

      if (!accessToken || !refreshToken) {
        setError("Tokens manquants dans le lien. Veuillez réessayer ou contacter le support.");
        return;
      }

      const supabase = createClient();
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError) {
        console.error("[auth/callback] setSession failed:", sessionError.message);
        setError("Impossible d'établir la session. Le lien a peut-être expiré.");
        return;
      }

      // Nettoie l'URL (retire le fragment qui contient les tokens sensibles)
      // avant de naviguer, par sécurité (évite que les tokens restent dans
      // l'historique navigateur ou les referers).
      window.history.replaceState(null, "", window.location.pathname);

      router.replace(safeNext);
    };

    handleCallback();
  }, [router, searchParams]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="max-w-md text-center bg-white rounded-xl p-8 shadow-lg">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Connexion impossible</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => router.replace("/login")}
            className="text-sm text-blue-600 hover:underline"
          >
            Retour à la page de connexion
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="max-w-md text-center">
        <Loader2 className="h-12 w-12 text-blue-500 mx-auto mb-4 animate-spin" />
        <h1 className="text-lg font-medium text-gray-900">Connexion en cours…</h1>
        <p className="text-sm text-gray-500 mt-2">Veuillez patienter.</p>
      </div>
    </div>
  );
}
