"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CalendarDays,
  MapPin,
  Clock,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatDate, STATUS_COLORS, SESSION_STATUS_LABELS } from "@/lib/utils";
import type { Session } from "@/lib/types";
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

interface SessionWithDetails extends Omit<Session, "training" | "enrollments"> {
  training?: { title: string };
}

export default function TrainerPlanningPage() {
  const supabase = createClient();
  const [sessions, setSessions] = useState<SessionWithDetails[]>([]);
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

    const { data: trainer } = await supabase
      .from("trainers")
      .select("id")
      .eq("profile_id", user.id)
      .single();

    if (!trainer) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("sessions")
      .select("*, training:trainings(title)")
      .eq("trainer_id", trainer.id)
      .order("start_date", { ascending: true });

    setSessions((data as SessionWithDetails[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const weekSessions = sessions.filter((s) => {
    const d = parseISO(s.start_date);
    return isWithinInterval(d, { start: currentWeekStart, end: currentWeekEnd });
  });

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
          const daySessions = weekSessions.filter((s) =>
            isSameDay(parseISO(s.start_date), day)
          );
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
                {daySessions.map((session) => (
                  <div
                    key={session.id}
                    className="bg-blue-100 text-blue-800 rounded-lg px-2 py-1.5 text-xs"
                  >
                    <p className="font-medium truncate">{session.title}</p>
                    <p className="text-blue-600 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {format(parseISO(session.start_date), "HH:mm")}
                    </p>
                    {session.location && (
                      <p className="text-blue-600 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" />
                        <span className="truncate">{session.location}</span>
                      </p>
                    )}
                  </div>
                ))}
                {daySessions.length === 0 && (
                  <p className="text-xs text-gray-300 text-center mt-4">—</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sessions list below */}
      {weekSessions.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Détail de la semaine ({weekSessions.length} session{weekSessions.length > 1 ? "s" : ""})
          </h2>
          <div className="space-y-2">
            {weekSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-3"
              >
                <div>
                  <p className="font-medium text-sm text-gray-900">{session.title}</p>
                  <p className="text-xs text-gray-500">
                    {formatDate(session.start_date)}
                    {session.location ? ` — ${session.location}` : ""}
                  </p>
                </div>
                <Badge className={cn("text-xs", STATUS_COLORS[session.status])}>
                  {SESSION_STATUS_LABELS[session.status] ?? session.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
