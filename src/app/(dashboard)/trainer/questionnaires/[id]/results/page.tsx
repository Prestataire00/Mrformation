"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Loader2, Users } from "lucide-react";

interface QResult {
  id: string;
  text: string;
  type: string;
  options: string[] | null;
  order_index: number;
}
interface RResponse {
  id: string;
  session_id: string;
  responses: Record<string, string | number>;
  submitted_at: string;
}

export default function TrainerQuestionnaireResultsPage() {
  const params = useParams();
  const id = params.id as string;
  const [questions, setQuestions] = useState<QResult[]>([]);
  const [responses, setResponses] = useState<RResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/trainer/questionnaires/${id}/results`);
        const json = await res.json();
        if (res.ok) {
          setQuestions(json.data.questions ?? []);
          setResponses(json.data.responses ?? []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  function summary(q: QResult): string {
    const vals = responses.map((r) => r.responses?.[q.id]).filter((v) => v !== undefined && v !== "");
    if (vals.length === 0) return "Aucune réponse";
    if (q.type === "rating") {
      const nums = vals.map((v) => Number(v)).filter((n) => !isNaN(n));
      if (nums.length === 0) return "—";
      const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
      return `Moyenne ${avg.toFixed(1)}/5 (${nums.length} réponses)`;
    }
    if (q.type === "yes_no") {
      const yes = vals.filter((v) => String(v).toLowerCase() === "oui" || String(v).toLowerCase() === "yes").length;
      return `${yes} oui / ${vals.length - yes} non`;
    }
    return `${vals.length} réponse(s)`;
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <Link href="/trainer/questionnaires" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour
      </Link>
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold">Résultats</h1>
        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <Users className="h-4 w-4" /> {responses.length} répondant(s)
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : responses.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Aucune réponse pour le moment.</p>
      ) : (
        <div className="grid gap-3">
          {questions.map((q) => (
            <Card key={q.id}>
              <CardContent className="pt-5">
                <p className="font-medium text-sm">{q.text}</p>
                <p className="text-sm text-muted-foreground mt-1">{summary(q)}</p>
                {(q.type === "text") && (
                  <ul className="mt-2 space-y-1 list-disc pl-5">
                    {responses
                      .map((r) => r.responses?.[q.id])
                      .filter((v) => v !== undefined && v !== "")
                      .map((v, i) => <li key={i} className="text-xs text-muted-foreground">{String(v)}</li>)}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
