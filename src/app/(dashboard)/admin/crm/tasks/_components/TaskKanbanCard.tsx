"use client";

import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { isGenericTaskTitle } from "@/lib/utils/crm-task-label-style";
import type { CrmTask } from "@/lib/types";

/**
 * Card compacte utilisée par les vues Kanban + Today.
 * Extrait de page.tsx pour partage entre vues (story h-19).
 */
export function TaskKanbanCard({
  task,
  onToggle,
  completingTask,
  completionNotes,
  onCompletionNotesChange,
  onConfirmComplete,
  onCancelComplete,
}: {
  task: CrmTask;
  onToggle: (t: CrmTask) => void;
  completingTask?: CrmTask | null;
  completionNotes?: string;
  onCompletionNotesChange?: (v: string) => void;
  onConfirmComplete?: () => void;
  onCancelComplete?: () => void;
}) {
  const priorityColor =
    task.priority === "high"
      ? "bg-red-500"
      : task.priority === "medium"
        ? "bg-amber-400"
        : "bg-gray-300";
  // Fallback display : si title est générique (= label ou un des 4 types Sellsy
  // connus) on préfère description ou prospect.company_name → évite les cartes
  // identiques "Rappel / Rappel / Rappel..." sur les 1773 tâches Sellsy.
  const titleIsGeneric = isGenericTaskTitle(task.title, task.label);
  const displayTitle = titleIsGeneric
    ? task.description?.trim() || task.prospect?.company_name || task.title
    : task.title;
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-3 hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-2">
        <Checkbox
          checked={task.status === "completed"}
          onCheckedChange={() => onToggle(task)}
          className="mt-0.5 flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", priorityColor)} />
            <p
              className={cn(
                "text-sm font-medium text-gray-900 truncate",
                task.status === "completed" && "line-through opacity-50"
              )}
            >
              {displayTitle}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-gray-400">
            {task.due_date && <span>{task.due_date}</span>}
            {task.assignee && <span>{task.assignee.first_name}</span>}
            {/* Si on a remplacé le titre par la description, on remet le prospect
                lié ici pour pas le perdre. */}
            {task.prospect && task.prospect_id && (
              <Link
                href={`/admin/crm/prospects/${task.prospect_id}`}
                className="truncate text-[#374151] hover:underline font-medium"
                onClick={(e) => e.stopPropagation()}
              >
                {task.prospect.company_name}
              </Link>
            )}
            {task.prospect && !task.prospect_id && (
              <span className="truncate">{task.prospect.company_name}</span>
            )}
          </div>
          {task.completion_notes && task.status === "completed" && (
            <p className="text-xs text-gray-500 italic mt-1">
              {"📝"} {task.completion_notes}
            </p>
          )}
          {completingTask?.id === task.id && onCompletionNotesChange && onConfirmComplete && onCancelComplete && (
            <div className="mt-2 border rounded-lg p-3 bg-gray-50/50 space-y-2">
              <Textarea
                value={completionNotes ?? ""}
                onChange={(e) => onCompletionNotesChange(e.target.value)}
                placeholder="Notes de complétion (ex: résumé de l'appel, décision prise...)"
                rows={2}
                autoFocus
                className="text-sm resize-none"
              />
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 flex-1">Optionnel</span>
                <Button size="sm" variant="ghost" className="text-xs h-6" onClick={() => onCancelComplete()}>
                  Annuler
                </Button>
                <Button size="sm" className="text-xs h-6" onClick={() => onConfirmComplete()}>
                  Terminer
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
