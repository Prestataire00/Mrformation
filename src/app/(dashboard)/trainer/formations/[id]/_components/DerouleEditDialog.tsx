"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

// ── Types ────────────────────────────────────────────────────────────────────

export interface DerouleSlot {
  id: string;
  title: string | null;
  start_time: string;
  end_time: string;
  module_title: string | null;
  module_objectives: string | null;
  module_themes: string | null;
  module_exercises: string | null;
}

interface Props {
  slot: DerouleSlot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

// ── Zod schema ───────────────────────────────────────────────────────────────

const derouleSchema = z.object({
  module_title: z.string().max(200, "200 caractères max").optional(),
  module_objectives: z.string().max(2000, "2000 caractères max").optional(),
  module_themes: z.string().max(2000, "2000 caractères max").optional(),
  module_exercises: z.string().max(2000, "2000 caractères max").optional(),
});

type DerouleFormValues = z.infer<typeof derouleSchema>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeParis(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}

function formatDateParis(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
}

// ── Component ────────────────────────────────────────────────────────────────

export function DerouleEditDialog({ slot, open, onOpenChange, onSaved }: Props) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DerouleFormValues>({
    resolver: zodResolver(derouleSchema),
    defaultValues: {
      module_title: "",
      module_objectives: "",
      module_themes: "",
      module_exercises: "",
    },
  });

  // Reset form when slot changes (new dialog open)
  useEffect(() => {
    if (slot) {
      reset({
        module_title: slot.module_title ?? "",
        module_objectives: slot.module_objectives ?? "",
        module_themes: slot.module_themes ?? "",
        module_exercises: slot.module_exercises ?? "",
      });
    }
  }, [slot, reset]);

  async function onSubmit(values: DerouleFormValues) {
    if (!slot) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/trainer/time-slots/${slot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module_title: values.module_title ?? null,
          module_objectives: values.module_objectives ?? null,
          module_themes: values.module_themes ?? null,
          module_exercises: values.module_exercises ?? null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Erreur ${res.status}`);
      }

      toast({
        title: "Déroulé enregistré",
        description: "Le déroulé pédagogique a bien été mis à jour.",
      });

      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Une erreur est survenue.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (!slot) return null;

  const slotLabel = slot.title ?? "Créneau";
  const dateLabel = formatDateParis(slot.start_time);
  const timeLabel = `${formatTimeParis(slot.start_time)} – ${formatTimeParis(slot.end_time)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base leading-snug">
            Déroulé — {slotLabel}
            <span className="block text-sm font-normal text-gray-500 mt-1">
              {dateLabel} · {timeLabel}
            </span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          {/* Titre du module */}
          <div className="space-y-1.5">
            <Label htmlFor="module_title">Titre du module</Label>
            <Textarea
              id="module_title"
              rows={2}
              placeholder="Ex : Introduction aux fondamentaux…"
              {...register("module_title")}
            />
            {errors.module_title && (
              <p className="text-xs text-destructive">{errors.module_title.message}</p>
            )}
          </div>

          {/* Objectifs */}
          <div className="space-y-1.5">
            <Label htmlFor="module_objectives">Objectifs pédagogiques</Label>
            <Textarea
              id="module_objectives"
              rows={3}
              placeholder="Ex : À l'issue de cette séquence, le stagiaire sera capable de…"
              {...register("module_objectives")}
            />
            {errors.module_objectives && (
              <p className="text-xs text-destructive">{errors.module_objectives.message}</p>
            )}
          </div>

          {/* Thèmes abordés */}
          <div className="space-y-1.5">
            <Label htmlFor="module_themes">Thèmes abordés</Label>
            <Textarea
              id="module_themes"
              rows={3}
              placeholder="Ex : Réglementation, outils pratiques, études de cas…"
              {...register("module_themes")}
            />
            {errors.module_themes && (
              <p className="text-xs text-destructive">{errors.module_themes.message}</p>
            )}
          </div>

          {/* Exercices / travaux pratiques */}
          <div className="space-y-1.5">
            <Label htmlFor="module_exercises">Exercices / travaux pratiques</Label>
            <Textarea
              id="module_exercises"
              rows={3}
              placeholder="Ex : Mise en situation, quiz, travaux de groupe…"
              {...register("module_exercises")}
            />
            {errors.module_exercises && (
              <p className="text-xs text-destructive">{errors.module_exercises.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
