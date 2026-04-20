"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import {
  Loader2, CheckCircle, Clock, Pause, XCircle, Send, Play, ToggleLeft, ToggleRight,
  Mail, FileText, Award, ClipboardCheck, CalendarDays,
} from "lucide-react";

interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  trigger_type: string;
  scheduled_date: string;
  status: "executed" | "pending" | "overridden" | "failed";
  recipient_type: string;
  rule_id: string;
  log_id?: string;
  last_executed_at?: string;
  recipient_count: number;
  can_override: boolean;
  can_trigger_now: boolean;
}

interface TimelineData {
  session: { id: string; title: string; start_date: string; end_date: string; status: string };
  events: TimelineEvent[];
  now: string;
}

const STATUS_CFG: Record<string, { color: string; icon: typeof CheckCircle; label: string }> = {
  executed: { color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle, label: "Exécuté" },
  pending: { color: "bg-gray-100 text-gray-600 border-gray-200", icon: Clock, label: "En attente" },
  overridden: { color: "bg-amber-100 text-amber-700 border-amber-200", icon: Pause, label: "Désactivé" },
  failed: { color: "bg-red-100 text-red-700 border-red-200", icon: XCircle, label: "Échoué" },
};

const TRIGGER_ICONS: Record<string, typeof Mail> = {
  session_start_minus_days: Send,
  session_end_plus_days: Award,
  on_session_creation: CalendarDays,
  on_session_completion: CheckCircle,
  on_enrollment: Mail,
  on_signature_complete: FileText,
  questionnaire_reminder: ClipboardCheck,
  certificate_ready: Award,
  opco_deposit_reminder: FileText,
  invoice_overdue: FileText,
};

function formatRelative(dateStr: string, now: string): string {
  const diff = new Date(dateStr).getTime() - new Date(now).getTime();
  const days = Math.round(diff / 86400000);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "demain";
  if (days === -1) return "hier";
  if (days > 0) return `dans ${days} jour${days > 1 ? "s" : ""}`;
  return `il y a ${Math.abs(days)} jour${Math.abs(days) > 1 ? "s" : ""}`;
}

function formatDateFr(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Paris",
  });
}

interface Props {
  sessionId: string;
}

