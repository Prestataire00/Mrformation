"use client";

import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";

export interface PriorityItem {
  id: string;
  initials?: string;
  title: string;
  subtitle?: string;
  href?: string;
  badge?: { label: string; color: string };
}

interface Props {
  title: string;
  items: PriorityItem[];
  viewAllHref?: string;
  emptyMessage?: string;
  icon?: LucideIcon;
}

export function PriorityList({ title, items, viewAllHref, emptyMessage = "Rien pour le moment", icon: Icon }: Props) {
  return (
    <div className="bg-white rounded-xl p-4 border">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          <h3 className="font-semibold text-sm">{title}</h3>
        </div>
        {viewAllHref && (
          <Link href={viewAllHref} className="text-xs text-[#374151] hover:underline">
            Voir tout
          </Link>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">{emptyMessage}</p>
      ) : (
        <div className="space-y-1">
          {items.slice(0, 5).map(item => (
            <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition">
              {item.initials && (
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs bg-gray-100 text-gray-600">{item.initials}</AvatarFallback>
                </Avatar>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.title}</p>
                {item.subtitle && <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>}
              </div>
              {item.badge && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${item.badge.color}`}>
                  {item.badge.label}
                </span>
              )}
              {item.href && (
                <Button size="sm" variant="ghost" asChild className="h-7 w-7 p-0 shrink-0">
                  <Link href={item.href}><ChevronRight className="h-4 w-4" /></Link>
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
