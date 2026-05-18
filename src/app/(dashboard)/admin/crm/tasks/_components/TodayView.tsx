"use client";

import { useState } from "react";
import { AlertCircle, Sun, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CrmTask } from "@/lib/types";
import { TaskKanbanCard } from "./TaskKanbanCard";

/**
 * Vue "Focus du jour" : uniquement les tâches en retard + dues aujourd'hui.
 * - En retard en haut (badge rouge), Aujourd'hui en bas (badge bleu)
 * - Tri par priorité descendante (high → medium → low)
 * - Empty state explicite si rien à traiter
 *
 * Story h-19 (Epic H) — extrait pour ne pas alourdir page.tsx.
 */

const PRIORITY_ORDER: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function sortByPriorityDesc(tasks: CrmTask[]): CrmTask[] {
  return [...tasks].sort(
    (a, b) => (PRIORITY_ORDER[b.priority] ?? 0) - (PRIORITY_ORDER[a.priority] ?? 0)
  );
}

interface TodayViewProps {
  overdueTasks: CrmTask[];
  todayTasks: CrmTask[];
  onToggle: (task: CrmTask) => void;
  completingTask: CrmTask | null;
  completionNotes: string;
  onCompletionNotesChange: (v: string) => void;
  onConfirmComplete: () => void;
  onCancelComplete: () => void;
}

export function TodayView({
  overdueTasks,
  todayTasks,
  onToggle,
  completingTask,
  completionNotes,
  onCompletionNotesChange,
  onConfirmComplete,
  onCancelComplete,
}: TodayViewProps) {
  const [overdueExpanded, setOverdueExpanded] = useState(true);

  const sortedOverdue = sortByPriorityDesc(
    overdueTasks.filter((t) => t.status !== "completed" && t.status !== "cancelled")
  );
  const sortedToday = sortByPriorityDesc(
    todayTasks.filter((t) => t.status !== "cancelled")
  );

  const isEmpty = sortedOverdue.length === 0 && sortedToday.length === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-3xl mb-3">🎉</div>
        <p className="text-sm font-medium text-gray-700">Aucune tâche à traiter aujourd&apos;hui</p>
        <p className="text-xs text-gray-400 mt-1">Profitez-en pour préparer demain !</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {sortedOverdue.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setOverdueExpanded((v) => !v)}
            className="flex items-center gap-2 mb-2 group"
          >
            {overdueExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-red-500" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-red-500" />
            )}
            <AlertCircle className="h-3.5 w-3.5 text-red-500" />
            <span className="text-xs font-semibold text-red-600 uppercase tracking-wider">
              En retard
            </span>
            <span className="text-[10px] text-gray-400">({sortedOverdue.length})</span>
          </button>
          <div className={cn("space-y-2", !overdueExpanded && "hidden")}>
            {sortedOverdue.map((task) => (
              <TaskKanbanCard
                key={task.id}
                task={task}
                onToggle={onToggle}
                completingTask={completingTask}
                completionNotes={completionNotes}
                onCompletionNotesChange={onCompletionNotesChange}
                onConfirmComplete={onConfirmComplete}
                onCancelComplete={onCancelComplete}
              />
            ))}
          </div>
        </section>
      )}

      {sortedToday.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Sun className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
              Aujourd&apos;hui
            </span>
            <span className="text-[10px] text-gray-400">({sortedToday.length})</span>
          </div>
          <div className="space-y-2">
            {sortedToday.map((task) => (
              <TaskKanbanCard
                key={task.id}
                task={task}
                onToggle={onToggle}
                completingTask={completingTask}
                completionNotes={completionNotes}
                onCompletionNotesChange={onCompletionNotesChange}
                onConfirmComplete={onConfirmComplete}
                onCancelComplete={onCancelComplete}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
