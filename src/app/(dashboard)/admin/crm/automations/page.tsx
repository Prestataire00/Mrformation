"use client";

/**
 * Story aut-c-3 — Page /admin/crm/automations refondue.
 *
 * Structure miroir de /admin/automation (formations) avec composants Epic
 * B + C : DomainToggle + CrmRuleWizard + CrmRuleTemplates + DryRunDialog.
 *
 * UX-DR-AUT-4 : toggle 2 univers en haut de page (Formations/CRM).
 * UX-DR-AUT-2 : libellé "🧪 Tester sans envoyer" exact.
 * Mitigation DoD #2 a11y : aria-label sur tous les contrôles interactifs.
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Loader2,
  Play,
  CheckCircle,
  ArrowLeft,
  Plus,
  FlaskConical,
  Briefcase,
  CheckSquare,
  Clock,
  Package,
  Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { useEntity } from "@/contexts/EntityContext";
import { cn } from "@/lib/utils";
import { DomainToggle } from "@/components/automation/DomainToggle";
import { ProspectionTabs } from "@/components/crm/ProspectionTabs";
import { CrmRuleWizard } from "@/components/automation/CrmRuleWizard";
import { CrmRuleTemplates } from "@/components/automation/CrmRuleTemplates";
import { DryRunDialog } from "@/components/automation/DryRunDialog";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

interface AutomationRule {
  id: string;
  entity_id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  action_type: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

const ACTION_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  update_prospect_status: { label: "Statut prospect", color: "bg-blue-100 text-blue-700" },
  create_task: { label: "Création tâche", color: "bg-amber-100 text-amber-700" },
  create_notification: { label: "Notification", color: "bg-violet-100 text-violet-700" },
  update_scores: { label: "Score", color: "bg-green-100 text-green-700" },
};

export default function CrmAutomationsPage() {
  const { toast } = useToast();
  const { entityId } = useEntity();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<Record<string, string> | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  // aut-b-2 pattern : dry-run target + audit (audit ouvert pour V1 future)
  const [dryRunTarget, setDryRunTarget] = useState<{ ruleId: string; ruleName: string } | null>(
    null,
  );

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/crm/automations");
      const json = await res.json();
      if (json.data) setRules(json.data);
    } catch (err) {
      console.error("[CrmAutomationsPage] Failed to fetch automation rules:", err);
      toast({
        title: "Erreur de chargement",
        description: "Impossible de charger les règles CRM.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleToggle = async (rule: AutomationRule) => {
    setTogglingId(rule.id);
    try {
      const res = await fetch("/api/crm/automations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, is_enabled: !rule.is_enabled }),
      });
      const json = await res.json();
      if (json.data) {
        setRules((prev) =>
          prev.map((r) =>
            r.id === rule.id ? { ...r, is_enabled: !r.is_enabled } : r,
          ),
        );
        toast({
          title: rule.is_enabled ? "Règle désactivée" : "Règle activée",
        });
      }
    } catch (err) {
      console.error("[CrmAutomationsPage] handleToggle failed:", err);
      toast({
        title: "Erreur",
        description: "Impossible de modifier la règle.",
        variant: "destructive",
      });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (rule: AutomationRule) => {
    const ok = await confirm({ title: "Supprimer ?", description: `Supprimer la règle "${rule.name}" ? Cette action est irréversible.` });
    if (!ok) return;
    setDeletingId(rule.id);
    try {
      const res = await fetch("/api/crm/automations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id }),
      });
      if (!res.ok) {
        // Si DELETE non supporté, on laisse Loris faire en SQL pour V1
        throw new Error(`HTTP ${res.status}`);
      }
      toast({ title: "Règle supprimée" });
      await fetchRules();
    } catch (err) {
      console.error("[CrmAutomationsPage] handleDelete failed:", err);
      toast({
        title: "Suppression non supportée",
        description: "Désactivez plutôt la règle, ou supprimez via SQL.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleTest = (rule: AutomationRule) => {
    setDryRunTarget({ ruleId: rule.id, ruleName: rule.name });
  };

  const runAutomations = async () => {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch("/api/crm/automations/run", { method: "POST" });
      const json = await res.json();
      if (json.data?.results) {
        setRunResult(json.data.results);
        toast({
          title: "Exécution lancée",
          description: `${json.data.executed} action(s) traitée(s)`,
        });
      }
    } catch (err) {
      console.error("[CrmAutomationsPage] runAutomations failed:", err);
      toast({
        title: "Erreur d'exécution",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  const enabledCount = rules.filter((r) => r.is_enabled).length;
  const disabledCount = rules.length - enabledCount;
  const existingRuleNames = rules.map((r) => r.name);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Navigation prospection */}
      <ProspectionTabs />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/crm"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 transition"
            aria-label="Retour au CRM"
          >
            <ArrowLeft className="h-4 w-4 text-gray-500" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-emerald-600" />
              Automatisations CRM
            </h1>
            <p className="text-sm text-muted-foreground">
              {enabledCount} règle{enabledCount !== 1 ? "s" : ""} active{enabledCount !== 1 ? "s" : ""} sur {rules.length}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const el = document.getElementById("crm-templates-section");
              el?.scrollIntoView({ behavior: "smooth" });
            }}
            className="gap-1.5 text-xs"
          >
            <Package className="h-3.5 w-3.5" /> Ajouter un modèle
          </Button>
          <Button
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setWizardOpen(true)}
            aria-label="Créer une nouvelle règle CRM via le wizard"
          >
            <Plus className="h-3.5 w-3.5" /> Nouvelle règle CRM
          </Button>
        </div>
      </div>

      {/* aut-b-2 pattern : Toggle 2 univers Formations/CRM (UX-DR-AUT-4) */}
      <DomainToggle
        activeDomain="crm"
        crmActiveCount={enabledCount}
      />

      {/* 4 cards d'état (cohérence avec /admin/automation) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 flex items-center gap-2.5">
            <Briefcase className="h-4 w-4 text-gray-600" />
            <div>
              <p className="text-xl font-bold">{rules.length}</p>
              <p className="text-[10px] text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 flex items-center gap-2.5">
            <CheckSquare className="h-4 w-4 text-emerald-600" />
            <div>
              <p className="text-xl font-bold">{enabledCount}</p>
              <p className="text-[10px] text-muted-foreground">Actives</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 flex items-center gap-2.5">
            <Clock className="h-4 w-4 text-amber-600" />
            <div>
              <p className="text-xl font-bold">{disabledCount}</p>
              <p className="text-[10px] text-muted-foreground">Désactivées</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 flex items-center gap-2.5">
            <Package className="h-4 w-4 text-purple-600" />
            <div>
              <p className="text-xl font-bold">4</p>
              <p className="text-[10px] text-muted-foreground">Modèles dispo.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bouton "Exécuter maintenant" + résultat */}
      <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
        <div>
          <p className="text-sm font-medium">Exécution manuelle</p>
          <p className="text-xs text-muted-foreground">
            Force l&apos;évaluation immédiate des règles actives sans attendre le run quotidien.
          </p>
        </div>
        <Button
          onClick={runAutomations}
          disabled={running}
          size="sm"
          className="gap-2 shrink-0"
          aria-label="Exécuter immédiatement toutes les règles CRM actives"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Exécuter maintenant
        </Button>
      </div>

      {runResult && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm font-semibold text-green-800">Exécution terminée</span>
            </div>
            <div className="space-y-1">
              {Object.entries(runResult).map(([key, value]) => (
                <p key={key} className="text-xs text-green-700">
                  {value}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section Modèles (c-2) */}
      <div id="crm-templates-section">
        <CrmRuleTemplates
          onActivated={fetchRules}
          existingRuleNames={existingRuleNames}
        />
      </div>

      {/* Liste des règles existantes */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Règles actives</h3>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : rules.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-lg">
            <Briefcase className="h-8 w-8 mx-auto text-gray-300 mb-3" />
            <p className="text-sm">Aucune règle CRM configurée</p>
            <p className="text-xs mt-1 text-muted-foreground">
              Activez un modèle ci-dessus ou créez votre première règle
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            {rules.map((rule) => {
              const actionMeta = ACTION_TYPE_LABELS[rule.action_type] ?? {
                label: rule.action_type,
                color: "bg-gray-100 text-gray-600",
              };

              return (
                <div
                  key={rule.id}
                  className={cn(
                    "flex items-start justify-between p-3 border rounded-lg gap-3 transition-colors hover:bg-gray-50",
                    !rule.is_enabled && "opacity-60",
                  )}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <Switch
                      checked={rule.is_enabled}
                      onCheckedChange={() => handleToggle(rule)}
                      disabled={togglingId === rule.id}
                      aria-label={`${rule.is_enabled ? "Désactiver" : "Activer"} la règle CRM ${rule.name}`}
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{rule.name}</p>
                        <Badge className={`text-[10px] ${actionMeta.color} border-0`}>
                          {actionMeta.label}
                        </Badge>
                      </div>
                      {rule.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {rule.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Déclencheur : <code className="rounded bg-gray-100 px-1 text-[10px]">{rule.trigger_type}</code>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs gap-1.5 h-8"
                      onClick={() => handleTest(rule)}
                      aria-label={`Tester sans envoyer la règle CRM ${rule.name}`}
                      title="Tester sans envoyer (aperçu sans effet)"
                    >
                      <FlaskConical className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Tester sans envoyer</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-700 h-8"
                      onClick={() => handleDelete(rule)}
                      disabled={deletingId === rule.id}
                      aria-label={`Supprimer la règle CRM ${rule.name}`}
                      title="Supprimer"
                    >
                      {deletingId === rule.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Wizard CRM (c-1) */}
      <CrmRuleWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={fetchRules}
      />

      {/* DryRunDialog (b-1) — domain="crm" */}
      {dryRunTarget && (
        <DryRunDialog
          open={true}
          onClose={() => setDryRunTarget(null)}
          ruleId={dryRunTarget.ruleId}
          ruleName={dryRunTarget.ruleName}
          domain="crm"
        />
      )}
      <ConfirmDialog />
    </div>
  );
}
