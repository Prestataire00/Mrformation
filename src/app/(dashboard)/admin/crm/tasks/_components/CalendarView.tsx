"use client";

import { useState } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  format,
  addMonths,
  subMonths,
} from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { isGenericTaskTitle } from "@/lib/utils/crm-task-label-style";
import type { CrmTask, TaskPriority } from "@/lib/types";

/**
 * Vue calendrier mensuel : tâches positionnées sur leur due_date.
 * - Grille 7 colonnes × 5-6 lignes (date-fns + Tailwind grid)
 * - 3 tâches max visibles par case, badge "+N" si plus
 * - Click sur tâche → callback edit (parent ouvre l'edit modal existant)
 *
 * Story h-19 (Epic H) — extrait pour ne pas alourdir page.tsx.
 */

const PRIORITY_BORDER: Record<TaskPriority, string> = {
  high: "border-l-2 border-l-red-500",
  medium: "border-l-2 border-l-amber-400",
  low: "border-l-2 border-l-gray-300",
};

const MAX_TASKS_PER_DAY = 3;

interface CalendarViewProps {
  tasks: CrmTask[];
  onTaskClick: (task: CrmTask) => void;
}

export function CalendarView({ tasks, onTaskClick }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { locale: fr });
  const calendarEnd = endOfWeek(monthEnd, { locale: fr });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const tasksByDay = new Map<string, CrmTask[]>();
  for (const task of tasks) {
    if (!task.due_date) continue;
    if (task.status === "cancelled" || task.status === "completed") continue;
    // task.due_date est déjà au format "yyyy-MM-dd" (colonne DATE Postgres).
    // Pas de parseISO + reformat — ça introduisait une conversion timezone
    // sournoise (UTC → local) et pouvait crash sur valeur corrompue.
    const arr = tasksByDay.get(task.due_date) ?? [];
    arr.push(task);
    tasksByDay.set(task.due_date, arr);
  }

  const weekdayLabels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  return (
    <div className="space-y-3">
      {/* Header navigation */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">
          {format(currentMonth, "MMMM yyyy", { locale: fr })}
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
            aria-label="Mois précédent"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setCurrentMonth(new Date())}
          >
            Aujourd&apos;hui
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
            aria-label="Mois suivant"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-t-lg overflow-hidden">
        {weekdayLabels.map((d) => (
          <div
            key={d}
            className="bg-white px-2 py-1.5 text-[11px] font-semibold text-gray-500 text-center uppercase tracking-wider"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-gray-200 border-x border-b border-gray-200 rounded-b-lg overflow-hidden -mt-3">
        {days.map((day) => {
          const dayKey = format(day, "yyyy-MM-dd");
          const dayTasks = tasksByDay.get(dayKey) ?? [];
          const visibleTasks = dayTasks.slice(0, MAX_TASKS_PER_DAY);
          const hiddenCount = dayTasks.length - visibleTasks.length;
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={dayKey}
              className={cn(
                "bg-white min-h-[90px] p-1.5 flex flex-col gap-0.5",
                !isCurrentMonth && "bg-gray-50/60",
                isToday && "ring-1 ring-inset ring-blue-400"
              )}
            >
              <div
                className={cn(
                  "text-[11px] font-medium mb-0.5",
                  isCurrentMonth ? "text-gray-700" : "text-gray-400",
                  isToday && "text-blue-600 font-bold"
                )}
              >
                {format(day, "d")}
              </div>
              {visibleTasks.map((task) => {
                const titleIsGeneric = isGenericTaskTitle(task.title, task.label);
                const displayTitle = titleIsGeneric
                  ? task.description?.trim() || task.prospect?.company_name || task.title
                  : task.title;
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onTaskClick(task)}
                    className={cn(
                      "text-left text-[10px] leading-tight rounded-sm bg-gray-50 hover:bg-gray-100 px-1.5 py-1 truncate transition-colors",
                      PRIORITY_BORDER[task.priority],
                      task.status === "completed" && "line-through opacity-50"
                    )}
                    title={displayTitle}
                  >
                    {displayTitle}
                  </button>
                );
              })}
              {hiddenCount > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="text-[10px] text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded px-1.5 py-0.5 text-left transition-colors"
                    >
                      +{hiddenCount}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-64 p-2 space-y-1">
                    <div className="text-[11px] font-semibold text-gray-500 px-1.5 pb-1 border-b mb-1">
                      {format(day, "EEEE d MMMM", { locale: fr })}
                    </div>
                    {dayTasks.slice(MAX_TASKS_PER_DAY).map((task) => {
                      const titleIsGeneric = isGenericTaskTitle(task.title, task.label);
                      const displayTitle = titleIsGeneric
                        ? task.description?.trim() || task.prospect?.company_name || task.title
                        : task.title;
                      return (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => onTaskClick(task)}
                          className={cn(
                            "w-full text-left text-xs rounded-sm bg-gray-50 hover:bg-gray-100 px-2 py-1.5 truncate transition-colors",
                            PRIORITY_BORDER[task.priority]
                          )}
                          title={displayTitle}
                        >
                          {displayTitle}
                        </button>
                      );
                    })}
                  </PopoverContent>
                </Popover>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
