"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Building2 } from "lucide-react";
import type { Entity } from "@/lib/types";

function setCookie(name: string, value: string, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
}

const ENTITY_CONFIG: Record<string, { initials: string; gradient: string }> = {
  "mr-formation": {
    initials: "MR",
    gradient: "linear-gradient(135deg, #2563EB, #1D4ED8)",
  },
  "c3v-formation": {
    initials: "C3V",
    gradient: "linear-gradient(135deg, #7C3AED, #6D28D9)",
  },
};

export default function SelectEntityPage() {
  const router = useRouter();
  const supabase = createClient();

  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("entities")
        .select("*")
        .order("name");
      setEntities(data ?? []);
      setLoading(false);
    }
    load();
  }, [supabase]);

  async function handleSelect(entity: Entity) {
    setSelecting(entity.id);

    // Update profile entity_id and get role
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("profiles")
        .update({ entity_id: entity.id })
        .eq("id", user.id);

      // Set user_role cookie for RBAC middleware
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (profile?.role) {
        setCookie("user_role", profile.role, 30);
      }
    }

    // Set cookie for server-side access
    setCookie("entity_id", entity.id);

    router.push("/");
    router.refresh();
  }

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background: "linear-gradient(135deg, #87CEEB 0%, #5BB8D4 50%, #3DB5C5 100%)",
        }}
      >
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: "linear-gradient(135deg, #87CEEB 0%, #5BB8D4 50%, #3DB5C5 100%)",
      }}
    >
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/20 mb-4">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-white font-bold text-2xl mb-1">Choisissez votre entité</h1>
          <p className="text-white/70 text-sm">
            Sélectionnez l&apos;organisme de formation avec lequel vous souhaitez travailler.
          </p>
        </div>

        {/* Entity Cards */}
        <div className="grid gap-4">
          {entities.map((entity) => {
            const config = ENTITY_CONFIG[entity.slug] ?? {
              initials: entity.name.charAt(0),
              gradient: `linear-gradient(135deg, ${entity.theme_color}, ${entity.theme_color})`,
            };
            const isSelecting = selecting === entity.id;

            return (
              <button
                key={entity.id}
                onClick={() => handleSelect(entity)}
                disabled={selecting !== null}
                className="group bg-white rounded-2xl shadow-xl overflow-hidden transition-all hover:shadow-2xl hover:scale-[1.02] disabled:opacity-60 disabled:pointer-events-none text-left"
              >
                <div className="flex items-center gap-4 p-5">
                  {/* Logo */}
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 text-white font-bold text-lg shadow-md"
                    style={{ background: config.gradient }}
                  >
                    {config.initials}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h2 className="font-bold text-gray-900 text-lg">{entity.name}</h2>
                    <p className="text-gray-500 text-sm">Organisme de formation</p>
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
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </div>
                </div>

                {/* Bottom color bar */}
                <div className="h-1" style={{ background: config.gradient }} />
              </button>
            );
          })}
        </div>

        <p className="text-center text-white/50 text-xs mt-8">
          Vous pourrez changer d&apos;entité à tout moment depuis le tableau de bord.
        </p>
      </div>
    </div>
  );
}
