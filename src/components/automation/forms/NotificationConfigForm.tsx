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
import type { NotificationConfig } from "@/lib/schemas/automation";

type Props = {
  value: Partial<NotificationConfig>;
  onChange: (next: Partial<NotificationConfig>) => void;
};

export function NotificationConfigForm({ value, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="notif-title" className="text-sm">Titre *</Label>
        <Input
          id="notif-title"
          value={value.title ?? ""}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
          placeholder="Ex : Prospect inactif depuis 30 jours"
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="notif-message" className="text-sm">Message *</Label>
        <textarea
          id="notif-message"
          value={value.message ?? ""}
          onChange={(e) => onChange({ ...value, message: e.target.value })}
          placeholder="Ex : Pensez à recontacter {{prospect_name}}"
          rows={3}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Variables disponibles : {`{{prospect_name}}, {{quote_reference}}`}
        </p>
      </div>

      <div>
        <Label htmlFor="notif-recipient" className="text-sm">Destinataire</Label>
        <Select
          value={value.recipient ?? "admin"}
          onValueChange={(v) =>
            onChange({
              ...value,
              recipient: v as "admin" | "commercial" | "all",
            })
          }
        >
          <SelectTrigger id="notif-recipient" className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin (vous)</SelectItem>
            <SelectItem value="commercial">Commercial assigné</SelectItem>
            <SelectItem value="all">Tous les utilisateurs</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
