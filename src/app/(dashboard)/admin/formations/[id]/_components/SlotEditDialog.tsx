"use client";

/**
 * PLAN-1 audit BMAD — Dialog d'édition d'un créneau (formation_time_slots).
 *
 * Avant : aucun moyen d'éditer un slot depuis le calendrier TabPlanning
 * (TimeSlotCard.tsx existait mais n'était importé nulle part). L'admin
 * devait passer par TabParcours.
 *
 * Ce dialog s'ouvre au clic sur un pavé du calendrier. Permet d'éditer :
 *  - Titre du créneau
 *  - Heure début / fin (datetime-local)
 *  - Contenu pédagogique : module_title, module_objectives, module_themes,
 *    module_exercises (alimente le programme PDF + Qualiopi).
 *
 * Validation Zod (extend updateTimeSlotSchema) + check cross-field
 * end_time > start_time. Affichage des erreurs sous chaque champ.
 */

import { useEffect, useState } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Save, Trash2 } from "lucide-react";
import { updateTimeSlot, deleteTimeSlot } from "@/lib/services/time-slots";
import { toUtcIsoFromParisTime } from "@/lib/timezone";
import type { FormationTimeSlot } from "@/lib/types";

interface Props {
  slot: FormationTimeSlot | null;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  entityId: string | null;
}

const slotEditSchema = z
  .object({
    title: z.string().max(500).optional().nullable(),
    start_time: z.string().min(1, "Heure de début requise"),
    end_time: z.string().min(1, "Heure de fin requise"),
    module_title: z.string().max(500).optional().nullable(),
    module_objectives: z.string().max(5000).optional().nullable(),
    module_themes: z.string().max(5000).optional().nullable(),
    module_exercises: z.string().max(5000).optional().nullable(),
  })
  .refine((d) => new Date(d.end_time) > new Date(d.start_time), {
    message: "La fin doit être après le début",
    path: ["end_time"],
  });

type SlotEditFormErrors = Partial<Record<keyof z.infer<typeof slotEditSchema>, string>>;

// datetime-local input ne supporte pas le suffixe Z, on convertit dans
// le fuseau Europe/Paris pour rester cohérent avec timezone.ts.
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const tz = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => tz.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function localInputToIso(local: string): string {
  // Interprète l'input datetime-local comme heure murale Europe/Paris et
  // retourne l'ISO UTC. Délègue à toUtcIsoFromParisTime (DST-safe via
  // date-fns-tz) au lieu d'un offset codé en dur, faux aux changements d'heure.
  const [datePart, timePart] = local.split("T");
  return toUtcIsoFromParisTime(datePart, timePart);
}

