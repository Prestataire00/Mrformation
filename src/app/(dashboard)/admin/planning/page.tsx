"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CalendarRange,
  Calendar,
  X,
  MapPin,
  User,
  Clock,
  BookOpen,
  Tag,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = "month" | "week" | "day";
type SessionStatus = "upcoming" | "in_progress" | "completed" | "cancelled";

interface CalendarSession {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  status: SessionStatus;
  mode: string;
  location: string | null;
  notes: string | null;
  max_participants: number | null;
  trainer_id: string | null;
  training_id: string | null;
  trainer: {
    first_name: string;
    last_name: string;
  } | null;
  training: {
    title: string;
  } | null;
}

interface TrainerOption {
  id: string;
  first_name: string;
  last_name: string;
}

interface TrainingOption {
  id: string;
  title: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const DAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const MONTHS_FR_LONG = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const STATUS_CONFIG: Record<
  SessionStatus,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  upcoming: {
    label: "À venir",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-300",
    dot: "bg-emerald-500",
  },
  in_progress: {
    label: "En cours",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-300",
    dot: "bg-blue-500",
  },
  completed: {
    label: "Terminée",
    bg: "bg-gray-50",
    text: "text-gray-600",
    border: "border-gray-300",
    dot: "bg-gray-400",
  },
  cancelled: {
    label: "Annulée",
    bg: "bg-red-50",
    text: "text-red-600",
    border: "border-red-300",
    dot: "bg-red-500",
  },
};

