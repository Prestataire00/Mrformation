"use client";

import { ShieldCheck, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";

interface LearnerAccessBadgeProps {
  profileId: string | null | undefined;
  syntheticEmailUsed?: boolean;
  size?: "xs" | "sm";
  iconOnly?: boolean;
}

export function LearnerAccessBadge({
  profileId,
  syntheticEmailUsed,
  size = "xs",
  iconOnly = false,
}: LearnerAccessBadgeProps) {
  const hasAccess = !!profileId;
  const sizeClasses = size === "xs"
    ? "text-[10px] px-1.5 py-0.5 gap-1"
    : "text-xs px-2 py-0.5 gap-1.5";
  const iconSize = size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3";

  if (hasAccess) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full font-medium border",
          "bg-green-50 text-green-700 border-green-200",
          sizeClasses,
        )}
        title={syntheticEmailUsed ? "Accès créé (email synthétique)" : "Accès actif"}
      >
        <ShieldCheck className={iconSize} />
        {!iconOnly && (syntheticEmailUsed ? "Accès (sans email)" : "Accès")}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium border",
        "bg-gray-50 text-gray-500 border-gray-200",
        sizeClasses,
      )}
      title="Aucun accès plateforme créé"
    >
      <KeyRound className={iconSize} />
      {!iconOnly && "Pas d\u2019acc\u00e8s"}
    </span>
  );
}
