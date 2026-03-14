"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CalendarPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

interface BulkForm {
  title: string;
  dateFrom: string;
  dateTo: string;
  timeStart: string;
  timeEnd: string;
  lunchStart: string;
  lunchEnd: string;
  weeklyDay: string;
}

const emptyForm: BulkForm = {
  title: "",
  dateFrom: "",
  dateTo: "",
  timeStart: "",
  timeEnd: "",
  lunchStart: "12:00",
  lunchEnd: "13:00",
  weeklyDay: "1",
};

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

function generateSlots(
  form: BulkForm,
  variant: string,
  formationTitle: string
): { title: string; start_time: string; end_time: string }[] {
  const slots: { title: string; start_time: string; end_time: string }[] = [];
  const title = form.title || formationTitle;
  const from = new Date(form.dateFrom + "T00:00:00");
  const to = new Date(form.dateTo + "T00:00:00");

  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) return slots;
  if (!form.timeStart || !form.timeEnd) return slots;

  const isWeekly = variant.startsWith("weekly");
  const noWeekends = variant.includes("no_weekends");
  const withLunch = variant.includes("lunch");

  const current = new Date(from);
  while (current <= to) {
    const dayOfWeek = current.getDay();
    let shouldAdd = false;

    if (isWeekly) {
      shouldAdd = dayOfWeek === parseInt(form.weeklyDay);
    } else {
      shouldAdd = true;
      if (noWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
        shouldAdd = false;
      }
    }

    if (shouldAdd) {
      const dateStr = current.toISOString().split("T")[0];

      if (withLunch) {
        // Matin
        slots.push({
          title,
          start_time: `${dateStr}T${form.timeStart}:00`,
          end_time: `${dateStr}T${form.lunchStart}:00`,
        });
        // Après-midi
        slots.push({
          title,
          start_time: `${dateStr}T${form.lunchEnd}:00`,
          end_time: `${dateStr}T${form.timeEnd}:00`,
        });
      } else {
        slots.push({
          title,
          start_time: `${dateStr}T${form.timeStart}:00`,
          end_time: `${dateStr}T${form.timeEnd}:00`,
        });
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return slots;
}

interface VariantConfig {
  key: string;
  title: string;
  titleColor?: string;
  showWeekend?: boolean;
  showLunch?: boolean;
  showWeeklyDay?: boolean;
}

const VARIANTS: VariantConfig[] = [
  {
    key: "every_day",
    title: "Vous pouvez planifier des créneaux en masse (par intervalle) :",
  },
  {
    key: "every_day_no_weekends",
    title: "Vous pouvez planifier des créneaux en masse (par intervalle)",
    titleColor: "text-red-500",
  },
  {
    key: "with_lunch",
    title: "Y a-t-il une pause déjeuner ?",
    showLunch: true,
  },
  {
    key: "with_lunch_no_weekends",
    title: "Y a-t-il une pause déjeuner et",
    titleColor: "text-red-500",
    showLunch: true,
  },
  {
    key: "weekly",
    title: "1 fois par semaine ?",
    titleColor: "text-red-500",
    showWeeklyDay: true,
  },
  {
    key: "weekly_with_lunch",
    title: "1 fois par semaine avec une pause déjeuner ?",
    titleColor: "text-red-500",
    showLunch: true,
    showWeeklyDay: true,
  },
];

export function BulkSlotCreator({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [forms, setForms] = useState<Record<string, BulkForm>>(
    Object.fromEntries(VARIANTS.map((v) => [v.key, { ...emptyForm, title: formation.title }]))
  );
  const [loadingVariant, setLoadingVariant] = useState<string | null>(null);

  const updateForm = (variant: string, field: keyof BulkForm, value: string) => {
    setForms((prev) => ({
      ...prev,
      [variant]: { ...prev[variant], [field]: value },
    }));
  };

  const handlePlanifier = async (variant: string) => {
    const form = forms[variant];
    const slots = generateSlots(form, variant, formation.title);

    if (slots.length === 0) {
      toast({ title: "Aucun créneau à créer", description: "Vérifiez les dates et heures", variant: "destructive" });
      return;
    }

    setLoadingVariant(variant);

    // Trouver le prochain slot_order
    const existingSlots = formation.formation_time_slots || [];
    let nextOrder = existingSlots.length > 0
      ? Math.max(...existingSlots.map((s) => s.slot_order)) + 1
      : 0;

    const rows = slots.map((s, i) => ({
      session_id: formation.id,
      title: s.title,
      start_time: s.start_time,
      end_time: s.end_time,
      slot_order: nextOrder + i,
    }));

    const { error } = await supabase.from("formation_time_slots").insert(rows);
    setLoadingVariant(null);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${slots.length} créneau(x) créé(s)` });
      onRefresh();
    }
  };

  return (
    <div className="space-y-6">
      {VARIANTS.map((v) => {
        const form = forms[v.key];
        return (
          <Card key={v.key}>
            <CardContent className="pt-6">
              <h3 className="font-bold mb-4">
                {v.title}
                {v.key === "every_day_no_weekends" && (
                  <span className="text-red-500 ml-1">sans les weekends</span>
                )}
                {v.key === "with_lunch_no_weekends" && (
                  <span className="text-red-500 ml-1">sans weekend ?</span>
                )}
              </h3>

              {v.showLunch && (
                <div className="flex items-center gap-3 mb-4">
                  <Label>Pause déjeuner de</Label>
                  <Input
                    type="time"
                    value={form.lunchStart}
                    onChange={(e) => updateForm(v.key, "lunchStart", e.target.value)}
                    className="w-[120px]"
                  />
                  <Label>À</Label>
                  <Input
                    type="time"
                    value={form.lunchEnd}
                    onChange={(e) => updateForm(v.key, "lunchEnd", e.target.value)}
                    className="w-[120px]"
                  />
                </div>
              )}

              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <Label className="text-xs">Titre du créneau</Label>
                  <Input
                    value={form.title}
                    onChange={(e) => updateForm(v.key, "title", e.target.value)}
                    className="w-[180px]"
                  />
                </div>

                {v.showWeeklyDay && (
                  <div>
                    <Label className="text-xs">Chaque*</Label>
                    <Select
                      value={form.weeklyDay}
                      onValueChange={(val) => updateForm(v.key, "weeklyDay", val)}
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEK_DAYS.map((d) => (
                          <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {!v.showWeeklyDay && (
                  <div>
                    <Label className="text-xs">Chaque jour du*</Label>
                    <Input
                      type="date"
                      value={form.dateFrom}
                      onChange={(e) => updateForm(v.key, "dateFrom", e.target.value)}
                      className="w-[150px]"
                    />
                  </div>
                )}

                {v.showWeeklyDay && (
                  <div>
                    <Label className="text-xs">du*</Label>
                    <Input
                      type="date"
                      value={form.dateFrom}
                      onChange={(e) => updateForm(v.key, "dateFrom", e.target.value)}
                      className="w-[150px]"
                    />
                  </div>
                )}

                <div>
                  <Label className="text-xs">Au*</Label>
                  <Input
                    type="date"
                    value={form.dateTo}
                    onChange={(e) => updateForm(v.key, "dateTo", e.target.value)}
                    className="w-[150px]"
                  />
                </div>

                <div>
                  <Label className="text-xs">De*</Label>
                  <Input
                    type="time"
                    value={form.timeStart}
                    onChange={(e) => updateForm(v.key, "timeStart", e.target.value)}
                    className="w-[110px]"
                  />
                </div>

                <div>
                  <Label className="text-xs">À*</Label>
                  <Input
                    type="time"
                    value={form.timeEnd}
                    onChange={(e) => updateForm(v.key, "timeEnd", e.target.value)}
                    className="w-[110px]"
                  />
                </div>

                <Button
                  onClick={() => handlePlanifier(v.key)}
                  disabled={loadingVariant === v.key}
                  className="bg-primary"
                >
                  {loadingVariant === v.key ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CalendarPlus className="h-4 w-4 mr-2" />
                  )}
                  Planifier
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
