"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { ChevronLeft, ChevronRight, Trash2, CheckCircle, AlertTriangle, Clock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { resolveDisplayedHours } from "@/lib/utils/hours-source";
import { distributeModulesToSlots } from "@/lib/utils/auto-fill-modules";
import { deleteAllTimeSlotsForSession, updateTimeSlot } from "@/lib/services/time-slots";
import type { Session, FormationTimeSlot } from "@/lib/types";
import { BulkSlotCreator } from "./BulkSlotCreator";
import { SlotEditDialog } from "./SlotEditDialog";

type ViewMode = "month" | "week" | "day";

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

  const timeSlots = formation.formation_time_slots || [];

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
              {(["month", "week", "day"] as ViewMode[]).map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant={viewMode === m ? "default" : "outline"}
                  onClick={() => setViewMode(m)}
                >
                  {m === "month" ? "Mois" : m === "week" ? "Semaine" : "Jour"}
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
                      {slots.slice(0, 2).map((slot) => (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => setEditingSlot(slot)}
                          className="block w-full text-left text-xs p-1 mb-0.5 bg-primary/10 hover:bg-primary/20 text-primary rounded truncate transition-colors cursor-pointer"
                          title={`${new Date(slot.start_time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })} - ${slot.title || formation.title} — cliquer pour éditer`}
                        >
                          {new Date(slot.start_time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}{" "}
                          {slot.title || formation.title}
                        </button>
                      ))}
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
                        return (
                          <button
                            key={slot.id}
                            type="button"
                            onClick={() => setEditingSlot(slot)}
                            className="block w-full text-left text-xs p-2 mb-1 bg-primary/10 hover:bg-primary/20 text-primary rounded transition-colors cursor-pointer"
                            title="Cliquer pour éditer ce créneau"
                          >
                            <div className="font-medium">
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
              <div className="p-3 bg-muted/50 font-medium text-center border-b">
                {currentDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
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
                          return (
                            <button
                              key={slot.id}
                              type="button"
                              onClick={() => setEditingSlot(slot)}
                              className="block w-full text-left text-xs p-2 bg-primary/10 hover:bg-primary/20 text-primary rounded transition-colors cursor-pointer"
                              title="Cliquer pour éditer ce créneau"
                            >
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
        </CardContent>
      </Card>

      {/* Création en masse */}
      <BulkSlotCreator formation={formation} onRefresh={onRefresh} />

      {/* Actions compactes */}
      {timeSlots.length > 0 && (
        <div className="flex items-center gap-3 pt-2 flex-wrap">
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
            <Button size="sm" className="text-xs h-7 gap-1 bg-green-600 hover:bg-green-700 text-white" onClick={async () => {
              if (!confirm("Confirmer que la formation est planifiée ?")) return;
              setSaving(true);
              await handleMarkPlanned();
            }} disabled={saving}>
              <CheckCircle className="h-3 w-3" /> Marquer comme planifiée
            </Button>
          )}
          <Button size="sm" variant="outline" className="text-xs h-7 gap-1 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={async () => {
            if (!confirm("Supprimer tous les créneaux planifiés ? Cette action est irréversible.")) return;
            await handleDeleteAll();
          }} disabled={deleting}>
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
    </div>
  );
}
