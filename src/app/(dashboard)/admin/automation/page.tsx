"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import {
  Loader2, Zap, Plus, Search, Package, CheckCircle, Clock, Trash2,
  FlaskConical, History, Pencil,
} from "lucide-react";
import { RuleWizard } from "@/components/automation/RuleWizard";
import { PacksManager } from "@/components/automation/PacksManager";
import { DryRunDialog } from "@/components/automation/DryRunDialog";
import { DomainToggle } from "@/components/automation/DomainToggle";
import { NextRunBadge } from "@/components/automation/NextRunBadge";
import { RuleAuditSheet } from "@/components/automation/RuleAuditSheet";
import { EditRuleDialog, type EditableRule } from "@/components/automation/EditRuleDialog";
import { useNextRuns } from "@/components/automation/useNextRuns";
import { TRIGGER_LABELS } from "@/lib/automation/compute-events";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

interface Rule {
  id: string;
  name: string | null;
  trigger_type: string;
  days_offset: number | null;
  document_type: string | null;
  recipient_type: string;
  is_enabled: boolean;
  condition_subcontracted: boolean | null;
  template_id: string | null;
  created_at?: string;
}

type DryRunTarget = {
  ruleId: string;
  ruleName: string;
  sessionId?: string;
};

type AuditTarget = {
  ruleId: string;
  ruleName: string;
};

