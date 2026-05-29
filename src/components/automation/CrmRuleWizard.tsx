"use client";

/**
 * Story aut-c-1 — CrmRuleWizard : wizard 5 étapes pour créer une règle CRM.
 *
 * Pattern miroir de RuleWizard formations (UX-DR-AUT-10), adapté aux
 * spécificités CRM (11 triggers regroupés par catégorie, 4 action_types
 * avec 4 sub-forms via Zod discriminated union).
 *
 * Étapes :
 * 1. Quand (trigger_type regroupé par catégorie)
 * 2. Condition (filtre optionnel — V1 affichée mais simplifiée)
 * 3. Action (action_type 4 choix)
 * 4. Configurer (sub-form dynamique par action_type)
 * 5. Nommer + Tester (description + activer + dry-run intégré — UX-DR-AUT-11)
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCircle2,
  Circle,
} from "lucide-react";
import {
  CRM_TRIGGER_TYPES,
  CRM_TRIGGER_LABELS,
  CRM_TRIGGER_CATEGORIES,
  CRM_ACTION_TYPES,
  CRM_ACTION_LABELS,
  crmRulePayloadSchema,
  type CrmTriggerType,
  type CrmActionType,
  type CrmActionConfig,
} from "@/lib/schemas/automation";
import { TaskConfigForm } from "@/components/automation/forms/TaskConfigForm";
import { NotificationConfigForm } from "@/components/automation/forms/NotificationConfigForm";
import { StatusUpdateConfigForm } from "@/components/automation/forms/StatusUpdateConfigForm";
import { ScoringConfigForm } from "@/components/automation/forms/ScoringConfigForm";
import { DryRunDialog } from "@/components/automation/DryRunDialog";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

type Step = 1 | 2 | 3 | 4 | 5;

const STEPS_LABELS: Record<Step, string> = {
  1: "Quand",
  2: "Condition",
  3: "Action",
  4: "Configurer",
  5: "Nommer + Tester",
};

export function CrmRuleWizard({ open, onClose, onCreated }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [triggerType, setTriggerType] = useState<CrmTriggerType | "">("");
  // Step 2 (optionnel, V1 simplifié — placeholder pour V2)
  const [conditionFilter, setConditionFilter] = useState<"all" | "qualified">(
    "all",
  );
  // Step 3
  const [actionType, setActionType] = useState<CrmActionType | "">("");
  // Step 4 (config dynamique par action_type)
  const [actionConfig, setActionConfig] = useState<Partial<CrmActionConfig>>({});
  // Step 5
  const [ruleName, setRuleName] = useState("");
  const [ruleDescription, setRuleDescription] = useState("");
  const [activateImmediately, setActivateImmediately] = useState(true);
  // Dry-run intégré (UX-DR-AUT-11)
  const [dryRunAfterCreate, setDryRunAfterCreate] = useState<{
    ruleId: string;
    ruleName: string;
  } | null>(null);

  // ── Helpers ────────────────────────────────────────────────────────────

  // Auto-init actionConfig quand actionType change
  const setActionTypeAndInit = (type: CrmActionType) => {
    setActionType(type);
    // Initialise la config par défaut selon le type
    if (type === "create_task") {
      setActionConfig({
        action_type: "create_task",
        version: 1,
        title: "",
        due_in_days: 3,
        assignee: "auto",
        priority: "normal",
      });
    } else if (type === "create_notification") {
      setActionConfig({
        action_type: "create_notification",
        version: 1,
        title: "",
        message: "",
        recipient: "admin",
      });
    } else if (type === "update_prospect_status") {
      setActionConfig({
        action_type: "update_prospect_status",
        version: 1,
      });
    } else if (type === "update_scores") {
      setActionConfig({
        action_type: "update_scores",
        version: 1,
        weights: {},
      });
    }
  };

  const canNext = (): boolean => {
    if (step === 1) return !!triggerType;
    if (step === 2) return true; // optionnel
    if (step === 3) return !!actionType;
    if (step === 4) {
      // Validation rapide selon action_type
      if (actionType === "create_task") {
        return !!actionConfig.action_type && !!(actionConfig as { title?: string }).title;
      }
      if (actionType === "create_notification") {
        const cfg = actionConfig as { title?: string; message?: string };
        return !!cfg.title && !!cfg.message;
      }
      if (actionType === "update_prospect_status") {
        return !!(actionConfig as { new_status?: string }).new_status;
      }
      if (actionType === "update_scores") {
        return true; // V1 : pas de config requise
      }
      return false;
    }
    return true;
  };

  const autoName = (): string => {
    if (!triggerType || !actionType) return "Règle CRM";
    const action = CRM_ACTION_LABELS[actionType];
    const trigger = CRM_TRIGGER_LABELS[triggerType];
    return `${action} — ${trigger}`.slice(0, 80);
  };

  // ── Création + dry-run ─────────────────────────────────────────────────

  const handleCreate = async (openDryRunAfter: boolean = false) => {
    if (!triggerType || !actionType) return;

    const finalName = ruleName || autoName();

    // Valide via Zod avant POST
    const payload = {
      name: finalName,
      description: ruleDescription || undefined,
      trigger_type: triggerType,
      action_type: actionType,
      is_enabled: activateImmediately,
      config: actionConfig as CrmActionConfig,
    };

    const parsed = crmRulePayloadSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      toast({
        title: "Validation",
        description: firstIssue?.message ?? "Configuration invalide",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/crm/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      const createdRuleId: string | null = json?.data?.id ?? json?.id ?? null;

      toast({
        title: activateImmediately
          ? "Règle CRM créée et activée"
          : "Règle CRM créée (désactivée)",
        description: finalName,
      });
      onCreated();

      if (openDryRunAfter && createdRuleId) {
        setDryRunAfterCreate({ ruleId: createdRuleId, ruleName: finalName });
        // Wizard reste ouvert ; DryRunDialog se superpose
      } else {
        resetAndClose();
      }
    } catch (err) {
      toast({
        title: "Erreur de création",
        description: err instanceof Error ? err.message : "Impossible de créer la règle",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const resetAndClose = () => {
    setStep(1);
    setTriggerType("");
    setConditionFilter("all");
    setActionType("");
    setActionConfig({});
    setRuleName("");
    setRuleDescription("");
    setActivateImmediately(true);
    setDryRunAfterCreate(null);
    onClose();
  };

  // ── Render ─────────────────────────────────────────────────────────────

  // Triggers groupés par catégorie pour étape 1
  const triggersByCategory = CRM_TRIGGER_TYPES.reduce<Record<string, CrmTriggerType[]>>(
    (acc, t) => {
      const cat = CRM_TRIGGER_CATEGORIES[t].category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(t);
      return acc;
    },
    {},
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouvelle règle CRM — Étape {step}/5 : {STEPS_LABELS[step]}</DialogTitle>
        </DialogHeader>

        {/* Progress indicator */}
        <div
          className="flex items-center gap-1.5 my-2"
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={5}
          aria-label={`Étape ${step} sur 5 : ${STEPS_LABELS[step]}`}
        >
          {([1, 2, 3, 4, 5] as Step[]).map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                s <= step ? "bg-emerald-500" : "bg-gray-200"
              }`}
            />
          ))}
        </div>

        <div className="space-y-4 py-2">
          {/* ── Step 1 : Quand (trigger groupé par catégorie) ── */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Quand veux-tu que ta règle se déclenche ?
              </p>
              {Object.entries(triggersByCategory).map(([category, triggers]) => (
                <div key={category}>
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span aria-hidden>{CRM_TRIGGER_CATEGORIES[triggers[0]].icon}</span>
                    {category}
                  </p>
                  <div className="space-y-1.5">
                    {triggers.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTriggerType(t)}
                        className={`w-full text-left rounded-md border p-2.5 text-sm transition-colors ${
                          triggerType === t
                            ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                        }`}
                        aria-pressed={triggerType === t}
                      >
                        <div className="flex items-center gap-2">
                          {triggerType === t ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          ) : (
                            <Circle className="h-4 w-4 text-gray-300 shrink-0" />
                          )}
                          <span>{CRM_TRIGGER_LABELS[t]}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Step 2 : Condition optionnelle ── */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Veux-tu limiter cette règle à certains prospects ?
              </p>
              <div className="space-y-2">
                {(
                  [
                    { value: "all", label: "Tous les prospects" },
                    { value: "qualified", label: "Seulement les prospects qualifiés" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setConditionFilter(opt.value)}
                    className={`w-full text-left rounded-md border p-3 text-sm transition-colors ${
                      conditionFilter === opt.value
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                    aria-pressed={conditionFilter === opt.value}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground italic">
                D&apos;autres filtres avancés (score, taille entreprise, assigné à)
                seront ajoutés en V2.
              </p>
            </div>
          )}

          {/* ── Step 3 : Action ── */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Quand le déclencheur se produit, que veux-tu faire ?
              </p>
              <div className="space-y-2">
                {CRM_ACTION_TYPES.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setActionTypeAndInit(a)}
                    className={`w-full text-left rounded-md border p-3 text-sm transition-colors ${
                      actionType === a
                        ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                    aria-pressed={actionType === a}
                  >
                    {CRM_ACTION_LABELS[a]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 4 : Configurer (sub-form dynamique) ── */}
          {step === 4 && actionType && (
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                Configure les détails de l&apos;action :
              </p>
              {actionType === "create_task" && (
                <TaskConfigForm
                  value={actionConfig as Partial<import("@/lib/schemas/automation").TaskConfig>}
                  onChange={(next) =>
                    setActionConfig({ ...actionConfig, ...next, action_type: "create_task", version: 1 })
                  }
                />
              )}
              {actionType === "create_notification" && (
                <NotificationConfigForm
                  value={actionConfig as Partial<import("@/lib/schemas/automation").NotificationConfig>}
                  onChange={(next) =>
                    setActionConfig({ ...actionConfig, ...next, action_type: "create_notification", version: 1 })
                  }
                />
              )}
              {actionType === "update_prospect_status" && (
                <StatusUpdateConfigForm
                  value={actionConfig as Partial<import("@/lib/schemas/automation").StatusUpdateConfig>}
                  onChange={(next) =>
                    setActionConfig({ ...actionConfig, ...next, action_type: "update_prospect_status", version: 1 })
                  }
                />
              )}
              {actionType === "update_scores" && (
                <ScoringConfigForm
                  value={actionConfig as Partial<import("@/lib/schemas/automation").ScoringConfig>}
                  onChange={(next) =>
                    setActionConfig({ ...actionConfig, ...next, action_type: "update_scores", version: 1 })
                  }
                />
              )}
            </div>
          )}

          {/* ── Step 5 : Nommer + Tester (UX-DR-AUT-11) ── */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="rounded-md bg-gray-50 p-3 text-sm">
                <p className="font-medium text-gray-900 mb-1">Récapitulatif</p>
                <p className="text-gray-700 text-xs">
                  <strong>Quand :</strong> {triggerType ? CRM_TRIGGER_LABELS[triggerType] : "—"}
                </p>
                <p className="text-gray-700 text-xs">
                  <strong>Action :</strong> {actionType ? CRM_ACTION_LABELS[actionType] : "—"}
                </p>
              </div>

              <div>
                <Label htmlFor="crm-rule-name" className="text-sm">Nom de la règle</Label>
                <Input
                  id="crm-rule-name"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder={autoName()}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Laissez vide pour utiliser le nom auto-généré
                </p>
              </div>

              <div>
                <Label htmlFor="crm-rule-description" className="text-sm">
                  Description (optionnel)
                </Label>
                <textarea
                  id="crm-rule-description"
                  value={ruleDescription}
                  onChange={(e) => setRuleDescription(e.target.value)}
                  placeholder="Note ou contexte pour vous y retrouver plus tard"
                  rows={2}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                />
              </div>

              <div className="flex items-start gap-2.5 rounded-md border bg-muted/30 p-3">
                <input
                  id="crm-activate-immediately"
                  type="checkbox"
                  checked={activateImmediately}
                  onChange={(e) => setActivateImmediately(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <Label
                    htmlFor="crm-activate-immediately"
                    className="text-sm font-medium cursor-pointer"
                  >
                    Activer immédiatement
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {activateImmediately
                      ? "La règle sera évaluée au prochain run quotidien (7h UTC)."
                      : "La règle sera créée désactivée — vous pourrez l'activer plus tard."}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <div>
            {step > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep((s) => (s - 1) as Step)}
                className="gap-1"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Précédent
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={resetAndClose}>
              Annuler
            </Button>
            {step < 5 ? (
              <Button
                size="sm"
                onClick={() => setStep((s) => (s + 1) as Step)}
                disabled={!canNext()}
                className="gap-1"
              >
                Suivant <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCreate(true)}
                  disabled={saving}
                  className="gap-1"
                  aria-label="Créer la règle CRM puis la tester sans envoyer"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Créer puis tester
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleCreate(false)}
                  disabled={saving}
                  className="gap-1"
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Créer la règle
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>

      {/* DryRunDialog post-création (UX-DR-AUT-11) */}
      {dryRunAfterCreate && (
        <DryRunDialog
          open={true}
          onClose={() => {
            setDryRunAfterCreate(null);
            resetAndClose();
          }}
          ruleId={dryRunAfterCreate.ruleId}
          ruleName={dryRunAfterCreate.ruleName}
          domain="crm"
        />
      )}
    </Dialog>
  );
}
