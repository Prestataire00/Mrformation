"use client";

import { cn } from "@/lib/utils";
import { Minus, Clock, Send, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export type StatusType = "not_assigned" | "assigned" | "sent" | "in_progress" | "completed" | "overdue";

interface StatusCellProps {
  status: StatusType;
  label?: string;
  score?: number;
  count?: { done: number; total: number };
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
}

const STATUS_CONFIG = {
  not_assigned: { color: "bg-gray-100 text-gray-500 border-gray-200", icon: Minus, label: "Non attribué" },
  assigned: { color: "bg-blue-50 text-blue-600 border-blue-200", icon: Clock, label: "En attente" },
  sent: { color: "bg-amber-50 text-amber-600 border-amber-200", icon: Send, label: "Envoyé" },
  in_progress: { color: "bg-violet-50 text-violet-600 border-violet-200", icon: Loader2, label: "En cours" },
  completed: { color: "bg-emerald-50 text-emerald-600 border-emerald-200", icon: CheckCircle2, label: "Complété" },
  overdue: { color: "bg-red-50 text-red-600 border-red-200", icon: AlertCircle, label: "En retard" },
};

const SIZES = {
  sm: "h-6 text-[10px] px-1.5 gap-1",
  md: "h-7 text-xs px-2 gap-1.5",
  lg: "h-8 text-sm px-3 gap-2",
};

export function StatusCell({ status, label, score, count, onClick, size = "md" }: StatusCellProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "inline-flex items-center rounded-md border transition",
        config.color,
        SIZES[size],
        onClick && "hover:ring-2 hover:ring-offset-1 cursor-pointer",
        !onClick && "cursor-default"
      )}
      title={label || config.label}
    >
      <Icon className="h-3 w-3 flex-shrink-0" />
      {score !== undefined && <span className="font-semibold">{score}%</span>}
      {count && <span>{count.done}/{count.total}</span>}
      {label && score === undefined && !count && <span className="truncate">{label}</span>}
    </button>
  );
}
