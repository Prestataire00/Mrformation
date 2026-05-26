"use client";

import { cn } from "@/lib/utils";

interface StageStatsBarProps {
  attributed: number;
  sent: number;
  expectedSent: number;
  answered: number;
  rate: number;
}

function getRateColorClasses(rate: number): string {
  if (rate < 26) return "bg-red-100 text-red-700";
  if (rate <= 70) return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

export function StageStatsBar({ attributed, sent, expectedSent, answered, rate }: StageStatsBarProps) {
  if (attributed === 0) {
    return (
      <div className="border-t border-b border-gray-200 py-2 my-3 text-xs text-gray-400 text-center italic">
        Aucun questionnaire attribué pour ce stage
      </div>
    );
  }

  return (
    <div className="border-t border-b border-gray-200 py-2 my-3 flex items-center gap-3 text-xs">
      <span className="text-gray-600">
        <b>{attributed}</b> attribué{attributed > 1 ? "s" : ""}
      </span>
      <span className="text-gray-400">·</span>
      <span className="text-gray-600">
        <b>{sent}</b>/{expectedSent} envoyé{sent > 1 ? "s" : ""}
      </span>
      <span className="text-gray-400">·</span>
      <span className="text-gray-600">
        <b>{answered}</b> répondu{answered > 1 ? "s" : ""}
      </span>
      <span className="ml-auto">
        <span className={cn("px-2 py-0.5 rounded-full font-semibold", getRateColorClasses(rate))}>
          {rate}%
        </span>
      </span>
    </div>
  );
}
