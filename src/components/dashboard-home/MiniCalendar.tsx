"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface Props {
  eventDates?: string[]; // ISO dates YYYY-MM-DD with events
}

const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function MiniCalendar({ eventDates = [] }: Props) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  const days = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = (firstDay.getDay() + 6) % 7; // Monday = 0
    const result: Array<{ day: number; isCurrentMonth: boolean; isToday: boolean; hasEvent: boolean; dateStr: string }> = [];

    // Previous month padding
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      const ds = d.toISOString().split("T")[0];
      result.push({ day: d.getDate(), isCurrentMonth: false, isToday: false, hasEvent: eventDates.includes(ds), dateStr: ds });
    }
    // Current month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      const ds = date.toISOString().split("T")[0];
      result.push({ day: d, isCurrentMonth: true, isToday: d === today.getDate(), hasEvent: eventDates.includes(ds), dateStr: ds });
    }
    // Next month padding
    const remaining = 7 - (result.length % 7);
    if (remaining < 7) {
      for (let d = 1; d <= remaining; d++) {
        const date = new Date(year, month + 1, d);
        const ds = date.toISOString().split("T")[0];
        result.push({ day: d, isCurrentMonth: false, isToday: false, hasEvent: eventDates.includes(ds), dateStr: ds });
      }
    }
    return result;
  }, [year, month, eventDates, today]);

  const monthLabel = today.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <div className="bg-white rounded-xl p-4 border">
      <p className="text-sm font-semibold text-gray-800 mb-3 capitalize">{monthLabel}</p>
      <div className="grid grid-cols-7 gap-1 text-center">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-[10px] font-medium text-muted-foreground py-1">{d}</div>
        ))}
        {days.map((d, i) => (
          <div
            key={i}
            className={cn(
              "relative text-xs py-1.5 rounded-md transition-colors",
              d.isCurrentMonth ? "text-gray-700" : "text-gray-300",
              d.isToday && "bg-[#374151] text-white font-bold",
              !d.isToday && d.hasEvent && "bg-red-50 text-red-700 font-medium"
            )}
          >
            {d.day}
            {d.hasEvent && !d.isToday && (
              <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#DC2626]" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
