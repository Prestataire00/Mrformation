"use client";

/**
 * Story aut-b-2 — <RuleAuditSheet> : panneau d'audit slide-in pour une règle.
 *
 * UX-DR-AUT-9 : statuts simplifiés à 3 niveaux (✓ Succès / ⚠ Partiel / ❌ Échec).
 * Skipped (recipient_count=0) → mappé visuellement sur ✓ Succès avec
 * sub-titre "0 cibles ce run" (cohérence cadrage §4.7).
 *
 * Affiche les 10 dernières exécutions de session_automation_logs (formations)
 * pour cette rule. Lecture via supabase client navigateur (RLS entity-scoped).
 *
 * NFR-AUT-A11Y : Sheet shadcn shadcn = role="dialog" + aria-label.
 */

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDistanceToNow, format } from "date-fns";
import { fr } from "date-fns/locale";

type LogEntry = {
  id: string;
  session_id: string;
  rule_name: string | null;
  trigger_type: string;
  executed_at: string;
  recipient_count: number;
  status: string;
  is_manual: boolean | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  ruleId: string;
  ruleName?: string;
};

// UX-DR-AUT-9 : mapping vers 3 niveaux visuels
function mapStatusVisual(status: string, recipientCount: number) {
  if (status === "failed") {
    return {
      label: "Échec",
      icon: XCircle,
      color: "text-red-600",
      bgColor: "bg-red-50 border-red-200",
    };
  }
  if (status === "partial") {
    return {
      label: "Partiel",
      icon: AlertTriangle,
      color: "text-orange-600",
      bgColor: "bg-orange-50 border-orange-200",
    };
  }
  // success ou skipped → ✓ Succès (skipped = 0 cibles affichées explicitement)
  return {
    label: recipientCount === 0 ? "Succès (0 cibles)" : "Succès",
    icon: CheckCircle2,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50 border-emerald-200",
  };
}

export function RuleAuditSheet({ open, onClose, ruleId, ruleName }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .from("session_automation_logs")
      .select(
        "id, session_id, rule_name, trigger_type, executed_at, recipient_count, status, is_manual",
      )
      .eq("rule_id", ruleId)
      .order("executed_at", { ascending: false })
      .limit(10)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(error.message);
        } else {
          setLogs((data ?? []) as LogEntry[]);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, ruleId, supabase]);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Audit : {ruleName ?? "Règle"}</SheetTitle>
          <SheetDescription>
            10 dernières exécutions de cette règle d&apos;automatisation.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && !loading && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              Impossible de charger l&apos;audit : {error}
            </div>
          )}

          {!loading && !error && logs.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">Aucune exécution enregistrée.</p>
              <p className="text-xs mt-1">
                Cette règle n&apos;a pas encore été déclenchée par le moteur.
              </p>
            </div>
          )}

          {!loading && !error && logs.length > 0 && (
            <ul className="space-y-2">
              {logs.map((log) => {
                const visual = mapStatusVisual(log.status, log.recipient_count);
                const Icon = visual.icon;
                return (
                  <li
                    key={log.id}
                    className={`rounded-md border p-3 ${visual.bgColor}`}
                  >
                    <div className="flex items-start gap-2">
                      <Icon
                        className={`h-4 w-4 ${visual.color} shrink-0 mt-0.5`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className={`text-sm font-medium ${visual.color}`}>
                            {visual.label}
                          </p>
                          {log.is_manual && (
                            <Badge variant="outline" className="text-[10px]">
                              Manuel
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {log.recipient_count} destinataire
                          {log.recipient_count > 1 ? "s" : ""} •{" "}
                          <span title={format(new Date(log.executed_at), "PPpp", { locale: fr })}>
                            {formatDistanceToNow(new Date(log.executed_at), {
                              addSuffix: true,
                              locale: fr,
                            })}
                          </span>
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
