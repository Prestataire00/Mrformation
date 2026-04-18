"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Zap, Loader2, CheckCircle, XCircle, Clock, Send, Play,
  Settings, ChevronDown, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import type { Session } from "@/lib/types";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

interface AutoRule {
  id: string;
  name: string | null;
  trigger_type: string;
  days_offset: number | null;
  document_type: string | null;
  recipient_type: string;
  template_id: string | null;
  is_active: boolean;
  condition_subcontracted: boolean | null;
}

interface Override {
  id: string;
  rule_id: string;
  is_enabled: boolean;
  days_offset_override: number | null;
}

interface LogEntry {
  id: string;
  rule_name: string | null;
  trigger_type: string | null;
  executed_at: string;
  recipient_count: number;
  status: string;
  is_manual: boolean;
}

const TRIGGER_LABELS: Record<string, string> = {
  session_start_minus_days: "Avant le début",
  session_end_plus_days: "Après la fin",
  on_session_creation: "À la création",
  on_session_completion: "À la clôture",
  on_enrollment: "À l'inscription",
  on_signature_complete: "Signatures complètes",
  opco_deposit_reminder: "Rappel dépôt OPCO",
  invoice_overdue: "Facture en retard",
  questionnaire_reminder: "Relance questionnaire",
  certificate_ready: "Certificat prêt",
};

const STATUS_COLORS: Record<string, string> = {
  success: "bg-green-100 text-green-700",
  partial: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
  skipped: "bg-gray-100 text-gray-500",
  test: "bg-blue-100 text-blue-700",
};

