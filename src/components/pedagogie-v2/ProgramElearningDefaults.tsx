"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  listProgramElearningDefaults,
  addProgramElearningDefault,
  removeProgramElearningDefault,
  updateProgramElearningDefault,
  type ProgramElearningDefault,
} from "@/lib/services/program-elearning-defaults";

/**
 * Pédagogie V2 Epic 3 — Section "E-learning par défaut" sur la fiche programme.
 *
 * Permet à l'admin de :
 * - Lister les e-learning attachés au programme (defaults qui seront copiés
 *   vers chaque nouvelle session créée à partir de ce programme)
 * - Ajouter un e-learning depuis la liste des elearning_courses de l'entité
 * - Retirer un e-learning des defaults
 * - Configurer par e-learning : obligatoire avant présentiel, ordre libre/imposé
 *
 * Spec : bmad_output/planning-artifacts/spec-restructuration-pedagogique-2026-06-04.md
 * Pré-requis : flag NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_3 ON.
 */

interface ProgramElearningDefaultsProps {
  programId: string;
  entityId: string;
}

interface AvailableElearning {
  id: string;
  title: string;
}

export default function ProgramElearningDefaults({ programId, entityId }: ProgramElearningDefaultsProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [defaults, setDefaults] = useState<ProgramElearningDefault[]>([]);
  const [available, setAvailable] = useState<AvailableElearning[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [defaultsList, { data: allElearning }] = await Promise.all([
        listProgramElearningDefaults(supabase, programId),
        supabase
          .from("elearning_courses")
          .select("id, title")
          .eq("entity_id", entityId)
          .order("title", { ascending: true }),
      ]);
      setDefaults(defaultsList);
      setAvailable((allElearning ?? []) as AvailableElearning[]);
    } catch (err) {
      console.error("[ProgramElearningDefaults] refresh error", err);
      toast({
        title: "Erreur",
        description: "Impossible de charger les e-learning.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [programId, entityId, supabase, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const attachedIds = new Set(defaults.map((d) => d.elearning_course_id));
  const availableToAdd = available.filter((e) => !attachedIds.has(e.id));

  const handleAdd = async (elearningCourseId: string) => {
    setAddingId(elearningCourseId);
    try {
      const result = await addProgramElearningDefault(supabase, {
        programId,
        elearningCourseId,
      });
      if (!result.ok) {
        throw new Error(result.error ?? "Erreur d'ajout");
      }
      toast({ title: "E-learning attaché", description: "Le module sera proposé sur les futures sessions." });
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setAddingId(null);
    }
  };

  const handleRemove = async (elearningCourseId: string) => {
    if (!confirm("Retirer ce module des defaults ? Les sessions existantes ne sont pas affectées.")) {
      return;
    }
    setRemovingId(elearningCourseId);
    try {
      const result = await removeProgramElearningDefault(supabase, {
        programId,
        elearningCourseId,
      });
      if (!result.ok) {
        throw new Error(result.error ?? "Erreur de suppression");
      }
      toast({ title: "E-learning retiré", description: "Le module ne sera plus proposé sur les nouvelles sessions." });
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setRemovingId(null);
    }
  };

  const handleTogglePolicy = async (
    elearningCourseId: string,
    field: "isMandatoryBeforeSession" | "allowFreeProgress",
    value: boolean,
  ) => {
    try {
      const result = await updateProgramElearningDefault(supabase, {
        programId,
        elearningCourseId,
        [field]: value,
      });
      if (!result.ok) throw new Error(result.error ?? "Erreur");
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const titleById = new Map(available.map((e) => [e.id, e.title]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>E-learning par défaut</CardTitle>
        <p className="text-sm text-muted-foreground">
          Modules e-learning qui seront automatiquement copiés sur chaque nouvelle session créée à partir
          de ce programme. Les sessions existantes ne sont pas affectées par les modifications ici.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : defaults.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Aucun e-learning attaché à ce programme.</p>
        ) : (
          <ul className="space-y-3">
            {defaults.map((d) => (
              <li key={d.id} className="flex flex-col gap-2 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{titleById.get(d.elearning_course_id) ?? d.elearning_course_id}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemove(d.elearning_course_id)}
                    disabled={removingId === d.elearning_course_id}
                  >
                    {removingId === d.elearning_course_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-destructive" />
                    )}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={d.is_mandatory_before_session_default}
                      onCheckedChange={(v) =>
                        handleTogglePolicy(d.elearning_course_id, "isMandatoryBeforeSession", v)
                      }
                      id={`mandatory-${d.id}`}
                    />
                    <Label htmlFor={`mandatory-${d.id}`}>Obligatoire avant le présentiel</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={d.allow_free_progress_default}
                      onCheckedChange={(v) =>
                        handleTogglePolicy(d.elearning_course_id, "allowFreeProgress", v)
                      }
                      id={`free-${d.id}`}
                    />
                    <Label htmlFor={`free-${d.id}`}>Avancement libre (ordre non imposé)</Label>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {availableToAdd.length > 0 && (
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-2">Ajouter un e-learning :</p>
            <div className="flex flex-wrap gap-2">
              {availableToAdd.map((e) => (
                <Button
                  key={e.id}
                  size="sm"
                  variant="outline"
                  onClick={() => handleAdd(e.id)}
                  disabled={addingId === e.id}
                >
                  {addingId === e.id ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Plus className="h-3 w-3 mr-1" />
                  )}
                  {e.title}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
