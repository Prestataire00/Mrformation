"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Loader2,
  Eye,
  EyeOff,
  GraduationCap,
  Handshake,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";

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

export default function InscriptionPage() {
  return (
    <Suspense>
      <InscriptionContent />
    </Suspense>
  );
}

function InscriptionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const refCode = searchParams.get("ref") ?? "";
  const entitySlug = searchParams.get("entity") ?? "";
  const entityConfig = ENTITY_CONFIG[entitySlug];

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [referralCode, setReferralCode] = useState(refCode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const headerTitle = entityConfig ? entityConfig.name : "LMS FORMATION";
  const headerGradient = entityConfig
    ? entityConfig.gradient
    : "linear-gradient(135deg, #3DB5C5, #2BA3B3)";

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validations
    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      setLoading(false);
      return;
    }

    try {
      // 1. Create the user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
          },
        },
      });

      if (authError) {
        if (authError.message.includes("already registered")) {
          setError("Un compte avec cet email existe déjà. Veuillez vous connecter.");
        } else {
          setError(authError.message);
        }
        setLoading(false);
        return;
      }

      if (!authData.user) {
        setError("Erreur lors de la création du compte.");
        setLoading(false);
        return;
      }

      // 2. Update the profile with additional info
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          first_name: firstName,
          last_name: lastName,
          phone: phone || null,
          role: "admin", // organismes de formation = admin role
          entity_id: entitySlug
            ? (
                await supabase
                  .from("entities")
                  .select("id")
                  .eq("slug", entitySlug)
                  .single()
              ).data?.id ?? null
            : null,
        })
        .eq("id", authData.user.id);

      if (profileError) {
        console.error("Profile update error:", profileError);
      }

      // 3. Track the referral if a code was provided
      if (referralCode.trim()) {
        await fetch("/api/auth/register-referral", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            referral_code: referralCode.trim(),
            referred_user_id: authData.user.id,
            referred_name: `${firstName} ${lastName}`.trim(),
            referred_email: email,
            company_name: companyName || null,
          }),
        });
      }

      setSuccess(true);
    } catch {
      setError("Une erreur inattendue est survenue. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{
          background:
            "linear-gradient(135deg, #87CEEB 0%, #5BB8D4 50%, #3DB5C5 100%)",
        }}
      >
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div
              className="px-8 py-6 text-center"
              style={{ background: headerGradient }}
            >
              <div className="flex items-center justify-center gap-3 mb-1">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-white font-bold text-xl tracking-wide">
                  Inscription réussie !
                </h1>
              </div>
            </div>
            <div className="px-8 py-8 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-800 mb-2">
                Bienvenue chez {headerTitle} !
              </h2>
              <p className="text-sm text-gray-600 mb-2">
                Votre compte a été créé avec succès.
              </p>
              <p className="text-sm text-gray-500 mb-6">
                Vérifiez votre boîte email pour confirmer votre adresse, puis connectez-vous.
              </p>
              {referralCode && (
                <div className="bg-[#e0f5f8] border border-[#3DB5C5]/20 rounded-lg px-4 py-3 mb-6">
                  <div className="flex items-center justify-center gap-2 text-sm text-[#2a9aaa] font-medium">
                    <Handshake className="w-4 h-4" />
                    Parrainage enregistré !
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Votre parrain sera récompensé dès votre 2ème mois d&apos;abonnement.
                  </p>
                </div>
              )}
              <button
                onClick={() => router.push(`/login${entitySlug ? `?entity=${entitySlug}&role=organisme` : ""}`)}
                className="w-full py-3 rounded-lg font-semibold text-white text-sm uppercase tracking-widest transition-all"
                style={{ background: headerGradient }}
              >
                SE CONNECTER
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
              Créez votre compte
            </p>
          </div>

          {/* Formulaire */}
          <div className="px-8 py-6">
            <p className="text-gray-400 text-xs text-center uppercase tracking-widest mb-1 font-semibold">
              INSCRIPTION
            </p>
            <p className="text-gray-500 text-sm text-center mb-5">
              Remplissez vos informations pour créer votre compte.
            </p>

            {/* Referral badge */}
            {refCode && (
              <div className="bg-[#e0f5f8] border border-[#3DB5C5]/20 rounded-lg px-4 py-3 mb-5 flex items-center gap-3">
                <Handshake className="w-5 h-5 text-[#3DB5C5] shrink-0" />
                <div>
                  <p className="text-sm font-medium text-[#2a9aaa]">
                    Vous avez été parrainé !
                  </p>
                  <p className="text-xs text-gray-500">
                    Code : <span className="font-mono font-bold">{refCode}</span> — 3ème mois offert
                  </p>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleRegister} className="space-y-3">
              {/* Nom / Prénom */}
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Prénom"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5] focus:border-transparent placeholder:text-gray-400"
                />
                <input
                  type="text"
                  placeholder="Nom"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5] focus:border-transparent placeholder:text-gray-400"
                />
              </div>

              {/* Email */}
              <input
                type="email"
                placeholder="Adresse email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5] focus:border-transparent placeholder:text-gray-400"
              />

              {/* Téléphone */}
              <input
                type="tel"
                placeholder="Téléphone (optionnel)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                className="w-full px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5] focus:border-transparent placeholder:text-gray-400"
              />

              {/* Nom organisme */}
              <input
                type="text"
                placeholder="Nom de l'organisme de formation (optionnel)"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5] focus:border-transparent placeholder:text-gray-400"
              />

              {/* Mot de passe */}
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Mot de passe (min. 6 caractères)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5] focus:border-transparent placeholder:text-gray-400 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Confirm password */}
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Confirmer le mot de passe"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5] focus:border-transparent placeholder:text-gray-400"
              />

              {/* Referral code (editable if not pre-filled) */}
              {!refCode && (
                <input
                  type="text"
                  placeholder="Code de parrainage (optionnel)"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value)}
                  className="w-full px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5] focus:border-transparent placeholder:text-gray-400 font-mono"
                />
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg font-semibold text-white text-sm uppercase tracking-widest transition-all disabled:opacity-60"
                style={{ background: headerGradient }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Inscription...
                  </span>
                ) : (
                  "CRÉER MON COMPTE"
                )}
              </button>
            </form>
          </div>

          {/* Footer */}
          <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 text-center">
            <p className="text-sm text-gray-500">
              Déjà un compte ?{" "}
              <button
                onClick={() => router.push(`/login${entitySlug ? `?entity=${entitySlug}` : ""}`)}
                className="text-[#3DB5C5] hover:underline font-medium"
              >
                Se connecter
              </button>
            </p>
          </div>
        </div>

        {/* Back link */}
        <div className="text-center mt-4">
          <button
            onClick={() => router.push("/")}
            className="text-white/60 text-sm hover:text-white transition-colors flex items-center justify-center gap-1 mx-auto"
          >
            <ArrowLeft className="w-3 h-3" />
            Retour
          </button>
        </div>

        <p className="text-center text-white/60 text-xs mt-4">
          &copy; {new Date().getFullYear()} LMS FORMATION — Inscription
        </p>
      </div>
    </div>
  );
}
