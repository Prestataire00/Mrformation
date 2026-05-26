"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { normalize, isCorrect } from "@/lib/services/questionnaire-scoring";
import type { LearnerStatusCell } from "@/lib/utils/questionnaire-stats";

interface Props {
  cell: LearnerStatusCell | null;
  sessionId: string;
  onClose: () => void;
}

interface QuestionRow {
  id: string;
  text: string;
  type: string;
  options: unknown;
  order_index: number;
}

interface ResponseRecord {
  responses: Record<string, unknown>;
  submitted_at: string;
}

export function LearnerResponsesDialog({ cell, sessionId, onClose }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [record, setRecord] = useState<ResponseRecord | null>(null);

  useEffect(() => {
    if (!cell) {
      setQuestions([]);
      setRecord(null);
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const supabase = createClient();
        const [qR, rR] = await Promise.all([
          supabase.from("questions").select("id, text, type, options, order_index").eq("questionnaire_id", cell.questionnaireId).order("order_index"),
          supabase.from("questionnaire_responses").select("responses, submitted_at").eq("id", cell.responseId!).single(),
        ]);
        if (qR.data) setQuestions(qR.data);
        if (rR.data) setRecord(rR.data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Erreur de chargement";
        toast({ title: "Erreur", description: message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [cell, toast]);

  // suppress unused-variable warning for sessionId (kept in Props for future use)
  void sessionId;

  if (!cell) return null;

  return (
    <Dialog open={!!cell} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Réponses de {cell.learnerName} — {cell.questionnaireTitle}</DialogTitle>
        </DialogHeader>

        {loading && <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>}

        {!loading && record && (
          <div className="space-y-1">
            <p className="text-xs text-gray-500">Soumis le {new Date(record.submitted_at).toLocaleString("fr-FR")}</p>
            <ol className="space-y-4 mt-4">
              {questions.map((q, idx) => (
                <li key={q.id} className="border-b border-gray-100 pb-3">
                  <p className="font-medium text-sm text-gray-800 mb-1">{idx + 1}. {q.text}</p>
                  <ResponseRenderer question={q} response={record.responses[q.id]} />
                </li>
              ))}
            </ol>
          </div>
        )}

        {!loading && !record && (
          <p className="py-8 text-center text-gray-500 text-sm">Aucune réponse trouvée</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResponseRenderer({ question, response }: { question: QuestionRow; response: unknown }) {
  if (response === undefined || response === null) {
    return <p className="text-xs text-gray-400 italic">Pas de réponse</p>;
  }

  switch (question.type) {
    case "rating": {
      const max = ((question.options as { max?: number } | null | undefined)?.max) ?? 5;
      return <p className="text-sm">Réponse : <b>{String(response)}/{max}</b></p>;
    }

    case "text":
    case "short_answer": {
      return <p className="text-sm">Réponse : <b className="italic">&quot;{String(response)}&quot;</b></p>;
    }

    case "multiple_choice": {
      const opts = question.options as { options?: string[]; correct_answer?: number } | null | undefined;
      const choices = opts?.options ?? [];
      const correctIdx = typeof opts?.correct_answer === "number" ? opts.correct_answer : null;

      let userLabel: string;
      let userIdx: number;
      if (typeof response === "number") {
        userIdx = response;
        userLabel = choices[response] ?? `Option ${response}`;
      } else {
        const respStr = String(response);
        userIdx = choices.findIndex((o) => normalize(o) === normalize(respStr));
        userLabel = userIdx >= 0 ? choices[userIdx] : respStr;
      }

      const correctness = correctIdx !== null ? isCorrect({ id: question.id, type: question.type, options: question.options }, response) : null;

      return (
        <p className="text-sm">
          Réponse : <b>▸ {userLabel}</b>
          {correctness === true && <span className="text-emerald-600 ml-2"><CheckCircle2 className="h-3.5 w-3.5 inline" /> Correct</span>}
          {correctness === false && <span className="text-red-600 ml-2"><XCircle className="h-3.5 w-3.5 inline" /> Incorrect</span>}
        </p>
      );
    }

    case "yes_no":
    case "true_false": {
      const normalized = normalize(response);
      const display = normalized === "oui" || normalized === "true" ? "Oui" : "Non";
      return <p className="text-sm">Réponse : <b>{display}</b></p>;
    }

    case "program_objectives": {
      if (typeof response !== "object" || response === null) {
        return <p className="text-sm">Réponse : <b>{String(response)}</b></p>;
      }
      const entries = Object.entries(response as Record<string, unknown>);
      return (
        <ul className="text-sm space-y-1 ml-3">
          {entries.map(([obj, val]) => (
            <li key={obj} className="text-xs">
              <span className="text-gray-600">{obj} :</span> <b>{String(val)}</b>
            </li>
          ))}
        </ul>
      );
    }

    default:
      return <p className="text-sm">Réponse : <b>{JSON.stringify(response)}</b></p>;
  }
}
