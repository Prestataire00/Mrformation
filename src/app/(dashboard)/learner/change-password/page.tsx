"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2, KeyRound, Sparkles } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

/**
 * Pédagogie V2 Epic 2.5 — Page de changement de mot de passe forcé.
 *
 * Affichée quand `user.user_metadata.password_must_change === true` :
 * le middleware redirige toute autre route vers ici. L'apprenant ne peut
 * pas accéder aux autres pages tant qu'il n'a pas changé son temp_password.
 *
 * Règles : ≥ 12 caractères, ≥ 1 maj, ≥ 1 chiffre, ≥ 1 spécial.
 * (zxcvbn pas inclus en V1 pour éviter une dep ~400KB ; règles simples
 * couvrent 90% des cas. À ajouter en V2 si demande.)
 */

const PasswordSchema = z
  .object({
    password: z
      .string()
      .min(12, "Au moins 12 caractères")
      .regex(/[A-Z]/, "Au moins une majuscule")
      .regex(/[0-9]/, "Au moins un chiffre")
      .regex(/[^A-Za-z0-9]/, "Au moins un caractère spécial"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    path: ["confirm"],
    message: "Les deux mots de passe ne correspondent pas",
  });

type FormValues = z.infer<typeof PasswordSchema>;

function generateStrongPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!#$%&*+=?@^";
  const all = upper + lower + digits + special;
  // 16 chars + au moins 1 par classe.
  const required = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];
  const rest = Array.from({ length: 12 }, () =>
    all[Math.floor(Math.random() * all.length)],
  );
  return [...required, ...rest]
    .sort(() => Math.random() - 0.5)
    .join("");
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(PasswordSchema),
    mode: "onChange",
    defaultValues: { password: "", confirm: "" },
  });

  const pwd = watch("password");

  function handleGenerate() {
    const fresh = generateStrongPassword();
    setValue("password", fresh, { shouldValidate: true });
    setValue("confirm", fresh, { shouldValidate: true });
    setShowPwd(true);
    toast({
      title: "Mot de passe généré",
      description:
        "Copiez-le dans votre gestionnaire avant de valider.",
    });
  }

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/learner/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: values.password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        toast({
          title: "Erreur",
          description:
            data.error === "weak_password"
              ? "Mot de passe trop faible."
              : "Impossible de changer le mot de passe. Réessayez.",
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }
      toast({
        title: "Mot de passe mis à jour",
        description: "Redirection en cours…",
      });
      // refresh pour que le middleware relise la session sans
      // password_must_change=true.
      router.refresh();
      setTimeout(() => router.push("/learner"), 500);
    } catch {
      toast({
        title: "Erreur réseau",
        description: "Réessayez.",
        variant: "destructive",
      });
      setSubmitting(false);
    }
  }

  // Score visuel : 0..4 selon classes/critères remplis.
  const score = (() => {
    if (!pwd) return 0;
    let s = 0;
    if (pwd.length >= 12) s++;
    if (/[A-Z]/.test(pwd)) s++;
    if (/[0-9]/.test(pwd)) s++;
    if (/[^A-Za-z0-9]/.test(pwd)) s++;
    return s;
  })();
  const scoreColors = [
    "bg-gray-200",
    "bg-red-400",
    "bg-orange-400",
    "bg-yellow-400",
    "bg-green-500",
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-100 to-gray-200">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="px-6 py-5 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          <div className="flex items-center gap-3">
            <KeyRound className="w-6 h-6" />
            <h1 className="font-bold text-lg">
              Changement de mot de passe requis
            </h1>
          </div>
          <p className="text-sm text-white/80 mt-1">
            Pour votre sécurité, vous devez choisir un nouveau mot de passe
            avant d&apos;accéder à votre espace.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">
              Nouveau mot de passe
            </label>
            <div className="relative mt-1">
              <input
                type={showPwd ? "text" : "password"}
                autoComplete="new-password"
                aria-label="Nouveau mot de passe"
                {...register("password")}
                className="w-full px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPwd((s) => !s)}
                aria-label={
                  showPwd ? "Masquer le mot de passe" : "Afficher le mot de passe"
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPwd ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            <div className="flex gap-1 mt-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded ${i <= score ? scoreColors[score] : "bg-gray-200"}`}
                />
              ))}
            </div>
            {errors.password && (
              <p className="text-red-600 text-xs mt-1">
                {errors.password.message}
              </p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              12 caractères min., 1 majuscule, 1 chiffre, 1 spécial.
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">
              Confirmer le mot de passe
            </label>
            <input
              type={showPwd ? "text" : "password"}
              autoComplete="new-password"
              aria-label="Confirmer le mot de passe"
              {...register("confirm")}
              className="w-full mt-1 px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.confirm && (
              <p className="text-red-600 text-xs mt-1">
                {errors.confirm.message}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Sparkles className="w-4 h-4" />
            Générer un mot de passe sûr
          </button>

          <button
            type="submit"
            disabled={!isValid || submitting}
            className="w-full py-3 rounded-lg font-semibold text-white text-sm uppercase tracking-wide bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Mise à jour…
              </span>
            ) : (
              "Mettre à jour mon mot de passe"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
