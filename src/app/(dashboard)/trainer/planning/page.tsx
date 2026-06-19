"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveTrainerSessionIds } from "@/lib/auth/trainer-session-access";
import { useToast } from "@/components/ui/use-toast";
import {
  MapPin,
  Clock,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  format,
  parseISO,
  isWithinInterval,
  eachDayOfInterval,
  isSameDay,
} from "date-fns";
import { fr } from "date-fns/locale";

// Un événement de planning = un CRÉNEAU (formation_time_slots), pas la session
// entière. Une session pluri-jours (ex. 100 créneaux sur 2 mois) doit apparaître
// sur chacun de ses créneaux, pas seulement sur sa start_date.
interface SlotEvent {
  id: string;
  sessionId: string;
  title: string;
  location: string | null;
  start: string; // ISO
  end: string | null; // ISO
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

export default function TrainerPlanningPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const [events, setEvents] = useState<SlotEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);

  const now = new Date();
  const currentWeekStart = startOfWeek(addWeeks(now, weekOffset), { weekStartsOn: 1 });
  const currentWeekEnd = endOfWeek(addWeeks(now, weekOffset), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: currentWeekStart, end: currentWeekEnd });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const sessionIds = await resolveTrainerSessionIds(supabase, user.id);
    if (sessionIds.length === 0) {
      setEvents([]);
      setLoading(false);
      return;
    }

    const [sessRes, slotRes] = await Promise.all([
      supabase.from("sessions").select("id, title, location, start_date").in("id", sessionIds),
      supabase
        .from("formation_time_slots")
        .select("id, session_id, title, start_time, end_time")
        .in("session_id", sessionIds)
        .order("start_time", { ascending: true }),
    ]);

    if (sessRes.error || slotRes.error) {
      toast({ title: "Erreur", description: "Impossible de charger votre planning.", variant: "destructive" });
      setEvents([]);
      setLoading(false);
      return;
    }

    const sessions = (sessRes.data ?? []) as Array<{ id: string; title: string; location: string | null; start_date: string }>;
    const sessionMap = new Map(sessions.map((s) => [s.id, s]));
    const slots = (slotRes.data ?? []) as Array<{ id: string; session_id: string; title: string | null; start_time: string; end_time: string | null }>;

    let built: SlotEvent[];
    if (slots.length > 0) {
      built = slots.map((sl) => {
        const sess = sessionMap.get(sl.session_id);
        return {
          id: sl.id,
          sessionId: sl.session_id,
          title: sl.title || sess?.title || "Session",
          location: sess?.location ?? null,
          start: sl.start_time,
          end: sl.end_time,
        };
      });
    } else {
      // Repli : sessions sans créneau détaillé → 1 événement sur la date de début.
      built = sessions.map((s) => ({
        id: s.id,
        sessionId: s.id,
        title: s.title,
        location: s.location,
        start: s.start_date,
        end: null,
      }));
    }
    setEvents(built);
    setLoading(false);
  }, [supabase, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const weekEvents = events
    .filter((e) => isWithinInterval(parseISO(e.start), { start: currentWeekStart, end: currentWeekEnd }))
    .sort((a, b) => a.start.localeCompare(b.start));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mon Planning</h1>
          <p className="text-gray-500 text-sm mt-1">
            Semaine du {format(currentWeekStart, "d MMMM", { locale: fr })} au{" "}
            {format(currentWeekEnd, "d MMMM yyyy", { locale: fr })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekOffset((w) => w - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekOffset(0)}
            className={cn(weekOffset === 0 && "bg-blue-50 text-blue-600")}
          >
            Aujourd&apos;hui
          </Button>
          <Button variant="outline" size="icon" onClick={() => setWeekOffset((w) => w + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-7 gap-3">
        {days.map((day) => {
          const dayEvents = weekEvents.filter((e) => isSameDay(parseISO(e.start), day));
          const isToday = isSameDay(day, now);

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "bg-white border rounded-xl p-3 min-h-[140px]",
                isToday ? "border-blue-300 bg-blue-50/30" : "border-gray-200"
              )}
            >
              <div className="text-center mb-2">
                <p className="text-xs text-gray-500 uppercase">
                  {format(day, "EEE", { locale: fr })}
                </p>
                <p
                  className={cn(
                    "text-lg font-bold",
                    isToday ? "text-blue-600" : "text-gray-900"
                  )}
                >
                  {format(day, "d")}
                </p>
              </div>
              <div className="space-y-1.5">
                {dayEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="bg-blue-100 text-blue-800 rounded-lg px-2 py-1.5 text-xs"
                  >
                    <p className="font-medium truncate">{ev.title}</p>
                    <p className="text-blue-600 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {fmtTime(ev.start)}{ev.end ? `–${fmtTime(ev.end)}` : ""}
                    </p>
                    {ev.location && (
                      <p className="text-blue-600 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" />
                        <span className="truncate">{ev.location}</span>
                      </p>
                    )}
                  </div>
                ))}
                {dayEvents.length === 0 && (
                  <p className="text-xs text-gray-300 text-center mt-4">—</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Détail de la semaine */}
      {weekEvents.length === 0 ? (
        <p className="mt-6 text-sm text-gray-500 text-center">
          Aucun créneau planifié cette semaine.
        </p>
      ) : (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Détail de la semaine ({weekEvents.length} créneau{weekEvents.length > 1 ? "x" : ""})
          </h2>
          <div className="space-y-2">
            {weekEvents.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-3"
              >
                <div>
                  <p className="font-medium text-sm text-gray-900">{ev.title}</p>
                  <p className="text-xs text-gray-500">
                    {format(parseISO(ev.start), "EEEE d MMMM", { locale: fr })} · {fmtTime(ev.start)}
                    {ev.end ? `–${fmtTime(ev.end)}` : ""}
                    {ev.location ? ` — ${ev.location}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
