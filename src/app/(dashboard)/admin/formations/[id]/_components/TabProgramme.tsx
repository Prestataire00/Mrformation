"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  FileText, Download, Trash2, Loader2, BookOpen, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { isPedagogieV2Epic2Enabled } from "@/lib/feature-flags";
import { copyProgramElearningToSession } from "@/lib/services/pedagogie-v2-snapshot";
import type { Session, Program, ProgramContent } from "@/lib/types";
import { getFormationKind } from "@/lib/utils/formation-companies";
import { GenerateProgramDialog } from "@/components/programs/GenerateProgramDialog";
import {
  createProgram,
  createProgramVersion,
  updateProgram,
  deleteProgram,
} from "@/lib/services/programs";
import { programContentSchema } from "@/lib/validations/program";
import type { GeneratedProgramContent } from "@/lib/services/openai";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

export function TabProgramme({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [showAssign, setShowAssign] = useState(false);
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [showGenerate, setShowGenerate] = useState(false);

  const program = formation.program;

  // Fetch available programs for assignment
  const fetchPrograms = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("entity_id")
      .eq("id", user.id)
      .single();
    if (!profile) return;
    const { data } = await supabase
      .from("programs")
      .select("id, title, description, is_active")
      .eq("entity_id", profile.entity_id)
      .eq("is_active", true)
      .order("title");
    setPrograms((data as Program[]) || []);
  }, [supabase]);

  useEffect(() => {
    if (!program) fetchPrograms();
  }, [program, fetchPrograms]);

  const handleToggleDpc = async (checked: boolean) => {
    try {
      const { error } = await supabase
        .from("sessions")
        .update({ is_dpc: checked })
        .eq("id", formation.id)
        .eq("entity_id", formation.entity_id);
      if (error) throw error;
      toast({ title: checked ? "DPC activé" : "DPC désactivé" });
      await onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible de modifier le DPC";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  const handleRemoveProgram = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("sessions")
        .update({ program_id: null })
        .eq("id", formation.id)
        .eq("entity_id", formation.entity_id);
      if (error) throw error;
      toast({ title: "Programme dissocié" });
      setConfirmRemove(false);
      await onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible de dissocier le programme";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleAssignProgram = async () => {
    if (!selectedProgramId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("sessions")
        .update({ program_id: selectedProgramId })
        .eq("id", formation.id)
        .eq("entity_id", formation.entity_id);
      if (error) throw error;

      // Pédagogie V2 Epic 2 : déclencher le snapshot des e-learning du
      // programme vers session_elearning_courses. Idempotent (no-op si la
      // session a déjà des e-learning attachés, ex: assignation antérieure
      // déjà fait le snapshot).
      let copiedCount = 0;
      if (isPedagogieV2Epic2Enabled()) {
        try {
          const result = await copyProgramElearningToSession(supabase, {
            sessionId: formation.id,
            programId: selectedProgramId,
          });
          copiedCount = result.copied;
        } catch (err) {
          // Non-bloquant : l'assignation du programme reste valide même
          // si le snapshot e-learning échoue.
          console.error("[pedagogie-v2] copyProgramElearningToSession failed:", err);
        }
      }

      toast({
        title: "Programme attribué",
        description: copiedCount > 0
          ? `${copiedCount} module(s) e-learning du programme attaché(s) à cette session.`
          : undefined,
      });
      setShowAssign(false);
      await onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible d'attribuer le programme";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Lot A1 — Accepter un programme généré par l'IA.
  //  - Aucun programme attribué → createProgram (entité de la formation)
  //    puis rattachement via sessions.program_id (même mécanisme que
  //    l'attribution manuelle existante).
  //  - Programme existant → createProgramVersion (snapshot) puis
  //    updateProgram(content) sur le programme attribué.
  // Refetch dans les deux cas. Lève en cas d'erreur (le dialog reste ouvert).
  const handleAcceptGenerated = async (ai: GeneratedProgramContent): Promise<void> => {
    const entityId = formation.entity_id;

    const content: ProgramContent = {
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
      // PATCH 5 — aligner le fallback durée du content sur celui de la colonne :
      // si l'IA omet la durée, on retombe sur la valeur du programme existant
      // (sinon le content perdrait l'ancienne valeur alors que la colonne la garde).
      duration_hours: ai.duration_hours ?? program?.duration_hours ?? program?.content?.duration_hours,
      duration_days: ai.duration_days ?? program?.content?.duration_days,
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

    // PATCH 1 — garde-fou de persistance : ne rien écrire en base si la
    // génération n'a pas produit de séquences exploitables (modules vide →
    // programContentSchema exige min 1). On arrête proprement avec un toast.
    const contentCheck = programContentSchema.safeParse(content);
    if (!contentCheck.success) {
      toast({
        title: "Génération inexploitable",
        description: "La génération n'a pas produit de séquences exploitables, réessayez.",
        variant: "destructive",
      });
      return;
    }

    try {
      if (program) {
        // Programme existant : nouvelle version + mise à jour du contenu.
        const versionResult = await createProgramVersion(
          supabase,
          program.id,
          entityId,
          program.version ?? 1,
          program.content ?? null,
        );
        if (!versionResult.ok) throw new Error(versionResult.error.message);

        const updateResult = await updateProgram(supabase, program.id, entityId, {
          description: ai.description || program.description,
          objectives: ai.objectives || program.objectives,
          content,
          duration_hours: ai.duration_hours ?? program.duration_hours,
        });
        if (!updateResult.ok) throw new Error(updateResult.error.message);
      } else {
        // Aucun programme : on en crée un puis on le rattache à la session.
        const createResult = await createProgram(supabase, entityId, {
          title: formation.title,
          description: ai.description || null,
          objectives: ai.objectives || null,
          content,
          price: null,
          tva_rate: null,
          duration_hours: ai.duration_hours ?? null,
          nsf_code: null,
          nsf_label: null,
          is_apprenticeship: false,
          bpf_objective: null,
          bpf_funding_type: null,
        });
        if (!createResult.ok) throw new Error(createResult.error.message);

        // PATCH 2 — atomicité create + rattachement : si la mise à jour de
        // sessions.program_id échoue, le programme tout juste créé resterait
        // orphelin (et un nouvel essai en recréerait un autre → duplication).
        // On nettoie donc en best-effort le programme créé avant de remonter
        // l'erreur, pour ne laisser aucun orphelin.
        try {
          const { error: attachError } = await supabase
            .from("sessions")
            .update({ program_id: createResult.program.id })
            .eq("id", formation.id)
            .eq("entity_id", entityId);
          if (attachError) throw attachError;
        } catch (attachErr) {
          // Cleanup best-effort : suppression du programme orphelin (catch
          // silencieux si le cleanup lui-même échoue — on remonte l'erreur
          // initiale du rattachement).
          try {
            await deleteProgram(supabase, createResult.program.id, entityId);
          } catch {
            // ignore : cleanup best-effort
          }
          throw attachErr;
        }
      }

      toast({
        title: "Programme enregistré",
        description: "Le programme généré a été enregistré (nouvelle version).",
      });
      await onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible d'enregistrer le programme";
      toast({ title: "Erreur", description: message, variant: "destructive" });
      throw err instanceof Error ? err : new Error(message);
    }
  };

  // Pré-remplissage du dialog : durée depuis la formation (override →
  // computed → planned), public cible si renseigné au niveau session ou
  // programme.
  const generateDefaults = {
    title: formation.title,
    durationHours:
      formation.override_hours ?? formation.computed_hours ?? formation.planned_hours ?? null,
    durationDays: program?.content?.duration_days ?? null,
    targetAudience:
      formation.target_audience ?? program?.content?.target_audience ?? null,
  };

  const handleDownloadPdf = async () => {
    if (!program) return;
    setSaving(true);
    try {
      const res = await fetch("/api/documents/generate-programme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: formation.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);

      const bytes = atob(data.pdfBase64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `programme-${(program.title || "formation")
        .toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 60)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "Programme exporté", description: "PDF téléchargé." });
    } catch (err) {
      toast({
        title: "Export échoué",
        description: err instanceof Error ? err.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {getFormationKind(formation) === "inter" && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <strong>Programme commun</strong> — Le programme pédagogique est commun à toutes les entreprises de la formation.
        </div>
      )}

      <h2 className="text-xl font-bold">{formation.title}</h2>

      {program ? (
        <>
          {/* Programme attribué */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                <span className="font-semibold">PROGRAMME ATTRIBUÉ À CETTE FORMATION:</span>
                <span className="font-bold">{program.title}</span>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  variant="default"
                  className="bg-teal-500 hover:bg-teal-600 text-white"
                  onClick={() => router.push(`/admin/programs/${program.id}`)}
                >
                  <FileText className="h-4 w-4 mr-2" /> Voir le programme
                </Button>
                <Button
                  variant="default"
                  className="bg-teal-500 hover:bg-teal-600 text-white"
                  onClick={handleDownloadPdf}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                  {saving ? "Génération…" : "Télécharger le programme en pdf"}
                </Button>
                <Button
                  variant="outline"
                  className="border-purple-300 text-purple-700 hover:bg-purple-50"
                  onClick={() => setShowGenerate(true)}
                >
                  <Sparkles className="h-4 w-4 mr-2" /> Générer le programme (IA)
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setConfirmRemove(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Supprimer le programme de la formation
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* DPC Toggle */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Label className="text-base font-bold">DPC?</Label>
                <Switch
                  checked={formation.is_dpc || false}
                  onCheckedChange={handleToggleDpc}
                />
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        /* Aucun programme */
        <Card>
          <CardContent className="pt-6 space-y-4">
            <p className="text-muted-foreground">
              Aucun programme attribué à cette formation.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setShowAssign(true)}>
                <BookOpen className="h-4 w-4 mr-2" /> Attribuer un programme
              </Button>
              <Button
                variant="outline"
                className="border-purple-300 text-purple-700 hover:bg-purple-50"
                onClick={() => setShowGenerate(true)}
              >
                <Sparkles className="h-4 w-4 mr-2" /> Générer le programme (IA)
              </Button>
            </div>

            {/* DPC Toggle même sans programme */}
            <div className="flex items-center gap-3 pt-4 border-t">
              <Label className="text-base font-bold">DPC?</Label>
              <Switch
                checked={formation.is_dpc || false}
                onCheckedChange={handleToggleDpc}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog confirmation suppression */}
      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Dissocier le programme ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Le programme ne sera plus lié à cette formation. Le programme lui-même ne sera pas supprimé.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleRemoveProgram} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Dissocier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog attribution programme */}
      <Dialog open={showAssign} onOpenChange={setShowAssign}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Attribuer un programme</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Programme</Label>
            <Select value={selectedProgramId} onValueChange={setSelectedProgramId}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un programme..." />
              </SelectTrigger>
              <SelectContent>
                {programs.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssign(false)}>Annuler</Button>
            <Button onClick={handleAssignProgram} disabled={saving || !selectedProgramId}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Attribuer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog génération IA (Lot A1) */}
      <GenerateProgramDialog
        open={showGenerate}
        onOpenChange={setShowGenerate}
        defaultTitle={generateDefaults.title}
        defaultDurationHours={generateDefaults.durationHours}
        defaultDurationDays={generateDefaults.durationDays}
        defaultTargetAudience={generateDefaults.targetAudience}
        onAccept={handleAcceptGenerated}
      />
    </div>
  );
}
