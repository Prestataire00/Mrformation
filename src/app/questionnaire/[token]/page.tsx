"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Loader2, Star, CheckCircle2, AlertTriangle } from "lucide-react";

interface Question {
  id: string;
  text: string;
  type: "rating" | "text" | "multiple_choice" | "yes_no";
  options: string[] | null;
  is_required: boolean;
  order_index: number;
}

interface TokenInfo {
  valid: boolean;
  used: boolean;
  expired: boolean;
  questionnaire_title: string;
  session_title: string;
  learner_name: string;
  questions: Question[];
}

export default function PublicQuestionnairePage() {
  const params = useParams();
  const token = params.token as string;

  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [responses, setResponses] = useState<Record<string, string | number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/questionnaire/public-submit?token=${token}`);
        const data = await res.json();
        setInfo(data);
      } catch {
        setError("Impossible de charger le questionnaire");
      }
      setLoading(false);
    }
    load();
  }, [token]);

  const updateResponse = (qId: string, value: string | number) => {
    setResponses(prev => ({ ...prev, [qId]: value }));
  };

  const answeredCount = info?.questions.filter(q => responses[q.id] !== undefined && responses[q.id] !== "").length || 0;
  const totalQuestions = info?.questions.length || 0;

  const handleSubmit = async () => {
    if (!info) return;
    const missing = info.questions.filter(q => q.is_required && (responses[q.id] === undefined || responses[q.id] === ""));
    if (missing.length > 0) {
      setError(`${missing.length} question(s) obligatoire(s) non remplie(s)`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/questionnaire/public-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, responses }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'envoi");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>;

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-md">
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Merci !</h1>
          <p className="text-gray-500">Vos réponses ont été enregistrées.</p>
        </div>
      </div>
    );
  }

  if (!info?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-md">
          <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">
            {info?.expired ? "Lien expiré" : info?.used ? "Déjà rempli" : "Lien invalide"}
          </h1>
          <p className="text-gray-500 text-sm">
            {info?.used ? "Vous avez déjà répondu à ce questionnaire." : "Ce lien n'est plus valide."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4 space-y-6">
        {/* Header */}
        <div className="bg-white rounded-xl border p-6">
          <h1 className="text-xl font-bold text-gray-900">{info.questionnaire_title}</h1>
          <p className="text-sm text-gray-500 mt-1">{info.session_title}</p>
          <p className="text-sm text-gray-700 mt-2 font-medium">{info.learner_name}</p>
          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Progression</span>
              <span>{answeredCount} / {totalQuestions}</span>
            </div>
            <Progress value={totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0} className="h-2" />
          </div>
        </div>

        {/* Questions */}
        {info.questions.map((q, idx) => (
          <div key={q.id} className="bg-white rounded-xl border p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600 shrink-0">{idx + 1}</div>
              <p className="text-sm font-medium text-gray-900">{q.text}{q.is_required && <span className="text-red-500 ml-1">*</span>}</p>
            </div>

            {q.type === "rating" && (
              <div className="flex items-center gap-1.5 pl-9">
                {[1, 2, 3, 4, 5].map(star => (
                  <button key={star} type="button" onClick={() => updateResponse(q.id, star)} className="p-1">
                    <Star className={cn("w-7 h-7", star <= ((responses[q.id] as number) || 0) ? "text-yellow-400 fill-yellow-400" : "text-gray-200 fill-gray-200")} />
                  </button>
                ))}
                {(responses[q.id] as number) > 0 && <span className="text-sm text-gray-500 ml-2">{responses[q.id]} / 5</span>}
              </div>
            )}

            {q.type === "text" && (
              <div className="pl-9">
                <Textarea value={(responses[q.id] as string) || ""} onChange={e => updateResponse(q.id, e.target.value)} placeholder="Votre réponse..." rows={3} className="text-sm" />
              </div>
            )}

            {q.type === "multiple_choice" && q.options && (
              <div className="space-y-2 pl-9">
                {q.options.map(opt => (
                  <button key={opt} type="button" onClick={() => updateResponse(q.id, opt)}
                    className={cn("w-full text-left px-4 py-2.5 rounded-lg border text-sm", responses[q.id] === opt ? "border-blue-500 bg-blue-50 text-blue-700 font-medium" : "border-gray-200 hover:border-gray-300")}>
                    <div className="flex items-center gap-3">
                      <div className={cn("w-4 h-4 rounded-full border-2 shrink-0", responses[q.id] === opt ? "border-blue-500 bg-blue-500" : "border-gray-300")} />
                      {opt}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {q.type === "yes_no" && (
              <div className="flex gap-3 pl-9">
                {[{ label: "Oui", value: "oui" }, { label: "Non", value: "non" }].map(({ label, value }) => (
                  <button key={value} type="button" onClick={() => updateResponse(q.id, value)}
                    className={cn("flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium",
                      responses[q.id] === value ? (value === "oui" ? "border-green-500 bg-green-50 text-green-700" : "border-red-500 bg-red-50 text-red-700") : "border-gray-200 hover:border-gray-300")}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Error + Submit */}
        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

        <Button onClick={handleSubmit} disabled={submitting} className="w-full gap-2" size="lg">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {submitting ? "Envoi..." : "Envoyer mes réponses"}
        </Button>
      </div>
    </div>
  );
}
