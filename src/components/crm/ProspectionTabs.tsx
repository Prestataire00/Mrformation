"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const MODULES = [
  { href: "/admin/crm/campaigns", label: "Campagnes", hint: "Un envoi email unique à un segment de contacts." },
  { href: "/admin/crm/sequences", label: "Séquences", hint: "Une suite de relances automatiques espacées dans le temps." },
  { href: "/admin/crm/automations", label: "Automatisations", hint: "Des actions déclenchées par un événement (ex. prospect gagné)." },
];

export function ProspectionTabs() {
  const pathname = usePathname();
  const current = MODULES.find((m) => m.href === pathname);
  return (
    <div className="space-y-1.5">
      <div className="inline-flex items-center gap-1 rounded-lg border bg-gray-50 p-1">
        {MODULES.map((m) => {
          const active = pathname === m.href;
          return (
            <Link
              key={m.href}
              href={m.href}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md transition-colors",
                active ? "bg-white shadow-sm font-medium text-gray-900" : "text-gray-500 hover:text-gray-700",
              )}
            >
              {m.label}
            </Link>
          );
        })}
      </div>
      {current && <p className="text-sm text-muted-foreground">{current.hint}</p>}
    </div>
  );
}
