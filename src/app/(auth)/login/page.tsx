"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Eye, EyeOff, GraduationCap } from "lucide-react";

function setCookie(name: string, value: string, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
}

const ENTITY_CONFIG: Record<string, { name: string; gradient: string }> = {
  "mr-formation": {
    name: "MR FORMATION",
    gradient: "linear-gradient(135deg, #374151, #B91C1C)",
  },
  "c3v-formation": {
    name: "C3V FORMATION",
    gradient: "linear-gradient(135deg, #2563EB, #1D4ED8)",
  },
};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  // Entité : pré-remplie depuis l'URL (QR/PDF) si présente, sinon choisie via
  // le sélecteur inline UNIQUEMENT pour le login par identifiant (la résolution
  // username→email est scopée par entité). Le login par email n'en a pas besoin.
  const [entitySlug, setEntitySlug] = useState(searchParams.get("entity") ?? "");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setError("Une erreur est survenue. Veuillez réessayer.");
      setLoading(false);
      return;
    }

    setResetSent(true);
    setLoading(false);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Pédagogie V2 Epic 2.5 — Si l'identifiant ne contient pas de "@",
    // on suppose un username apprenant et on résout d'abord vers son email
    // (réel ou synthétique) via la route timing-safe /api/auth/resolve-username.
    // Cf. spec §4 Architecture C Hybride Username-Alias.
    let emailToUse = email.trim();
    if (!emailToUse.includes("@")) {
      if (!entitySlug) {
        setError(
          "Pour vous connecter par identifiant, choisissez d'abord votre entité.",
        );
        setLoading(false);
        return;
      }
      try {
        const res = await fetch("/api/auth/resolve-username", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: emailToUse, entitySlug }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          email?: string;
        };
        if (!res.ok || !data.email) {
          // Anti-énumération : message générique unique.
          setError("Identifiant ou mot de passe incorrect.");
          setLoading(false);
          return;
        }
        emailToUse = data.email;
      } catch {
        setError("Identifiant ou mot de passe incorrect.");
        setLoading(false);
        return;
      }
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: emailToUse,
      password,
    });

    if (error) {
      // Message générique unique (anti-énumération — ne distingue pas
      // "email/identifiant inconnu" de "mauvais mot de passe").
      setError("Identifiant ou mot de passe incorrect.");
      setLoading(false);
      return;
    }

    // Connexion unique : l'entité active est DÉRIVÉE du profil (plus de choix
    // d'organisme pré-login). On pose les cookies role + entity_id depuis le
    // profil pour éviter un détour par /select-entity ; le middleware re-dérive
    // de toute façon l'entité du profil (source de vérité).
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, entity_id")
        .eq("id", user.id)
        .single();

      if (profile?.role) {
        setCookie("user_role", profile.role, 30);
      }
      if (profile?.entity_id) {
        setCookie("entity_id", profile.entity_id);
      }
    }

    // Redirect to root which handles role-based routing
    router.push("/");
    router.refresh();
  }

  // Connexion unique : branding générique (l'organisme n'est plus choisi
  // avant l'auth ; le branding par entité s'applique après, dans le dashboard).
  const headerTitle = "LMS FORMATION";
  const headerGradient = "linear-gradient(135deg, #374151, #B91C1C)";

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background:
          "linear-gradient(135deg, #FCA5A5 0%, #EF4444 50%, #374151 100%)",
      }}
    >
      <div className="w-full max-w-md">
        {/* Card principale */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div
            className="px-8 py-6 text-center"
            style={{ background: headerGradient }}
          >
            <div className="flex items-center justify-center gap-3 mb-1">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-white font-bold text-xl tracking-wide">
                {headerTitle}
              </h1>
            </div>
            <p className="text-white/80 text-sm">
              Plateforme de gestion des formations
            </p>
          </div>

          {/* Formulaire */}
          <div className="px-8 py-8">
            {forgotPassword ? (
              <>
                <p className="text-gray-400 text-xs text-center uppercase tracking-widest mb-1 font-semibold">
                  MOT DE PASSE OUBLIÉ
                </p>
                <p className="text-gray-500 text-sm text-center mb-6">
                  Entrez votre email pour recevoir un lien de réinitialisation.
                </p>

                {error && (
                  <div role="alert" className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm mb-4">
                    {error}
                  </div>
                )}

                {resetSent ? (
                  <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm mb-4">
                    Un email de réinitialisation a été envoyé à <strong>{email}</strong>. Vérifiez votre boîte de réception.
                  </div>
                ) : (
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <input
                      type="email"
                      placeholder="Adresse email"
                      aria-label="Adresse email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="w-full px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#374151] focus:border-transparent placeholder:text-gray-400"
                    />
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 rounded-lg font-semibold text-white text-sm uppercase tracking-widest transition-all disabled:opacity-60"
                      style={{ background: headerGradient }}
                    >
                      {loading ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Envoi...
                        </span>
                      ) : (
                        "ENVOYER LE LIEN"
                      )}
                    </button>
                  </form>
                )}

                <button
                  onClick={() => { setForgotPassword(false); setResetSent(false); setError(null); }}
                  className="w-full text-center text-sm text-[#374151] hover:underline font-medium mt-4"
                >
                  &larr; Retour à la connexion
                </button>
              </>
            ) : (
              <>
                <p className="text-gray-400 text-xs text-center uppercase tracking-widest mb-1 font-semibold">
                  SE CONNECTER
                </p>
                <p className="text-gray-500 text-sm text-center mb-6">
                  Veuillez remplir vos identifiants pour vous connecter.
                </p>

                {error && (
                  <div id="login-error" role="alert" className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm mb-4">
                    {error}
                  </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <input
                      type="text"
                      placeholder="Identifiant (ex: marie.dupont) ou adresse email"
                      aria-label="Identifiant ou adresse email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="username"
                      aria-describedby={error ? "login-error" : "login-helper"}
                      className="w-full px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#374151] focus:border-transparent placeholder:text-gray-400"
                    />
                    <p id="login-helper" className="text-xs text-gray-500 mt-1.5">
                      Vous n&apos;avez pas d&apos;email ? Utilisez l&apos;identifiant
                      reçu dans votre PDF de bienvenue.
                    </p>
                  </div>

                  {/* Sélecteur d'organisme inline : nécessaire UNIQUEMENT pour
                      la connexion par identifiant (apprenant sans email), car la
                      résolution username→email est scopée par entité. Masqué
                      pour la connexion par email. */}
                  {email.trim().length > 0 && !email.includes("@") && (
                    <div>
                      <label htmlFor="entity-select" className="block text-xs text-gray-500 mb-1.5">
                        Votre organisme de formation
                      </label>
                      <select
                        id="entity-select"
                        value={entitySlug}
                        onChange={(e) => setEntitySlug(e.target.value)}
                        className="w-full px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#374151] focus:border-transparent"
                      >
                        <option value="">Sélectionnez votre organisme…</option>
                        {Object.entries(ENTITY_CONFIG).map(([slug, cfg]) => (
                          <option key={slug} value={slug}>{cfg.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Mot de passe"
                      aria-label="Mot de passe"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      aria-describedby={error ? "login-error" : undefined}
                      className="w-full px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#374151] focus:border-transparent placeholder:text-gray-400 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-lg font-semibold text-white text-sm uppercase tracking-widest transition-all disabled:opacity-60"
                    style={{ background: headerGradient }}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Connexion...
                      </span>
                    ) : (
                      "CONNEXION"
                    )}
                  </button>
                </form>
              </>
            )}
          </div>

          {/* Footer */}
          {!forgotPassword && (
            <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 text-center space-y-1">
              <p className="text-sm text-gray-500">
                Mot de passe oublié ?{" "}
                <button
                  onClick={() => { setForgotPassword(true); setError(null); }}
                  className="text-[#374151] hover:underline font-medium"
                >
                  Cliquez ici
                </button>
              </p>
              <p className="text-xs text-gray-400">
                Identifiant oublié ?{" "}
                <a
                  href="mailto:acces.prestataires@i-a-infinity.com?subject=Identifiant%20oubli%C3%A9&body=Bonjour%2C%0A%0AJe%20n%27arrive%20plus%20%C3%A0%20me%20connecter%20%C3%A0%20mon%20espace%20apprenant.%0A%0APr%C3%A9nom%20%3A%20%0ANom%20%3A%20%0AEntreprise%20%3A%20%0AFormation%20%3A%20%0A%0AMerci%20de%20me%20renvoyer%20mes%20identifiants."
                  className="text-[#374151] hover:underline"
                >
                  Contactez votre formateur
                </a>
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-white/60 text-xs mt-4">
          &copy; {new Date().getFullYear()} LMS FORMATION — Acc&egrave;s
          r&eacute;serv&eacute;
        </p>
      </div>
    </div>
  );
}