export function SlotEditDialog({ slot, onClose, onRefresh, entityId }: Props) {
  const supabase = createClient();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errors, setErrors] = useState<SlotEditFormErrors>({});

  const [form, setForm] = useState({
    title: "",
    start_time: "",
    end_time: "",
    module_title: "",
    module_objectives: "",
    module_themes: "",
    module_exercises: "",
  });

  useEffect(() => {
    if (!slot) return;
    setForm({
      title: slot.title || "",
      start_time: isoToLocalInput(slot.start_time),
      end_time: isoToLocalInput(slot.end_time),
      module_title: slot.module_title || "",
      module_objectives: slot.module_objectives || "",
      module_themes: slot.module_themes || "",
      module_exercises: slot.module_exercises || "",
    });
    setErrors({});
    setConfirmDelete(false);
  }, [slot]);

  if (!slot) return null;

  const handleSave = async () => {
    const parsed = slotEditSchema.safeParse(form);
    if (!parsed.success) {
      const map: SlotEditFormErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof SlotEditFormErrors;
        if (key && !map[key]) map[key] = issue.message;
      }
      setErrors(map);
      toast({
        title: "Formulaire invalide",
        description: Object.values(map)[0] || "Vérifiez les champs.",
        variant: "destructive",
      });
      return;
    }
    setErrors({});
    if (!entityId) {
      toast({ title: "Erreur", description: "Entité non chargée.", variant: "destructive" });
      return;
    }
    setSaving(true);
    // PLAN-4 audit BMAD : service centralisé (entity_id check + ServiceResult).
    const result = await updateTimeSlot(supabase, slot.id, slot.session_id, entityId, {
      title: form.title.trim() || null,
      start_time: localInputToIso(form.start_time),
      end_time: localInputToIso(form.end_time),
      module_title: form.module_title.trim() || null,
      module_objectives: form.module_objectives.trim() || null,
      module_themes: form.module_themes.trim() || null,
      module_exercises: form.module_exercises.trim() || null,
    });
    if (!result.ok) {
      toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
    } else {
      toast({ title: "Créneau mis à jour" });
      await onRefresh();
      onClose();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!entityId) {
      toast({ title: "Erreur", description: "Entité non chargée.", variant: "destructive" });
      return;
    }
    setDeleting(true);
    // PLAN-4 audit BMAD : service centralisé.
    const result = await deleteTimeSlot(supabase, slot.id, slot.session_id, entityId);
    if (!result.ok) {
      toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
    } else {
      toast({ title: "Créneau supprimé" });
      await onRefresh();
      onClose();
    }
    setDeleting(false);
    setConfirmDelete(false);
  };

  return (
    <Dialog open={slot !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier le créneau</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Titre */}
          <div className="space-y-1.5">
            <Label>Titre du créneau</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Ex: Matinée — Introduction"
            />
          </div>

          {/* Heures */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Début</Label>
              <Input
                type="datetime-local"
                value={form.start_time}
                onChange={(e) => setForm((p) => ({ ...p, start_time: e.target.value }))}
                className={errors.start_time ? "border-red-400" : ""}
              />
              {errors.start_time && <p className="text-xs text-red-600">{errors.start_time}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Fin</Label>
              <Input
                type="datetime-local"
                value={form.end_time}
                onChange={(e) => setForm((p) => ({ ...p, end_time: e.target.value }))}
                className={errors.end_time ? "border-red-400" : ""}
              />
              {errors.end_time && <p className="text-xs text-red-600">{errors.end_time}</p>}
            </div>
          </div>

          {/* Contenu pédagogique */}
          <div className="space-y-3 border-t pt-3">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Contenu pédagogique (alimente le programme PDF + Qualiopi)
            </p>
            <div className="space-y-1.5">
              <Label>Titre du module</Label>
              <Input
                value={form.module_title}
                onChange={(e) => setForm((p) => ({ ...p, module_title: e.target.value }))}
                placeholder="Ex: MODULE 1 — Rôle du manager"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Objectifs liés</Label>
              <Textarea
                value={form.module_objectives}
                onChange={(e) => setForm((p) => ({ ...p, module_objectives: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Thèmes abordés</Label>
              <Textarea
                value={form.module_themes}
                onChange={(e) => setForm((p) => ({ ...p, module_themes: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Exercices pratiques</Label>
              <Textarea
                value={form.module_exercises}
                onChange={(e) => setForm((p) => ({ ...p, module_exercises: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="outline"
            onClick={() => setConfirmDelete(true)}
            disabled={saving || deleting}
            className="text-red-600 hover:bg-red-50 border-red-200"
          >
            <Trash2 className="h-4 w-4 mr-1" /> Supprimer
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving || deleting}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving || deleting}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Save className="h-4 w-4 mr-1" />
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </DialogFooter>

        {/* Confirmation suppression — sous-dialog inline */}
        {confirmDelete && (
          <div className="mt-2 border border-red-200 bg-red-50 rounded-md p-3 space-y-2">
            <p className="text-sm text-red-800">
              Confirmer la suppression de ce créneau ? Cette action est irréversible.
            </p>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                Annuler
              </Button>
              <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                Supprimer
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
