"use client";

/**
 * Lot A1 — Générateur de programme interne (IA + relecture).
 *
 * Dialog ouvert depuis l'onglet Programme d'une formation. Pré-remplit
 * titre + durée depuis la session, offre un champ libre « précisions »,
 * appelle la génération IA (`POST /api/ai/generate-program` en mode
 * `structured`), affiche le résultat via `ProgramContentPreview` pour
 * relecture (régénérer), puis remonte le contenu accepté au parent via
 * `onAccept` (qui se charge de l'enregistrement versionné).
 *
 * Aucune écriture Supabase ici : la persistance (createProgram /
 * createProgramVersion + updateProgram) est faite côté TabProgramme.
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Sparkles, RefreshCw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { ProgramContentPreview } from "@/components/programs/ProgramContentPreview";
import {
  generateProgramFormSchema,
  type GenerateProgramFormInput,
} from "@/lib/validations/program";
import type { GeneratedProgramContent } from "@/lib/services/openai";
import type { ProgramContent } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pré-remplissage depuis la formation. */
  defaultTitle: string;
  defaultDurationHours: number | null;
  defaultDurationDays?: number | null;
  defaultTargetAudience?: string | null;
  /** Appelé quand l'admin valide l'aperçu. Le parent persiste le contenu. */
  onAccept: (generated: GeneratedProgramContent) => Promise<void>;
}

/**
 * Mappe la sortie IA vers la forme `ProgramContent` (pour l'aperçu).
 * Tous les champs enrichis sont additifs et optionnels.
 */
function toProgramContent(ai: GeneratedProgramContent): ProgramContent {
  return {
    modules: ai.modules?.map((m) => ({
      id: m.id,
      title: m.title,
      duration_hours: m.duration_hours,
      topics: m.topics,
      summary_objective: m.summary_objective,
      operational_objectives: m.operational_objectives,
      content_details: m.content_details,
      methods: m.methods,
      evaluation: m.evaluation,
    })),
    duration_hours: ai.duration_hours,
    duration_days: ai.duration_days,
    location: ai.location,
    target_audience: ai.target_audience,
    prerequisites: ai.prerequisites,
    team_description: ai.team_description,
    evaluation_methods: ai.evaluation_methods,
    pedagogical_resources: ai.pedagogical_resources,
    certification_results: ai.certification_results,
    general_objectives: ai.general_objectives,
    access_terms: ai.access_terms,
  };
}

export function GenerateProgramDialog({
  open,
  onOpenChange,
  defaultTitle,
  defaultDurationHours,
  defaultDurationDays,
  defaultTargetAudience,
  onAccept,
}: Props) {
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [generated, setGenerated] = useState<GeneratedProgramContent | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<GenerateProgramFormInput>({
    resolver: zodResolver(generateProgramFormSchema) as never,
    values: {
      title: defaultTitle,
      duration_hours:
        defaultDurationHours != null ? String(defaultDurationHours) : "",
      duration_days:
        defaultDurationDays != null ? String(defaultDurationDays) : "",
      precisions: "",
    },
  });

  async function runGeneration(values: GenerateProgramFormInput): Promise<void> {
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-program", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          structured: true,
          title: values.title,
          duration_hours: values.duration_hours
            ? Number(values.duration_hours)
            : undefined,
          duration_days: values.duration_days
            ? Number(values.duration_days)
            : undefined,
          target_audience: defaultTargetAudience || undefined,
          precisions: values.precisions || undefined,
        }),
      });

      if (res.status === 429) {
        toast({
          title: "Trop de générations",
          description:
            "Limite de génération atteinte (12/min). Réessayez dans quelques instants.",
          variant: "destructive",
        });
        return;
      }

      const json = await res.json();
      if (!res.ok || json.error) {
        toast({
          title: "Erreur IA",
          description: json.error || "Impossible de générer le contenu.",
          variant: "destructive",
        });
        return;
      }

      setGenerated(json.data as GeneratedProgramContent);
    } catch {
      toast({
        title: "Erreur",
        description: "Erreur de connexion à l'IA.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }

  async function handleRegenerate(): Promise<void> {
    // Régénère avec les valeurs courantes du formulaire (validation légère).
    const parsed = generateProgramFormSchema.safeParse(getValues());
    if (!parsed.success) {
      toast({
        title: "Formulaire invalide",
        description: "Vérifiez le titre et la durée avant de régénérer.",
        variant: "destructive",
      });
      return;
    }
    await runGeneration(getValues());
  }

  async function handleAccept(): Promise<void> {
    if (!generated) return;
    setAccepting(true);
    try {
      await onAccept(generated);
      // Le parent gère le toast de succès + le refetch ; on ferme et reset.
      setGenerated(null);
      onOpenChange(false);
    } catch {
      // Le parent gère déjà son toast d'erreur ; on ne ferme pas pour
      // laisser l'admin réessayer depuis l'aperçu.
    } finally {
      setAccepting(false);
    }
  }

  function handleOpenChange(next: boolean): void {
    if (!next) {
      setGenerated(null);
    }
    onOpenChange(next);
  }

  const busy = generating || accepting;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            Générer le programme (IA)
          </DialogTitle>
          <DialogDescription>
            L&apos;IA propose un programme structuré à partir du titre et de la
            durée. Relisez, régénérez si besoin, puis acceptez pour
            l&apos;enregistrer (nouvelle version).
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(runGeneration)}
          className="space-y-4"
          id="generate-program-form"
        >
          <div className="space-y-1.5">
            <Label htmlFor="gp-title">Titre de la formation</Label>
            <Input id="gp-title" {...register("title")} disabled={busy} />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="gp-hours">Durée (heures)</Label>
              <Input
                id="gp-hours"
                type="number"
                step="0.5"
                min="0"
                {...register("duration_hours")}
                disabled={busy}
              />
              {errors.duration_hours && (
                <p className="text-xs text-destructive">
                  {errors.duration_hours.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gp-days">Durée (jours) — optionnel</Label>
              <Input
                id="gp-days"
                type="number"
                step="1"
                min="0"
                {...register("duration_days")}
                disabled={busy}
              />
              {errors.duration_days && (
                <p className="text-xs text-destructive">
                  {errors.duration_days.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gp-precisions">Précisions (optionnel)</Label>
            <Textarea
              id="gp-precisions"
              rows={3}
              placeholder="Ex. : formation DPC, public aides-soignants, atelier pratique sur cas réels…"
              {...register("precisions")}
              disabled={busy}
            />
            {errors.precisions && (
              <p className="text-xs text-destructive">
                {errors.precisions.message}
              </p>
            )}
          </div>

          {!generated && (
            <Button type="submit" disabled={busy} className="w-full">
              {generating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              {generating ? "Génération en cours…" : "Générer"}
            </Button>
          )}
        </form>

        {/* Aperçu pour relecture */}
        {generated && (
          <div className="space-y-3">
            <ProgramContentPreview
              program={{
                id: "preview",
                title: getValues("title") || defaultTitle,
                description: generated.description || null,
                objectives: generated.objectives || null,
                duration_hours: generated.duration_hours ?? null,
                content: toProgramContent(generated),
              }}
            />
          </div>
        )}

        {generated && (
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleRegenerate}
              disabled={busy}
            >
              {generating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Régénérer
            </Button>
            <Button type="button" onClick={handleAccept} disabled={busy}>
              {accepting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Accepter et enregistrer
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
