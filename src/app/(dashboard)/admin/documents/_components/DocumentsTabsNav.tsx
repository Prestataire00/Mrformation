"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutGrid, Variable, Upload, HelpCircle } from "lucide-react";

interface Tab {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: Tab[] = [
  { href: "/admin/documents", label: "Catalogue", icon: LayoutGrid },
  { href: "/admin/documents/variables", label: "Variables", icon: Variable },
  { href: "/admin/documents/import", label: "Importer", icon: Upload },
  { href: "/admin/documents/how-to", label: "Aide", icon: HelpCircle },
];

export function DocumentsTabsNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-10 bg-white border-b border-gray-200 mb-6 -mx-6 px-6">
      <div className="flex gap-1">
        {TABS.map((tab) => {
          const isActive = pathname === tab.href;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
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
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
