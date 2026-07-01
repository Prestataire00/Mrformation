"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const VIEWS = [
  { href: "/admin/crm/prospects", label: "Kanban" },
  { href: "/admin/crm/prospects/liste", label: "Liste" },
  { href: "/admin/crm/prospects/portfolio", label: "Portefeuille" },
];

export function ProspectsViewTabs() {
  const pathname = usePathname();
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border bg-gray-50 p-1">
      {VIEWS.map((v) => {
        const active = pathname === v.href;
        return (
          <Link
            key={v.href}
            href={v.href}
            className={cn(
              "px-3 py-1.5 text-sm rounded-md transition-colors",
              active ? "bg-white shadow-sm font-medium text-gray-900" : "text-gray-500 hover:text-gray-700",
            )}
          >
            {v.label}
          </Link>
        );
      })}
    </div>
  );
}
