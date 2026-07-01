"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Loader2,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import {
  packMetaSchema,
  packStepsSchema,
  TRIGGER_TYPES,
  RECIPIENT_TYPES,
  type PackStepInput,
} from "@/lib/validations/automation-pack";
import type { ConventionDocType } from "@/lib/types";
import type { z } from "zod";

// Type du formulaire = type input Zod (champs optionnels/default tolérés)
type PackMetaFormValues = z.input<typeof packMetaSchema>;

// ──────────────────────────────────────────────
// Constantes / libellés
// ──────────────────────────────────────────────

const TRIGGER_LABELS: Record<(typeof TRIGGER_TYPES)[number], string> = {
  session_start_minus_days: "J-x avant le début",
  session_end_plus_days: "J+x après la fin",
  on_session_creation: "À la création",
  on_session_completion: "À la clôture",
  on_enrollment: "À l'inscription",
  on_signature_complete: "Signatures complètes",
  opco_deposit_reminder: "Rappel dépôt OPCO",
  invoice_overdue: "Facture en retard",
  questionnaire_reminder: "Rappel questionnaire",
  certificate_ready: "Certificat prêt",
};

/** Triggers dont l'affichage de `days_offset` n'a pas de sens */
const DATE_BASED_TRIGGERS = new Set<(typeof TRIGGER_TYPES)[number]>([
  "session_start_minus_days",
  "session_end_plus_days",
  "opco_deposit_reminder",
  "invoice_overdue",
]);

const RECIPIENT_LABELS: Record<(typeof RECIPIENT_TYPES)[number], string> = {
  learners: "Apprenants",
  trainers: "Formateurs",
  companies: "Entreprises",
  all: "Tous (apprenants + formateurs)",
};

const COLOR_OPTIONS = [
  { value: "blue", label: "Bleu" },
  { value: "green", label: "Vert" },
  { value: "purple", label: "Violet" },
  { value: "amber", label: "Ambre" },
  { value: "red", label: "Rouge" },
  { value: "gray", label: "Gris" },
];

/**
 * Liste des types de documents les plus courants dans l'application.
 * Source : type ConventionDocType de src/lib/types/index.ts.
 */
const DOCUMENT_TYPE_OPTIONS: { value: ConventionDocType; label: string }[] = [
  { value: "convocation", label: "Convocation" },
  { value: "certificat_realisation", label: "Certificat de réalisation" },
  { value: "attestation_assiduite", label: "Attestation d'assiduité" },
  { value: "feuille_emargement", label: "Feuille d'émargement" },
  { value: "convention_entreprise", label: "Convention entreprise" },
  { value: "convention_intervention", label: "Convention d'intervention" },
  { value: "contrat_sous_traitance", label: "Contrat de sous-traitance" },
  { value: "programme_formation", label: "Programme de formation" },
  { value: "planning_semaine", label: "Planning semaine" },
  { value: "reglement_interieur", label: "Règlement intérieur" },
  { value: "cgv", label: "CGV" },
  { value: "politique_confidentialite", label: "Politique de confidentialité" },
  { value: "feuille_emargement_collectif", label: "Émargement collectif" },
  { value: "attestation_aipr", label: "Attestation AIPR" },
  { value: "attestation_competences", label: "Attestation de compétences" },
  { value: "attestation_abandon_formation", label: "Attestation d'abandon" },
  { value: "certificat_travail_hauteur", label: "Certificat travail en hauteur" },
  { value: "certificat_diplome", label: "Certificat / Diplôme" },
  { value: "autorisation_image", label: "Autorisation droit à l'image" },
  { value: "decharge_responsabilite", label: "Décharge de responsabilité" },
  { value: "lettre_decharge_responsabilite", label: "Lettre de décharge" },
  { value: "charte_formateur", label: "Charte formateur" },
  { value: "contrat_engagement_stagiaire", label: "Contrat d'engagement stagiaire" },
  { value: "bilan_poe", label: "Bilan POE" },
  { value: "reponses_evaluations", label: "Réponses évaluations" },
  { value: "reponses_satisfaction_session", label: "Réponses satisfaction session" },
  { value: "resultats_evaluations", label: "Résultats évaluations" },
  { value: "avis_hab_elec_generique", label: "Avis habilitation élec. générique" },
  { value: "avis_hab_elec_b0_bf_bs", label: "Avis hab. élec. B0/BF/BS" },
  { value: "avis_hab_elec_b1v_b2v_br", label: "Avis hab. élec. B1V/B2V/BR" },
  { value: "avis_hab_elec_bf_hf", label: "Avis hab. élec. BF/HF" },
  { value: "avis_hab_elec_bt_ht", label: "Avis hab. élec. BT/HT" },
  { value: "avis_hab_elec_bt", label: "Avis hab. élec. BT" },
  { value: "avis_hab_elec_h0_b0", label: "Avis hab. élec. H0/B0" },
  { value: "avis_hab_elec_h0_b0_bf_hf_bs", label: "Avis hab. élec. H0/B0/BF/HF/BS" },
  { value: "avis_hab_elec_h0_b0_initial", label: "Avis hab. élec. H0/B0 initial" },
  { value: "custom", label: "Personnalisé" },
];

