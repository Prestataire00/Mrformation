"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import {
  Loader2, CalendarDays, AlertTriangle, CheckCircle, Clock, XCircle, Pause,
  ChevronLeft, ChevronRight, Coffee, Mail, FileText, Award, ClipboardCheck,
  Play, ToggleLeft, ToggleRight, Send,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  trigger_type: string;
  scheduled_date: string;
  status: "executed" | "pending" | "overridden" | "failed";
  recipient_type: string;
  rule_id: string;
  session_id: string;
  session_title: string;
  log_id?: string;
  last_executed_at?: string;
  recipient_count: number;
  can_override: boolean;
  can_trigger_now: boolean;
}

interface Alert {
  level: "warning" | "error";
  type: string;
  title: string;
  description: string;
  session_id: string;
  session_title: string;
  cta?: { label: string; href: string };
}

interface OverviewData {
  period: { from: string; to: string };
  total_events: number;
  counts_by_status: { pending: number; executed: number; overridden: number; failed: number };
  counts_by_type: { email: number; document: number; questionnaire: number; invoice: number; certificate: number };
  events_by_day: Record<string, TimelineEvent[]>;
  alerts: Alert[];
  sessions_count: number;
}

const STATUS_CFG: Record<string, { color: string; Icon: typeof CheckCircle; label: string }> = {
  executed: { color: "bg-emerald-100 text-emerald-700", Icon: CheckCircle, label: "Fait" },
  pending: { color: "bg-gray-100 text-gray-600", Icon: Clock, label: "En attente" },
  overridden: { color: "bg-amber-100 text-amber-700", Icon: Pause, label: "Désactivé" },
  failed: { color: "bg-red-100 text-red-700", Icon: XCircle, label: "Échoué" },
};

const TRIGGER_ICONS: Record<string, typeof Mail> = {
  session_start_minus_days: Send,
  session_end_plus_days: Award,
  on_session_completion: CheckCircle,
  questionnaire_reminder: ClipboardCheck,
  certificate_ready: Award,
  invoice_overdue: FileText,
  opco_deposit_reminder: FileText,
};

function formatDateFr(d: string): string {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Paris" });
}

function getDayLabel(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });
}

function getWeekDays(from: string): string[] {
  const d = new Date(from);
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 1);
  }
  return days;
}

