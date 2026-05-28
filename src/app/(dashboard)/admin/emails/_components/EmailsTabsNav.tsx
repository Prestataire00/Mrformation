"use client";

import { cn } from "@/lib/utils";
import { LayoutGrid, Inbox, Cog, Archive } from "lucide-react";

export type EmailsTab = "templates" | "history" | "automations" | "archived";

interface Tab {
  key: EmailsTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: Tab[] = [
  { key: "templates", label: "Modèles", icon: LayoutGrid },
  { key: "history", label: "Historique", icon: Inbox },
  { key: "automations", label: "Automatisations", icon: Cog },
  { key: "archived", label: "Archivés", icon: Archive },
];

export interface EmailsTabsNavProps {
  activeTab: EmailsTab;
  onTabChange: (tab: EmailsTab) => void;
  /** Badge count optionnel sur "Historique" (emails en échec récents) */
  historyFailedCount?: number;
  /** Badge count optionnel sur "Archivés" (nombre de templates archivés) */
  archivedCount?: number;
}

export function EmailsTabsNav({
  activeTab,
  onTabChange,
  historyFailedCount = 0,
  archivedCount = 0,
}: EmailsTabsNavProps) {
  return (
    <nav
      className="sticky top-0 z-10 bg-white border-b border-gray-200 mb-6 -mx-6 px-6"
      aria-label="Navigation des sections emails"
    >
      <div className="flex gap-1">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          const badge =
            (tab.key === "history" && historyFailedCount > 0
              ? historyFailedCount
              : null) ??
            (tab.key === "archived" && archivedCount > 0 ? archivedCount : null);

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                isActive
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {badge !== null && (
                <span
                  className={cn(
                    "inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none min-w-[18px]",
                    tab.key === "history"
                      ? "bg-orange-100 text-orange-700"
                      : "bg-gray-100 text-gray-700",
                  )}
                  aria-label={`${badge} ${tab.key === "history" ? "emails en échec" : "templates archivés"}`}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
