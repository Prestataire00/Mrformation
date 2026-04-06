"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  MapPin,
  Loader2,
  Download,
  CalendarPlus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Constants (French calendar labels)                                  */
/* ------------------------------------------------------------------ */
const MONTHS_FR_FULL = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
const DAYS_FR = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
const BRAND_LIGHT = "rgba(61, 181, 197, 0.15)";

const MODE_LABELS: Record<string, string> = {
  presentiel: "Présentiel",
  distanciel: "Distanciel",
  hybride: "Hybride",
};

const MODE_COLORS: Record<string, string> = {
  presentiel: "bg-blue-100 text-blue-800",
  distanciel: "bg-purple-100 text-purple-800",
  hybride: "bg-teal-100 text-teal-800",
};

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */
interface CalendarSession {
  id: string;
  title: string;
  training_title: string | null;
  start_date: string;
  end_date: string;
  start_hour: string;
  location: string | null;
  mode: string;
  trainer_name: string | null;
}

/* ------------------------------------------------------------------ */
/*  Calendar grid helpers                                               */
/* ------------------------------------------------------------------ */
function getWeekDays(baseDate: string): string[] {
  const d = new Date(baseDate);
  const dow = d.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return day.toISOString().slice(0, 10);
  });
}

function buildCalendarGrid(calYear: number, calMonth: number) {
  const firstOfMonth = new Date(calYear, calMonth, 1);
  const lastOfMonth = new Date(calYear, calMonth + 1, 0);
  let startDow = firstOfMonth.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const days: { date: number; inMonth: boolean; dateStr: string }[] = [];

  const prevLast = new Date(calYear, calMonth, 0).getDate();
  for (let i = startDow - 1; i >= 0; i--) {
    const d = prevLast - i;
    const pm = calMonth === 0 ? 11 : calMonth - 1;
    const py = calMonth === 0 ? calYear - 1 : calYear;
    days.push({ date: d, inMonth: false, dateStr: `${py}-${String(pm + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
  }

  for (let d = 1; d <= lastOfMonth.getDate(); d++) {
    days.push({ date: d, inMonth: true, dateStr: `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
  }

  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    const nm = calMonth === 11 ? 0 : calMonth + 1;
    const ny = calMonth === 11 ? calYear + 1 : calYear;
    days.push({ date: d, inMonth: false, dateStr: `${ny}-${String(nm + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
  }

  return days;
}

/* ------------------------------------------------------------------ */
/*  Google Calendar URL builder                                         */
/* ------------------------------------------------------------------ */
function buildGoogleCalendarUrl(session: CalendarSession): string {
  const start = new Date(session.start_date).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const end = new Date(session.end_date).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const title = encodeURIComponent(session.training_title || session.title);
  const location = encodeURIComponent(session.location || "");
  const details = encodeURIComponent(
    `Formation : ${session.training_title || session.title}${session.trainer_name ? `\nFormateur : ${session.trainer_name}` : ""}${session.mode ? `\nMode : ${MODE_LABELS[session.mode] || session.mode}` : ""}`
  );
  return `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&location=${location}&details=${details}`;
}

/* ------------------------------------------------------------------ */
/*  Hour slots for day view                                             */
/* ------------------------------------------------------------------ */
const HOUR_SLOTS = Array.from({ length: 12 }, (_, i) => i + 8);

/* ------------------------------------------------------------------ */
/*  Main page                                                           */
/* ------------------------------------------------------------------ */
export default function LearnerCalendarPage() {
  const supabase = createClient();
  const today = new Date();

  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<CalendarSession[]>([]);
  const [learnerId, setLearnerId] = useState<string | null>(null);

  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calendarView, setCalendarView] = useState<"month" | "week" | "day">("month");
  const [calSelectedDay, setCalSelectedDay] = useState(today.toISOString().slice(0, 10));

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: learner } = await supabase
      .from("learners")
      .select("id")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (!learner) { setLoading(false); return; }
    setLearnerId(learner.id);

    const { data: enrollments } = await supabase
      .from("enrollments")
      .select(`
        session_id,
        sessions(
          id, title, start_date, end_date, location, mode,
          trainings(title),
          trainers(first_name, last_name)
        )
      `)
      .eq("learner_id", learner.id)
      .neq("status", "cancelled");

    if (enrollments) {
      const mapped: CalendarSession[] = enrollments
        .filter((e: any) => e.sessions)
        .map((e: any) => {
          const s = e.sessions;
          const startHour = s.start_date ? String(new Date(s.start_date).getHours()) : "9";
          return {
            id: s.id,
            title: s.title,
            training_title: s.trainings?.title || null,
            start_date: s.start_date,
            end_date: s.end_date,
            start_hour: startHour,
            location: s.location,
            mode: s.mode,
            trainer_name: s.trainers
              ? `${s.trainers.first_name} ${s.trainers.last_name}`
              : null,
          };
        });
      setSessions(mapped);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  /* ---------------------------------------------------------------- */
  /*  Calendar navigation                                               */
  /* ---------------------------------------------------------------- */
  function getSessionsForDate(dateStr: string) {
    return sessions.filter((s) => s.start_date.slice(0, 10) === dateStr);
  }

  function getSessionsForHour(dateStr: string, hour: number) {
    return sessions.filter((s) => {
      if (s.start_date.slice(0, 10) !== dateStr) return false;
      return parseInt(s.start_hour, 10) === hour;
    });
  }

  function calNavWeek(dir: "prev" | "next") {
    const d = new Date(calSelectedDay);
    d.setDate(d.getDate() + (dir === "prev" ? -7 : 7));
    const newDay = d.toISOString().slice(0, 10);
    setCalSelectedDay(newDay);
    setCalMonth(d.getMonth());
    setCalYear(d.getFullYear());
  }

  function calNavDay(dir: "prev" | "next") {
    const d = new Date(calSelectedDay);
    d.setDate(d.getDate() + (dir === "prev" ? -1 : 1));
    const newDay = d.toISOString().slice(0, 10);
    setCalSelectedDay(newDay);
    setCalMonth(d.getMonth());
    setCalYear(d.getFullYear());
  }

  function calPrev() {
    if (calendarView === "day") { calNavDay("prev"); return; }
    if (calendarView === "week") { calNavWeek("prev"); return; }
    if (calMonth === 0) { setCalMonth(11); setCalYear((y) => y - 1); }
    else setCalMonth((m) => m - 1);
  }

  function calNext() {
    if (calendarView === "day") { calNavDay("next"); return; }
    if (calendarView === "week") { calNavWeek("next"); return; }
    if (calMonth === 11) { setCalMonth(0); setCalYear((y) => y + 1); }
    else setCalMonth((m) => m + 1);
  }

  function calToday() {
    const t = new Date();
    setCalSelectedDay(t.toISOString().slice(0, 10));
    setCalMonth(t.getMonth());
    setCalYear(t.getFullYear());
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                            */
  /* ---------------------------------------------------------------- */
  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 text-[#DC2626] animate-spin" />
      </div>
    );
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  // Selected day sessions for detail panel
  const selectedDaySessions = getSessionsForDate(calSelectedDay);

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/learner" className="text-[#DC2626] hover:underline">Accueil</Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-500">Calendrier</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mon Calendrier</h1>
          <p className="text-sm text-gray-500 mt-1">Visualisez vos sessions de formation planifiées.</p>
        </div>

        {/* Export buttons */}
        <div className="flex items-center gap-2">
          {learnerId && (
            <a
              href={`/api/calendar/export?format=ics`}
              download="mes-formations.ics"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              <Download className="h-4 w-4" />
              Exporter .ics
            </a>
          )}
        </div>
      </div>

      {/* Calendar */}
      <Card className="bg-white border border-gray-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-xl font-bold text-gray-900">
            {calendarView === "month" && `${MONTHS_FR_FULL[calMonth]} ${calYear}`}
            {calendarView === "week" && (() => {
              const days = getWeekDays(calSelectedDay);
              const first = new Date(days[0]);
              return `Semaine du ${first.getDate()} ${MONTHS_FR_FULL[first.getMonth()]}`;
            })()}
            {calendarView === "day" && (() => {
              const d = new Date(calSelectedDay);
              return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
            })()}
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-gray-200 overflow-hidden">
              {(["day", "week", "month"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setCalendarView(v)}
                  className={cn(
                    "px-3 py-1 text-xs font-medium transition",
                    calendarView === v ? "bg-[#DC2626] text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                  )}
                >
                  {v === "day" ? "Jour" : v === "week" ? "Semaine" : "Mois"}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={calToday} className="text-xs h-8">
              Aujourd&apos;hui
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={calPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={calNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">

          {/* Week view */}
          {calendarView === "week" && (() => {
            const weekDays = getWeekDays(calSelectedDay);
            return (
              <div className="overflow-x-auto">
                <div className="grid grid-cols-7 border-b border-gray-200 min-w-[700px]">
                  {weekDays.map((d) => {
                    const isToday = d === todayStr;
                    const daySessions = sessions.filter((s) => s.start_date.slice(0, 10) === d);
                    const dd = new Date(d);
                    return (
                      <div
                        key={d}
                        onClick={() => { setCalSelectedDay(d); setCalendarView("day"); }}
                        className={cn(
                          "p-2 min-h-[120px] border-r border-gray-100 last:border-r-0 cursor-pointer hover:bg-blue-50/30 transition",
                          isToday && "bg-blue-50/40"
                        )}
                      >
                        <div className={cn(
                          "text-xs font-semibold mb-1 text-center",
                          isToday ? "text-[#DC2626]" : "text-gray-500"
                        )}>
                          <div>{DAYS_FR[dd.getDay() === 0 ? 6 : dd.getDay() - 1]}</div>
                          <span className={cn(
                            "inline-flex items-center justify-center h-6 w-6 rounded-full text-sm font-bold",
                            isToday && "bg-[#DC2626] text-white"
                          )}>{dd.getDate()}</span>
                        </div>
                        <div className="space-y-0.5">
                          {daySessions.slice(0, 3).map((s) => (
                            <div
                              key={s.id}
                              className="text-[10px] rounded px-1 py-0.5 truncate font-medium"
                              style={{ backgroundColor: BRAND_LIGHT, color: "#0e7c8a" }}
                              title={`${s.start_hour}h — ${s.training_title || s.title}`}
                            >
                              <span className="font-bold">{s.start_hour}h</span> {s.training_title || s.title}
                            </div>
                          ))}
                          {daySessions.length > 3 && (
                            <span className="text-[9px] text-gray-400 px-1">+{daySessions.length - 3} autres</span>
                          )}
                          {daySessions.length === 0 && (
                            <span className="text-[10px] text-gray-300 italic">—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Day view */}
          {calendarView === "day" && (
            <div className="divide-y divide-gray-100">
              {HOUR_SLOTS.map((hour) => {
                const hourSessions = getSessionsForHour(calSelectedDay, hour);
                const isCurrentHour = calSelectedDay === todayStr && new Date().getHours() === hour;
                return (
                  <div key={hour} className={cn(
                    "flex gap-4 px-4 py-2 min-h-[52px]",
                    isCurrentHour && "bg-blue-50/40"
                  )}>
                    <div className={cn(
                      "w-12 text-xs font-mono flex-shrink-0 pt-1",
                      isCurrentHour ? "text-[#DC2626] font-bold" : "text-gray-400"
                    )}>
                      {String(hour).padStart(2, "0")}:00
                    </div>
                    <div className="flex-1 flex flex-wrap gap-2 items-start">
                      {hourSessions.map((s) => (
                        <div
                          key={s.id}
                          className="inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium"
                          style={{ backgroundColor: BRAND_LIGHT, color: "#0e7c8a" }}
                        >
                          <Calendar className="h-3 w-3" />
                          {s.training_title || s.title}
                          {s.location && (
                            <span className="text-gray-500 ml-1 flex items-center gap-0.5">
                              <MapPin className="h-2.5 w-2.5" />{s.location}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Month view */}
          {calendarView === "month" && <>
            <div className="grid grid-cols-7 border-b border-gray-200">
              {DAYS_FR.map((d, i) => (
                <div
                  key={d}
                  className={cn(
                    "py-2 text-center text-xs font-semibold text-gray-500 uppercase",
                    i >= 5 && "bg-amber-50/50"
                  )}
                >
                  {d}
                </div>
              ))}
            </div>

            {(() => {
              const grid = buildCalendarGrid(calYear, calMonth);
              const weeks: typeof grid[] = [];
              for (let i = 0; i < grid.length; i += 7) {
                weeks.push(grid.slice(i, i + 7));
              }

              return weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0">
                  {week.map((day, di) => {
                    const daySessions = getSessionsForDate(day.dateStr);
                    const isToday = day.dateStr === todayStr;
                    const isWeekend = di >= 5;
                    const isSelected = day.dateStr === calSelectedDay;

                    return (
                      <div
                        key={day.dateStr}
                        onClick={() => { setCalSelectedDay(day.dateStr); }}
                        className={cn(
                          "min-h-[90px] border-r border-gray-100 last:border-r-0 p-1 cursor-pointer hover:bg-blue-50/20 transition",
                          !day.inMonth && "bg-gray-50/60",
                          isWeekend && day.inMonth && "bg-amber-50/30",
                          isToday && "bg-blue-50/40",
                          isSelected && "ring-2 ring-[#DC2626] ring-inset"
                        )}
                      >
                        <span className={cn(
                          "inline-block text-xs font-medium mb-0.5 px-1 rounded",
                          !day.inMonth && "text-gray-300",
                          day.inMonth && "text-gray-700",
                          isToday && "bg-[#DC2626] text-white"
                        )}>
                          {day.date}
                        </span>
                        <div className="space-y-0.5">
                          {daySessions.slice(0, 3).map((s) => (
                            <div
                              key={s.id}
                              className="block truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight"
                              style={{ backgroundColor: BRAND_LIGHT, color: "#0e7c8a" }}
                              title={`${s.start_hour}h — ${s.training_title || s.title}`}
                            >
                              <span className="font-bold">{s.start_hour}</span>{" "}
                              {s.training_title || s.title}
                            </div>
                          ))}
                          {daySessions.length > 3 && (
                            <span className="text-[9px] text-gray-400 px-1">
                              +{daySessions.length - 3} autres
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ));
            })()}
          </>}
        </CardContent>
      </Card>

      {/* Selected day detail panel */}
      {selectedDaySessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#DC2626]" />
              {new Date(calSelectedDay).toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
              <span className="text-sm font-normal text-gray-400">
                — {selectedDaySessions.length} session{selectedDaySessions.length > 1 ? "s" : ""}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {selectedDaySessions.map((s) => (
                <div key={s.id} className="rounded-lg border p-4 space-y-2 hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">{s.training_title || s.title}</p>
                      {s.training_title && s.title !== s.training_title && (
                        <p className="text-xs text-gray-500">{s.title}</p>
                      )}
                    </div>
                    <Badge className={MODE_COLORS[s.mode] ?? "bg-gray-100 text-gray-800"}>
                      {MODE_LABELS[s.mode] ?? s.mode}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span>{s.start_hour}h — {new Date(s.end_date).getHours()}h</span>
                    {s.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />{s.location}
                      </span>
                    )}
                    {s.trainer_name && (
                      <span>Formateur : {s.trainer_name}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <a
                      href={buildGoogleCalendarUrl(s)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#DC2626] hover:underline"
                    >
                      <CalendarPlus className="h-3 w-3" />
                      Google Calendar
                    </a>
                    <a
                      href={`/api/calendar/export?session_id=${s.id}&format=ics`}
                      download={`session-${s.id}.ics`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#DC2626] hover:underline"
                    >
                      <Download className="h-3 w-3" />
                      Apple / Outlook (.ics)
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