const DEFAULT_NEW_STEP: PackStepInput = {
  trigger_type: "session_start_minus_days",
  days_offset: 5,
  recipient_type: "learners",
  document_type: "convocation",
  template_id: null,
  condition_subcontracted: null,
  send_email: true,
  name: null,
  description: null,
};

// ──────────────────────────────────────────────
// Composant sous-bloc : une étape de la timeline
// ──────────────────────────────────────────────

interface StepRowProps {
  step: PackStepInput;
  index: number;
  total: number;
  onChange: (index: number, updated: PackStepInput) => void;
  onRemove: (index: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}

function StepRow({
  step,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: StepRowProps) {
  const isDateBased = DATE_BASED_TRIGGERS.has(
    step.trigger_type as (typeof TRIGGER_TYPES)[number],
  );

  function update(field: keyof PackStepInput, value: PackStepInput[keyof PackStepInput]) {
    onChange(index, { ...step, [field]: value });
  }

  const condSubValue =
    step.condition_subcontracted === null
      ? "__any"
      : step.condition_subcontracted
        ? "true"
        : "false";

  return (
    <Card className="border border-border">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Étape {index + 1}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={index === 0}
              onClick={() => onMoveUp(index)}
              title="Monter"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={index === total - 1}
              onClick={() => onMoveDown(index)}
              title="Descendre"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => onRemove(index)}
              title="Supprimer cette étape"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Trigger */}
          <div className="space-y-1.5">
            <Label>Déclencheur</Label>
            <Select
              value={step.trigger_type}
              onValueChange={(v) =>
                update("trigger_type", v as (typeof TRIGGER_TYPES)[number])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TRIGGER_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Décalage jours (masqué si trigger événementiel) */}
          {isDateBased && (
            <div className="space-y-1.5">
              <Label>Décalage (jours)</Label>
              <Input
                type="number"
                min={0}
                value={step.days_offset ?? 0}
                onChange={(e) =>
                  update("days_offset", Math.max(0, parseInt(e.target.value, 10) || 0))
                }
              />
            </div>
          )}

          {/* Destinataires */}
          <div className="space-y-1.5">
            <Label>Destinataires</Label>
            <Select
              value={step.recipient_type ?? "__none"}
              onValueChange={(v) =>
                update(
                  "recipient_type",
                  v === "__none" ? null : (v as (typeof RECIPIENT_TYPES)[number]),
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Non défini —</SelectItem>
                {RECIPIENT_TYPES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {RECIPIENT_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Type de document */}
          <div className="space-y-1.5">
            <Label>Type de document</Label>
            <Select
              value={step.document_type ?? "__none"}
              onValueChange={(v) =>
                update("document_type", v === "__none" ? null : v)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Non défini —</SelectItem>
                {DOCUMENT_TYPE_OPTIONS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filtre sous-traitance */}
          <div className="space-y-1.5">
            <Label>Filtre sous-traitance</Label>
            <Select
              value={condSubValue}
              onValueChange={(v) =>
                update(
                  "condition_subcontracted",
                  v === "__any" ? null : v === "true",
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__any">Toutes les sessions</SelectItem>
                <SelectItem value="true">Sous-traitées uniquement</SelectItem>
                <SelectItem value="false">Non sous-traitées uniquement</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Nom / Description de l'étape */}
        <div className="space-y-1.5">
          <Label>Nom de l&apos;étape (optionnel)</Label>
          <Input
            value={step.name ?? ""}
            onChange={(e) => update("name", e.target.value || null)}
            placeholder="Ex. : Envoi convocation J-7"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Description (optionnel)</Label>
          <Textarea
            rows={2}
            value={step.description ?? ""}
            onChange={(e) => update("description", e.target.value || null)}
            placeholder="Détails sur cette étape…"
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────
// Page principale
// ──────────────────────────────────────────────

interface RemotePack {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  is_default: boolean;
}

interface RemoteStep {
  id: string;
  pack_id: string;
  order_index: number;
  trigger_type: string;
  days_offset: number | null;
  recipient_type: string | null;
  document_type: string | null;
  template_id: string | null;
  condition_subcontracted: boolean | null;
  send_email: boolean;
  name: string | null;
  description: string | null;
}

export default function PackEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const packId = typeof params.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [steps, setSteps] = useState<PackStepInput[]>([]);

  const metaForm = useForm<PackMetaFormValues>({
    resolver: zodResolver(packMetaSchema),
    defaultValues: {
      name: "",
      description: null,
      icon: null,
      color: null,
      is_default: false,
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = metaForm;

  const isDefault = watch("is_default");
  const currentColor = watch("color");

  // Chargement initial
  const fetchPack = useCallback(async () => {
    if (!packId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/automation-packs/${packId}`);
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Erreur de chargement");
      }
      const json = (await res.json()) as { pack: RemotePack; steps: RemoteStep[] };
      const { pack, steps: remoteSteps } = json;

      setValue("name", pack.name);
      setValue("description", pack.description ?? null);
      setValue("icon", pack.icon ?? null);
      setValue("color", pack.color ?? null);
      setValue("is_default", pack.is_default ?? false);

      const mapped: PackStepInput[] = (remoteSteps ?? []).map((s) => ({
        trigger_type: s.trigger_type as (typeof TRIGGER_TYPES)[number],
        days_offset: s.days_offset ?? 0,
        recipient_type:
          (s.recipient_type as (typeof RECIPIENT_TYPES)[number] | null) ?? null,
        document_type: s.document_type ?? null,
        template_id: s.template_id ?? null,
        condition_subcontracted: s.condition_subcontracted ?? null,
        send_email: s.send_email ?? true,
        name: s.name ?? null,
        description: s.description ?? null,
      }));
      setSteps(mapped);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [packId, setValue, toast]);

  useEffect(() => {
    void fetchPack();
  }, [fetchPack]);

  // ── Handlers étapes ──────────────────────────

  function handleStepChange(index: number, updated: PackStepInput) {
    setSteps((prev) => prev.map((s, i) => (i === index ? updated : s)));
  }

  function handleStepRemove(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  function handleMoveUp(index: number) {
    if (index === 0) return;
    setSteps((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  function handleMoveDown(index: number) {
    setSteps((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }

  function handleAddStep() {
    setSteps((prev) => [...prev, { ...DEFAULT_NEW_STEP }]);
  }

  // ── Sauvegarde ───────────────────────────────

  const onSubmit = handleSubmit(async (metaData) => {
    // Validation côté client des étapes
    const stepsValidation = packStepsSchema.safeParse(steps);
    if (!stepsValidation.success) {
      const message = stepsValidation.error.issues[0]?.message ?? "Étapes invalides";
      toast({ title: "Étapes invalides", description: message, variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      // 1. Sauvegarde des métadonnées
      const metaRes = await fetch(`/api/automation-packs/${packId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metaData),
      });
      if (!metaRes.ok) {
        const json = (await metaRes.json()) as { error?: string };
        throw new Error(json.error ?? "Erreur lors de la mise à jour des métadonnées");
      }

      // 2. Remplacement des étapes
      const stepsRes = await fetch(`/api/automation-packs/${packId}/steps`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: stepsValidation.data }),
      });
      if (!stepsRes.ok) {
        const json = (await stepsRes.json()) as { error?: string };
        throw new Error(json.error ?? "Erreur lors de la sauvegarde des étapes");
      }

      toast({ title: "Pack enregistré", description: "Les modifications ont été sauvegardées." });
      router.push("/admin/automation");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  });

  // ── Rendu ────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-8">
      {/* En-tête */}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => router.push("/admin/automation")}
          title="Retour à la liste"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">Éditer le pack d&apos;automatisation</h1>
      </div>

      <form onSubmit={onSubmit} className="space-y-8">
        {/* ── Bloc métadonnées ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Métadonnées du pack</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Nom */}
            <div className="space-y-1.5">
              <Label htmlFor="pack-name">
                Nom <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pack-name"
                {...register("name")}
                placeholder="Ex. : Pack Qualiopi standard"
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="pack-description">Description</Label>
              <Textarea
                id="pack-description"
                rows={3}
                {...register("description")}
                placeholder="Décrivez l'objectif de ce pack…"
              />
              {errors.description && (
                <p className="text-sm text-destructive">{errors.description.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Icône */}
              <div className="space-y-1.5">
                <Label htmlFor="pack-icon">Icône (emoji)</Label>
                <Input
                  id="pack-icon"
                  {...register("icon")}
                  placeholder="📋"
                  className="text-center text-lg"
                  maxLength={16}
                />
                {errors.icon && (
                  <p className="text-sm text-destructive">{errors.icon.message}</p>
                )}
              </div>

              {/* Couleur */}
              <div className="space-y-1.5">
                <Label>Couleur</Label>
                <Select
                  value={currentColor ?? "__none"}
                  onValueChange={(v) =>
                    setValue("color", v === "__none" ? null : v, { shouldValidate: true })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Aucune —</SelectItem>
                    {COLOR_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.color && (
                  <p className="text-sm text-destructive">{errors.color.message}</p>
                )}
              </div>

              {/* Pack par défaut */}
              <div className="space-y-1.5">
                <Label>Pack par défaut</Label>
                <div className="flex items-center gap-2 pt-2">
                  <Switch
                    id="pack-default"
                    checked={isDefault ?? false}
                    onCheckedChange={(checked) =>
                      setValue("is_default", checked, { shouldValidate: true })
                    }
                  />
                  <Label htmlFor="pack-default" className="font-normal cursor-pointer">
                    {isDefault ? "Oui" : "Non"}
                  </Label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Timeline d'étapes ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">
              Timeline d&apos;étapes
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({steps.length} étape{steps.length !== 1 ? "s" : ""})
              </span>
            </h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddStep}
            >
              <Plus className="h-4 w-4 mr-1" />
              Ajouter une étape
            </Button>
          </div>

          {steps.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-muted-foreground">
                <p className="text-sm">Aucune étape pour l&apos;instant.</p>
                <p className="text-sm mt-1">
                  Cliquez sur « Ajouter une étape » pour commencer à construire votre
                  timeline.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4"
                  onClick={handleAddStep}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Ajouter une étape
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {steps.map((step, index) => (
                <StepRow
                  key={index}
                  step={step}
                  index={index}
                  total={steps.length}
                  onChange={handleStepChange}
                  onRemove={handleStepRemove}
                  onMoveUp={handleMoveUp}
                  onMoveDown={handleMoveDown}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Actions bas de page ── */}
        <div className="flex items-center justify-between border-t pt-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/admin/automation")}
            disabled={saving}
          >
            Annuler
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enregistrement…
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Enregistrer
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
