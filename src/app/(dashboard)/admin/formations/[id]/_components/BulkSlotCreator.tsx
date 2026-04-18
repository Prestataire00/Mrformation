"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { CalendarPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import type { Session } from "@/lib/types";

const WEEK_DAYS = [
  { value: "1", label: "Lundi" },
  { value: "2", label: "Mardi" },
  { value: "3", label: "Mercredi" },
  { value: "4", label: "Jeudi" },
  { value: "5", label: "Vendredi" },
  { value: "6", label: "Samedi" },
  { value: "0", label: "Dimanche" },
];

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

export function BulkSlotCreator({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  // Form
  const [title, setTitle] = useState(formation.title);
  const [dateFrom, setDateFrom] = useState(formation.start_date?.split("T")[0] || "");
  const [dateTo, setDateTo] = useState(formation.end_date?.split("T")[0] || "");
  const [timeStart, setTimeStart] = useState("09:00");
  const [timeEnd, setTimeEnd] = useState("17:00");

  // Options
  const [excludeWeekends, setExcludeWeekends] = useState(true);
  const [withLunch, setWithLunch] = useState(false);
  const [lunchStart, setLunchStart] = useState("12:00");
  const [lunchEnd, setLunchEnd] = useState("13:00");
  const [weeklyMode, setWeeklyMode] = useState(false);
  const [weeklyDay, setWeeklyDay] = useState("1");

  // Generate preview slots
  const previewSlots = useMemo(() => {
    const slots: { title: string; start_time: string; end_time: string }[] = [];
    if (!dateFrom || !dateTo || !timeStart || !timeEnd) return slots;

    const from = new Date(dateFrom + "T00:00:00");
    const to = new Date(dateTo + "T00:00:00");
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) return slots;

    const slotTitle = title || formation.title;
    const current = new Date(from);

    while (current <= to) {
      const dayOfWeek = current.getDay();
      let shouldAdd = true;

      if (weeklyMode) {
        shouldAdd = dayOfWeek === parseInt(weeklyDay);
      } else if (excludeWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
        shouldAdd = false;
      }

      if (shouldAdd) {
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, "0");
        const day = String(current.getDate()).padStart(2, "0");
        const dateStr = `${year}-${month}-${day}`;
        // Compute local timezone offset (e.g. "+02:00" for Paris summer)
        const offset = (() => {
          const d = new Date(`${dateStr}T12:00:00`);
          const off = -d.getTimezoneOffset();
          const sign = off >= 0 ? "+" : "-";
          const h = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
          const m = String(Math.abs(off) % 60).padStart(2, "0");
          return `${sign}${h}:${m}`;
        })();
        if (withLunch) {
          slots.push({ title: slotTitle, start_time: `${dateStr}T${timeStart}:00${offset}`, end_time: `${dateStr}T${lunchStart}:00${offset}` });
          slots.push({ title: slotTitle, start_time: `${dateStr}T${lunchEnd}:00${offset}`, end_time: `${dateStr}T${timeEnd}:00${offset}` });
        } else {
          slots.push({ title: slotTitle, start_time: `${dateStr}T${timeStart}:00${offset}`, end_time: `${dateStr}T${timeEnd}:00${offset}` });
        }
      }
      current.setDate(current.getDate() + 1);
    }
    return slots;
  }, [title, dateFrom, dateTo, timeStart, timeEnd, excludeWeekends, withLunch, lunchStart, lunchEnd, weeklyMode, weeklyDay, formation.title]);

  async function handlePlanifier() {
    if (previewSlots.length === 0) {
      toast({ title: "Aucun créneau à créer", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const existing = formation.formation_time_slots?.length ?? 0;
      const rows = previewSlots.map((s, i) => ({
        session_id: formation.id,
        title: s.title,
        start_time: s.start_time,
        end_time: s.end_time,
        slot_order: existing + i + 1,
      }));

      const { error } = await supabase.from("formation_time_slots").insert(rows);
      if (error) throw error;
      toast({ title: `${previewSlots.length} créneau${previewSlots.length > 1 ? "x" : ""} créé${previewSlots.length > 1 ? "s" : ""}` });
      await onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible de créer les créneaux";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border rounded-lg p-4 bg-gray-50/50 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">Planifier des créneaux en masse</h3>

      {/* Row 1: Title + Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Titre</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Du</label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Au</label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-sm" />
        </div>
      </div>

      {/* Row 2: Times */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">De</label>
          <Input type="time" value={timeStart} onChange={(e) => setTimeStart(e.target.value)} className="h-8 text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">À</label>
          <Input type="time" value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)} className="h-8 text-sm" />
        </div>
      </div>

      {/* Options */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={excludeWeekends} onCheckedChange={(v) => setExcludeWeekends(!!v)} />
          Exclure les weekends
        </label>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={withLunch} onCheckedChange={(v) => setWithLunch(!!v)} />
          Pause déjeuner
        </label>
        {withLunch && (
          <div className="flex items-center gap-2 ml-6">
            <Input type="time" value={lunchStart} onChange={(e) => setLunchStart(e.target.value)} className="h-7 w-28 text-xs" />
            <span className="text-xs text-gray-400">à</span>
            <Input type="time" value={lunchEnd} onChange={(e) => setLunchEnd(e.target.value)} className="h-7 w-28 text-xs" />
          </div>
        )}

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={weeklyMode} onCheckedChange={(v) => setWeeklyMode(!!v)} />
          1 fois par semaine uniquement
        </label>
        {weeklyMode && (
          <div className="ml-6">
            <Select value={weeklyDay} onValueChange={setWeeklyDay}>
              <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WEEK_DAYS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Action */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-200">
        <span className="text-xs text-gray-400">
          {previewSlots.length > 0 ? `${previewSlots.length} créneau${previewSlots.length > 1 ? "x" : ""} à créer` : "Remplissez les dates pour prévisualiser"}
        </span>
        <Button
          size="sm"
          onClick={handlePlanifier}
          disabled={loading || previewSlots.length === 0}
          style={{ background: "#374151" }}
          className="text-white gap-1.5 text-xs"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5" />}
          Planifier {previewSlots.length > 0 ? `${previewSlots.length} créneau${previewSlots.length > 1 ? "x" : ""}` : ""}
        </Button>
      </div>
    </div>
  );
}
