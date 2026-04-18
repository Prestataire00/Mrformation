"use client";

import Link from "next/link";
import { CheckCircle2, ChevronRight, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface AttentionItem {
  id: string;
  icon: LucideIcon;
  label: string;
  count: number;
  href: string;
  severity: "urgent" | "warning" | "info";
}

interface Props {
  items: AttentionItem[];
}

export function AdminAttentionPanel({ items }: Props) {
  const activeItems = items.filter(i => i.count > 0).sort((a, b) => {
    const order = { urgent: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });
  const totalCount = activeItems.reduce((s, i) => s + i.count, 0);

  if (totalCount === 0) {
    return (
      <div className="rounded-xl border bg-white p-6 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
        <p className="text-sm font-medium text-gray-800">Rien ne demande votre attention</p>
        <p className="text-xs text-muted-foreground mt-1">Tout est à jour</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white" id="attention">
      <div className="px-4 py-3 border-b bg-gray-50/50">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          Actions requises
          <span className="ml-auto text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{totalCount}</span>
        </h3>
      </div>
      <div className="divide-y">
        {activeItems.map(item => (
          <Link key={item.id} href={item.href} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition group">
            <div className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0",
              item.severity === "urgent" ? "bg-red-50 text-red-600" :
              item.severity === "warning" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
            )}>
              <item.icon className="h-4 w-4" />
            </div>
            <p className="flex-1 text-sm text-gray-800">{item.label}</p>
            <span className="text-sm font-semibold text-gray-700">{item.count}</span>
            <ChevronRight className="h-4 w-4 text-gray-400 group-hover:translate-x-0.5 transition" />
          </Link>
        ))}
      </div>
    </div>
  );
}
