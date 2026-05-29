"use client";

/**
 * Story aut-c-2 — CrmRuleTemplates : 4 cards de modèles préétablis CRM.
 *
 * Pattern miroir de QuickStartPacks.tsx (formations), adapté pour CRM.
 * UX-DR-AUT-12 : catégorisation visuelle forte avec 4 couleurs.
 * FR-AUT-72 : pré-décochage des règles déjà existantes (case-insensitive).
 * FR-AUT-73 : toast partiel si activation incomplète.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Check, ChevronRight } from "lucide-react";
import {
  CRM_RULE_TEMPLATES,
  type CrmRuleTemplate,
} from "@/lib/crm/rule-templates";

type Props = {
  onActivated: () => void;
  existingRuleNames: string[];
};

// UX-DR-AUT-12 : couleurs cohérentes avec les catégories CRM
const COLOR_MAP: Record<CrmRuleTemplate["color"], string> = {
  emerald: "border-emerald-200 bg-emerald-50/50 hover:border-emerald-300",
  orange: "border-orange-200 bg-orange-50/50 hover:border-orange-300",
  green: "border-green-200 bg-green-50/50 hover:border-green-300",
  purple: "border-purple-200 bg-purple-50/50 hover:border-purple-300",
};

const TEXT_COLOR_MAP: Record<CrmRuleTemplate["color"], string> = {
  emerald: "text-emerald-700",
  orange: "text-orange-700",
  green: "text-green-700",
  purple: "text-purple-700",
};

export function CrmRuleTemplates({ onActivated, existingRuleNames }: Props) {
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<CrmRuleTemplate | null>(null);
  const [checkedRules, setCheckedRules] = useState<Set<number>>(new Set());
  const [activating, setActivating] = useState(false);

  const openTemplate = (template: CrmRuleTemplate) => {
    setSelectedTemplate(template);
    // FR-AUT-72 : pré-décocher les règles dont le nom existe déjà (case-insensitive)
    const checked = new Set<number>();
    template.rules.forEach((r, i) => {
      const alreadyExists = existingRuleNames.some(
        (n) => n.toLowerCase() === r.name.toLowerCase(),
      );
      if (!alreadyExists) checked.add(i);
    });
    setCheckedRules(checked);
  };

  const toggleRule = (idx: number) => {
    setCheckedRules((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleActivate = async () => {
    if (!selectedTemplate) return;
    setActivating(true);

    const rulesToCreate = selectedTemplate.rules.filter((_, i) =>
      checkedRules.has(i),
    );

    let created = 0;
    let failed = 0;
    const failures: string[] = [];

    for (const rule of rulesToCreate) {
      try {
        const res = await fetch("/api/crm/automations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: rule.name,
            description: rule.description,
            trigger_type: rule.trigger_type,
            action_type: rule.action_type,
            is_enabled: true,
            config: rule.config,
          }),
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        created++;
      } catch (err) {
        failed++;
        failures.push(rule.name);
        console.error("[CrmRuleTemplates] activation failed:", rule.name, err);
      }
    }

    setActivating(false);
    setSelectedTemplate(null);
    setCheckedRules(new Set());
    onActivated();

    // FR-AUT-73 : toast partiel si certaines règles ont échoué
    if (failed === 0) {
      toast({
        title: `${created} règle${created > 1 ? "s" : ""} CRM activée${created > 1 ? "s" : ""}`,
        description: "Elles seront évaluées au prochain run (chaque jour à 7h UTC).",
      });
    } else {
      toast({
        title: `${created}/${rulesToCreate.length} règles créées`,
        description: `Échec : ${failures.join(", ")}`,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Modèles de règles</h3>
        <p className="text-xs text-muted-foreground">
          Démarre rapidement avec un set de règles prêtes à l&apos;emploi
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {CRM_RULE_TEMPLATES.map((template) => (
          <Card
            key={template.id}
            className={`border-2 transition-all cursor-pointer ${COLOR_MAP[template.color]}`}
            onClick={() => openTemplate(template)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openTemplate(template);
              }
            }}
            aria-label={`Ouvrir le modèle ${template.name}, ${template.rules.length} règles incluses`}
          >
            <CardContent className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className="text-2xl" aria-hidden>
                  {template.icon}
                </span>
                <ChevronRight
                  className={`h-4 w-4 ${TEXT_COLOR_MAP[template.color]}`}
                />
              </div>
              <div>
                <p className={`text-sm font-semibold ${TEXT_COLOR_MAP[template.color]}`}>
                  {template.name}
                </p>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                  {template.description}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {template.rules.length} règle{template.rules.length > 1 ? "s" : ""} incluse{template.rules.length > 1 ? "s" : ""}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Modal d'aperçu + activation */}
      <Dialog
        open={!!selectedTemplate}
        onOpenChange={(o) => {
          if (!o) {
            setSelectedTemplate(null);
            setCheckedRules(new Set());
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              <span aria-hidden>{selectedTemplate?.icon}</span> {selectedTemplate?.name}
            </DialogTitle>
          </DialogHeader>

          {selectedTemplate && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {selectedTemplate.description}
              </p>

              <p className="text-xs text-muted-foreground italic">
                Coche les règles que tu veux activer. Les règles dont le nom
                existe déjà sont automatiquement décochées.
              </p>

              <ul className="space-y-2">
                {selectedTemplate.rules.map((rule, i) => {
                  const isChecked = checkedRules.has(i);
                  const alreadyExists = existingRuleNames.some(
                    (n) => n.toLowerCase() === rule.name.toLowerCase(),
                  );
                  return (
                    <li
                      key={i}
                      className={`flex items-start gap-2.5 rounded-md border p-3 ${
                        isChecked
                          ? "border-emerald-300 bg-emerald-50/50"
                          : "border-gray-200"
                      }`}
                    >
                      <input
                        id={`crm-template-rule-${i}`}
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleRule(i)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        aria-describedby={`crm-template-rule-${i}-desc`}
                      />
                      <div className="flex-1 min-w-0">
                        <label
                          htmlFor={`crm-template-rule-${i}`}
                          className="text-sm font-medium cursor-pointer flex items-center gap-2"
                        >
                          {rule.name}
                          {alreadyExists && (
                            <span className="text-xs text-orange-600 font-normal">
                              (déjà existante)
                            </span>
                          )}
                        </label>
                        <p
                          id={`crm-template-rule-${i}-desc`}
                          className="text-xs text-muted-foreground mt-0.5"
                        >
                          {rule.description}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <p className="text-xs text-muted-foreground text-center pt-2">
                {checkedRules.size} règle{checkedRules.size > 1 ? "s" : ""} sera
                {checkedRules.size > 1 ? "ont" : ""} créée
                {checkedRules.size > 1 ? "s" : ""} et activée
                {checkedRules.size > 1 ? "s" : ""}.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedTemplate(null);
                setCheckedRules(new Set());
              }}
              disabled={activating}
            >
              Annuler
            </Button>
            <Button
              size="sm"
              onClick={handleActivate}
              disabled={activating || checkedRules.size === 0}
              className="gap-1"
            >
              {activating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Activer {checkedRules.size > 0 && `(${checkedRules.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
