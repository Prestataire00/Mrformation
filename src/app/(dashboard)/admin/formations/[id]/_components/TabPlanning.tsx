"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { ChevronLeft, ChevronRight, Trash2, CheckCircle, AlertTriangle, Clock, Sparkles, UserX, Calendar, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { resolveDisplayedHours } from "@/lib/utils/hours-source";
import { distributeModulesToSlots } from "@/lib/utils/auto-fill-modules";
import { slotsToIcs } from "@/lib/utils/ics-export";
import { generatePlanningPdf } from "@/lib/utils/planning-pdf";
import { bulkCreateTimeSlots, deleteAllTimeSlotsForSession, updateTimeSlot } from "@/lib/services/time-slots";
import {
  detectTrainerConflicts,
  fetchTrainerWeeklyLoad,
  type TrainerConflict,
  type TrainerLoad,
} from "@/lib/services/trainer-conflicts";
import type { Session, FormationTimeSlot } from "@/lib/types";
import { BulkSlotCreator } from "./BulkSlotCreator";
import { SlotEditDialog } from "./SlotEditDialog";

type ViewMode = "month" | "week" | "day" | "trainers";

const DAYS_FR = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

export function TabPlanning({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const { entityId } = useEntity();
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  // PLAN-1 audit BMAD : édition d'un créneau au clic sur le pavé du calendrier.
  const [editingSlot, setEditingSlot] = useState<FormationTimeSlot | null>(null);
  // PLAN-5 audit BMAD : auto-fill modules depuis le programme.
  const [autoFilling, setAutoFilling] = useState(false);
  // PLAN-6 audit BMAD : conflits formateurs cross-session.
  const [conflicts, setConflicts] = useState<TrainerConflict[]>([]);
  // PLAN-9 audit BMAD : vue ressources — charge hebdo des formateurs.
  const [trainerLoads, setTrainerLoads] = useState<TrainerLoad[]>([]);
  // PLAN-10 audit BMAD : Dialogs shadcn remplaçant les confirm() natifs.
  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState(false);
  const [confirmMarkPlannedOpen, setConfirmMarkPlannedOpen] = useState(false);

  const timeSlots = formation.formation_time_slots || [];

  // PLAN-6 audit BMAD : recalcule les conflits formateurs quand les slots
  // ou les trainers de la session changent. Effet best-effort : erreurs
  // silencieuses (ne casse pas l'affichage du calendrier).
  useEffect(() => {
    if (!entityId) return;
    const trainerIds = (formation.formation_trainers ?? [])
      .map((ft) => ft.trainer_id)
      .filter((id): id is string => !!id);
    if (trainerIds.length === 0 || timeSlots.length === 0) {
      setConflicts([]);
      return;
    }
    const currentSlots = timeSlots.map((s) => ({
      id: s.id,
      start_time: s.start_time,
      end_time: s.end_time,
    }));
    (async () => {
      const result = await detectTrainerConflicts(supabase, {
        sessionId: formation.id,
        entityId,
        currentSlots,
        trainerIds,
      });
      if (result.ok) setConflicts(result.conflicts);
    })();
  }, [entityId, formation.id, formation.formation_trainers, timeSlots, supabase]);

  // Set des slot_ids en conflit pour highlight rapide dans le rendu.
  const conflictingSlotIds = useMemo(
    () => new Set(conflicts.map((c) => c.slotId)),
    [conflicts],
  );

  // PLAN-9 audit BMAD : début/fin de la semaine affichée (lundi → dimanche),
  // utilisé par la vue "Par formateur" pour requêter les slots cross-session.
  const weekRange = useMemo(() => {
    const start = new Date(currentDate);
    const dayOfWeek = start.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    start.setDate(start.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { fromIso: start.toISOString(), toIso: end.toISOString(), start };
  }, [currentDate]);

  // PLAN-9 audit BMAD : charge la charge hebdo des formateurs quand on
  // entre dans la vue "trainers" (ou quand la semaine ou les trainers
  // changent en mode trainers).
  useEffect(() => {
    if (viewMode !== "trainers" || !entityId) return;
    const trainerIds = (formation.formation_trainers ?? [])
      .map((ft) => ft.trainer_id)
      .filter((id): id is string => !!id);
    if (trainerIds.length === 0) {
      setTrainerLoads([]);
      return;
    }
    (async () => {
      const result = await fetchTrainerWeeklyLoad(supabase, {
        entityId,
        trainerIds,
        currentSessionId: formation.id,
        fromIso: weekRange.fromIso,
        toIso: weekRange.toIso,
      });
      if (result.ok) setTrainerLoads(result.loads);
    })();
  }, [viewMode, entityId, formation.formation_trainers, formation.id, weekRange.fromIso, weekRange.toIso, supabase]);

  // PLAN-3 audit BMAD : cohérence heures planifiées vs prévues +
  // détection slots hors période de la session.
  const coherence = useMemo(() => {
    const totalMs = timeSlots.reduce((acc, s) => {
      return acc + (new Date(s.end_time).getTime() - new Date(s.start_time).getTime());
    }, 0);
    const plannedHours = Math.round((totalMs / (1000 * 60 * 60)) * 10) / 10;
    const expected = resolveDisplayedHours(formation).value;
    const sessionStart = formation.start_date ? new Date(formation.start_date).getTime() : null;
    const sessionEnd = formation.end_date ? new Date(formation.end_date).getTime() : null;
    const outOfRangeSlots = timeSlots.filter((s) => {
      if (sessionStart === null || sessionEnd === null) return false;
      const slotStart = new Date(s.start_time).getTime();
      const slotEnd = new Date(s.end_time).getTime();
      // On compare la date du créneau (Europe/Paris pratique : on ajoute
      // 1 jour de tolérance à `sessionEnd` car formation.end_date est
      // souvent à 00:00 du dernier jour alors qu'un slot finit à 17h).
      return slotStart < sessionStart || slotEnd > sessionEnd + 24 * 3600 * 1000;
    }).length;
    return { plannedHours, expected, outOfRangeSlots };
  }, [timeSlots, formation]);

  // Navigation
  const navigate = (direction: number) => {
    const d = new Date(currentDate);
    if (viewMode === "month") d.setMonth(d.getMonth() + direction);
    else if (viewMode === "week") d.setDate(d.getDate() + direction * 7);
    else d.setDate(d.getDate() + direction);
    setCurrentDate(d);
  };

  const goToday = () => setCurrentDate(new Date());

  // Générer les jours du mois
  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Trouver le lundi avant le 1er
    let startDay = new Date(firstDay);
    const dayOfWeek = startDay.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startDay.setDate(startDay.getDate() - diff);

    const days: Date[] = [];
    const current = new Date(startDay);
    while (current <= lastDay || days.length % 7 !== 0) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
      if (days.length > 42) break;
    }
    return days;
  }, [currentDate]);

  // Trouver les slots pour un jour donné
  const getSlotsForDay = (date: Date): FormationTimeSlot[] => {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return timeSlots.filter((slot) => {
      const d = new Date(slot.start_time);
      const slotDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return slotDate === dateStr;
    });
  };

  const handleDeleteAll = async () => {
    if (!entityId) {
      toast({ title: "Erreur", description: "Entité non chargée.", variant: "destructive" });
      return;
    }
    setDeleting(true);
    // PLAN-4 audit BMAD : service centralisé (entity_id check).
    const result = await deleteAllTimeSlotsForSession(supabase, formation.id, entityId);
    if (!result.ok) {
      toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
    } else {
      toast({ title: "Tous les créneaux supprimés" });
      await onRefresh();
    }
    setDeleting(false);
  };

  // PLAN-8 audit BMAD : duplique tous les slots du jour affiché vers
  // une date cible (prompt) — n'écrase rien, ajoute en complément.
  const handleDuplicateDay = async () => {
    if (!entityId) return;
    const slotsToday = getSlotsForDay(currentDate);
    if (slotsToday.length === 0) {
      toast({
        title: "Rien à dupliquer",
        description: "Aucun créneau ce jour. Basculez sur un jour avec des créneaux.",
        variant: "destructive",
      });
      return;
    }
    const todayStr = currentDate.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const targetStr = window.prompt(
      `Dupliquer les ${slotsToday.length} créneau(x) du ${todayStr} vers quelle date ? (YYYY-MM-DD)`,
    );
    if (!targetStr) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetStr)) {
      toast({ title: "Date invalide", description: "Format attendu : YYYY-MM-DD", variant: "destructive" });
      return;
    }
    const targetDate = new Date(targetStr + "T00:00:00");
    if (isNaN(targetDate.getTime())) {
      toast({ title: "Date invalide", variant: "destructive" });
      return;
    }
    // Décale chaque slot du delta jour-cible − jour-source (en jours).
    const dayMs = 24 * 60 * 60 * 1000;
    const deltaDays = Math.round(
      (Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()) -
        Date.UTC(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate())) /
        dayMs,
    );
    const existing = timeSlots.length;
    const inputs = slotsToday.map((s, i) => {
      const newStart = new Date(new Date(s.start_time).getTime() + deltaDays * dayMs);
      const newEnd = new Date(new Date(s.end_time).getTime() + deltaDays * dayMs);
      return {
        title: s.title,
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
        slot_order: existing + i + 1,
        module_title: s.module_title,
        module_objectives: s.module_objectives,
        module_themes: s.module_themes,
        module_exercises: s.module_exercises,
      };
    });
    const result = await bulkCreateTimeSlots(supabase, formation.id, entityId, inputs);
    if (!result.ok) {
      toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
    } else {
      toast({
        title: `${result.count} créneau(x) dupliqué(s) vers le ${targetStr}`,
      });
      await onRefresh();
    }
  };

  // PLAN-7 audit BMAD : exports planning (ICS pour calendriers, PDF récap).
  const handleExportIcs = () => {
    if (timeSlots.length === 0) {
      toast({ title: "Aucun créneau à exporter", variant: "destructive" });
      return;
    }
    const ics = slotsToIcs({
      sessionId: formation.id,
      sessionTitle: formation.title,
      slots: timeSlots,
    });
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `planning-${formation.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast({ title: "Planning .ics téléchargé", description: "Importable dans Google Calendar, Outlook, Apple Calendar." });
  };

  const handleExportPdf = () => {
    if (timeSlots.length === 0) {
      toast({ title: "Aucun créneau à exporter", variant: "destructive" });
      return;
    }
    const doc = generatePlanningPdf({
      sessionTitle: formation.title,
      sessionStart: formation.start_date,
      sessionEnd: formation.end_date,
      slots: timeSlots,
    });
    doc.save(`planning-${formation.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}.pdf`);
    toast({ title: "Planning PDF téléchargé" });
  };

  // PLAN-5 audit BMAD : auto-fill des modules pédagogiques depuis le programme
  // attaché à la session. Distribue program.content.modules[i] → slot[i] par
  // ordre chronologique (helper distributeModulesToSlots).
  const handleAutoFillModules = async () => {
    if (!entityId) return;
    const modules = formation.program?.content?.modules ?? [];
    if (modules.length === 0) {
      toast({
        title: "Aucun module dans le programme",
        description: "Complétez les modules du programme avant d'auto-remplir.",
        variant: "destructive",
      });
      return;
    }
    if (timeSlots.length === 0) {
      toast({
        title: "Aucun créneau à remplir",
        description: "Planifiez d'abord les créneaux ci-dessus.",
        variant: "destructive",
      });
      return;
    }

    const plan = distributeModulesToSlots(modules, timeSlots);

    if (plan.slotsAlreadyFilled > 0) {
      const ok = confirm(
        `${plan.slotsAlreadyFilled} créneau(x) ont déjà un contenu pédagogique. Remplacer ?`,
      );
      if (!ok) return;
    }

    setAutoFilling(true);
    let success = 0;
    let failed = 0;
    for (const a of plan.assignments) {
      const result = await updateTimeSlot(supabase, a.slotId, formation.id, entityId, a.patch);
      if (result.ok) success++;
      else failed++;
    }
    setAutoFilling(false);

    if (failed > 0) {
      toast({
        title: "Auto-remplissage partiel",
        description: `${success} créneau(x) mis à jour, ${failed} en échec.`,
        variant: "destructive",
      });
    } else {
      const extras: string[] = [];
      if (plan.emptySlots > 0) extras.push(`${plan.emptySlots} créneau(x) sans module`);
      if (plan.unassignedModules > 0)
        extras.push(`${plan.unassignedModules} module(s) ignoré(s) — manque de créneaux`);
      toast({
        title: `${success} créneau(x) auto-remplis`,
        description: extras.length > 0 ? extras.join(" · ") : "Tout est aligné sur le programme.",
      });
    }
    await onRefresh();
  };

  const handleMarkPlanned = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("sessions")
        .update({ is_planned: true })
        .eq("id", formation.id)
        .eq("entity_id", formation.entity_id);
      if (error) throw error;
      toast({ title: "Formation marquée comme planifiée" });
      await onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible de marquer comme planifiée";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const today = new Date();
  const isToday = (d: Date) =>
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  const isCurrentMonth = (d: Date) => d.getMonth() === currentDate.getMonth();

  // Banner cohérence : compare heures planifiées vs heures prévues.
  const renderCoherenceBanner = () => {
    if (timeSlots.length === 0) return null;
    const { plannedHours, expected, outOfRangeSlots } = coherence;
    const delta = expected !== null ? plannedHours - expected : null;
    const status: "ok" | "missing" | "excess" | "neutral" =
      delta === null
        ? "neutral"
        : Math.abs(delta) < 0.1
          ? "ok"
          : delta < 0
            ? "missing"
            : "excess";
    const palette = {
      ok: "border-green-200 bg-green-50 text-green-900",
      missing: "border-amber-200 bg-amber-50 text-amber-900",
      excess: "border-red-200 bg-red-50 text-red-900",
      neutral: "border-gray-200 bg-gray-50 text-gray-700",
    }[status];

    return (
      <div className={cn("border rounded-lg px-3 py-2 flex items-start gap-3", palette)}>
        <Clock className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="flex-1 text-xs space-y-0.5">
          <p className="font-medium">
            {plannedHours} h planifiée{plannedHours > 1 ? "s" : ""}
            {expected !== null && (
              <> sur {expected} h prévue{expected > 1 ? "s" : ""}</>
            )}
            {status === "ok" && " ✓"}
            {status === "missing" && delta !== null && (
              <> — manque {Math.abs(delta).toFixed(1)} h</>
            )}
            {status === "excess" && delta !== null && (
              <> — excès de {delta.toFixed(1)} h</>
            )}
          </p>
          {outOfRangeSlots > 0 && (
            <p className="flex items-center gap-1 text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              {outOfRangeSlots} créneau{outOfRangeSlots > 1 ? "x" : ""} hors période de la session
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Titre */}
      <h2 className="text-xl font-bold">{formation.title}</h2>

      {/* PLAN-3 audit BMAD : banner cohérence heures + alerte hors-période */}
      {renderCoherenceBanner()}

      {/* PLAN-6 audit BMAD : banner conflits formateurs cross-session */}
      {conflicts.length > 0 && (
        <div className="border border-red-200 bg-red-50 rounded-lg px-3 py-2 flex items-start gap-3">
          <UserX className="h-4 w-4 mt-0.5 shrink-0 text-red-600" />
          <div className="flex-1 text-xs space-y-0.5">
            <p className="font-medium text-red-900">
              {conflicts.length} conflit{conflicts.length > 1 ? "s" : ""} formateur détecté{conflicts.length > 1 ? "s" : ""}
            </p>
            {Array.from(
              new Map(
                conflicts.map((c) => [
                  `${c.trainerId}-${c.conflictingSessionId}`,
                  c,
                ]),
              ).values(),
            )
              .slice(0, 5)
              .map((c) => (
                <p key={`${c.trainerId}-${c.conflictingSessionId}`} className="text-red-800">
                  • <strong>{c.trainerName}</strong> est aussi sur «&nbsp;{c.conflictingSessionTitle}&nbsp;»
                  ({new Date(c.conflictingStart).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" })})
                </p>
              ))}
            {conflicts.length > 5 && (
              <p className="text-red-700 italic">… et {conflicts.length - 5} autre(s).</p>
            )}
          </div>
        </div>
      )}

      {/* Calendrier */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => navigate(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={goToday}>
                Aujourd&apos;hui
              </Button>
            </div>
            <h3 className="text-lg font-semibold capitalize">
              {MONTHS_FR[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h3>
            <div className="flex gap-1">
              {(["month", "week", "day", "trainers"] as ViewMode[]).map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant={viewMode === m ? "default" : "outline"}
                  onClick={() => setViewMode(m)}
                >
                  {m === "month"
                    ? "Mois"
                    : m === "week"
                      ? "Semaine"
                      : m === "day"
                        ? "Jour"
                        : "Par formateur"}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {viewMode === "month" && (
            <div className="border rounded-lg overflow-hidden">
              {/* En-têtes jours */}
              <div className="grid grid-cols-7 bg-muted/50">
                {DAYS_FR.map((d) => (
                  <div key={d} className="p-2 text-center text-sm font-medium border-b">
                    {d}
                  </div>
                ))}
              </div>
              {/* Grille des jours */}
              <div className="grid grid-cols-7">
                {monthDays.map((day, i) => {
                  const slots = getSlotsForDay(day);
                  return (
                    <div
                      key={i}
                      className={cn(
                        "min-h-[80px] p-1 border-b border-r",
                        !isCurrentMonth(day) && "bg-muted/30",
                        isToday(day) && "bg-amber-50"
                      )}
                    >
                      <div className={cn(
                        "text-sm text-right p-1",
                        !isCurrentMonth(day) && "text-muted-foreground"
                      )}>
                        {day.getDate()}
                      </div>
                      {/* PLAN-3 audit BMAD : affiche 2 slots max + indicator "+N" si plus */}
                      {slots.slice(0, 2).map((slot) => {
                        const conflict = conflictingSlotIds.has(slot.id);
                        return (
                          <button
                            key={slot.id}
                            type="button"
                            onClick={() => setEditingSlot(slot)}
                            className={cn(
                              "block w-full text-left text-xs p-1 mb-0.5 rounded truncate transition-colors cursor-pointer",
                              conflict
                                ? "bg-red-100 hover:bg-red-200 text-red-800 border border-red-300"
                                : "bg-primary/10 hover:bg-primary/20 text-primary",
                            )}
                            title={`${new Date(slot.start_time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })} - ${slot.title || formation.title}${conflict ? " — ⚠ conflit formateur" : " — cliquer pour éditer"}`}
                          >
                            {conflict && "⚠ "}
                            {new Date(slot.start_time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}{" "}
                            {slot.title || formation.title}
                          </button>
                        );
                      })}
                      {slots.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setViewMode("day")}
                          className="block w-full text-[10px] text-gray-500 hover:text-gray-700 cursor-pointer pl-1"
                          title="Basculer en vue Jour pour voir tous les créneaux"
                        >
                          + {slots.length - 2} autre{slots.length - 2 > 1 ? "s" : ""}…
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {viewMode === "week" && (
            <div className="border rounded-lg overflow-hidden">
              <div className="grid grid-cols-7 bg-muted/50">
                {DAYS_FR.map((d, i) => {
                  const startOfWeek = new Date(currentDate);
                  const dayOfWeek = startOfWeek.getDay();
                  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                  startOfWeek.setDate(startOfWeek.getDate() - diff + i);
                  return (
                    <div key={d} className="p-2 text-center text-sm font-medium border-b">
                      {d} {startOfWeek.getDate()}
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-7">
                {DAYS_FR.map((_, i) => {
                  const day = new Date(currentDate);
                  const dayOfWeek = day.getDay();
                  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                  day.setDate(day.getDate() - diff + i);
                  const slots = getSlotsForDay(day);
                  return (
                    <div key={i} className={cn("min-h-[200px] p-2 border-r", isToday(day) && "bg-amber-50")}>
                      {slots.map((slot) => {
                        const start = new Date(slot.start_time);
                        const end = new Date(slot.end_time);
                        const conflict = conflictingSlotIds.has(slot.id);
                        return (
                          <button
                            key={slot.id}
                            type="button"
                            onClick={() => setEditingSlot(slot)}
                            className={cn(
                              "block w-full text-left text-xs p-2 mb-1 rounded transition-colors cursor-pointer",
                              conflict
                                ? "bg-red-100 hover:bg-red-200 text-red-800 border border-red-300"
                                : "bg-primary/10 hover:bg-primary/20 text-primary",
                            )}
                            title={conflict ? "⚠ Conflit formateur — cliquer pour éditer" : "Cliquer pour éditer"}
                          >
                            <div className="font-medium flex items-center gap-1">
                              {conflict && <UserX className="h-3 w-3" />}
                              {start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })} -{" "}
                              {end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}
                            </div>
                            <div className="truncate">{slot.title || formation.title}</div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {viewMode === "day" && (
            <div className="border rounded-lg">
              <div className="p-3 bg-muted/50 border-b flex items-center justify-between gap-2">
                <span className="font-medium">
                  {currentDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </span>
                {/* PLAN-8 audit BMAD : duplication d'un jour vers une date cible */}
                {getSlotsForDay(currentDate).length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-[11px] h-6 gap-1"
                    onClick={handleDuplicateDay}
                    title="Recopie les créneaux de ce jour vers une autre date (titre + horaires + contenu pédagogique)"
                  >
                    Dupliquer ce jour
                  </Button>
                )}
              </div>
              <div className="divide-y">
                {Array.from({ length: 12 }, (_, i) => i + 8).map((hour) => {
                  const slots = getSlotsForDay(currentDate).filter((s) => {
                    const h = new Date(s.start_time).getHours();
                    return h === hour;
                  });
                  return (
                    <div key={hour} className="flex min-h-[50px]">
                      <div className="w-16 p-2 text-xs text-muted-foreground border-r text-right">
                        {hour}:00
                      </div>
                      <div className="flex-1 p-1">
                        {slots.map((slot) => {
                          const start = new Date(slot.start_time);
                          const end = new Date(slot.end_time);
                          const conflict = conflictingSlotIds.has(slot.id);
                          return (
                            <button
                              key={slot.id}
                              type="button"
                              onClick={() => setEditingSlot(slot)}
                              className={cn(
                                "block w-full text-left text-xs p-2 rounded transition-colors cursor-pointer",
                                conflict
                                  ? "bg-red-100 hover:bg-red-200 text-red-800 border border-red-300"
                                  : "bg-primary/10 hover:bg-primary/20 text-primary",
                              )}
                              title={conflict ? "⚠ Conflit formateur — cliquer pour éditer" : "Cliquer pour éditer"}
                            >
                              {conflict && "⚠ "}
                              {start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })} -{" "}
                              {end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })} |{" "}
                              {slot.title || formation.title}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* PLAN-9 audit BMAD : vue par formateur — tableau formateur × jour
              de la semaine. Inclut les slots cross-session pour spotter les
              double-bookings et la disponibilité. */}
          {viewMode === "trainers" && (
            <div className="border rounded-lg overflow-hidden">
              {trainerLoads.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Aucun formateur assigné à cette session — assignez-en dans l&apos;onglet Résumé.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold text-gray-700 min-w-[160px]">Formateur</th>
                        {DAYS_FR.map((d, i) => {
                          const day = new Date(weekRange.start);
                          day.setDate(day.getDate() + i);
                          return (
                            <th key={d} className={cn("text-left px-3 py-2 font-semibold text-gray-700 min-w-[140px]", isToday(day) && "bg-amber-50")}>
                              {d} {day.getDate()}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {trainerLoads.map((load) => {
                        const totalHours = load.slots.reduce(
                          (acc, s) => acc + (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 3_600_000,
                          0,
                        );
                        return (
                          <tr key={load.trainerId}>
                            <td className="px-3 py-2 align-top">
                              <p className="font-medium">{load.name}</p>
                              <p className="text-[10px] text-gray-400">{Math.round(totalHours * 10) / 10} h / semaine</p>
                            </td>
                            {DAYS_FR.map((_, i) => {
                              const day = new Date(weekRange.start);
                              day.setDate(day.getDate() + i);
                              const dayStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
                              const daySlots = load.slots.filter((s) => {
                                const sd = new Date(s.start_time);
                                const sdStr = `${sd.getFullYear()}-${String(sd.getMonth() + 1).padStart(2, "0")}-${String(sd.getDate()).padStart(2, "0")}`;
                                return sdStr === dayStr;
                              });
                              return (
                                <td key={i} className={cn("px-2 py-1 align-top", isToday(day) && "bg-amber-50/50")}>
                                  {daySlots.length === 0 ? (
                                    <span className="text-[10px] text-gray-300">—</span>
                                  ) : (
                                    daySlots.map((s) => (
                                      <div
                                        key={s.id}
                                        className={cn(
                                          "text-[10px] p-1 mb-0.5 rounded truncate",
                                          s.isCurrentSession
                                            ? "bg-primary/10 text-primary"
                                            : "bg-orange-100 text-orange-800 border border-orange-200",
                                        )}
                                        title={`${new Date(s.start_time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}–${new Date(s.end_time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })} | ${s.sessionTitle}`}
                                      >
                                        {new Date(s.start_time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}{" "}
                                        {s.isCurrentSession ? "" : "↪"}
                                      </div>
                                    ))
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="text-[10px] text-gray-400 px-3 py-2 border-t flex items-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded bg-primary/40" /> cette session
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded bg-orange-300" /> autre session (↪)
                    </span>
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Création en masse */}
      <BulkSlotCreator formation={formation} onRefresh={onRefresh} />

      {/* Actions compactes */}
      {timeSlots.length > 0 && (
        <div className="flex items-center gap-3 pt-2 flex-wrap">
          {/* PLAN-7 audit BMAD : exports planning */}
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 gap-1"
            onClick={handleExportIcs}
            title="Importable dans Google Calendar / Outlook / Apple Calendar"
          >
            <Calendar className="h-3 w-3" /> Exporter .ics
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 gap-1"
            onClick={handleExportPdf}
            title="Récap PDF avec horaires et modules pédagogiques"
          >
            <Download className="h-3 w-3" /> Exporter PDF
          </Button>
          {/* PLAN-5 audit BMAD : auto-fill modules depuis programme.
              Visible uniquement si le programme attaché a au moins 1 module. */}
          {(formation.program?.content?.modules?.length ?? 0) > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 gap-1 border-purple-300 text-purple-700 hover:bg-purple-50"
              onClick={handleAutoFillModules}
              disabled={autoFilling}
              title="Distribue les modules du programme sur les créneaux par ordre chronologique"
            >
              <Sparkles className="h-3 w-3" />
              {autoFilling
                ? "Remplissage…"
                : `Auto-remplir depuis le programme (${formation.program?.content?.modules?.length} module${(formation.program?.content?.modules?.length ?? 0) > 1 ? "s" : ""})`}
            </Button>
          )}
          {!formation.is_planned && (
            <Button size="sm" className="text-xs h-7 gap-1 bg-green-600 hover:bg-green-700 text-white"
              onClick={() => setConfirmMarkPlannedOpen(true)}
              disabled={saving}>
              <CheckCircle className="h-3 w-3" /> Marquer comme planifiée
            </Button>
          )}
          <Button size="sm" variant="outline" className="text-xs h-7 gap-1 text-red-500 hover:text-red-600 hover:bg-red-50"
            onClick={() => setConfirmDeleteAllOpen(true)}
            disabled={deleting}>
            <Trash2 className="h-3 w-3" /> Supprimer tous les créneaux
          </Button>
        </div>
      )}

      {/* PLAN-1 audit BMAD : dialog d'édition au clic sur un slot */}
      <SlotEditDialog
        slot={editingSlot}
        onClose={() => setEditingSlot(null)}
        onRefresh={onRefresh}
        entityId={entityId}
      />

      {/* PLAN-10 audit BMAD : Dialog shadcn de confirmation
          (remplace les confirm() natifs) */}
      <Dialog open={confirmMarkPlannedOpen} onOpenChange={setConfirmMarkPlannedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marquer la formation comme planifiée</DialogTitle>
            <DialogDescription>
              Une fois marquée, la formation passe au statut planifiée. Les automatisations
              déclenchées par cet état (notifications, rappels…) seront activées.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmMarkPlannedOpen(false)} disabled={saving}>
              Annuler
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={async () => {
                setConfirmMarkPlannedOpen(false);
                setSaving(true);
                await handleMarkPlanned();
              }}
              disabled={saving}
            >
              <CheckCircle className="h-4 w-4 mr-1" /> Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDeleteAllOpen} onOpenChange={setConfirmDeleteAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer tous les créneaux ?</DialogTitle>
            <DialogDescription>
              {timeSlots.length} créneau(x) seront définitivement supprimés. Le contenu
              pédagogique (modules, objectifs, thèmes, exercices) sera aussi perdu. Cette
              action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteAllOpen(false)} disabled={deleting}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                setConfirmDeleteAllOpen(false);
                await handleDeleteAll();
              }}
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Supprimer tout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
