"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  GraduationCap,
  UserCheck,
  Settings,
  TrendingUp,
  Loader2,
} from "lucide-react";

interface RoleOption {
  key: string;
  label: string;
  subtitle?: string;
  description: string;
  icon: React.ElementType;
  gradient: string;
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    key: "organisme",
    label: "Organisme de formation",
    subtitle: "Formateur indépendant",
    description: "Gérez votre organisme de formation",
    icon: Building2,
    gradient: "linear-gradient(135deg, #3B82F6, #2563EB)",
  },
  {
    key: "learner",
    label: "Apprenant",
    description: "Accédez à vos formations et suivez votre progression",
    icon: GraduationCap,
    gradient: "linear-gradient(135deg, #10B981, #059669)",
  },
  {
    key: "company",
    label: "Entreprise",
    description: "Suivez les formations de vos collaborateurs",
    icon: Building2,
    gradient: "linear-gradient(135deg, #F59E0B, #D97706)",
  },
  {
    key: "trainer",
    label: "Formateur",
    description: "Consultez vos sessions et vos apprenants",
    icon: UserCheck,
    gradient: "linear-gradient(135deg, #8B5CF6, #7C3AED)",
  },
  {
    key: "admin",
    label: "Administrateur",
    description: "Gérez la plateforme et les utilisateurs",
    icon: Settings,
    gradient: "linear-gradient(135deg, #EF4444, #DC2626)",
  },
  {
    key: "commercial",
    label: "Commercial",
    description: "Gérez les prospects et les devis",
    icon: TrendingUp,
    gradient: "linear-gradient(135deg, #EC4899, #DB2777)",
  },
];

export default function SelectRolePage() {
  return (
    <Suspense>
      <SelectRoleContent />
    </Suspense>
  );
}

function SelectRoleContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const entity = searchParams.get("entity") ?? "";
  const [selecting, setSelecting] = useState<string | null>(null);

  function handleSelect(role: RoleOption) {
    setSelecting(role.key);
    router.push(`/login?entity=${entity}&role=${role.key}`);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background:
          "linear-gradient(135deg, #FCA5A5 0%, #EF4444 50%, #DC2626 100%)",
      }}
    >
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-white font-bold text-2xl mb-1">
            Quel est votre profil ?
          </h1>
          <p className="text-white/70 text-sm">
            Sélectionnez votre rôle pour accéder à votre espace.
          </p>
        </div>

        {/* Role Cards - 2x3 grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ROLE_OPTIONS.map((role) => {
            const Icon = role.icon;
            const isSelecting = selecting === role.key;

            return (
              <button
                key={role.key}
                onClick={() => handleSelect(role)}
                disabled={selecting !== null}
                className="group bg-white rounded-2xl shadow-lg overflow-hidden transition-all hover:shadow-2xl hover:scale-[1.02] disabled:opacity-60 disabled:pointer-events-none text-left"
              >
                <div className="flex items-center gap-4 p-5">
                  {/* Icon */}
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-white shadow-md"
                    style={{ background: role.gradient }}
                  >
                    {isSelecting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h2 className="font-bold text-gray-900 text-base">
                      {role.label}
                    </h2>
                    {role.subtitle && (
                      <p className="text-gray-600 text-xs font-medium">
                        {role.subtitle}
                      </p>
                    )}
                    <p className="text-gray-400 text-xs mt-0.5">
                      {role.description}
                    </p>
                  </div>

                  {/* Arrow */}
                  <svg
                    className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </button>
            );
          })}
        </div>

        {/* Back link */}
        <div className="text-center mt-6">
          <button
            onClick={() => router.push("/")}
            className="text-white/60 text-sm hover:text-white transition-colors"
          >
            &larr; Changer d&apos;organisme
          </button>
        </div>
      </div>
    </div>
  );
}
