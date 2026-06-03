"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutGrid, Table2, FileSearch } from "lucide-react";

/**
 * Lot E audit BMAD — Switcher de vues unifié pour les 3 pages formateurs
 * (Hub Cards / Tableau dense / CV-thèque). Donne une UX cohérente :
 * Loris voit les mêmes 3 onglets quel que soit l'écran formateur.
 *
 * Chaque vue garde sa route propre pour ne pas casser les URLs externes
 * et le pattern "1 route = 1 use case". L'unification est visuelle via
 * ce composant placé en haut des 3 pages.
 *
 * Étape 1 (cette PR) : nav visuelle commune.
 * Étape 2 (si besoin futur) : fusion physique en 1 seul composant Tabs
 *   avec render conditionnel des 3 vues — refactor plus lourd.
 */

const VIEWS = [
  {
    href: "/admin/trainers",
    label: "Cards",
    description: "Vue cartes avec recherche IA et actions rapides",
    icon: LayoutGrid,
  },
  {
    href: "/admin/trainers/liste",
    label: "Tableau",
    description: "Vue tableau dense paginée",
    icon: Table2,
  },
  {
    href: "/admin/trainers/cvtheque",
    label: "CV-thèque",
    description: "Recherche dans les CV + compétences",
    icon: FileSearch,
  },
];

export function TrainersViewSwitcher() {
  const pathname = usePathname();

  return (
    <nav
      className="inline-flex items-center gap-0.5 p-1 bg-gray-100 rounded-lg border border-gray-200"
      aria-label="Vues formateurs"
    >
      {VIEWS.map((view) => {
        const isActive = pathname === view.href;
        const Icon = view.icon;
        return (
          <Link
            key={view.href}
            href={view.href}
            title={view.description}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              isActive
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900 hover:bg-white/50",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {view.label}
          </Link>
        );
      })}
    </nav>
  );
}
