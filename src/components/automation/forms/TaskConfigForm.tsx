"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TaskConfig } from "@/lib/schemas/automation";

type Props = {
  value: Partial<TaskConfig>;
  onChange: (next: Partial<TaskConfig>) => void;
};

export function TaskConfigForm({ value, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="task-title" className="text-sm">Titre de la tâche *</Label>
        <Input
          id="task-title"
          value={value.title ?? ""}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
          placeholder="Ex : Relancer {{prospect_name}}"
          className="mt-1"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Les variables {`{{prospect_name}}, {{quote_reference}}`} seront résolues à
          l&apos;exécution.
        </p>
      </div>

      <div>
        <Label htmlFor="task-description" className="text-sm">
          Description (optionnel)
        </Label>
        <textarea
          id="task-description"
          value={value.description ?? ""}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          placeholder="Note ou contexte additionnel"
          rows={2}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="task-due" className="text-sm">Échéance</Label>
          <Select
            value={String(value.due_in_days ?? 3)}
            onValueChange={(v) =>
              onChange({ ...value, due_in_days: Number(v) })
            }
          >
            <SelectTrigger id="task-due" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Aujourd&apos;hui</SelectItem>
              <SelectItem value="1">Dans 1 jour</SelectItem>
              <SelectItem value="3">Dans 3 jours</SelectItem>
              <SelectItem value="7">Dans 7 jours</SelectItem>
              <SelectItem value="14">Dans 14 jours</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="task-priority" className="text-sm">Priorité</Label>
          <Select
            value={value.priority ?? "normal"}
            onValueChange={(v) =>
              onChange({ ...value, priority: v as "low" | "normal" | "high" })
            }
          >
            <SelectTrigger id="task-priority" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Basse</SelectItem>
              <SelectItem value="normal">Normale</SelectItem>
              <SelectItem value="high">Haute</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="task-assignee" className="text-sm">Assigner à</Label>
        <Select
          value={value.assignee ?? "auto"}
          onValueChange={(v) =>
            onChange({
              ...value,
              assignee: v as "auto" | "owner" | "specific",
            })
          }
        >
          <SelectTrigger id="task-assignee" className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto (responsable du prospect)</SelectItem>
            <SelectItem value="owner">Propriétaire de la règle</SelectItem>
            <SelectItem value="specific">Utilisateur spécifique (V2)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
