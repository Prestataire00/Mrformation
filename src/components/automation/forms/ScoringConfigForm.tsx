"use client";

import { Info } from "lucide-react";
import type { ScoringConfig } from "@/lib/schemas/automation";

type Props = {
  value: Partial<ScoringConfig>;
  onChange: (next: Partial<ScoringConfig>) => void;
};

export function ScoringConfigForm({ value }: Props) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 flex items-start gap-2">
        <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-900 space-y-1">
          <p className="font-medium">Recalcul automatique des scores prospects.</p>
          <p>
            Cette action déclenche le recalcul des scores selon les critères
            configurés dans <code className="rounded bg-white/50 px-1">/admin/crm/scoring</code>.
            La configuration fine des poids par critère est différée à V2.
          </p>
          <p className="italic">
            Pour V1, cocher cette action active simplement le recalcul périodique.
          </p>
        </div>
      </div>

      {/* Champ caché : on stocke un weights vide par défaut (V2 ajoutera l'UI) */}
      <input
        type="hidden"
        value={JSON.stringify(value.weights ?? {})}
        readOnly
      />
    </div>
  );
}
