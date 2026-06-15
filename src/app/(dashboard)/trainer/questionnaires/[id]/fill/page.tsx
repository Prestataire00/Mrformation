"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { ArrowLeft, Loader2, CheckCircle2, Send, AlertTriangle } from "lucide-react";
import { QuestionField, type QuestionFieldData } from "@/components/questionnaires/QuestionField";
import {
  expandObjectivesQuestions,
  buildResponsesPayload,
  type BaseQuestion,
} from "@/lib/expand-objectives-question";

type QuestionnaireType = "satisfaction" | "evaluation" | "survey";

interface QuestionnaireData {
  id: string;
  title: string;
  description: string | null;
  type: QuestionnaireType;
  entity_id: string;
}

const TYPE_LABELS: Record<QuestionnaireType, string> = {
  satisfaction: "Satisfaction",
  evaluation: "Evaluation",
  survey: "Enquete",
};

const TYPE_COLORS: Record<QuestionnaireType, string> = {
  satisfaction: "bg-green-100 text-green-700",
  evaluation: "bg-blue-100 text-blue-700",
  survey: "bg-purple-100 text-purple-700",
};

/**
 * Remplissage d'un questionnaire par le FORMATEUR (EF-3.4). Stocke la réponse
 * avec `trainer_id` (jamais `learner_id`). Route dédiée — ne réutilise PAS
 * `/learner/*` (interdit au rôle). Partage le rendu via QuestionField.
 */
export default function TrainerQuestionnaireFillPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { entityId } = useEntity();
  const { toast } = useToast();

  const questionnaireId = params.id as string;
  const sessionId = searchParams.get("session_id");

  const [questionnaire, setQuestionnaire] = useState<QuestionnaireData | null>(null);
  const [questions, setQuestions] = useState<QuestionFieldData[]>([]);
  const [responses, setResponses] = useState<Record<string, string | number>>({});
  const [trainerId, setTrainerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: trainer } = await supabase
      .from("trainers")
      .select("id")
      .eq("profile_id", user.id)
      .single();
    if (!trainer) {
      setLoading(false);
      return;
    }
    setTrainerId(trainer.id);

    let qQuery = supabase
      .from("questionnaires")
      .select("id, title, description, type, entity_id")
      .eq("id", questionnaireId)
      .eq("is_active", true);
    if (entityId) qQuery = qQuery.eq("entity_id", entityId);
    const { data: qData } = await qQuery.single();
    if (!qData) {
      setLoading(false);
      return;
    }
    setQuestionnaire(qData as QuestionnaireData);

    const { data: questionsData } = await supabase
      .from("questions")
      .select("id, questionnaire_id, text, type, options, is_required, order_index")
      .eq("questionnaire_id", questionnaireId)
      .order("order_index", { ascending: true });

    let expanded = (questionsData as QuestionFieldData[]) || [];
    if (sessionId && expanded.some((q) => q.type === "program_objectives")) {
      const { data: sessionData } = await supabase
        .from("sessions")
        .select("program:programs(objectives), training:trainings(objectives)")
        .eq("id", sessionId)
        .maybeSingle();
      expanded = expandObjectivesQuestions(
        expanded as unknown as BaseQuestion[],
        sessionData as never
      ) as unknown as QuestionFieldData[];
    }
    setQuestions(expanded);

    // Réponse déjà enregistrée (par trainer_id) → lecture seule.
    if (sessionId) {
      const { data: existing } = await supabase
        .from("questionnaire_responses")
        .select("responses")
        .eq("questionnaire_id", questionnaireId)
        .eq("session_id", sessionId)
        .eq("trainer_id", trainer.id)
        .maybeSingle();
      if (existing) {
        setResponses(existing.responses as Record<string, string | number>);
        setReadOnly(true);
      }
    }

    setLoading(false);
  }, [questionnaireId, sessionId, entityId, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function updateResponse(questionId: string, value: string | number) {
    setResponses((prev) => ({ ...prev, [questionId]: value }));
    setValidationErrors((prev) => {
      if (!prev.has(questionId)) return prev;
      const next = new Set(prev);
      next.delete(questionId);
      return next;
    });
  }

  function validate(): boolean {
    const errors = new Set<string>();
    for (const q of questions) {
      if (q.is_required) {
        const val = responses[q.id];
        if (val === undefined || val === "" || val === 0) errors.add(q.id);
      }
    }
    setValidationErrors(errors);
    return errors.size === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    if (!trainerId || !sessionId) {
      toast({
        title: "Contexte manquant",
        description: "Session introuvable pour ce questionnaire.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    const responsesPayload = buildResponsesPayload(responses, questions as never);
    const { error } = await supabase.from("questionnaire_responses").insert({
      questionnaire_id: questionnaireId,
      session_id: sessionId,
      trainer_id: trainerId,
      responses: responsesPayload,
    });
    setSubmitting(false);
    if (error) {
      toast({
        title: "Erreur",
        description: "Impossible d'envoyer vos réponses. Veuillez réessayer.",
        variant: "destructive",
      });
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Merci pour votre reponse !</h1>
        <p className="text-gray-500 text-sm mb-8">Votre questionnaire a bien ete enregistre.</p>
        <Link href="/trainer/evaluations">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Retour aux evaluations
          </Button>
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!questionnaire) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500 font-medium">Questionnaire introuvable</p>
        <Link href="/trainer/evaluations" className="text-blue-600 text-sm mt-2 inline-block hover:underline">
          Retour aux evaluations
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href="/trainer/evaluations"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Retour aux evaluations
      </Link>

      {readOnly && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Vous avez deja complete ce questionnaire. Vos reponses sont affichees en lecture seule.
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{questionnaire.title}</h1>
            {questionnaire.description && (
              <p className="text-gray-500 text-sm mt-1">{questionnaire.description}</p>
            )}
          </div>
          <Badge className={cn("text-xs font-normal shrink-0", TYPE_COLORS[questionnaire.type])}>
            {TYPE_LABELS[questionnaire.type]}
          </Badge>
        </div>
      </div>

      <div className="space-y-4">
        {questions.map((question, idx) => (
          <QuestionField
            key={question.id}
            question={question}
            index={idx}
            value={responses[question.id]}
            onChange={(v) => updateResponse(question.id, v)}
            readOnly={readOnly}
            hasError={validationErrors.has(question.id)}
          />
        ))}
      </div>

      {!readOnly && questions.length > 0 && (
        <>
          <Separator className="my-6" />
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Les champs marques d&apos;un <span className="text-red-500">*</span> sont obligatoires
            </p>
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Envoi en cours...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Envoyer mes reponses
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