export function TabAutomation({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();

  const [rules, setRules] = useState<AutoRule[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);

  // Bulk action dialog
  const [bulkDialog, setBulkDialog] = useState<{ open: boolean; action: string; label: string }>({ open: false, action: "", label: "" });
  const [bulkSending, setBulkSending] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch global rules for this entity
      const { data: rulesData } = await supabase
        .from("formation_automation_rules")
        .select("id, name, trigger_type, days_offset, document_type, recipient_type, template_id, is_active, condition_subcontracted")
        .eq("entity_id", formation.entity_id)
        .order("trigger_type");

      // Fetch overrides for this session
      const { data: overridesData } = await supabase
        .from("session_automation_overrides")
        .select("id, rule_id, is_enabled, days_offset_override")
        .eq("session_id", formation.id);

      // Fetch recent logs
      const { data: logsData } = await supabase
        .from("session_automation_logs")
        .select("id, rule_name, trigger_type, executed_at, recipient_count, status, is_manual")
        .eq("session_id", formation.id)
        .order("executed_at", { ascending: false })
        .limit(20);

      setRules((rulesData as AutoRule[]) || []);
      setOverrides((overridesData as Override[]) || []);
      setLogs((logsData as LogEntry[]) || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [formation.id, formation.entity_id, supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Check if rule applies to this session (subcontracted condition)
  const ruleApplies = (rule: AutoRule) => {
    if (rule.condition_subcontracted === null) return true;
    return rule.condition_subcontracted === (formation as unknown as { is_subcontracted?: boolean }).is_subcontracted;
  };

  const applicableRules = rules.filter(r => r.is_active && ruleApplies(r));

  // Get effective enabled state (override takes precedence)
  const isRuleEnabled = (ruleId: string) => {
    const override = overrides.find(o => o.rule_id === ruleId);
    return override ? override.is_enabled : true;
  };

  // Toggle override
  const handleToggle = async (ruleId: string, enabled: boolean) => {
    setToggling(ruleId);
    try {
      const existing = overrides.find(o => o.rule_id === ruleId);
      if (existing) {
        await supabase.from("session_automation_overrides").update({ is_enabled: enabled }).eq("id", existing.id);
      } else {
        await supabase.from("session_automation_overrides").insert({
          session_id: formation.id,
          rule_id: ruleId,
          is_enabled: enabled,
        });
      }
      await fetchData();
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
    setToggling(null);
  };

  // Test single rule
  const handleTest = async (ruleId: string) => {
    setTesting(ruleId);
    try {
      const res = await fetch("/api/formations/automation-rules/trigger-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger_type: "manual_test", session_id: formation.id, rule_id: ruleId }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Test envoyé", description: `${data.sent || 0} email(s) envoyé(s)` });
        await fetchData();
      } else {
        toast({ title: "Erreur", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    }
    setTesting(null);
  };

  // Bulk action
  const handleBulkAction = async () => {
    setBulkSending(true);
    try {
      const res = await fetch(`/api/formations/${formation.id}/automation-trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action_type: bulkDialog.action }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Envoi effectué", description: `${data.sent || 0} email(s)` });
        setBulkDialog({ open: false, action: "", label: "" });
        await fetchData();
      } else {
        toast({ title: "Erreur", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    }
    setBulkSending(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const bulkActions = [
    { action: "bulk_convocation", label: "Envoyer toutes les convocations", icon: Send },
    { action: "bulk_convention", label: "Envoyer conventions aux entreprises", icon: Send },
    { action: "bulk_certificate", label: "Envoyer certificats de réalisation", icon: CheckCircle },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="h-5 w-5 text-amber-500" />
          <div>
            <h3 className="text-sm font-semibold">Automatisations</h3>
            <p className="text-xs text-muted-foreground">
              {applicableRules.length} règle{applicableRules.length !== 1 ? "s" : ""} active{applicableRules.length !== 1 ? "s" : ""} pour cette formation
            </p>
          </div>
        </div>
        <Link href="/admin/trainings/automation">
          <Button variant="outline" size="sm" className="text-xs gap-1.5">
            <Settings className="h-3.5 w-3.5" /> Règles globales
            <ExternalLink className="h-3 w-3" />
          </Button>
        </Link>
      </div>

      {/* Règles actives */}
      {applicableRules.length === 0 ? (
        <div className="text-center py-8 border border-dashed rounded-lg">
          <Zap className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Aucune règle d&apos;automatisation configurée</p>
          <Link href="/admin/trainings/automation">
            <Button variant="outline" size="sm" className="mt-3 text-xs">Configurer les règles</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {applicableRules.map(rule => {
            const enabled = isRuleEnabled(rule.id);
            return (
              <div key={rule.id} className={`border rounded-lg p-4 transition-opacity ${!enabled ? "opacity-50" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{rule.name || rule.document_type || rule.trigger_type}</p>
                      {rule.condition_subcontracted === true && (
                        <Badge variant="outline" className="text-[10px]">Sous-traitance</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {TRIGGER_LABELS[rule.trigger_type] || rule.trigger_type}
                        {rule.days_offset ? ` (${rule.days_offset}j)` : ""}
                      </span>
                      <span>→ {rule.recipient_type}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs gap-1"
                      onClick={() => handleTest(rule.id)}
                      disabled={testing === rule.id || !enabled}
                    >
                      {testing === rule.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                      Tester
                    </Button>
                    <Switch
                      checked={enabled}
                      onCheckedChange={(v) => handleToggle(rule.id, v)}
                      disabled={toggling === rule.id}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Actions manuelles rapides */}
      <div>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Actions manuelles</h4>
        <div className="flex flex-wrap gap-2">
          {bulkActions.map(ba => (
            <Button
              key={ba.action}
              size="sm"
              variant="outline"
              className="text-xs gap-1.5"
              onClick={() => setBulkDialog({ open: true, action: ba.action, label: ba.label })}
            >
              <ba.icon className="h-3.5 w-3.5" /> {ba.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Historique */}
      <div>
        <button
          onClick={() => setShowLogs(!showLogs)}
          className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600"
        >
          <ChevronDown className={`h-3 w-3 transition-transform ${showLogs ? "rotate-180" : ""}`} />
          Historique ({logs.length})
        </button>
        {showLogs && (
          <div className="mt-3 space-y-2">
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucun envoi automatique enregistré</p>
            ) : (
              logs.map(log => (
                <div key={log.id} className="flex items-center justify-between py-2 border-b last:border-b-0 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge className={`text-[10px] ${STATUS_COLORS[log.status] || "bg-gray-100"}`}>
                      {log.status === "success" ? <CheckCircle className="h-3 w-3 mr-0.5" /> : log.status === "failed" ? <XCircle className="h-3 w-3 mr-0.5" /> : null}
                      {log.status}
                    </Badge>
                    <span className="text-xs">{log.rule_name || log.trigger_type || "Action manuelle"}</span>
                    {log.is_manual && <Badge variant="outline" className="text-[10px]">Manuel</Badge>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{log.recipient_count} dest.</span>
                    <span>{formatDate(log.executed_at, "dd/MM HH:mm")}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Bulk action confirmation dialog */}
      <Dialog open={bulkDialog.open} onOpenChange={(o) => setBulkDialog(prev => ({ ...prev, open: o }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{bulkDialog.label}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Cette action va envoyer les emails correspondants à tous les destinataires de cette formation. Continuer ?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialog({ open: false, action: "", label: "" })}>Annuler</Button>
            <Button onClick={handleBulkAction} disabled={bulkSending}>
              {bulkSending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
