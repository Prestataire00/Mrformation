"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, GraduationCap } from "lucide-react";

interface EntityOption {
  slug: string;
  name: string;
  initials: string;
  gradient: string;
  description: string;
}

const ENTITIES: EntityOption[] = [
  {
    slug: "mr-formation",
    name: "MR FORMATION",
    initials: "MR",
    gradient: "linear-gradient(135deg, #2563EB, #1D4ED8)",
    description: "Organisme de formation professionnelle",
  },
  {
    slug: "c3v-formation",
    name: "C3V FORMATION",
    initials: "C3V",
    gradient: "linear-gradient(135deg, #7C3AED, #6D28D9)",
    description: "Organisme de formation professionnelle",
  },
];

export function LandingPage() {
  const router = useRouter();
  const [selecting, setSelecting] = useState<string | null>(null);

  function handleSelect(entity: EntityOption) {
    setSelecting(entity.slug);
    router.push(`/select-role?entity=${entity.slug}`);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background:
          "linear-gradient(135deg, #87CEEB 0%, #5BB8D4 50%, #3DB5C5 100%)",
      }}
    >
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/20 mb-4">
            <GraduationCap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-white font-bold text-2xl mb-1">
            Bienvenue sur LMS FORMATION
          </h1>
          <p className="text-white/70 text-sm">
            Sélectionnez votre organisme de formation pour continuer.
          </p>
        </div>

        {/* Entity Cards */}
        <div className="grid gap-4">
          {ENTITIES.map((entity) => {
            const isSelecting = selecting === entity.slug;

            return (
              <button
                key={entity.slug}
                onClick={() => handleSelect(entity)}
                disabled={selecting !== null}
                className="group bg-white rounded-2xl shadow-xl overflow-hidden transition-all hover:shadow-2xl hover:scale-[1.02] disabled:opacity-60 disabled:pointer-events-none text-left"
              >
                <div className="flex items-center gap-4 p-5">
                  {/* Logo */}
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 text-white font-bold text-lg shadow-md"
                    style={{ background: entity.gradient }}
                  >
                    {entity.initials}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h2 className="font-bold text-gray-900 text-lg">
                      {entity.name}
                    </h2>
                    <p className="text-gray-500 text-sm">
                      {entity.description}
                    </p>
                  </div>

                  {/* Arrow / Loader */}
                  <div className="shrink-0">
                    {isSelecting ? (
                      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                    ) : (
                      <svg
                        className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors"
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
                    )}
                  </div>
                </div>

                {/* Bottom color bar */}
                <div className="h-1" style={{ background: entity.gradient }} />
              </button>
            );
          })}
        </div>

        <p className="text-center text-white/50 text-xs mt-8">
          Plateforme de gestion des formations professionnelles
        </p>
      </div>
    </div>
  );
}
