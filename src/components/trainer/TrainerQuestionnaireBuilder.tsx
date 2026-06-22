"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, Loader2, GripVertical } from "lucide-react";

export type BuilderQuestionType = "rating" | "text" | "multiple_choice" | "yes_no";

export interface BuilderQuestion {
  text: string;
  type: BuilderQuestionType;
  options: string[];
  is_required: boolean;
}

export interface BuilderInitial {
  title: string;
  description: string;
  type: string;
  questions: BuilderQuestion[];
}

const QUESTION_TYPE_LABELS: Record<BuilderQuestionType, string> = {
  rating: "Note (1-5)",
  text: "Texte libre",
  multiple_choice: "Choix multiple",
  yes_no: "Oui / Non",
};

export function TrainerQuestionnaireBuilder({
  questionnaireId,
  initial,
}: {
  questionnaireId?: string;
  initial?: BuilderInitial;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [type, setType] = useState(initial?.type ?? "evaluation");
  const [questions, setQuestions] = useState<BuilderQuestion[]>(initial?.questions ?? []);
  const [saving, setSaving] = useState(false);

  const addQuestion = () =>
    setQuestions((p) => [...p, { text: "", type: "rating", options: [], is_required: true }]);
  const removeQuestion = (i: number) => setQuestions((p) => p.filter((_, idx) => idx !== i));
  const updateQuestion = (i: number, patch: Partial<BuilderQuestion>) =>
    setQuestions((p) => p.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "Titre requis", variant: "destructive" });
      return;
    }
    if (questions.some((q) => !q.text.trim())) {
      toast({ title: "Chaque question doit avoir un libellé", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const url = questionnaireId
        ? `/api/trainer/questionnaires/${questionnaireId}`
        : "/api/trainer/questionnaires";
      const res = await fetch(url, {
        method: questionnaireId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, type, questions }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      toast({ title: questionnaireId ? "Questionnaire mis à jour" : "Questionnaire créé" });
      router.push("/trainer/questionnaires");
      router.refresh();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Enregistrement impossible.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="space-y-3">
        <div>
          <Label htmlFor="q-title">Titre</Label>
          <Input id="q-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex : Évaluation des acquis" />
        </div>
        <div>
          <Label htmlFor="q-desc">Description (optionnel)</Label>
          <Textarea id="q-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <Label>Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="evaluation">Évaluation</SelectItem>
              <SelectItem value="satisfaction">Satisfaction</SelectItem>
              <SelectItem value="survey">Enquête</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Questions ({questions.length})</h3>
          <Button size="sm" variant="outline" onClick={addQuestion} className="gap-1.5">
            <Plus className="h-4 w-4" /> Ajouter
          </Button>
        </div>

        {questions.length === 0 && (
          <p className="text-sm text-muted-foreground italic">Aucune question. Cliquez « Ajouter ».</p>
        )}

        {questions.map((q, i) => (
          <div key={i} className="border rounded-lg p-3 space-y-2 bg-muted/30">
            <div className="flex items-start gap-2">
              <GripVertical className="h-4 w-4 text-muted-foreground mt-2.5 shrink-0" />
              <Input
                value={q.text}
                onChange={(e) => updateQuestion(i, { text: e.target.value })}
                placeholder={`Question ${i + 1}`}
                className="flex-1"
              />
              <Button size="sm" variant="ghost" className="text-red-600" onClick={() => removeQuestion(i)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-3 pl-6">
              <Select value={q.type} onValueChange={(v) => updateQuestion(i, { type: v as BuilderQuestionType })}>
                <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(QUESTION_TYPE_LABELS) as BuilderQuestionType[]).map((t) => (
                    <SelectItem key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={q.is_required}
                  onChange={(e) => updateQuestion(i, { is_required: e.target.checked })}
                />
                Obligatoire
              </label>
            </div>
            {q.type === "multiple_choice" && (
              <div className="pl-6">
                <Input
                  value={q.options.join(", ")}
                  onChange={(e) => updateQuestion(i, { options: e.target.value.split(",").map((o) => o.trim()) })}
                  placeholder="Options séparées par des virgules"
                  className="h-8 text-xs"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push("/trainer/questionnaires")} disabled={saving}>
          Annuler
        </Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {questionnaireId ? "Enregistrer" : "Créer"}
        </Button>
      </div>
    </div>
  );
}