const MODE_LABELS: Record<string, string> = {
  presentiel: "Présentiel",
  distanciel: "Distanciel",
  hybride: "Hybride",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toLocalDate(iso: string): Date {
  // Parse YYYY-MM-DD or full ISO without timezone conversion issues
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDateFull(iso: string): string {
  const d = toLocalDate(iso);
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  // If time part is midnight, just show the date
  if (d.getHours() === 0 && d.getMinutes() === 0) return "";
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isSessionOnDay(session: CalendarSession, day: Date): boolean {
  const start = toLocalDate(session.start_date);
  const end = toLocalDate(session.end_date);
  return day >= start && day <= end;
}

// Monday-based week start
function getWeekDays(date: Date): Date[] {
  const day = date.getDay(); // 0=Sun, 1=Mon...
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function getMonthGrid(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Monday-start: offset for first day
  const startOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - startOffset);

  // Always show 6 weeks = 42 cells
  const endOffset = 41 - (lastDay.getDate() + startOffset - 1);
  const gridEnd = new Date(lastDay);
  gridEnd.setDate(lastDay.getDate() + endOffset);

  const days: Date[] = [];
  const current = new Date(gridStart);
  while (current <= gridEnd) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

// ─── Session Chip ─────────────────────────────────────────────────────────────

function SessionChip({
  session,
  onClick,
  compact = false,
}: {
  session: CalendarSession;
  onClick: () => void;
  compact?: boolean;
}) {
  const cfg = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.upcoming;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "w-full text-left rounded px-1.5 py-0.5 border text-xs font-medium truncate transition-all hover:opacity-80 hover:shadow-sm",
        cfg.bg,
        cfg.text,
        cfg.border,
        compact ? "py-0.5" : "py-1"
      )}
      title={session.title}
    >
      <span
        className={cn("inline-block w-1.5 h-1.5 rounded-full mr-1 flex-shrink-0", cfg.dot)}
        style={{ display: "inline-block", verticalAlign: "middle" }}
      />
      {session.title}
    </button>
  );
}

// ─── Session Detail Dialog ────────────────────────────────────────────────────

function SessionDetailDialog({
  session,
  onClose,
}: {
  session: CalendarSession | null;
  onClose: () => void;
}) {
  if (!session) return null;

  const cfg = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.upcoming;
  const trainerName = session.trainer
    ? `${session.trainer.first_name} ${session.trainer.last_name}`.trim()
    : null;

  const startTime = formatTime(session.start_date);
  const endTime = formatTime(session.end_date);

  return (
    <Dialog open={!!session} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-6 text-base leading-snug">{session.title}</DialogTitle>
          <DialogDescription asChild>
            <div className="mt-1">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border",
                  cfg.bg,
                  cfg.text,
                  cfg.border
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
                {cfg.label}
              </span>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {/* Dates */}
          <div className="flex items-start gap-3 text-sm">
            <Calendar className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-gray-800 capitalize">
                {formatDateFull(session.start_date)}
              </p>
              {session.start_date.slice(0, 10) !== session.end_date.slice(0, 10) && (
                <p className="text-gray-500 capitalize">
                  — {formatDateFull(session.end_date)}
                </p>
              )}
              {(startTime || endTime) && (
                <p className="text-gray-500 text-xs mt-0.5">
                  {startTime}{startTime && endTime ? " → " : ""}{endTime}
                </p>
              )}
            </div>
          </div>

          {/* Formation */}
          {session.training && (
            <div className="flex items-center gap-3 text-sm">
              <BookOpen className="h-4 w-4 text-gray-400 shrink-0" />
              <span className="text-gray-700">{session.training.title}</span>
            </div>
          )}

          {/* Formateur */}
          {trainerName && (
            <div className="flex items-center gap-3 text-sm">
              <User className="h-4 w-4 text-gray-400 shrink-0" />
              <span className="text-gray-700">{trainerName}</span>
            </div>
          )}

          {/* Mode */}
          <div className="flex items-center gap-3 text-sm">
            <Tag className="h-4 w-4 text-gray-400 shrink-0" />
            <span className="text-gray-700">
              {MODE_LABELS[session.mode] ?? session.mode}
            </span>
          </div>

          {/* Lieu */}
          {session.location && (
            <div className="flex items-center gap-3 text-sm">
              <MapPin className="h-4 w-4 text-gray-400 shrink-0" />
              <span className="text-gray-700">{session.location}</span>
            </div>
          )}

          {/* Participants max */}
          {session.max_participants && (
            <div className="flex items-center gap-3 text-sm">
              <Clock className="h-4 w-4 text-gray-400 shrink-0" />
              <span className="text-gray-700">
                Max {session.max_participants} participant
                {session.max_participants > 1 ? "s" : ""}
              </span>
            </div>
          )}

          {/* Notes */}
          {session.notes && (
            <div className="rounded-md bg-gray-50 border border-gray-200 p-3 text-sm text-gray-600">
              {session.notes}
            </div>
          )}
        </div>

        {/* Footer action */}
        <div className="mt-4 flex justify-end">
          <Link
            href={`/admin/sessions`}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
            onClick={onClose}
          >
            Voir toutes les sessions →
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Monthly Grid ─────────────────────────────────────────────────────────────

function MonthGrid({
  year,
  month,
  sessions,
  today,
  onSessionClick,
}: {
  year: number;
  month: number;
  sessions: CalendarSession[];
  today: Date;
  onSessionClick: (s: CalendarSession) => void;
}) {
  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header row */}
      <div className="grid grid-cols-7 border-b border-gray-200">
        {DAYS_FR.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-xs font-semibold uppercase tracking-wider text-gray-500"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 grid-rows-6 flex-1 border-l border-t border-gray-200">
        {grid.map((day, idx) => {
          const isCurrentMonth = day.getMonth() === month;
          const isToday = isSameDay(day, today);
          const daySessions = sessions.filter((s) => isSessionOnDay(s, day));

          return (
            <div
              key={idx}
              className={cn(
                "min-h-[100px] border-r border-b border-gray-200 p-1.5 flex flex-col gap-1",
                !isCurrentMonth && "bg-gray-50/60",
                isToday && "bg-blue-50/40"
              )}
            >
              {/* Day number */}
              <div className="flex items-center justify-between mb-0.5">
                <span
                  className={cn(
                    "inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-semibold transition-colors",
                    isToday
                      ? "bg-blue-600 text-white"
                      : isCurrentMonth
                      ? "text-gray-800"
                      : "text-gray-400"
                  )}
                >
                  {day.getDate()}
                </span>
              </div>

              {/* Sessions */}
              <div className="flex flex-col gap-0.5 overflow-hidden">
                {daySessions.slice(0, 3).map((s) => (
                  <SessionChip
                    key={s.id + "-" + day.toISOString()}
                    session={s}
                    onClick={() => onSessionClick(s)}
                    compact
                  />
                ))}
                {daySessions.length > 3 && (
                  <span className="text-[10px] text-gray-500 pl-1">
                    +{daySessions.length - 3} de plus
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Weekly Grid ──────────────────────────────────────────────────────────────

function WeekGrid({
  currentDate,
  sessions,
  today,
  onSessionClick,
}: {
  currentDate: Date;
  sessions: CalendarSession[];
  today: Date;
  onSessionClick: (s: CalendarSession) => void;
}) {
  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);

  return (
    <div className="flex flex-col flex-1">
      {/* Header */}
      <div className="grid grid-cols-7 border-b border-gray-200">
        {weekDays.map((day, i) => {
          const isToday = isSameDay(day, today);
          return (
            <div key={i} className="py-3 text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {DAYS_FR[i]}
              </p>
              <p
                className={cn(
                  "mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold mx-auto",
                  isToday ? "bg-blue-600 text-white" : "text-gray-800"
                )}
              >
                {day.getDate()}
              </p>
            </div>
          );
        })}
      </div>

      {/* Day columns */}
      <div className="grid grid-cols-7 flex-1 border-l border-t border-gray-200">
        {weekDays.map((day, i) => {
          const daySessions = sessions.filter((s) => isSessionOnDay(s, day));
          const isToday = isSameDay(day, today);

          return (
            <div
              key={i}
              className={cn(
                "border-r border-b border-gray-200 p-2 min-h-[200px]",
                isToday && "bg-blue-50/30"
              )}
            >
              <div className="flex flex-col gap-1">
                {daySessions.length === 0 ? (
                  <p className="text-xs text-gray-300 text-center mt-4">—</p>
                ) : (
                  daySessions.map((s) => (
                    <SessionChip
                      key={s.id + "-" + day.toISOString()}
                      session={s}
                      onClick={() => onSessionClick(s)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Daily View ───────────────────────────────────────────────────────────────

function DayView({
  currentDate,
  sessions,
  today,
  onSessionClick,
}: {
  currentDate: Date;
  sessions: CalendarSession[];
  today: Date;
  onSessionClick: (s: CalendarSession) => void;
}) {
  const daySessions = useMemo(
    () => sessions.filter((s) => isSessionOnDay(s, currentDate)),
    [sessions, currentDate]
  );

  const isToday = isSameDay(currentDate, today);

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Day header */}
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex items-center justify-center h-12 w-12 rounded-full text-xl font-bold",
            isToday ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-800"
          )}
        >
          {currentDate.getDate()}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-700 capitalize">
            {DAYS_FR[(currentDate.getDay() + 6) % 7]}
          </p>
          <p className="text-xs text-gray-500">
            {MONTHS_FR_LONG[currentDate.getMonth()]} {currentDate.getFullYear()}
          </p>
        </div>
        {isToday && (
          <span className="ml-2 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
            Aujourd&apos;hui
          </span>
        )}
      </div>

      {/* Sessions list */}
      {daySessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <CalendarDays className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm">Aucune session ce jour</p>
        </div>
      ) : (
        <div className="space-y-3">
          {daySessions.map((s) => {
            const cfg = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.upcoming;
            const trainerName = s.trainer
              ? `${s.trainer.first_name} ${s.trainer.last_name}`.trim()
              : null;

            return (
              <button
                key={s.id}
                onClick={() => onSessionClick(s)}
                className={cn(
                  "w-full text-left rounded-lg border p-4 transition-all hover:shadow-md",
                  cfg.bg,
                  cfg.border
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className={cn("font-semibold text-sm truncate", cfg.text)}>
                      {s.title}
                    </p>
                    {s.training && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {s.training.title}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      "shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border",
                      cfg.bg,
                      cfg.text,
                      cfg.border
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
                    {cfg.label}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  {trainerName && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {trainerName}
                    </span>
                  )}
                  {s.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {s.location}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    {MODE_LABELS[s.mode] ?? s.mode}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PlanningPage() {
  const supabase = createClient();
  const { entityId } = useEntity();

  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState<Date>(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );

  const [sessions, setSessions] = useState<CalendarSession[]>([]);
  const [trainers, setTrainers] = useState<TrainerOption[]>([]);
  const [trainings, setTrainings] = useState<TrainingOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterTrainer, setFilterTrainer] = useState<string>("all");
  const [filterTraining, setFilterTraining] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Selected session for detail dialog
  const [selectedSession, setSelectedSession] = useState<CalendarSession | null>(null);

  // ── Navigation helpers ──────────────────────────────────────────────────────

  const navigatePrev = useCallback(() => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (viewMode === "month") {
        d.setMonth(d.getMonth() - 1);
      } else if (viewMode === "week") {
        d.setDate(d.getDate() - 7);
      } else {
        d.setDate(d.getDate() - 1);
      }
      return d;
    });
  }, [viewMode]);

  const navigateNext = useCallback(() => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (viewMode === "month") {
        d.setMonth(d.getMonth() + 1);
      } else if (viewMode === "week") {
        d.setDate(d.getDate() + 7);
      } else {
        d.setDate(d.getDate() + 1);
      }
      return d;
    });
  }, [viewMode]);

  const goToToday = useCallback(() => {
    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  }, [today]);

  // ── Current period label ────────────────────────────────────────────────────

  const periodLabel = useMemo(() => {
    if (viewMode === "month") {
      return `${MONTHS_FR_LONG[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
    if (viewMode === "week") {
      const week = getWeekDays(currentDate);
      const first = week[0];
      const last = week[6];
      if (first.getMonth() === last.getMonth()) {
        return `${first.getDate()} – ${last.getDate()} ${MONTHS_FR_LONG[first.getMonth()]} ${first.getFullYear()}`;
      }
      return `${first.getDate()} ${MONTHS_FR_LONG[first.getMonth()]} – ${last.getDate()} ${MONTHS_FR_LONG[last.getMonth()]} ${last.getFullYear()}`;
    }
    // day
    return `${DAYS_FR[(currentDate.getDay() + 6) % 7]} ${currentDate.getDate()} ${MONTHS_FR_LONG[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  }, [viewMode, currentDate]);

  // ── Date range for Supabase query ───────────────────────────────────────────

  const dateRange = useMemo(() => {
    if (viewMode === "month") {
      const gridStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const startOffset = (gridStart.getDay() + 6) % 7;
      gridStart.setDate(gridStart.getDate() - startOffset - 7); // buffer
      const gridEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 7);
      return { start: gridStart.toISOString().slice(0, 10), end: gridEnd.toISOString().slice(0, 10) };
    }
    if (viewMode === "week") {
      const week = getWeekDays(currentDate);
      return {
        start: week[0].toISOString().slice(0, 10),
        end: week[6].toISOString().slice(0, 10),
      };
    }
    const d = currentDate.toISOString().slice(0, 10);
    return { start: d, end: d };
  }, [viewMode, currentDate]);

  // ── Fetch sessions ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (entityId === undefined) return;

    async function fetchSessions() {
      setLoading(true);
      try {
        let q = supabase
          .from("sessions")
          .select(
            "id, title, start_date, end_date, status, mode, location, notes, max_participants, trainer_id, training_id, trainer:trainers(first_name, last_name), training:trainings(title)"
          )
          .lte("start_date", dateRange.end)
          .gte("end_date", dateRange.start)
          .order("start_date", { ascending: true });

        if (entityId) q = q.eq("entity_id", entityId);

        const { data, error } = await q;
        if (error) throw error;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parsed: CalendarSession[] = (data ?? []).map((s: any) => ({
          id: s.id,
          title: s.title,
          start_date: s.start_date,
          end_date: s.end_date,
          status: s.status,
          mode: s.mode,
          location: s.location,
          notes: s.notes,
          max_participants: s.max_participants,
          trainer_id: s.trainer_id,
          training_id: s.training_id,
          trainer: Array.isArray(s.trainer) ? s.trainer[0] ?? null : s.trainer,
          training: Array.isArray(s.training) ? s.training[0] ?? null : s.training,
        }));

        setSessions(parsed);
      } catch (err) {
        console.error("Error fetching sessions:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchSessions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, dateRange]);

  // ── Fetch trainer / training lists for filters ──────────────────────────────

  useEffect(() => {
    if (entityId === undefined) return;

    async function fetchFilters() {
      let tq = supabase
        .from("trainers")
        .select("id, first_name, last_name")
        .order("last_name");
      if (entityId) tq = tq.eq("entity_id", entityId);

      let trq = supabase
        .from("trainings")
        .select("id, title")
        .eq("is_active", true)
        .order("title");
      if (entityId) trq = trq.eq("entity_id", entityId);

      const [{ data: trainerData }, { data: trainingData }] = await Promise.all([tq, trq]);

      setTrainers((trainerData ?? []) as TrainerOption[]);
      setTrainings((trainingData ?? []) as TrainingOption[]);
    }

    fetchFilters();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  // ── Apply filters ───────────────────────────────────────────────────────────

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (filterStatus !== "all" && s.status !== filterStatus) return false;
      if (filterTrainer !== "all" && s.trainer_id !== filterTrainer) return false;
      if (filterTraining !== "all" && s.training_id !== filterTraining) return false;
      return true;
    });
  }, [sessions, filterStatus, filterTrainer, filterTraining]);

  // ── Reset filters ───────────────────────────────────────────────────────────

  const hasActiveFilters =
    filterStatus !== "all" || filterTrainer !== "all" || filterTraining !== "all";

  function resetFilters() {
    setFilterStatus("all");
    setFilterTrainer("all");
    setFilterTraining("all");
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-50">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="text-sm text-gray-500 mb-3">
          <span className="font-medium text-gray-700">Administration</span>
          <span className="mx-2">/</span>
          <span>Planning</span>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Title */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Planning des Sessions</h1>
              <p className="text-xs text-gray-500">
                Vue calendaire des formations
              </p>
            </div>
          </div>

          {/* View mode toggles */}
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm">
              {(
                [
                  { mode: "month" as ViewMode, label: "Mois", Icon: Calendar },
                  { mode: "week" as ViewMode, label: "Semaine", Icon: CalendarRange },
                  { mode: "day" as ViewMode, label: "Jour", Icon: CalendarDays },
                ] as const
              ).map(({ mode, label, Icon }) => (
                <button
                  key={mode}
                  onClick={() => {
                    setViewMode(mode);
                    // When switching to week/day, keep current date aligned
                    if (mode === "month") {
                      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
                    }
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors",
                    viewMode === mode
                      ? "bg-blue-600 text-white"
                      : "text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Navigation + Filters row ────────────────────────────────── */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={navigatePrev}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition shadow-sm"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <button
              onClick={goToToday}
              className="h-8 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition shadow-sm"
            >
              Aujourd&apos;hui
            </button>

            <button
              onClick={navigateNext}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition shadow-sm"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <span className="ml-2 text-base font-semibold text-gray-800 capitalize">
              {periodLabel}
            </span>

            {loading && (
              <span className="ml-2 text-xs text-gray-400 animate-pulse">
                Chargement…
              </span>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status filter */}
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="upcoming">À venir</SelectItem>
                <SelectItem value="in_progress">En cours</SelectItem>
                <SelectItem value="completed">Terminée</SelectItem>
                <SelectItem value="cancelled">Annulée</SelectItem>
              </SelectContent>
            </Select>

            {/* Trainer filter */}
            <Select value={filterTrainer} onValueChange={setFilterTrainer}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="Formateur" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les formateurs</SelectItem>
                {trainers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.first_name} {t.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Training filter */}
            <Select value={filterTraining} onValueChange={setFilterTraining}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="Formation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les formations</SelectItem>
                {trainings.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Reset filters */}
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1 h-8 rounded-lg border border-red-200 bg-red-50 px-2.5 text-xs font-medium text-red-600 hover:bg-red-100 transition"
              >
                <X className="h-3 w-3" />
                Effacer
              </button>
            )}
          </div>
        </div>

        {/* ── Legend ──────────────────────────────────────────────────── */}
        <div className="mt-3 flex flex-wrap gap-3">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <span
              key={key}
              className="flex items-center gap-1.5 text-xs text-gray-600"
            >
              <span className={cn("h-2 w-2 rounded-full", cfg.dot)} />
              {cfg.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Calendar body ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <Card className="m-4 border border-gray-200 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {loading && sessions.length === 0 ? (
              <div className="flex items-center justify-center py-24 text-gray-400">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
                  <p className="text-sm">Chargement du planning…</p>
                </div>
              </div>
            ) : viewMode === "month" ? (
              <MonthGrid
                year={currentDate.getFullYear()}
                month={currentDate.getMonth()}
                sessions={filteredSessions}
                today={today}
                onSessionClick={setSelectedSession}
              />
            ) : viewMode === "week" ? (
              <WeekGrid
                currentDate={currentDate}
                sessions={filteredSessions}
                today={today}
                onSessionClick={setSelectedSession}
              />
            ) : (
              <DayView
                currentDate={currentDate}
                sessions={filteredSessions}
                today={today}
                onSessionClick={setSelectedSession}
              />
            )}
          </CardContent>
        </Card>

        {/* ── Session count footer ──────────────────────────────────────── */}
        <div className="px-4 pb-4 text-xs text-gray-400 text-right">
          {filteredSessions.length} session{filteredSessions.length !== 1 ? "s" : ""} affichée
          {filteredSessions.length !== 1 ? "s" : ""}
          {hasActiveFilters && " (filtres actifs)"}
        </div>
      </div>

      {/* ── Session detail dialog ────────────────────────────────────────── */}
      <SessionDetailDialog
        session={selectedSession}
        onClose={() => setSelectedSession(null)}
      />
    </div>
  );
}
