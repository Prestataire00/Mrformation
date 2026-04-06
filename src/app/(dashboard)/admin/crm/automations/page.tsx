"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import {
  Zap,
  Play,
  Loader2,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  CheckCircle,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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

export default function AutomationsPage() {
  const supabase = createClient();
  const { entityId } = useEntity();
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<Record<string, string> | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/crm/automations");
      const json = await res.json();
      if (json.data) setRules(json.data);
    } catch (err) {
      console.error("Failed to fetch automation rules:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  async function toggleRule(rule: AutomationRule) {
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
          prev.map((r) => (r.id === rule.id ? { ...r, is_enabled: !r.is_enabled } : r))
        );
      }
    } catch (err) {
      console.error("Failed to toggle rule:", err);
    } finally {
      setTogglingId(null);
    }
  }

  async function runAutomations() {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch("/api/crm/automations/run", { method: "POST" });
      const json = await res.json();
      if (json.data?.results) {
        setRunResult(json.data.results);
      }
    } catch (err) {
      console.error("Failed to run automations:", err);
    } finally {
      setRunning(false);
    }
  }

  const enabledCount = rules.filter((r) => r.is_enabled).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/crm"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 transition"
          >
            <ArrowLeft className="h-4 w-4 text-gray-500" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Zap className="h-6 w-6 text-[#DC2626]" />
              Automatisations CRM
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {enabledCount} / {rules.length} règles activées
            </p>
          </div>
        </div>
        <Button
          onClick={runAutomations}
          disabled={running}
          className="gap-2"
          style={{ backgroundColor: "#DC2626" }}
        >
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Exécuter maintenant
        </Button>
      </div>

      {/* Run result */}
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

      {/* Rules list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="grid gap-3">
          {rules.map((rule) => {
            const actionMeta = ACTION_TYPE_LABELS[rule.action_type] ?? {
              label: rule.action_type,
              color: "bg-gray-100 text-gray-600",
            };
            const isToggling = togglingId === rule.id;

            return (
              <Card
                key={rule.id}
                className={`transition-all ${
                  rule.is_enabled ? "border-gray-200" : "border-gray-100 opacity-60"
                }`}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  {/* Toggle */}
                  <button
                    onClick={() => toggleRule(rule)}
                    disabled={isToggling}
                    className="flex-shrink-0 transition-colors"
                  >
                    {isToggling ? (
                      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    ) : rule.is_enabled ? (
                      <ToggleRight className="h-7 w-7 text-[#DC2626]" />
                    ) : (
                      <ToggleLeft className="h-7 w-7 text-gray-300" />
                    )}
                  </button>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-gray-900">{rule.name}</p>
                      <Badge className={`text-[10px] ${actionMeta.color} border-0`}>
                        {actionMeta.label}
                      </Badge>
                    </div>
                    {rule.description && (
                      <p className="text-xs text-gray-500 line-clamp-1">{rule.description}</p>
                    )}
                  </div>

                  {/* Status */}
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      rule.is_enabled
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {rule.is_enabled ? "Actif" : "Inactif"}
                  </span>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
