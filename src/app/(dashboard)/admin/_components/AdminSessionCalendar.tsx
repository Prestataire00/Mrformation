"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MONTHS_FR_FULL, DAYS_FR, BRAND_LIGHT } from "./constants";
import type { CalendarSession } from "./types";

interface AdminSessionCalendarProps {
  calMonth: number;
  calYear: number;
  calSessions: CalendarSession[];
  calendarView: "month" | "week" | "day";
  calSelectedDay: string;
  setCalMonth: React.Dispatch<React.SetStateAction<number>>;
  setCalYear: React.Dispatch<React.SetStateAction<number>>;
  setCalendarView: React.Dispatch<React.SetStateAction<"month" | "week" | "day">>;
  setCalSelectedDay: React.Dispatch<React.SetStateAction<string>>;
}

const HOUR_SLOTS = Array.from({ length: 12 }, (_, i) => i + 8); // 8h-19h

function getWeekDays(baseDate: string): string[] {
  const d = new Date(baseDate);
  const dow = d.getDay(); // 0=Sun..6=Sat
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

  // Previous month padding
  const prevLast = new Date(calYear, calMonth, 0).getDate();
  for (let i = startDow - 1; i >= 0; i--) {
    const d = prevLast - i;
    const pm = calMonth === 0 ? 11 : calMonth - 1;
    const py = calMonth === 0 ? calYear - 1 : calYear;
    days.push({ date: d, inMonth: false, dateStr: `${py}-${String(pm + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
  }

  // Current month
  for (let d = 1; d <= lastOfMonth.getDate(); d++) {
    days.push({ date: d, inMonth: true, dateStr: `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
  }

  // Next month padding to fill 6 rows
  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    const nm = calMonth === 11 ? 0 : calMonth + 1;
    const ny = calMonth === 11 ? calYear + 1 : calYear;
    days.push({ date: d, inMonth: false, dateStr: `${ny}-${String(nm + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
  }

  return days;
}

export function AdminSessionCalendar({
  calMonth,
  calYear,
  calSessions,
  calendarView,
  calSelectedDay,
  setCalMonth,
  setCalYear,
  setCalendarView,
  setCalSelectedDay,
}: AdminSessionCalendarProps) {

  function getSessionsForDate(dateStr: string) {
    return calSessions.filter((s) => s.start_date.slice(0, 10) === dateStr);
  }

  function getSessionsForHour(dateStr: string, hour: number): CalendarSession[] {
    return calSessions.filter((s) => {
      if (s.start_date.slice(0, 10) !== dateStr) return false;
      const h = parseInt(s.start_hour, 10);
      return h === hour;
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
    const today = new Date();
    setCalSelectedDay(today.toISOString().slice(0, 10));
    setCalMonth(today.getMonth());
    setCalYear(today.getFullYear());
  }

  return (
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
          {/* View toggle */}
          <div className="flex rounded-md border border-gray-200 overflow-hidden">
            {(["day", "week", "month"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setCalendarView(v)}
                className={cn(
                  "px-3 py-1 text-xs font-medium transition",
                  calendarView === v ? "bg-[#3DB5C5] text-white" : "bg-white text-gray-600 hover:bg-gray-50"
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
          const todayStr = new Date().toISOString().slice(0, 10);
          return (
            <div className="overflow-x-auto">
              <div className="grid grid-cols-7 border-b border-gray-200 min-w-[700px]">
                {weekDays.map((d) => {
                  const isToday = d === todayStr;
                  const daySessions = calSessions.filter((s) => s.start_date.slice(0, 10) === d);
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
                        isToday ? "text-[#3DB5C5]" : "text-gray-500"
                      )}>
                        <div>{["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."][dd.getDay() === 0 ? 6 : dd.getDay() - 1]}</div>
                        <span className={cn(
                          "inline-flex items-center justify-center h-6 w-6 rounded-full text-sm font-bold",
                          isToday && "bg-[#3DB5C5] text-white"
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
        {calendarView === "day" && (() => {
          const todayStr = new Date().toISOString().slice(0, 10);
          return (
            <div className="divide-y divide-gray-100">
              {HOUR_SLOTS.map((hour) => {
                const sessions = getSessionsForHour(calSelectedDay, hour);
                const isCurrentHour = calSelectedDay === todayStr && new Date().getHours() === hour;
                return (
                  <div key={hour} className={cn(
                    "flex gap-4 px-4 py-2 min-h-[52px]",
                    isCurrentHour && "bg-blue-50/40"
                  )}>
                    <div className={cn(
                      "w-12 text-xs font-mono flex-shrink-0 pt-1",
                      isCurrentHour ? "text-[#3DB5C5] font-bold" : "text-gray-400"
                    )}>
                      {String(hour).padStart(2, "0")}:00
                    </div>
                    <div className="flex-1 flex flex-wrap gap-2 items-start">
                      {sessions.map((s) => (
                        <Link
                          key={s.id}
                          href="/admin/sessions"
                          className="inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium"
                          style={{ backgroundColor: BRAND_LIGHT, color: "#0e7c8a" }}
                        >
                          <Calendar className="h-3 w-3" />
                          {s.training_title || s.title}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Month view */}
        {calendarView === "month" && <>
          {/* Day headers */}
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

          {/* Calendar grid */}
          {(() => {
            const grid = buildCalendarGrid(calYear, calMonth);
            const todayStr = new Date().toISOString().slice(0, 10);
            const weeks: typeof grid[] = [];
            for (let i = 0; i < grid.length; i += 7) {
              weeks.push(grid.slice(i, i + 7));
            }

            return weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0">
                {week.map((day, di) => {
                  const sessions = getSessionsForDate(day.dateStr);
                  const isToday = day.dateStr === todayStr;
                  const isWeekend = di >= 5;

                  return (
                    <div
                      key={day.dateStr}
                      className={cn(
                        "min-h-[90px] border-r border-gray-100 last:border-r-0 p-1",
                        !day.inMonth && "bg-gray-50/60",
                        isWeekend && day.inMonth && "bg-amber-50/30",
                        isToday && "bg-blue-50/40"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block text-xs font-medium mb-0.5 px-1 rounded",
                          !day.inMonth && "text-gray-300",
                          day.inMonth && "text-gray-700",
                          isToday && "bg-[#3DB5C5] text-white"
                        )}
                      >
                        {day.date}
                      </span>
                      <div className="space-y-0.5">
                        {sessions.slice(0, 3).map((s) => (
                          <Link
                            key={s.id}
                            href={`/admin/sessions`}
                            className="block truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight cursor-pointer hover:opacity-80 transition-opacity"
                            style={{ backgroundColor: BRAND_LIGHT, color: "#0e7c8a" }}
                            title={`${s.start_hour}h — ${s.training_title || s.title}`}
                          >
                            <span className="font-bold">{s.start_hour}</span>{" "}
                            {s.training_title || s.title}
                          </Link>
                        ))}
                        {sessions.length > 3 && (
                          <span className="text-[9px] text-gray-400 px-1">
                            +{sessions.length - 3} autres
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
  );
}
