"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface QuickAction {
  icon: LucideIcon;
  label: string;
  count?: number;
  href: string;
  color: "red" | "blue" | "green" | "purple" | "amber" | "gray";
  urgent?: boolean;
}

const COLOR_MAP: Record<string, string> = {
  red: "bg-red-50 text-red-600",
  blue: "bg-blue-50 text-blue-600",
  green: "bg-green-50 text-green-600",
  purple: "bg-purple-50 text-purple-600",
  amber: "bg-amber-50 text-amber-600",
  gray: "bg-gray-100 text-gray-600",
};

interface Props {
  actions: QuickAction[];
  title?: string;
}

export function QuickActionCards({ actions, title }: Props) {
  return (
    <div>
      {title && <h2 className="text-lg font-semibold text-gray-800 mb-3">{title}</h2>}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="group bg-white rounded-xl p-4 border hover:border-gray-300 hover:shadow-md transition-all"
          >
            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center mb-3", COLOR_MAP[action.color])}>
              <action.icon className="h-5 w-5" />
            </div>
            <p className="font-medium text-sm text-gray-800">{action.label}</p>
            {action.count !== undefined && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-xs text-muted-foreground">
                  {action.count} élément{action.count !== 1 ? "s" : ""}
                </p>
                {action.urgent && (
                  <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">URGENT</span>
                )}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
