"use client";

/**
 * EL-5 audit BMAD — Dialog d'édition / suppression d'un chapitre.
 *
 * Avant : routes PATCH/DELETE `/api/elearning/[courseId]/chapters/[chapterId]`
 * existaient mais aucun bouton dans l'UI admin. L'admin ne pouvait pas
 * corriger un titre, une durée, des concepts clés ni supprimer un chapitre
 * sans passer par SQL.
 *
 * Champs éditables :
 *  - title (required)
 *  - summary (résumé court)
 *  - key_concepts (un par ligne)
 *  - estimated_duration_minutes (1-10000)
 *
 * Bouton "Supprimer" avec confirm inline (pattern aligné autres lots).
 */

import { useEffect, useState } from "react";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Save, Trash2 } from "lucide-react";

interface ChapterPatch {
  title?: string;
  summary?: string | null;
  key_concepts?: string[];
  estimated_duration_minutes?: number;
}

export interface ChapterEditable {
  id: string;
  title: string;
  summary: string | null;
  key_concepts: string[] | null;
  estimated_duration_minutes: number;
}

interface Props {
  courseId: string;
  chapter: ChapterEditable | null;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

const chapterEditSchema = z.object({
  title: z.string().min(1, "Le titre est requis").max(255),
  summary: z.string().max(2000).optional(),
  key_concepts_text: z.string().max(5000).optional(),
  estimated_duration_minutes: z.preprocess(
    (v) => {
      if (v === "" || v === null || v === undefined) return NaN;
      const n = typeof v === "string" ? parseInt(v, 10) : v;
      return Number.isFinite(n as number) ? n : NaN;
    },
    z.number().min(1, "Durée minimale 1 min").max(10_000, "Durée maximale 10 000 min"),
  ),
});

type FormErrors = Partial<Record<"title" | "summary" | "key_concepts_text" | "estimated_duration_minutes", string>>;

export function ChapterEditDialog({ courseId, chapter, onClose, onRefresh }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const [form, setForm] = useState({
    title: "",
    summary: "",
    key_concepts_text: "",
    estimated_duration_minutes: "",
  });

  useEffect(() => {
    if (!chapter) return;
    setForm({
      title: chapter.title,
      summary: chapter.summary ?? "",
      key_concepts_text: (chapter.key_concepts ?? []).join("\n"),
      estimated_duration_minutes: String(chapter.estimated_duration_minutes ?? 0),
    });
    setErrors({});
    setConfirmDelete(false);
  }, [chapter]);

  if (!chapter) return null;

  const handleSave = async () => {
    const parsed = chapterEditSchema.safeParse(form);
    if (!parsed.success) {
      const map: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormErrors;
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
    setSaving(true);
    try {
      const data = parsed.data;
      const keyConcepts = (data.key_concepts_text ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const patch: ChapterPatch = {
        title: data.title.trim(),
        summary: data.summary?.trim() || null,
        key_concepts: keyConcepts,
        estimated_duration_minutes: data.estimated_duration_minutes,
      };
      const res = await fetch(`/api/elearning/${courseId}/chapters/${chapter.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.error) {
        throw new Error(body.error || `Erreur ${res.status}`);
      }
      toast({ title: "Chapitre mis à jour" });
      await onRefresh();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur réseau";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/elearning/${courseId}/chapters/${chapter.id}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.error) {
        throw new Error(body.error || `Erreur ${res.status}`);
      }
      toast({ title: "Chapitre supprimé" });
      await onRefresh();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur réseau";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <Dialog open={chapter !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier le chapitre</DialogTitle>
          <DialogDescription>
            Les modifications du titre, résumé et concepts clés se répercutent dans le programme PDF et la vue apprenant.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>
              Titre <span className="text-red-500">*</span>
            </Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              className={errors.title ? "border-red-400" : ""}
            />
            {errors.title && <p className="text-xs text-red-600">{errors.title}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Résumé</Label>
            <Textarea
              value={form.summary}
              onChange={(e) => setForm((p) => ({ ...p, summary: e.target.value }))}
              rows={3}
              placeholder="Résumé court du chapitre (affiché en intro côté apprenant)"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Concepts clés</Label>
            <Textarea
              value={form.key_concepts_text}
              onChange={(e) => setForm((p) => ({ ...p, key_concepts_text: e.target.value }))}
              rows={4}
              placeholder="Un concept par ligne"
            />
            <p className="text-[11px] text-gray-400">
              Un par ligne — affichés en bullets dans l&apos;aperçu apprenant et le programme PDF.
            </p>
          </div>

          <div className="space-y-1.5 max-w-xs">
            <Label>Durée estimée (minutes)</Label>
            <Input
              type="number"
              min={1}
              value={form.estimated_duration_minutes}
              onChange={(e) => setForm((p) => ({ ...p, estimated_duration_minutes: e.target.value }))}
              className={errors.estimated_duration_minutes ? "border-red-400" : ""}
            />
            {errors.estimated_duration_minutes && (
              <p className="text-xs text-red-600">{errors.estimated_duration_minutes}</p>
            )}
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

        {confirmDelete && (
          <div className="mt-2 border border-red-200 bg-red-50 rounded-md p-3 space-y-2">
            <p className="text-sm text-red-800">
              Confirmer la suppression de ce chapitre ? Cette action est irréversible :
              les quiz, flashcards et progression apprenants associés seront supprimés en cascade.
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
