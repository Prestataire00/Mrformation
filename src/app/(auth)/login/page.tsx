"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Eye, EyeOff, GraduationCap } from "lucide-react";

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
}

const ENTITY_CONFIG: Record<string, { name: string; gradient: string }> = {
  "mr-formation": {
    name: "MR FORMATION",
    gradient: "linear-gradient(135deg, #2563EB, #1D4ED8)",
  },
  "c3v-formation": {
    name: "C3V FORMATION",
    gradient: "linear-gradient(135deg, #7C3AED, #6D28D9)",
  },
};

const ROLE_LABELS: Record<string, string> = {
  organisme: "Organisme de formation",
  learner: "Apprenant",
  company: "Entreprise",
  trainer: "Formateur",
  admin: "Administrateur",
  commercial: "Commercial",
};

// Map UI role keys to the DB roles they correspond to
const ROLE_KEY_TO_DB_ROLE: Record<string, string> = {
  organisme: "super_admin",
  learner: "learner",
  company: "client",
  trainer: "trainer",
  admin: "admin",
  commercial: "commercial",
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

  const entitySlug = searchParams.get("entity") ?? "";
  const roleKey = searchParams.get("role") ?? "";
  const entityConfig = ENTITY_CONFIG[entitySlug];
  const roleLabel = ROLE_LABELS[roleKey];

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

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("Email ou mot de passe incorrect.");
      setLoading(false);
      return;
    }

    // Fetch user profile to get role and set cookie
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role) {
        // If a role was selected on select-role page, verify it matches
        const expectedDbRole = roleKey ? ROLE_KEY_TO_DB_ROLE[roleKey] : null;

        if (expectedDbRole && profile.role !== expectedDbRole) {
          // Role mismatch — sign out and show error
          await supabase.auth.signOut();
          const expectedLabel = ROLE_LABELS[roleKey] || roleKey;
          const DB_ROLE_LABELS: Record<string, string> = {
            super_admin: "Organisme de formation",
            admin: "Administrateur",
            commercial: "Commercial",
            learner: "Apprenant",
            client: "Entreprise",
            trainer: "Formateur",
          };
          const actualRoleName = DB_ROLE_LABELS[profile.role] || profile.role;
          setError(
            `Ce compte est associé au profil "${actualRoleName}". Vous ne pouvez pas vous connecter en tant que "${expectedLabel}". Veuillez sélectionner le bon profil.`
          );
          setLoading(false);
          return;
        }

        setCookie("user_role", profile.role, 30);
      }
    }

    // If entity was selected from landing page but no cookie yet, set it now
    if (entitySlug && !getCookie("entity_id")) {
      // Look up the entity ID by slug
      const { data: entity } = await supabase
        .from("entities")
        .select("id")
        .eq("slug", entitySlug)
        .single();

      if (entity) {
        setCookie("entity_id", entity.id);

        // Also update the profile entity_id
        if (user) {
          await supabase
            .from("profiles")
            .update({ entity_id: entity.id })
            .eq("id", user.id);
        }
      }
    }

    // Redirect to root which handles role-based routing
    router.push("/");
    router.refresh();
  }

  const headerTitle = entityConfig
    ? entityConfig.name
    : "LMS FORMATION";
  const headerGradient = entityConfig
    ? entityConfig.gradient
    : "linear-gradient(135deg, #3DB5C5, #2BA3B3)";

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background:
          "linear-gradient(135deg, #87CEEB 0%, #5BB8D4 50%, #3DB5C5 100%)",
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
                      className="w-full px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5] focus:border-transparent placeholder:text-gray-400"
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
                  className="w-full text-center text-sm text-[#3DB5C5] hover:underline font-medium mt-4"
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
                  {roleLabel
                    ? `Connexion ${roleLabel}`
                    : "Veuillez remplir vos identifiants pour vous connecter."}
                </p>

                {error && (
                  <div id="login-error" role="alert" className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm mb-4">
                    {error}
                  </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                  <input
                    type="email"
                    placeholder="Adresse email"
                    aria-label="Adresse email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    aria-describedby={error ? "login-error" : undefined}
                    className="w-full px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5] focus:border-transparent placeholder:text-gray-400"
                  />

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
                      className="w-full px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5] focus:border-transparent placeholder:text-gray-400 pr-10"
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
                  className="text-[#3DB5C5] hover:underline font-medium"
                >
                  Cliquez ici
                </button>
              </p>
              <p className="text-sm text-gray-500">
                Pas encore de compte ?{" "}
                <button
                  onClick={() => router.push(`/inscription${entitySlug ? `?entity=${entitySlug}` : ""}`)}
                  className="text-[#3DB5C5] hover:underline font-medium"
                >
                  S&apos;inscrire
                </button>
              </p>
            </div>
          )}
        </div>

        {/* Back link */}
        <div className="text-center mt-4">
          <button
            onClick={() =>
              router.push(
                entitySlug ? `/select-role?entity=${entitySlug}` : "/"
              )
            }
            className="text-white/60 text-sm hover:text-white transition-colors"
          >
            &larr; Retour
          </button>
        </div>

        <p className="text-center text-white/60 text-xs mt-4">
          &copy; {new Date().getFullYear()} LMS FORMATION — Acc&egrave;s
          r&eacute;serv&eacute;
        </p>
      </div>
    </div>
  );
}