export default function MaSemainePage() {
  const { toast } = useToast();
  const supabase = createClient();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [detailEvent, setDetailEvent] = useState<TimelineEvent | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const getWeekBounds = useCallback(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff + weekOffset * 7);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { from: monday.toISOString(), to: sunday.toISOString() };
  }, [weekOffset]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { from, to } = getWeekBounds();
    const res = await fetch(`/api/automation/weekly-overview?from=${from}&to=${to}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [getWeekBounds]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleToggleOverride = async (event: TimelineEvent) => {
    setActing(event.id);
    const isEnabled = event.status !== "overridden";
    if (isEnabled) {
      await supabase.from("session_automation_overrides")
        .upsert({ session_id: event.session_id, rule_id: event.rule_id, is_enabled: false }, { onConflict: "session_id,rule_id" });
      toast({ title: "Règle désactivée" });
    } else {
      await supabase.from("session_automation_overrides")
        .delete().eq("session_id", event.session_id).eq("rule_id", event.rule_id);
      toast({ title: "Règle réactivée" });
    }
    await fetchData();
    setActing(null);
    setDetailEvent(null);
  };

  const handleTriggerNow = async (event: TimelineEvent) => {
    setActing(event.id);
    try {
      await fetch("/api/formations/automation-rules/trigger-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger_type: "manual_test", session_id: event.session_id, rule_id: event.rule_id }),
      });
      toast({ title: "Exécution lancée" });
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
    await fetchData();
    setActing(null);
    setDetailEvent(null);
  };

  const { from, to } = getWeekBounds();
  const weekLabel = weekOffset === 0 ? "Cette semaine" : weekOffset === 1 ? "Semaine prochaine" : weekOffset === -1 ? "Semaine dernière" : `Semaine du ${formatDateFr(from)}`;

  if (loading) return <div className="p-6 flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  const days = getWeekDays(from.split("T")[0]);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header + period selector */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Ma semaine</h1>
          <p className="text-sm text-muted-foreground">Vue transversale des automations sur toutes vos formations</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setWeekOffset(w => w - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant={weekOffset === 0 ? "default" : "outline"} onClick={() => setWeekOffset(0)} className="text-xs">{weekLabel}</Button>
          <Button size="sm" variant="outline" onClick={() => setWeekOffset(w => w + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* KPI Cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Événements", value: data.total_events, icon: CalendarDays, color: "text-blue-600" },
            { label: "Alertes", value: data.alerts.length, icon: AlertTriangle, color: data.alerts.length > 0 ? "text-amber-600" : "text-gray-400" },
            { label: "Emails", value: data.counts_by_type.email, icon: Mail, color: "text-violet-600" },
            { label: "Documents", value: data.counts_by_type.document + data.counts_by_type.certificate, icon: FileText, color: "text-emerald-600" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="border-0 shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <Icon className={cn("h-5 w-5", color)} />
                <div>
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Alerts */}
      {data && data.alerts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" />
            {data.alerts.length} alerte{data.alerts.length > 1 ? "s" : ""} à traiter
          </p>
          {data.alerts.map((a, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <div>
                <span className={cn("inline-block w-1.5 h-1.5 rounded-full mr-2", a.level === "error" ? "bg-red-500" : "bg-amber-500")} />
                <span className="font-medium">{a.title}</span>
                <span className="text-muted-foreground ml-1">— {a.description}</span>
              </div>
              {a.cta && (
                <Link href={a.cta.href}>
                  <Button size="sm" variant="outline" className="h-6 text-xs">{a.cta.label}</Button>
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Main content */}
      {data && data.total_events === 0 && data.alerts.length === 0 ? (
        <div className="text-center py-16">
          <Coffee className="h-12 w-12 mx-auto text-gray-300 mb-4" />
          <p className="text-lg font-medium text-gray-500">Rien de prévu cette semaine</p>
          <p className="text-sm text-muted-foreground mt-1">Toutes les automations sont à jour.</p>
        </div>
      ) : data && (
        <Tabs defaultValue="calendar">
          <TabsList className="h-9">
            <TabsTrigger value="calendar" className="text-xs gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> Calendrier</TabsTrigger>
            <TabsTrigger value="list" className="text-xs gap-1.5"><FileText className="h-3.5 w-3.5" /> Liste</TabsTrigger>
          </TabsList>

          <TabsContent value="calendar">
            <div className="grid grid-cols-7 gap-2 mt-2">
              {days.map(day => {
                const dayEvents = data.events_by_day[day] || [];
                const isToday = day === new Date().toISOString().split("T")[0];
                return (
                  <div key={day} className={cn("rounded-lg border p-2 min-h-[120px]", isToday ? "border-blue-300 bg-blue-50/50" : "border-gray-200")}>
                    <p className={cn("text-[10px] font-semibold uppercase mb-1", isToday ? "text-blue-700" : "text-gray-400")}>
                      {new Date(day + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}
                    </p>
                    {dayEvents.length === 0 ? (
                      <p className="text-[10px] text-gray-300 mt-4 text-center">—</p>
                    ) : (
                      <div className="space-y-1">
                        {dayEvents.map(e => {
                          const cfg = STATUS_CFG[e.status] || STATUS_CFG.pending;
                          const TriggerIcon = TRIGGER_ICONS[e.trigger_type] || Mail;
                          return (
                            <button
                              key={e.id}
                              onClick={() => setDetailEvent(e)}
                              className={cn("w-full text-left rounded px-1.5 py-1 text-[10px] leading-tight transition-colors hover:shadow-sm", cfg.color)}
                            >
                              <div className="flex items-center gap-1">
                                <TriggerIcon className="h-2.5 w-2.5 shrink-0" />
                                <span className="truncate font-medium">{e.title}</span>
                              </div>
                              <p className="truncate text-[9px] opacity-70 ml-3.5">{e.session_title}</p>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="list">
            <div className="space-y-4 mt-2">
              {days.map(day => {
                const dayEvents = data.events_by_day[day] || [];
                return (
                  <div key={day}>
                    <p className="text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {getDayLabel(day)}
                      {dayEvents.length > 0 && <Badge variant="outline" className="text-[9px] ml-1">{dayEvents.length}</Badge>}
                    </p>
                    {dayEvents.length === 0 ? (
                      <p className="text-xs text-gray-300 ml-5 mb-2">Aucun événement</p>
                    ) : (
                      <div className="space-y-1 ml-5">
                        {dayEvents.map(e => {
                          const cfg = STATUS_CFG[e.status] || STATUS_CFG.pending;
                          const StatusIcon = cfg.Icon;
                          return (
                            <button
                              key={e.id}
                              onClick={() => setDetailEvent(e)}
                              className="w-full text-left flex items-center gap-2 rounded-lg border p-2 hover:shadow-sm transition-shadow"
                            >
                              <div className={cn("w-6 h-6 rounded-full flex items-center justify-center border shrink-0", cfg.color)}>
                                <StatusIcon className="h-3 w-3" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{e.title}</p>
                                <p className="text-[11px] text-muted-foreground truncate">{e.session_title} — {e.description}</p>
                              </div>
                              {e.recipient_count > 0 && (
                                <Badge variant="outline" className="text-[9px] shrink-0">{e.recipient_count}</Badge>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* Event detail dialog — same pattern as AutomationTimeline */}
      <Dialog open={!!detailEvent} onOpenChange={(o) => !o && setDetailEvent(null)}>
        <DialogContent className="max-w-md">
          {detailEvent && (() => {
            const cfg = STATUS_CFG[detailEvent.status] || STATUS_CFG.pending;
            const StatusIcon = cfg.Icon;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base">
                    {detailEvent.title}
                    <Badge variant="outline" className={cn("text-[10px]", cfg.color)}>
                      <StatusIcon className="h-2.5 w-2.5 mr-0.5" /> {cfg.label}
                    </Badge>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Formation</p>
                    <Link href={`/admin/formations/${detailEvent.session_id}`} className="text-sm font-medium text-[#374151] hover:underline">
                      {detailEvent.session_title}
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Date prévue</p>
                      <p className="font-medium">{formatDateFr(detailEvent.scheduled_date)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Destinataires</p>
                      <p className="font-medium capitalize">{detailEvent.recipient_type}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Déclencheur</p>
                    <p>{detailEvent.description}</p>
                  </div>
                </div>
                <DialogFooter className="flex-col sm:flex-row gap-2">
                  {detailEvent.status === "pending" && (
                    <>
                      <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => handleToggleOverride(detailEvent)} disabled={acting === detailEvent.id}>
                        {acting === detailEvent.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ToggleLeft className="h-3 w-3" />} Désactiver
                      </Button>
                      <Button size="sm" className="gap-1 text-xs" onClick={() => handleTriggerNow(detailEvent)} disabled={acting === detailEvent.id}>
                        {acting === detailEvent.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Envoyer maintenant
                      </Button>
                    </>
                  )}
                  {detailEvent.status === "overridden" && (
                    <Button size="sm" className="gap-1 text-xs" onClick={() => handleToggleOverride(detailEvent)} disabled={acting === detailEvent.id}>
                      {acting === detailEvent.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ToggleRight className="h-3 w-3" />} Réactiver
                    </Button>
                  )}
                  {detailEvent.status === "failed" && (
                    <Button size="sm" className="gap-1 text-xs" onClick={() => handleTriggerNow(detailEvent)} disabled={acting === detailEvent.id}>
                      {acting === detailEvent.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Relancer
                    </Button>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
