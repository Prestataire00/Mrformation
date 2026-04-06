"use client";

import { useState } from "react";
import { Clock, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { OverdueTask } from "./types";

interface AdminOverdueTasksProps {
  overdueTasks: OverdueTask[];
}

export function AdminOverdueTasks({ overdueTasks }: AdminOverdueTasksProps) {
  const [showAll, setShowAll] = useState(false);

  if (overdueTasks.length === 0) {
    return (
      <div className="rounded-md px-5 py-4 text-white text-sm font-medium bg-green-500">
        Aucune tâche en retard
      </div>
    );
  }

  const visible = showAll ? overdueTasks : overdueTasks.slice(0, 5);

  return (
    <div className="space-y-3">
    <div
      className="rounded-md px-5 py-4 text-white text-sm font-medium"
      style={{ backgroundColor: "#DC2626" }}
    >
      {overdueTasks.length} tâche{overdueTasks.length > 1 ? "s" : ""} en retard
    </div>
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
        <AlertTriangle className="h-5 w-5 text-amber-500" />
        <h2 className="text-base font-semibold text-gray-800">
          Tâches en retard
        </h2>
        <Badge className="bg-amber-100 text-amber-700 text-xs ml-1">
          {overdueTasks.length}
        </Badge>
      </div>

      <div className="divide-y divide-gray-100">
        {visible.map((task) => (
          <div
            key={task.id}
            className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
          >
            <Clock className="h-4 w-4 text-amber-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">
                {task.title}
              </p>
              <p className="text-xs text-gray-500">
                Échéance : {formatDate(task.due_date)}
              </p>
            </div>
            {task.priority === "high" && (
              <Badge className="bg-red-100 text-red-700 text-[10px]">
                Priorité haute
              </Badge>
            )}
            {task.priority === "medium" && (
              <Badge className="bg-amber-100 text-amber-700 text-[10px]">
                Priorité moyenne
              </Badge>
            )}
          </div>
        ))}
      </div>

      {overdueTasks.length > 5 && (
        <div className="border-t border-gray-100 px-5 py-3">
          <button
            onClick={() => setShowAll((v) => !v)}
            className="text-sm text-[#DC2626] hover:text-[#2a9aa8] font-medium"
          >
            {showAll
              ? "Réduire"
              : `Voir les ${overdueTasks.length - 5} autres tâches`}
          </button>
        </div>
      )}
    </div>
    </div>
  );
}
