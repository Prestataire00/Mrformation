"use client";

import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User, Search, ChevronRight, Building2, Check, ChevronsUpDown } from "lucide-react";
import { NotificationPanel } from "@/components/layout/NotificationPanel";
import { getInitials, ROLE_LABELS } from "@/lib/utils";
import type { Profile, Entity } from "@/lib/types";

// Breadcrumb labels basés sur les paths
const BREADCRUMB_MAP: Record<string, string> = {
  admin: "Tableau de Bord",
  clients: "Clients & Financeurs",
  apprenants: "Profils des Apprenants",
  liste: "Tous les Apprenants",
  financeurs: "Tous les Financeurs",
  trainers: "Formateurs",
  trainings: "Formations",
  sessions: "Sessions",
  programs: "Bibliothèque",
  questionnaires: "Évaluations & Questionnaires",
  documents: "Documents",
  emails: "Emails",
  signatures: "Signatures",
  reports: "Suivis & Rapports",
  crm: "CRM",
  prospects: "Tunnel de Vente",
  tasks: "Tâches",
  quotes: "Devis",
  campaigns: "Campagnes",
  lieux: "Lieux",
  support: "Support",
  elearning: "E-Learning",
  bpf: "Bilan Pédagogique et Financier",
};

// Context-aware labels for segments that appear under different parents
const CONTEXT_LABELS: Record<string, Record<string, string>> = {
  liste: {
    prospects: "Tous les Prospects",
    apprenants: "Tous les Apprenants",
  },
};

function useBreadcrumb() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);

  const crumbs: { label: string; href: string }[] = [];
  let currentPath = "";

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    currentPath += `/${part}`;

    // Check context-aware labels first
    const contextMap = CONTEXT_LABELS[part];
    if (contextMap) {
      const prevPart = parts[i - 1];
      const label = (prevPart && contextMap[prevPart]) || BREADCRUMB_MAP[part];
      if (label) {
        crumbs.push({ label, href: currentPath });
      }
    } else {
      const label = BREADCRUMB_MAP[part];
      if (label) {
        crumbs.push({ label, href: currentPath });
      }
    }
  }

  return crumbs;
}

const ENTITY_COLORS: Record<string, string> = {
  "mr-formation": "#374151",
  "c3v-formation": "#2563EB",
};

interface HeaderProps {
  profile: Profile | null;
  entity: Entity | null;
}

export function Header({ profile, entity }: HeaderProps) {
  const router = useRouter();
  const supabase = createClient();
  const breadcrumbs = useBreadcrumb();
  const { entities, setEntity } = useEntity();

  async function handleLogout() {
    // Clear entity cookie
    document.cookie = "entity_id=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  function handleSwitchEntity(newEntity: Entity) {
    if (newEntity.id === entity?.id) return;
    setEntity(newEntity);
  }

  const fullName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Utilisateur";
  const initials = getInitials(profile?.first_name, profile?.last_name);
  const roleLabel = profile?.role ? ROLE_LABELS[profile.role] : "";
  const entityColor = entity?.slug ? ENTITY_COLORS[entity.slug] ?? entity.theme_color : "#374151";

  return (
    <header className="h-14 flex items-center px-5 gap-4 shrink-0" style={{ background: "#374151" }}>
      {/* Entity Switcher separator */}

      {/* Entity Switcher */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="Changer d'entité"
            aria-haspopup="true"
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 bg-white/20 hover:bg-white/30 transition-colors focus:outline-none"
          >
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0 bg-white"
            />
            <span className="text-xs font-semibold text-white max-w-[120px] truncate">
              {entity?.name ?? "Entité"}
            </span>
            <ChevronsUpDown className="w-3 h-3 text-white/70" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            Changer d&apos;entité
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {entities.map((e) => {
            const color = ENTITY_COLORS[e.slug] ?? e.theme_color;
            const isActive = e.id === entity?.id;
            return (
              <DropdownMenuItem
                key={e.id}
                onClick={() => handleSwitchEntity(e)}
                className="flex items-center gap-2.5 cursor-pointer"
              >
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="flex-1 text-sm">{e.name}</span>
                {isActive && <Check className="w-4 h-4 text-primary" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="w-px h-6 bg-white/30" />

      {/* Breadcrumb */}
      <div className="flex-1 flex items-center gap-1.5 text-sm">
        {breadcrumbs.map((crumb, index) => (
          <span key={crumb.href} className="flex items-center gap-1.5">
            {index > 0 && <ChevronRight className="w-3.5 h-3.5 text-white/50" />}
            <span className={index === breadcrumbs.length - 1 ? "font-semibold text-white" : "text-white/70"}>
              {crumb.label}
            </span>
          </span>
        ))}
      </div>

      {/* Search */}
      <div role="search" aria-label="Recherche globale" className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-white/20 rounded-lg text-sm text-white/80 w-52">
        <Search className="w-3.5 h-3.5" />
        <span className="text-xs">Rechercher...</span>
      </div>

      {/* Notifications */}
      <NotificationPanel />

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="Menu utilisateur"
            aria-haspopup="true"
            className="flex items-center gap-2.5 rounded-lg px-2 py-1 hover:bg-white/20 transition-colors focus:outline-none"
          >
            <Avatar className="h-7 w-7">
              <AvatarImage src={profile?.avatar_url || undefined} alt={fullName} />
              <AvatarFallback className="text-white text-xs font-bold bg-white/30">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="hidden md:flex flex-col items-start">
              <span className="text-xs font-semibold leading-none text-white">{fullName}</span>
              <span className="text-[10px] text-white/70 mt-0.5">{roleLabel}</span>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>
            <div>
              <p className="font-semibold text-sm">{fullName}</p>
              <p className="text-xs text-muted-foreground font-normal">{profile?.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => {
            const role = profile?.role ?? "admin";
            router.push(`/${role}/profile`);
          }}>
            <User className="mr-2 h-4 w-4" />
            Mon Profil
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600">
            <LogOut className="mr-2 h-4 w-4" />
            Déconnexion
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