export function AutomationTimeline({ sessionId }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailEvent, setDetailEvent] = useState<TimelineEvent | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const fetchTimeline = useCallback(async () => {
    const res = await fetch(`/api/formations/${sessionId}/timeline`);
    if (res.ok) {
      const json = await res.json();
      setData(json);
    }
    setLoading(false);
  }, [sessionId]);

  useEffect(() => { fetchTimeline(); }, [fetchTimeline]);

  const handleToggleOverride = async (event: TimelineEvent) => {
    setActing(event.id);
    const isCurrentlyEnabled = event.status !== "overridden";

    if (isCurrentlyEnabled) {
      // Disable this rule for the session
      await supabase
        .from("session_automation_overrides")
        .upsert({ session_id: sessionId, rule_id: event.rule_id, is_enabled: false }, { onConflict: "session_id,rule_id" });
      toast({ title: "Règle désactivée pour cette formation" });
    } else {
      // Re-enable: delete the override
      await supabase
        .from("session_automation_overrides")
        .delete()
        .eq("session_id", sessionId)
        .eq("rule_id", event.rule_id);
      toast({ title: "Règle réactivée" });
    }
    await fetchTimeline();
    setActing(null);
    setDetailEvent(null);
  };

  const handleTriggerNow = async (event: TimelineEvent) => {
    setActing(event.id);
    try {
      const res = await fetch("/api/formations/automation-rules/trigger-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger_type: "manual_test", session_id: sessionId, rule_id: event.rule_id }),
      });
      if (!res.ok) throw new Error("Erreur");
      toast({ title: "Exécution lancée", description: "Les emails seront envoyés sous peu." });
    } catch {
      toast({ title: "Erreur", description: "Impossible de déclencher l'exécution", variant: "destructive" });
    }
    await fetchTimeline();
    setActing(null);
    setDetailEvent(null);
  };

  if (loading) return <div className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>;

  if (!data || data.events.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <CalendarDays className="h-10 w-10 mx-auto mb-3 text-gray-300" />
        <p className="text-sm font-medium">Aucune automation configurée</p>
        <p className="text-xs mt-1">Configurez des règles dans l&apos;onglet &quot;Règles&quot; pour voir la timeline.</p>
      </div>
    );
  }

  // Find "now" position in timeline
  const nowTs = new Date(data.now).getTime();
  let nowInserted = false;

  return (
    <>
      <div className="space-y-1">
        {/* Session info bar */}
        <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2 mb-4">
          <div className="text-xs text-gray-500">
            <span className="font-semibold text-gray-700">{data.session.title}</span>
            {" — "}du {formatDateFr(data.session.start_date)} au {formatDateFr(data.session.end_date)}
          </div>
          <Badge variant="outline" className="text-[10px]">{data.events.length} étape{data.events.length > 1 ? "s" : ""}</Badge>
        </div>

        {data.events.map((event, idx) => {
          const eventTs = new Date(event.scheduled_date).getTime();
          const cfg = STATUS_CFG[event.status] || STATUS_CFG.pending;
          const StatusIcon = cfg.icon;
          const TriggerIcon = TRIGGER_ICONS[event.trigger_type] || Mail;
          const isPast = eventTs < nowTs;

          // Insert "now" marker
          let showNow = false;
          if (!nowInserted && eventTs > nowTs) {
            showNow = true;
            nowInserted = true;
          }

          return (
            <div key={event.id}>
              {showNow && (
                <div className="flex items-center gap-2 py-2">
                  <div className="flex-1 h-px bg-blue-400" />
                  <span className="text-[10px] font-bold text-blue-600 px-2 py-0.5 bg-blue-50 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    Aujourd&apos;hui — {formatDateFr(data.now)}
                  </span>
                  <div className="flex-1 h-px bg-blue-400" />
                </div>
              )}

              <button
                onClick={() => setDetailEvent(event)}
                className={cn(
                  "w-full text-left rounded-lg border p-3 transition-all hover:shadow-sm",
                  isPast ? "opacity-70" : "",
                  event.status === "overridden" ? "border-dashed" : "",
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Timeline dot + line */}
                  <div className="flex flex-col items-center pt-0.5">
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center border", cfg.color)}>
                      <TriggerIcon className="h-3.5 w-3.5" />
                    </div>
                    {idx < data.events.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 mt-1 min-h-[12px]" />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">{event.title}</span>
                      <Badge variant="outline" className={cn("text-[10px] border", cfg.color)}>
                        <StatusIcon className="h-2.5 w-2.5 mr-0.5" />
                        {cfg.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                      <span>{formatDateFr(event.scheduled_date)}</span>
                      <span className="font-medium">{formatRelative(event.scheduled_date, data.now)}</span>
                      {event.recipient_count > 0 && <span>{event.recipient_count} destinataire{event.recipient_count > 1 ? "s" : ""}</span>}
                      {event.last_executed_at && <span>Exécuté le {formatDateFr(event.last_executed_at)}</span>}
                    </div>
                  </div>
                </div>
              </button>
            </div>
          );
        })}

        {/* If "now" is after all events */}
        {!nowInserted && (
          <div className="flex items-center gap-2 py-2">
            <div className="flex-1 h-px bg-blue-400" />
            <span className="text-[10px] font-bold text-blue-600 px-2 py-0.5 bg-blue-50 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              Aujourd&apos;hui — {formatDateFr(data.now)}
            </span>
            <div className="flex-1 h-px bg-blue-400" />
          </div>
        )}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!detailEvent} onOpenChange={(o) => !o && setDetailEvent(null)}>
        <DialogContent className="max-w-md">
          {detailEvent && (() => {
            const cfg = STATUS_CFG[detailEvent.status] || STATUS_CFG.pending;
            const StatusIcon = cfg.icon;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {detailEvent.title}
                    <Badge variant="outline" className={cn("text-[10px]", cfg.color)}>
                      <StatusIcon className="h-2.5 w-2.5 mr-0.5" /> {cfg.label}
                    </Badge>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Date prévue</p>
                      <p className="font-medium">{formatDateFr(detailEvent.scheduled_date)}</p>
                      <p className="text-xs text-gray-400">{formatRelative(detailEvent.scheduled_date, data!.now)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Destinataires</p>
                      <p className="font-medium capitalize">{detailEvent.recipient_type}</p>
                      {detailEvent.recipient_count > 0 && (
                        <p className="text-xs text-gray-400">{detailEvent.recipient_count} envoyé{detailEvent.recipient_count > 1 ? "s" : ""}</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Déclencheur</p>
                    <p className="text-sm">{detailEvent.description}</p>
                  </div>
                  {detailEvent.last_executed_at && (
                    <div>
                      <p className="text-xs text-muted-foreground">Dernière exécution</p>
                      <p className="text-sm">{formatDateFr(detailEvent.last_executed_at)}</p>
                    </div>
                  )}
                </div>
                <DialogFooter className="flex-col sm:flex-row gap-2">
                  {detailEvent.status === "pending" && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-xs"
                        onClick={() => handleToggleOverride(detailEvent)}
                        disabled={acting === detailEvent.id}
                      >
                        {acting === detailEvent.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ToggleLeft className="h-3 w-3" />}
                        Désactiver
                      </Button>
                      <Button
                        size="sm"
                        className="gap-1 text-xs"
                        onClick={() => handleTriggerNow(detailEvent)}
                        disabled={acting === detailEvent.id}
                      >
                        {acting === detailEvent.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                        Envoyer maintenant
                      </Button>
                    </>
                  )}
                  {detailEvent.status === "overridden" && (
                    <Button
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={() => handleToggleOverride(detailEvent)}
                      disabled={acting === detailEvent.id}
                    >
                      {acting === detailEvent.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ToggleRight className="h-3 w-3" />}
                      Réactiver
                    </Button>
                  )}
                  {detailEvent.status === "failed" && (
                    <Button
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={() => handleTriggerNow(detailEvent)}
                      disabled={acting === detailEvent.id}
                    >
                      {acting === detailEvent.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                      Relancer
                    </Button>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}
