"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Trash2, CheckCircle, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { cn, formatDate } from "@/lib/utils";
import type { Session, FormationTimeSlot } from "@/lib/types";
import { BulkSlotCreator } from "./BulkSlotCreator";

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
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const timeSlots = formation.formation_time_slots || [];

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
    const dateStr = date.toISOString().split("T")[0];
    return timeSlots.filter((slot) => {
      const slotDate = new Date(slot.start_time).toISOString().split("T")[0];
      return slotDate === dateStr;
    });
  };

  const handleDeleteAll = async () => {
    setDeleting(true);
    const { error } = await supabase
      .from("formation_time_slots")
      .delete()
      .eq("session_id", formation.id);
    setDeleting(false);
    if (error) {
      toast({ title: "Erreur", variant: "destructive" });
    } else {
      toast({ title: "Tous les créneaux supprimés" });
      onRefresh();
    }
  };

  const handleMarkPlanned = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("sessions")
      .update({ is_planned: true })
      .eq("id", formation.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erreur", variant: "destructive" });
    } else {
      toast({ title: "Formation marquée comme planifiée" });
      onRefresh();
    }
  };

  const today = new Date();
  const isToday = (d: Date) =>
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  const isCurrentMonth = (d: Date) => d.getMonth() === currentDate.getMonth();

  return (
    <div className="space-y-6">
      {/* Titre */}
      <h2 className="text-xl font-bold">{formation.title}</h2>

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
                      {slots.map((slot) => (
                        <div
                          key={slot.id}
                          className="text-xs p-1 mb-0.5 bg-primary/10 text-primary rounded truncate"
                          title={`${new Date(slot.start_time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} - ${slot.title || formation.title}`}
                        >
                          {new Date(slot.start_time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}{" "}
                          {slot.title || formation.title}
                        </div>
                      ))}
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
                          <div key={slot.id} className="text-xs p-2 mb-1 bg-primary/10 text-primary rounded">
                            <div className="font-medium">
                              {start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} -{" "}
                              {end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                            <div className="truncate">{slot.title || formation.title}</div>
                          </div>
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
                            <div key={slot.id} className="text-xs p-2 bg-primary/10 text-primary rounded">
                              {start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} -{" "}
                              {end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} |{" "}
                              {slot.title || formation.title}
                            </div>
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
        <div className="flex items-center gap-3 pt-2">
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
    </div>
  );
}
