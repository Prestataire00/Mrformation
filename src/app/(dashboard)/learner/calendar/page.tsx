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
  GraduationCap,
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
  /** Heure de début formatée Europe/Paris (ex. "09:00"), ou null si inconnue. */
  start_hour: string | null;
  location: string | null;
  mode: string;
  trainer_name: string | null;
}

/* ------------------------------------------------------------------ */
/*  Time helpers                                                        */
/* ------------------------------------------------------------------ */
/** Formate une heure en Europe/Paris (ex. "09:00"). null si valeur absente. */
function formatParisHour(value: string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
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
  const [profileMissing, setProfileMissing] = useState(false);
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

    // Query nested unique : learners → enrollments → sessions → formation_time_slots
    // Évite les ruptures RLS entre 2 queries séparées + récupère les créneaux
    // détaillés (1 par jour/demi-journée) au lieu d'un seul event par session
    const { data: learnerData, error: learnerError } = await supabase
      .from("learners")
      .select(`
        id,
        enrollments(
          session_id, status,
          sessions(
            id, title, start_date, end_date, location, mode,
            trainings(title),
            trainers(first_name, last_name),
            formation_time_slots(id, start_time, end_time, title, module_title)
          )
        )
      `)
      .eq("profile_id", user.id)
      .maybeSingle();

    if (learnerError || !learnerData) {
      console.error("[calendar] learner fetch error:", learnerError);
      setProfileMissing(true);
      setLoading(false);
      return;
    }
    setLearnerId(learnerData.id);

    const enrollments = ((learnerData.enrollments as unknown as Array<{
      session_id: string;
      status: string;
      sessions: {
        id: string;
        title: string;
        start_date: string;
        end_date: string;
        location: string | null;
        mode: string;
        trainings: { title: string } | null;
        trainers: { first_name: string; last_name: string } | null;
        formation_time_slots: Array<{
          id: string;
          start_time: string;
          end_time: string;
          title: string | null;
          module_title: string | null;
        }> | null;
      } | null;
    }>) ?? []).filter((e) => e.status !== "cancelled");

    // Génère 1 event par formation_time_slot (créneau détaillé).
    // Fallback : si une session n'a aucun slot, on génère 1 event sur start_date
    // (rare, mais évite que la session disparaisse complètement du calendrier).
    const mapped: CalendarSession[] = [];
    for (const e of enrollments) {
      if (!e.sessions) continue;
      const s = e.sessions;
      const slots = s.formation_time_slots ?? [];
      const trainerName = s.trainers
        ? `${s.trainers.first_name} ${s.trainers.last_name}`
        : null;
      const trainingTitle = s.trainings?.title || null;

      if (slots.length > 0) {
        for (const slot of slots) {
          mapped.push({
            id: `${s.id}-${slot.id}`,
            title: slot.module_title || slot.title || s.title,
            training_title: trainingTitle,
            start_date: slot.start_time,
            end_date: slot.end_time,
            start_hour: formatParisHour(slot.start_time),
            location: s.location,
            mode: s.mode,
            trainer_name: trainerName,
          });
        }
      } else {
        mapped.push({
          id: s.id,
          title: s.title,
          training_title: trainingTitle,
          start_date: s.start_date,
          end_date: s.end_date,
          start_hour: formatParisHour(s.start_date),
          location: s.location,
          mode: s.mode,
          trainer_name: trainerName,
        });
      }
    }
    setSessions(mapped);

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
      if (!s.start_hour) return false;
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
        <Loader2 className="h-8 w-8 text-[#374151] animate-spin" />
      </div>
    );
  }

  if (profileMissing) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <GraduationCap className="h-12 w-12 text-muted-foreground" />
        <p className="text-lg font-medium text-muted-foreground">
          Profil apprenant non configuré
        </p>
        <p className="text-sm text-muted-foreground">
          Contactez votre administrateur pour configurer votre profil apprenant.
        </p>
      </div>
    );
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  // Selected day sessions for detail panel
  const selectedDaySessions = getSessionsForDate(calSelectedDay);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/learner" className="text-[#374151] hover:underline">Accueil</Link>
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
                    calendarView === v ? "bg-[#374151] text-white" : "bg-white text-gray-600 hover:bg-gray-50"
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
                          isToday ? "text-[#374151]" : "text-gray-500"
                        )}>
                          <div>{DAYS_FR[dd.getDay() === 0 ? 6 : dd.getDay() - 1]}</div>
                          <span className={cn(
                            "inline-flex items-center justify-center h-6 w-6 rounded-full text-sm font-bold",
                            isToday && "bg-[#374151] text-white"
                          )}>{dd.getDate()}</span>
                        </div>
                        <div className="space-y-0.5">
                          {daySessions.slice(0, 3).map((s) => (
                            <div
                              key={s.id}
                              className="text-[10px] rounded px-1 py-0.5 truncate font-medium"
                              style={{ backgroundColor: BRAND_LIGHT, color: "#0e7c8a" }}
                              title={`${s.start_hour ?? "—"} — ${s.training_title || s.title}`}
                            >
                              <span className="font-bold">{s.start_hour ?? "—"}</span> {s.training_title || s.title}
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
                      isCurrentHour ? "text-[#374151] font-bold" : "text-gray-400"
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
                          isSelected && "ring-2 ring-[#374151] ring-inset"
                        )}
                      >
                        <span className={cn(
                          "inline-block text-xs font-medium mb-0.5 px-1 rounded",
                          !day.inMonth && "text-gray-300",
                          day.inMonth && "text-gray-700",
                          isToday && "bg-[#374151] text-white"
                        )}>
                          {day.date}
                        </span>
                        <div className="space-y-0.5">
                          {daySessions.slice(0, 3).map((s) => (
                            <div
                              key={s.id}
                              className="block truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight"
                              style={{ backgroundColor: BRAND_LIGHT, color: "#0e7c8a" }}
                              title={`${s.start_hour ?? "—"} — ${s.training_title || s.title}`}
                            >
                              <span className="font-bold">{s.start_hour ?? "—"}</span>{" "}
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
              <Calendar className="h-4 w-4 text-[#374151]" />
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
                    <span>{s.start_hour ?? "—"} — {formatParisHour(s.end_date) ?? "—"}</span>
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
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#374151] hover:underline"
                    >
                      <CalendarPlus className="h-3 w-3" />
                      Google Calendar
                    </a>
                    <a
                      href={`/api/calendar/export?session_id=${s.id}&format=ics`}
                      download={`session-${s.id}.ics`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#374151] hover:underline"
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
