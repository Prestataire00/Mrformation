"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Pencil, Save, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import type { FormationTimeSlot } from "@/lib/types";

interface Props {
  slot: FormationTimeSlot;
  index: number;
  formationTitle: string;
  onRefresh: () => Promise<void>;
}

export function TimeSlotCard({ slot, index, formationTitle, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [moduleTitle, setModuleTitle] = useState(slot.module_title || "");
  const [moduleObjectives, setModuleObjectives] = useState(slot.module_objectives || "");
  const [moduleThemes, setModuleThemes] = useState(slot.module_themes || "");
  const [moduleExercises, setModuleExercises] = useState(slot.module_exercises || "");

  const start = new Date(slot.start_time);
  const end = new Date(slot.end_time);
  const durationMs = end.getTime() - start.getTime();
  const durationH = Math.floor(durationMs / (1000 * 60 * 60));
  const durationM = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
  const durationStr = durationH > 0
    ? `${durationH}h${durationM > 0 ? durationM.toString().padStart(2, "0") : ""}`
    : `${durationM}min`;

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("formation_time_slots")
        .update({
          module_title: moduleTitle || null,
          module_objectives: moduleObjectives || null,
          module_themes: moduleThemes || null,
          module_exercises: moduleExercises || null,
        })
        .eq("id", slot.id)
        .eq("session_id", slot.session_id);
      if (error) throw error;
      toast({ title: "Créneau mis à jour" });
      setEditing(false);
      await onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible de mettre à jour";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Créneau {index + 1}</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            {start.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })} {start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}
            {" - "}
            {end.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })} {end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}
            {" "}({durationStr}) - {slot.title || formationTitle}
          </p>
        </CardHeader>
        <CardContent>
          {(slot.module_title || slot.module_objectives || slot.module_themes || slot.module_exercises) ? (
            <div className="bg-muted/30 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap space-y-2">
              {slot.module_title && (
                <p><strong>{slot.module_title}</strong></p>
              )}
              {slot.module_objectives && (
                <p>Objectif lié : {slot.module_objectives}</p>
              )}
              {slot.module_themes && (
                <p>Thème(s) abordé(s) : {slot.module_themes}</p>
              )}
              {slot.module_exercises && (
                <p>Exercices pratiques : {slot.module_exercises}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Aucun contenu pédagogique défini pour ce créneau.
            </p>
          )}
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4 mr-1" /> Modifier
          </Button>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Modifier le contenu — Créneau {index + 1}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Titre du module</Label>
              <Input
                value={moduleTitle}
                onChange={(e) => setModuleTitle(e.target.value)}
                placeholder="Ex: MODULE 1 — Comprendre son rôle de manager"
              />
            </div>
            <div>
              <Label>Objectif lié</Label>
              <Textarea
                value={moduleObjectives}
                onChange={(e) => setModuleObjectives(e.target.value)}
                rows={2}
                placeholder="Clarifier son rôle et ses responsabilités..."
              />
            </div>
            <div>
              <Label>Thème(s) abordé(s)</Label>
              <Textarea
                value={moduleThemes}
                onChange={(e) => setModuleThemes(e.target.value)}
                rows={3}
                placeholder="Identification des missions clés du manager..."
              />
            </div>
            <div>
              <Label>Exercices pratiques</Label>
              <Textarea
                value={moduleExercises}
                onChange={(e) => setModuleExercises(e.target.value)}
                rows={3}
                placeholder="Auto-diagnostic de positionnement managérial..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>
              <X className="h-4 w-4 mr-1" /> Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Save className="h-4 w-4 mr-1" /> Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
