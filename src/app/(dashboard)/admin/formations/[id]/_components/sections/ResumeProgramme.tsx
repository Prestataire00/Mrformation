"use client";

/**
 * Card "Programme pédagogique" dans TabResume.
 *
 * 3 états :
 * A. Programme catalogue attribué → ProgramContentPreview + Exporter PDF
 * B. Infos pédagogiques saisies directement sur la session → affichage + Modifier
 * C. Rien → 2 boutons : "Choisir un programme" + "Saisir les infos directement"
 */

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Session } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { BookOpen, Download, Loader2, Pencil, PlusCircle } from "lucide-react";
import { ProgramContentPreview } from "@/components/programs/ProgramContentPreview";

interface Props {
  formation: Session;
  onRefresh?: () => Promise<void>;
}

interface InlineForm {
  pedagogical_objectives: string;
  pedagogical_content: string;
  target_audience: string;
  prerequisites: string;
  team_description: string;
  pedagogical_resources: string;
  evaluation_methods: string;
  access_modality: string;
  access_delay_days: number | null;
}

const FIELDS: { key: keyof InlineForm; label: string; type: "textarea" | "number" }[] = [
  { key: "pedagogical_objectives", label: "Objectifs pédagogiques", type: "textarea" },
  { key: "pedagogical_content", label: "Contenu pédagogique", type: "textarea" },
  { key: "target_audience", label: "Public visé", type: "textarea" },
  { key: "prerequisites", label: "Prérequis", type: "textarea" },
  { key: "team_description", label: "Équipe pédagogique", type: "textarea" },
  { key: "pedagogical_resources", label: "Ressources pédagogiques", type: "textarea" },
  { key: "evaluation_methods", label: "Méthodes d'évaluation", type: "textarea" },
  { key: "access_modality", label: "Modalités d'accès", type: "textarea" },
  { key: "access_delay_days", label: "Délai d'accès (jours)", type: "number" },
];

function formFromSession(f: Session): InlineForm {
  return {
    pedagogical_objectives: f.pedagogical_objectives ?? "",
    pedagogical_content: f.pedagogical_content ?? "",
    target_audience: f.target_audience ?? "",
    prerequisites: f.prerequisites ?? "",
    team_description: f.team_description ?? "",
    pedagogical_resources: f.pedagogical_resources ?? "",
    evaluation_methods: f.evaluation_methods ?? "",
    access_modality: f.access_modality ?? "",
    access_delay_days: f.access_delay_days ?? null,
  };
}

function hasInlineData(f: Session): boolean {
  return !f.program && !!(
    f.pedagogical_objectives || f.pedagogical_content ||
    f.target_audience || f.prerequisites ||
    f.team_description || f.pedagogical_resources ||
    f.evaluation_methods || f.access_modality ||
    f.access_delay_days != null
  );
}

export function ResumeProgramme({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<InlineForm>(formFromSession(formation));

  const program = formation.program;

  const handleExportPdf = async () => {
    if (!program) return;
    setExporting(true);
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
      a.download = `programme-${program.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}.pdf`;
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
      setExporting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("sessions")
        .update({
          pedagogical_objectives: form.pedagogical_objectives.trim() || null,
          pedagogical_content: form.pedagogical_content.trim() || null,
          target_audience: form.target_audience.trim() || null,
          prerequisites: form.prerequisites.trim() || null,
          team_description: form.team_description.trim() || null,
          pedagogical_resources: form.pedagogical_resources.trim() || null,
          evaluation_methods: form.evaluation_methods.trim() || null,
          access_modality: form.access_modality.trim() || null,
          access_delay_days: form.access_delay_days,
        })
        .eq("id", formation.id);

      if (error) throw new Error(error.message);
      toast({ title: "Infos pédagogiques enregistrées" });
      setEditOpen(false);
      await onRefresh?.();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Échec de l'enregistrement",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = () => {
    setForm(formFromSession(formation));
    setEditOpen(true);
  };

  // ── État A : programme catalogue attribué ──
  if (program) {
    return (
      <div className="space-y-3">
        <ProgramContentPreview program={program} />
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 w-full"
          onClick={handleExportPdf}
          disabled={exporting}
        >
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {exporting ? "Génération…" : "Exporter le programme (PDF)"}
        </Button>
      </div>
    );
  }

  // ── État B : infos pédagogiques saisies directement ──
  if (hasInlineData(formation)) {
    const displayFields = FIELDS.filter((f) => {
      if (f.type === "number") return formation.access_delay_days != null;
      return !!(formation[f.key as keyof Session] as string | null);
    });

    return (
      <div className="space-y-3">
        <div className="space-y-2.5 text-sm">
          {displayFields.map((field) => (
            <div key={field.key}>
              <h4 className="font-semibold text-xs uppercase text-gray-500 tracking-wider">{field.label}</h4>
              <p className="whitespace-pre-wrap text-gray-700 mt-0.5">
                {field.type === "number"
                  ? `${formation.access_delay_days} jours`
                  : (formation[field.key as keyof Session] as string)}
              </p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={openEdit}>
            <Pencil className="h-3.5 w-3.5" /> Modifier les infos
          </Button>
          <Button asChild size="sm" variant="ghost" className="gap-1.5 text-muted-foreground">
            <Link href="/admin/programs">
              <BookOpen className="h-3.5 w-3.5" /> Choisir un programme catalogue
            </Link>
          </Button>
        </div>

        {renderEditDialog()}
      </div>
    );
  }

  // ── État C : rien du tout ──
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Aucun programme pédagogique attribué à cette formation.
      </p>
      <div className="flex items-center gap-2">
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <Link href="/admin/programs">
            <BookOpen className="h-3.5 w-3.5" /> Choisir un programme
          </Link>
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={openEdit}>
          <PlusCircle className="h-3.5 w-3.5" /> Saisir les infos directement
        </Button>
      </div>

      {renderEditDialog()}
    </div>
  );

  function renderEditDialog() {
    return (
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Infos pédagogiques de cette formation</DialogTitle>
            <DialogDescription>
              Saisies sans rattacher de programme catalogue. Reprises automatiquement dans les documents générés (convention, programme PDF, attestation).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {FIELDS.map((field) => (
              <div key={field.key}>
                <label className="text-sm font-medium">{field.label}</label>
                {field.type === "number" ? (
                  <Input
                    type="number"
                    min={0}
                    value={form.access_delay_days ?? ""}
                    onChange={(e) => setForm({ ...form, access_delay_days: e.target.value ? parseInt(e.target.value, 10) : null })}
                    className="mt-1"
                  />
                ) : (
                  <Textarea
                    value={form[field.key] as string}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    rows={3}
                    className="mt-1"
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
}
