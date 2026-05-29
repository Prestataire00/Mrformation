"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StatusUpdateConfig } from "@/lib/schemas/automation";

type Props = {
  value: Partial<StatusUpdateConfig>;
  onChange: (next: Partial<StatusUpdateConfig>) => void;
};

const STATUS_LABELS: Record<NonNullable<StatusUpdateConfig["new_status"]>, string> = {
  active: "Actif",
  qualified: "Qualifié",
  dormant: "Dormant",
  won: "Gagné",
  lost: "Perdu",
};

export function StatusUpdateConfigForm({ value, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="status-new" className="text-sm">Nouveau statut *</Label>
        <Select
          value={value.new_status ?? ""}
          onValueChange={(v) =>
            onChange({
              ...value,
              new_status: v as StatusUpdateConfig["new_status"],
            })
          }
        >
          <SelectTrigger id="status-new" className="mt-1">
            <SelectValue placeholder="Sélectionner un statut" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">
          Le statut du prospect sera mis à jour automatiquement quand le
          déclencheur se produit.
        </p>
      </div>

      <div>
        <Label htmlFor="status-reason" className="text-sm">
          Raison (loguée dans l&apos;audit, optionnel)
        </Label>
        <textarea
          id="status-reason"
          value={value.reason ?? ""}
          onChange={(e) => onChange({ ...value, reason: e.target.value })}
          placeholder="Ex : Aucune activité depuis 30 jours"
          rows={2}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        />
      </div>
    </div>
  );
}
