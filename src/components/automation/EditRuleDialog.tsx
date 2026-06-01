"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Mini-dialog d'édition d'une règle d'automatisation formation.
 *
 * Permet à Loris de modifier les champs courants d'une règle existante
 * (nom, template email associé, recipient_type, days_offset si trigger
 * date-based, condition_subcontracted) sans passer par le RuleWizard
 * 5-étapes (qui est mode CREATE uniquement).
 *
 * Pour modifier le trigger_type / scope d'une règle, supprimer + recréer
 * via RuleWizard (cas rare, justifie le surcoût).
 *
 * Pattern UPDATE supabase direct (cf. handleToggle / handleDelete dans
 * /admin/automation/page.tsx). RLS filtre par entity_id.
 */

export interface EditableRule {
  id: string;
  name: string | null;
  trigger_type: string;
  days_offset: number | null;
  recipient_type: string;
  condition_subcontracted: boolean | null;
  template_id: string | null;
}

interface EmailTemplate {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: EditableRule | null;
  entityId: string;
  onUpdated: () => void;
}

const RECIPIENT_OPTIONS = [
  { value: "learners", label: "Apprenants" },
  { value: "trainers", label: "Formateurs" },
  { value: "companies", label: "Entreprises" },
  { value: "all", label: "Tous (apprenants + formateurs)" },
];

const DATE_BASED_TRIGGERS = new Set([
  "session_start_minus_days",
  "session_end_plus_days",
]);

export function EditRuleDialog({
  open,
  onOpenChange,
  rule,
  entityId,
  onUpdated,
}: Props) {
  const supabase = createClient();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [recipientType, setRecipientType] = useState<string>("learners");
  const [daysOffset, setDaysOffset] = useState<string>("0");
  const [conditionSub, setConditionSub] = useState<"any" | "true" | "false">("any");
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [saving, setSaving] = useState(false);

  const isDateBased = rule ? DATE_BASED_TRIGGERS.has(rule.trigger_type) : false;

  // Re-hydrate form quand on change de rule
  useEffect(() => {
    if (!rule) return;
    setName(rule.name ?? "");
    setTemplateId(rule.template_id ?? "");
    setRecipientType(rule.recipient_type || "learners");
    setDaysOffset(String(rule.days_offset ?? 0));
    setConditionSub(
      rule.condition_subcontracted === null
        ? "any"
        : rule.condition_subcontracted
          ? "true"
          : "false",
    );
  }, [rule]);

  // Charge les templates email de l'entité quand le dialog s'ouvre
  useEffect(() => {
    if (!open || !entityId) return;
    void (async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("id, name")
        .eq("entity_id", entityId)
        .order("name", { ascending: true });
      if (error) {
        toast({
          title: "Erreur de chargement des templates",
          description: error.message,
          variant: "destructive",
        });
        return;
      }
      if (data) setTemplates(data as EmailTemplate[]);
    })();
  }, [open, entityId, supabase, toast]);

  const handleSubmit = async () => {
    if (!rule) return;
    if (!name.trim()) {
      toast({
        title: "Nom obligatoire",
        description: "La règle doit avoir un nom.",
        variant: "destructive",
      });
      return;
    }
    if (isDateBased) {
      const parsed = Number(daysOffset);
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast({
          title: "Décalage invalide",
          description: "days_offset doit être un nombre ≥ 0.",
          variant: "destructive",
        });
        return;
      }
    }

    setSaving(true);
    // Skip days_offset si trigger non date-based : la colonne SQL est NOT NULL
    // DEFAULT 5, donc on ne touche pas la valeur existante.
    const payload: Record<string, unknown> = {
      name: name.trim(),
      template_id: templateId || null,
      recipient_type: recipientType,
      condition_subcontracted:
        conditionSub === "any" ? null : conditionSub === "true",
    };
    if (isDateBased) {
      payload.days_offset = Number(daysOffset);
    }

    const { error } = await supabase
      .from("formation_automation_rules")
      .update(payload)
      .eq("id", rule.id);

    setSaving(false);

    if (error) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Règle modifiée" });
    onUpdated();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier la règle</DialogTitle>
          <DialogDescription>
            Pour modifier le déclencheur (trigger) ou le type d&apos;action,
            supprimez la règle et recréez-la via le wizard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="rule-name">Nom</Label>
            <Input
              id="rule-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nom de la règle"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rule-template">Template email</Label>
            <Select value={templateId || "__none"} onValueChange={(v) => setTemplateId(v === "__none" ? "" : v)}>
              <SelectTrigger id="rule-template">
                <SelectValue placeholder="Sélectionner un template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Aucun template —</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rule-recipient">Destinataires</Label>
            <Select value={recipientType} onValueChange={setRecipientType}>
              <SelectTrigger id="rule-recipient">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECIPIENT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isDateBased && (
            <div className="space-y-1.5">
              <Label htmlFor="rule-offset">
                Décalage en jours (
                {rule?.trigger_type === "session_start_minus_days"
                  ? "J-X avant le début"
                  : "J+X après la fin"}
                )
              </Label>
              <Input
                id="rule-offset"
                type="number"
                min={0}
                value={daysOffset}
                onChange={(e) => setDaysOffset(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="rule-subcontracted">Filtre sous-traitance</Label>
            <Select value={conditionSub} onValueChange={(v) => setConditionSub(v as "any" | "true" | "false")}>
              <SelectTrigger id="rule-subcontracted">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Toutes les sessions</SelectItem>
                <SelectItem value="true">Sessions sous-traitées uniquement</SelectItem>
                <SelectItem value="false">Sessions non sous-traitées uniquement</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