export default function AutomationPage() {
  const { toast } = useToast();
  const supabase = createClient();
  const { entity } = useEntity();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "overview";

  const [formationRules, setFormationRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [search, setSearch] = useState("");

  // aut-b-2 : dry-run + audit sheet
  const [dryRunTarget, setDryRunTarget] = useState<DryRunTarget | null>(null);
  const [auditTarget, setAuditTarget] = useState<AuditTarget | null>(null);
  // Mini-dialog édition rapide
  const [editingRule, setEditingRule] = useState<EditableRule | null>(null);

  // aut-b-2 : ▶ Prochain déclenchement (batch-loader aut-a-6)
  const { data: nextRuns } = useNextRuns(entity?.id);

  const fetchRules = useCallback(async () => {
    if (!entity?.id) return;
    setLoading(true);

    const { data } = await supabase
      .from("formation_automation_rules")
      .select("id, name, trigger_type, days_offset, document_type, recipient_type, is_enabled, condition_subcontracted, template_id, created_at")
      .eq("entity_id", entity.id)
      .order("created_at", { ascending: false });

    setFormationRules(data || []);
    setLoading(false);
  }, [entity?.id, supabase]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const handleToggle = async (rule: Rule) => {
    const { error } = await supabase
      .from("formation_automation_rules")
      .update({ is_enabled: !rule.is_enabled })
      .eq("id", rule.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: rule.is_enabled ? "Règle désactivée" : "Règle activée" });
      fetchRules();
    }
  };

  const handleDelete = async (rule: Rule) => {
    const ok = await confirm({ title: "Supprimer ?", description: `Supprimer la règle "${rule.name || rule.trigger_type}" ? Cette action est irréversible.` });
    if (!ok) return;
    const { error } = await supabase
      .from("formation_automation_rules")
      .delete()
      .eq("id", rule.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Règle supprimée" });
      fetchRules();
    }
  };

  // aut-b-2 : ouvre DryRunDialog avec contexte rule
  // Note: pour les règles formations, on a besoin d'un session_id. V1 simplifié :
  // on ne propose le dry-run que pour rule isolée sans session contexte (le test
  // dry-run vit dans TabAutomation par-session pour b-3). Ici la version sans
  // session = sera supportée en story B.1 future. Pour V1 b-2, on désactive le
  // bouton si pas de session pertinente — alternative : appeler dry-run avec
  // sessionId="" et le backend retourne 0 recipients (acceptable).
  const handleTest = (rule: Rule) => {
    // V1 : dry-run par rule sans session_id (le backend retournera 0 recipients
    // si la rule nécessite une session — Loris peut tester depuis TabAutomation
    // par-session pour avoir des données réelles).
    setDryRunTarget({
      ruleId: rule.id,
      ruleName: rule.name || TRIGGER_LABELS[rule.trigger_type] || rule.trigger_type,
      sessionId: undefined,
    });
  };

  const handleViewAudit = (rule: Rule) => {
    setAuditTarget({
      ruleId: rule.id,
      ruleName: rule.name || TRIGGER_LABELS[rule.trigger_type] || rule.trigger_type,
    });
  };

  const allRules = formationRules;

  const filteredRules = allRules.filter(r =>
    !search ||
    (r.name || "").toLowerCase().includes(search.toLowerCase()) ||
    r.trigger_type.toLowerCase().includes(search.toLowerCase()) ||
    (r.document_type || "").toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = allRules.filter(r => r.is_enabled).length;

  if (loading) return <div className="p-6 flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  const renderRuleRow = (rule: Rule) => {
    const triggerLabel = TRIGGER_LABELS[rule.trigger_type] || rule.trigger_type;
    const offset = rule.days_offset || 0;
    const offsetLabel = offset > 0
      ? rule.trigger_type.includes("minus") ? `J-${offset}` : `J+${offset}`
      : "";
    const nextRunInfo = nextRuns.get(rule.id);

    return (
      <div key={rule.id} className="flex items-start justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <Switch
            checked={rule.is_enabled}
            onCheckedChange={() => handleToggle(rule)}
            aria-label={`Activer/désactiver la règle ${rule.name || triggerLabel}`}
          />
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={cn("text-sm font-medium truncate", !rule.is_enabled && "text-muted-foreground line-through")}>
                {rule.name || triggerLabel}
              </p>
              {offsetLabel && (
                <Badge variant="outline" className="text-[10px] shrink-0">{offsetLabel}</Badge>
              )}
              {rule.condition_subcontracted && (
                <Badge variant="outline" className="text-[10px] shrink-0 border-purple-200 text-purple-700">Sous-traitance</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {triggerLabel} — {rule.recipient_type} — {rule.document_type || "email"}
            </p>
            {/* aut-b-2 : ▶ Prochain déclenchement en langage naturel */}
            <NextRunBadge info={nextRunInfo} />
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* aut-b-2 : bouton "🧪 Tester sans envoyer" (UX-DR-AUT-2 libellé exact) */}
          <Button
            size="sm"
            variant="ghost"
            className="text-xs gap-1.5 h-8"
            onClick={() => handleTest(rule)}
            aria-label={`Tester la règle ${rule.name || triggerLabel} sans envoyer`}
            title="Tester sans envoyer"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Tester sans envoyer</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs gap-1.5 h-8"
            onClick={() => handleViewAudit(rule)}
            aria-label={`Voir l'audit de la règle ${rule.name || triggerLabel}`}
            title="Voir l'audit"
          >
            <History className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Audit</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs gap-1.5 h-8"
            onClick={() => setEditingRule({
              id: rule.id,
              name: rule.name,
              trigger_type: rule.trigger_type,
              days_offset: rule.days_offset,
              recipient_type: rule.recipient_type,
              condition_subcontracted: rule.condition_subcontracted,
              template_id: rule.template_id,
            })}
            aria-label={`Modifier la règle ${rule.name || triggerLabel}`}
            title="Modifier"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Modifier</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-500 hover:text-red-700 h-8"
            onClick={() => handleDelete(rule)}
            aria-label={`Supprimer la règle ${rule.name || triggerLabel}`}
            title="Supprimer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Zap className="h-5 w-5 text-amber-500" />
          <div>
            <h1 className="text-lg font-bold text-gray-900">Automatisations</h1>
            <p className="text-sm text-muted-foreground">
              {activeCount} règle{activeCount !== 1 ? "s" : ""} active{activeCount !== 1 ? "s" : ""} sur {allRules.length}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => {
            const el = document.getElementById("packs-section");
            el?.scrollIntoView({ behavior: "smooth" });
          }}>
            <Package className="h-3.5 w-3.5" /> Ajouter un modèle
          </Button>
          <Button size="sm" className="gap-1.5 text-xs" onClick={() => setWizardOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Nouvelle règle
          </Button>
        </div>
      </div>

      {/* aut-b-2 : Toggle 2 univers Formations/CRM (UX-DR-AUT-4) */}
      <DomainToggle
        activeDomain="formation"
        formationsActiveCount={activeCount}
      />

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: allRules.length, icon: Zap, color: "text-gray-600" },
          { label: "Actives", value: activeCount, icon: CheckCircle, color: "text-emerald-600" },
          { label: "Désactivées", value: allRules.length - activeCount, icon: Clock, color: "text-amber-600" },
          { label: "Formations", value: formationRules.length, icon: Zap, color: "text-blue-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border-0 shadow-sm">
            <CardContent className="p-3 flex items-center gap-2.5">
              <Icon className={cn("h-4 w-4", color)} />
              <div>
                <p className="text-xl font-bold">{value}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Packs section */}
      <div id="packs-section">
        <PacksManager />
      </div>

      {/* Rules tabs */}
      <Tabs defaultValue={initialTab}>
        <TabsList className="h-9">
          <TabsTrigger value="overview" className="text-xs gap-1.5">
            Toutes ({allRules.length})
          </TabsTrigger>
          <TabsTrigger value="formations" className="text-xs gap-1.5">
            Formations ({formationRules.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder="Rechercher une règle..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
              aria-label="Rechercher dans les règles d'automatisation"
            />
          </div>
          {filteredRules.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Zap className="h-8 w-8 mx-auto text-gray-300 mb-3" />
              <p className="text-sm">Aucune règle configurée</p>
              <p className="text-xs mt-1">Activez un modèle ou créez votre première règle</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredRules.map(renderRuleRow)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="formations" className="mt-4 space-y-2">
          {formationRules.length === 0 ? (
            <p className="text-sm text-center text-muted-foreground py-8">Aucune règle formation</p>
          ) : (
            formationRules.map(renderRuleRow)
          )}
        </TabsContent>
      </Tabs>

      {/* Wizard */}
      <RuleWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={fetchRules}
        entityId={entity?.id || ""}
      />

      {/* Mini-dialog édition rapide */}
      <EditRuleDialog
        open={editingRule !== null}
        onOpenChange={(o) => { if (!o) setEditingRule(null); }}
        rule={editingRule}
        entityId={entity?.id || ""}
        onUpdated={fetchRules}
      />

      {/* aut-b-2 : DryRunDialog (B.1) — ouvert via bouton "Tester sans envoyer" */}
      {dryRunTarget && (
        <DryRunDialog
          open={true}
          onClose={() => setDryRunTarget(null)}
          ruleId={dryRunTarget.ruleId}
          ruleName={dryRunTarget.ruleName}
          domain="formation"
          sessionId={dryRunTarget.sessionId}
        />
      )}

      {/* aut-b-2 : RuleAuditSheet — ouvert via bouton "Audit" */}
      {auditTarget && (
        <RuleAuditSheet
          open={true}
          onClose={() => setAuditTarget(null)}
          ruleId={auditTarget.ruleId}
          ruleName={auditTarget.ruleName}
        />
      )}
      <ConfirmDialog />
    </div>
  );
}
