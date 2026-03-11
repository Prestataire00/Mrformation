"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Eye, EyeOff, GraduationCap } from "lucide-react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError("Une erreur est survenue. Le lien a peut-être expiré. Veuillez réessayer.");
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);

    // Redirect to login after 3 seconds
    setTimeout(() => {
      router.push("/login");
    }, 3000);
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
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div
            className="px-8 py-6 text-center"
            style={{ background: "linear-gradient(135deg, #3DB5C5, #2BA3B3)" }}
          >
            <div className="flex items-center justify-center gap-3 mb-1">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-white font-bold text-xl tracking-wide">
                LMS FORMATION
              </h1>
            </div>
            <p className="text-white/80 text-sm">
              Réinitialisation du mot de passe
            </p>
          </div>

          <div className="px-8 py-8">
            <p className="text-gray-400 text-xs text-center uppercase tracking-widest mb-1 font-semibold">
              NOUVEAU MOT DE PASSE
            </p>
            <p className="text-gray-500 text-sm text-center mb-6">
              Saisissez votre nouveau mot de passe.
            </p>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm mb-4">
                {error}
              </div>
            )}

            {success ? (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                Mot de passe modifié avec succès ! Redirection vers la page de connexion...
              </div>
            ) : (
              <form onSubmit={handleReset} className="space-y-4">
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Nouveau mot de passe"
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

                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Confirmer le mot de passe"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5] focus:border-transparent placeholder:text-gray-400"
                />

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-lg font-semibold text-white text-sm uppercase tracking-widest transition-all disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #3DB5C5, #2BA3B3)" }}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Modification...
                    </span>
                  ) : (
                    "MODIFIER LE MOT DE PASSE"
                  )}
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="text-center mt-4">
          <button
            onClick={() => router.push("/login")}
            className="text-white/60 text-sm hover:text-white transition-colors"
          >
            &larr; Retour à la connexion
          </button>
        </div>
      </div>
    </div>
  );
}
