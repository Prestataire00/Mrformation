"use client";

import { useState, useMemo } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { toUtcIsoFromParisTime } from "@/lib/timezone";
import { CalendarPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { bulkCreateTimeSlots } from "@/lib/services/time-slots";
import { buildHolidaySet } from "@/lib/utils/french-holidays";
import type { Session } from "@/lib/types";

/**
 * PLAN-2 audit BMAD — Zod schema local pour BulkSlotCreator.
 *
 * Avant : aucune validation, accepte silencieusement timeEnd<timeStart,
 * dateFrom>dateTo, lunch hors plage. bulkTimeSlotSchema existe dans
 * validations/index.ts mais n'était pas branché.
 *
 * Ce schema étend la validation de base avec :
 *  - cross-field : timeEnd > timeStart
 *  - cross-field : dateTo >= dateFrom
 *  - cross-field : lunch dans [timeStart, timeEnd] (si withLunch)
 *  - cross-field : lunchEnd > lunchStart (si withLunch)
 *  - warning bornes session : dateFrom/dateTo dans [session.start_date,
 *    session.end_date] (côté UI, pas dans le schema — laisse passer mais
 *    affiche un message).
 */
const bulkSlotFormSchema = z
  .object({
    title: z.string().max(500).optional(),
    dateFrom: z.string().min(1, "Date de début requise"),
    dateTo: z.string().min(1, "Date de fin requise"),
    timeStart: z.string().min(1, "Heure de début requise"),
    timeEnd: z.string().min(1, "Heure de fin requise"),
    excludeWeekends: z.boolean(),
    withLunch: z.boolean(),
    lunchStart: z.string(),
    lunchEnd: z.string(),
    weeklyMode: z.boolean(),
    weeklyDay: z.string(),
  })
  .refine((d) => d.dateTo >= d.dateFrom, {
    message: "La date de fin doit être ≥ date de début",
    path: ["dateTo"],
  })
  .refine((d) => d.timeEnd > d.timeStart, {
    message: "L'heure de fin doit être > heure de début",
    path: ["timeEnd"],
  })
  .refine((d) => !d.withLunch || d.lunchEnd > d.lunchStart, {
    message: "Fin pause > début pause",
    path: ["lunchEnd"],
  })
  .refine((d) => !d.withLunch || (d.lunchStart >= d.timeStart && d.lunchEnd <= d.timeEnd), {
    message: "Pause hors de la plage horaire",
    path: ["lunchStart"],
  });

type BulkSlotFormErrors = Partial<Record<
  | "title" | "dateFrom" | "dateTo" | "timeStart" | "timeEnd"
  | "lunchStart" | "lunchEnd",
  string
>>;

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
  const { entityId } = useEntity();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<BulkSlotFormErrors>({});

  // Form
  const [title, setTitle] = useState(formation.title);
  const [dateFrom, setDateFrom] = useState(formation.start_date?.split("T")[0] || "");
  const [dateTo, setDateTo] = useState(formation.end_date?.split("T")[0] || "");
  const [timeStart, setTimeStart] = useState("09:00");
  const [timeEnd, setTimeEnd] = useState("17:00");

  // Options
  const [excludeWeekends, setExcludeWeekends] = useState(true);
  // PLAN-11 audit BMAD : option d'exclusion des jours fériés FR (cochée par défaut).
  const [excludeHolidays, setExcludeHolidays] = useState(true);
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
    // PLAN-11 audit BMAD : précalcule les fériés FR sur la plage.
    const holidays = excludeHolidays
      ? buildHolidaySet(from.getFullYear(), to.getFullYear())
      : null;

    while (current <= to) {
      const dayOfWeek = current.getDay();
      let shouldAdd = true;

      if (weeklyMode) {
        shouldAdd = dayOfWeek === parseInt(weeklyDay);
      } else if (excludeWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
        shouldAdd = false;
      }

      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, "0");
      const day = String(current.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      if (shouldAdd && holidays?.has(dateStr)) {
        shouldAdd = false;
      }

      if (shouldAdd) {
        if (withLunch) {
          slots.push({ title: slotTitle, start_time: toUtcIsoFromParisTime(dateStr, timeStart), end_time: toUtcIsoFromParisTime(dateStr, lunchStart) });
          slots.push({ title: slotTitle, start_time: toUtcIsoFromParisTime(dateStr, lunchEnd), end_time: toUtcIsoFromParisTime(dateStr, timeEnd) });
        } else {
          slots.push({ title: slotTitle, start_time: toUtcIsoFromParisTime(dateStr, timeStart), end_time: toUtcIsoFromParisTime(dateStr, timeEnd) });
        }
      }
      current.setDate(current.getDate() + 1);
    }
    return slots;
  }, [title, dateFrom, dateTo, timeStart, timeEnd, excludeWeekends, excludeHolidays, withLunch, lunchStart, lunchEnd, weeklyMode, weeklyDay, formation.title]);

  // PLAN-2 audit BMAD : warning si dates hors bornes de la session
  // (best-effort UI, n'empêche pas la création).
  const sessionStart = formation.start_date?.split("T")[0];
  const sessionEnd = formation.end_date?.split("T")[0];
  const dateOutOfRange =
    dateFrom && dateTo && sessionStart && sessionEnd
      ? dateFrom < sessionStart || dateTo > sessionEnd
      : false;

  async function handlePlanifier() {
    // PLAN-2 audit BMAD : validation Zod centralisée (cross-field).
    const parsed = bulkSlotFormSchema.safeParse({
      title,
      dateFrom,
      dateTo,
      timeStart,
      timeEnd,
      excludeWeekends,
      withLunch,
      lunchStart,
      lunchEnd,
      weeklyMode,
      weeklyDay,
    });
    if (!parsed.success) {
      const map: BulkSlotFormErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof BulkSlotFormErrors;
        if (key && !map[key]) map[key] = issue.message;
      }
      setErrors(map);
      toast({
        title: "Formulaire invalide",
        description: Object.values(map)[0] || "Vérifiez les champs en rouge.",
        variant: "destructive",
      });
      return;
    }
    setErrors({});

    if (previewSlots.length === 0) {
      toast({ title: "Aucun créneau à créer", variant: "destructive" });
      return;
    }
    if (!entityId) {
      toast({ title: "Erreur", description: "Entité non chargée.", variant: "destructive" });
      return;
    }

    setLoading(true);
    // PLAN-4 audit BMAD : service centralisé (entity_id check + erreur ServiceResult).
    const existing = formation.formation_time_slots?.length ?? 0;
    const inputs = previewSlots.map((s, i) => ({
      title: s.title,
      start_time: s.start_time,
      end_time: s.end_time,
      slot_order: existing + i + 1,
    }));
    const result = await bulkCreateTimeSlots(supabase, formation.id, entityId, inputs);
    if (!result.ok) {
      toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
    } else {
      toast({ title: `${result.count} créneau${result.count > 1 ? "x" : ""} créé${result.count > 1 ? "s" : ""}` });
      await onRefresh();
    }
    setLoading(false);
  }

  // PLAN-8 audit BMAD : presets horaires pour gagner du temps. Chaque
  // preset modifie timeStart/timeEnd/withLunch en un clic — l'admin n'a
  // plus besoin de retaper les horaires usuels.
  const applyPreset = (preset: "journee-pause" | "journee" | "matin" | "aprem") => {
    if (preset === "journee-pause") {
      setTimeStart("09:00");
      setTimeEnd("17:00");
      setWithLunch(true);
      setLunchStart("12:00");
      setLunchEnd("13:00");
    } else if (preset === "journee") {
      setTimeStart("09:00");
      setTimeEnd("17:00");
      setWithLunch(false);
    } else if (preset === "matin") {
      setTimeStart("09:00");
      setTimeEnd("12:00");
      setWithLunch(false);
    } else if (preset === "aprem") {
      setTimeStart("14:00");
      setTimeEnd("17:00");
      setWithLunch(false);
    }
  };

  return (
    <div className="border rounded-lg p-4 bg-gray-50/50 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-gray-700">Planifier des créneaux en masse</h3>
        {/* PLAN-8 audit BMAD : presets horaires */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-gray-400 mr-1">Modèles :</span>
          <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={() => applyPreset("journee-pause")}>
            Journée 9h–17h pause
          </Button>
          <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={() => applyPreset("journee")}>
            Journée 9h–17h
          </Button>
          <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={() => applyPreset("matin")}>
            Matin 9h–12h
          </Button>
          <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={() => applyPreset("aprem")}>
            Aprem 14h–17h
          </Button>
        </div>
      </div>

      {/* Row 1: Title + Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Titre</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Du</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={`h-8 text-sm ${errors.dateFrom ? "border-red-400" : ""}`}
          />
          {errors.dateFrom && <p className="text-xs text-red-600 mt-0.5">{errors.dateFrom}</p>}
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Au</label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={`h-8 text-sm ${errors.dateTo ? "border-red-400" : ""}`}
          />
          {errors.dateTo && <p className="text-xs text-red-600 mt-0.5">{errors.dateTo}</p>}
        </div>
      </div>

      {/* PLAN-2 : warning si dates hors bornes de la session */}
      {dateOutOfRange && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          ⚠ Les dates sortent de la période de la session ({sessionStart} → {sessionEnd}). Vérifiez avant de planifier.
        </p>
      )}

      {/* Row 2: Times */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">De</label>
          <Input
            type="time"
            value={timeStart}
            onChange={(e) => setTimeStart(e.target.value)}
            className={`h-8 text-sm ${errors.timeStart ? "border-red-400" : ""}`}
          />
          {errors.timeStart && <p className="text-xs text-red-600 mt-0.5">{errors.timeStart}</p>}
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">À</label>
          <Input
            type="time"
            value={timeEnd}
            onChange={(e) => setTimeEnd(e.target.value)}
            className={`h-8 text-sm ${errors.timeEnd ? "border-red-400" : ""}`}
          />
          {errors.timeEnd && <p className="text-xs text-red-600 mt-0.5">{errors.timeEnd}</p>}
        </div>
      </div>

      {/* Options */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={excludeWeekends} onCheckedChange={(v) => setExcludeWeekends(!!v)} />
          Exclure les weekends
        </label>

        {/* PLAN-11 audit BMAD : exclusion des jours fériés FR */}
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={excludeHolidays} onCheckedChange={(v) => setExcludeHolidays(!!v)} />
          Exclure les jours fériés (France métropolitaine)
        </label>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={withLunch} onCheckedChange={(v) => setWithLunch(!!v)} />
          Pause déjeuner
        </label>
        {withLunch && (
          <div className="ml-6 space-y-1">
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={lunchStart}
                onChange={(e) => setLunchStart(e.target.value)}
                className={`h-7 w-28 text-xs ${errors.lunchStart ? "border-red-400" : ""}`}
              />
              <span className="text-xs text-gray-400">à</span>
              <Input
                type="time"
                value={lunchEnd}
                onChange={(e) => setLunchEnd(e.target.value)}
                className={`h-7 w-28 text-xs ${errors.lunchEnd ? "border-red-400" : ""}`}
              />
            </div>
            {(errors.lunchStart || errors.lunchEnd) && (
              <p className="text-xs text-red-600">{errors.lunchStart || errors.lunchEnd}</p>
            )}
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
