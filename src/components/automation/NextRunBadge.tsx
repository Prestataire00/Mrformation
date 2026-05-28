"use client";

/**
 * Story aut-b-2 — <NextRunBadge> : affiche le "▶ Prochain déclenchement"
 * en langage naturel pour une règle (UX-DR-AUT-5).
 *
 * Reçoit un NextRunInfo (déjà calculé côté serveur via aut-a-6) et le
 * formate visuellement :
 * - "Ce soir 7h" / "Demain 7h" → bleu gras (imminent)
 * - "Vendredi 7h" / "Le 27 juin" → bleu (planifié)
 * - "Pas applicable…" / "Aucun cas en attente" → gris italic
 * - "Désactivée" → gris barré
 * - "Évalué à chaque événement" → gris (event-driven)
 *
 * NFR-AUT-A11Y-3 : aria-label complet pour screen readers
 */

import { cn } from "@/lib/utils";
import type { NextRunInfo } from "@/lib/automation/next-run-natural-language";

type Props = {
  info: NextRunInfo | undefined;
  loading?: boolean;
  className?: string;
};

export function NextRunBadge({ info, loading, className }: Props) {
  if (loading) {
    return (
      <span className={cn("text-xs text-muted-foreground italic", className)}>
        ▶ Calcul…
      </span>
    );
  }

  if (!info) {
    return null;
  }

  const isImminent =
    info.natural_language === "Ce soir 7h" ||
    info.natural_language === "Demain 7h";

  const isDisabled = info.natural_language === "Désactivée";
  const isNotApplicable =
    info.natural_language.startsWith("Pas applicable") ||
    info.natural_language === "Aucun cas en attente" ||
    info.natural_language === "Évalué à chaque événement";

  return (
    <span
      className={cn(
        "text-xs inline-flex items-center gap-1",
        isImminent && "text-blue-700 font-semibold",
        !isImminent && !isDisabled && !isNotApplicable && "text-blue-600",
        isDisabled && "text-muted-foreground line-through",
        isNotApplicable && "text-muted-foreground italic",
        className,
      )}
      aria-label={`Prochain déclenchement : ${info.natural_language}${
        info.applicable_count > 0
          ? `, ${info.applicable_count} cible${info.applicable_count > 1 ? "s" : ""} concernée${info.applicable_count > 1 ? "s" : ""}`
          : ""
      }`}
    >
      <span aria-hidden>▶</span>
      {info.natural_language}
      {info.applicable_count > 0 && (
        <span className="text-muted-foreground font-normal">
          ({info.applicable_count})
        </span>
      )}
    </span>
  );
}
