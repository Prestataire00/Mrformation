"use client";

/**
 * Story aut-b-2 — <DomainToggle> : toggle Formations / CRM en haut de page.
 *
 * UX-DR-AUT-4 : toggle 2 univers en haut de page (pas tab interne).
 * Navigation Link vers /admin/automation ou /admin/crm/automations.
 *
 * Affiche les compteurs d'activation par univers (passés en props pour
 * éviter de coupler à des stores).
 */

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Settings, Briefcase } from "lucide-react";

type Props = {
  activeDomain: "formation" | "crm";
  formationsActiveCount?: number;
  crmActiveCount?: number;
};

export function DomainToggle({
  activeDomain,
  formationsActiveCount,
  crmActiveCount,
}: Props) {
  return (
    <div
      className="inline-flex items-center gap-2 p-1 rounded-lg bg-muted/40 border"
      role="tablist"
      aria-label="Choisir l'univers d'automatisations"
    >
      <Link
        href="/admin/automation"
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors",
          activeDomain === "formation"
            ? "bg-white shadow-sm font-semibold text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        role="tab"
        aria-selected={activeDomain === "formation"}
      >
        <Settings className="h-4 w-4" />
        <span>Formations</span>
        {formationsActiveCount !== undefined && (
          <span className="text-xs text-muted-foreground font-normal">
            ({formationsActiveCount} actives)
          </span>
        )}
      </Link>
      <Link
        href="/admin/crm/automations"
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors",
          activeDomain === "crm"
            ? "bg-white shadow-sm font-semibold text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        role="tab"
        aria-selected={activeDomain === "crm"}
      >
        <Briefcase className="h-4 w-4" />
        <span>CRM</span>
        {crmActiveCount !== undefined && (
          <span className="text-xs text-muted-foreground font-normal">
            ({crmActiveCount} actives)
          </span>
        )}
      </Link>
    </div>
  );
}
