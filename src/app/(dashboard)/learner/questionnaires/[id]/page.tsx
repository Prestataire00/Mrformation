"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Loader2,
  Star,
  CheckCircle2,
  Send,
  AlertTriangle,
} from "lucide-react";

type QuestionnaireType = "satisfaction" | "evaluation" | "survey";
type QuestionType = "rating" | "text" | "multiple_choice" | "yes_no";

interface QuestionData {
  id: string;
  questionnaire_id: string;
  text: string;
  type: QuestionType;
  options: string[] | null;
  is_required: boolean;
  order_index: number;
}

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

export default function LearnerQuestionnaireFillPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();
  const { entityId } = useEntity();

  const questionnaireId = params.id as string;
  const sessionId = searchParams.get("session_id");

  const [questionnaire, setQuestionnaire] = useState<QuestionnaireData | null>(null);
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [responses, setResponses] = useState<Record<string, string | number>>({});
  const [learnerId, setLearnerId] = useState<string | null>(null);
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

    // Find learner
    const { data: learner } = await supabase
      .from("learners")
      .select("id")
      .eq("profile_id", user.id)
      .single();

    if (!learner) {
      setLoading(false);
      return;
    }

    setLearnerId(learner.id);

    // Load questionnaire
    let qQuery = supabase
      .from("questionnaires")
      .select("id, title, description, type, entity_id")
      .eq("id", questionnaireId)
      .eq("is_active", true);

    if (entityId) {
      qQuery = qQuery.eq("entity_id", entityId);
    }

    const { data: qData } = await qQuery.single();
    if (!qData) {
      setLoading(false);
      return;
    }

    setQuestionnaire(qData as QuestionnaireData);

    // Load questions
    const { data: questionsData } = await supabase
      .from("questions")
      .select("id, questionnaire_id, text, type, options, is_required, order_index")
      .eq("questionnaire_id", questionnaireId)
      .order("order_index", { ascending: true });

    setQuestions((questionsData as QuestionData[]) || []);

    // Check for existing response
    if (sessionId) {
      const { data: existingResponse } = await supabase
        .from("questionnaire_responses")
        .select("responses")
        .eq("questionnaire_id", questionnaireId)
        .eq("session_id", sessionId)
        .eq("learner_id", learner.id)
        .maybeSingle();

      if (existingResponse) {
        setResponses(existingResponse.responses as Record<string, string | number>);
        setReadOnly(true);
      }
    }

    setLoading(false);
  }, [questionnaireId, sessionId, entityId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function updateResponse(questionId: string, value: string | number) {
    setResponses((prev) => ({ ...prev, [questionId]: value }));
    setValidationErrors((prev) => {
      const next = new Set(prev);
      next.delete(questionId);
      return next;
    });
  }

  function getAnsweredCount(): number {
    return questions.filter((q) => {
      const val = responses[q.id];
      return val !== undefined && val !== "" && val !== 0;
    }).length;
  }

  function getProgressPercent(): number {
    if (questions.length === 0) return 0;
    return Math.round((getAnsweredCount() / questions.length) * 100);
  }

  function validate(): boolean {
    const errors = new Set<string>();
    for (const q of questions) {
      if (q.is_required) {
        const val = responses[q.id];
        if (val === undefined || val === "" || val === 0) {
          errors.add(q.id);
        }
      }
    }
    setValidationErrors(errors);
    return errors.size === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    if (!learnerId || !sessionId) return;

    setSubmitting(true);

    const { error } = await supabase.from("questionnaire_responses").insert({
      questionnaire_id: questionnaireId,
      session_id: sessionId,
      learner_id: learnerId,
      responses,
    });

    setSubmitting(false);

    if (error) {
      // Show inline error
      return;
    }

    setSubmitted(true);
  }

  // Success screen
  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Merci pour votre reponse !
        </h1>
        <p className="text-gray-500 text-sm mb-8">
          Votre questionnaire a bien ete enregistre.
        </p>
        <Link href="/learner/questionnaires">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Retour aux questionnaires
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
        <Link href="/learner/questionnaires" className="text-blue-600 text-sm mt-2 inline-block hover:underline">
          Retour aux questionnaires
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Back link */}
      <Link
        href="/learner/questionnaires"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Retour aux questionnaires
      </Link>

      {/* Read-only banner */}
      {readOnly && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Vous avez deja complete ce questionnaire. Vos reponses sont affichees en lecture seule.
        </div>
      )}

      {/* Header card */}
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

        {/* Progress */}
        {!readOnly && (
          <div className="mt-5">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
              <span>Progression</span>
              <span>
                {getAnsweredCount()} / {questions.length} question{questions.length !== 1 ? "s" : ""}
              </span>
            </div>
            <Progress value={getProgressPercent()} className="h-2" />
          </div>
        )}
      </div>

      {/* Questions */}
      <div className="space-y-4">
        {questions.map((question, idx) => {
          const hasError = validationErrors.has(question.id);

          return (
            <div
              key={question.id}
              className={cn(
                "bg-white border rounded-xl p-5 transition-colors",
                hasError ? "border-red-300 bg-red-50/30" : "border-gray-200"
              )}
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600 shrink-0 mt-0.5">
                  {idx + 1}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {question.text}
                    {question.is_required && (
                      <span className="text-red-500 ml-1">*</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Rating question */}
              {question.type === "rating" && (
                <div className="flex items-center gap-1.5 pl-9">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const currentValue = (responses[question.id] as number) || 0;
                    return (
                      <button
                        key={star}
                        type="button"
                        disabled={readOnly}
                        onClick={() => updateResponse(question.id, star)}
                        className={cn(
                          "p-1 rounded transition-colors",
                          readOnly ? "cursor-default" : "hover:scale-110 cursor-pointer"
                        )}
                      >
                        <Star
                          className={cn(
                            "w-7 h-7 transition-colors",
                            star <= currentValue
                              ? "text-yellow-400 fill-yellow-400"
                              : "text-gray-200 fill-gray-200"
                          )}
                        />
                      </button>
                    );
                  })}
                  {(responses[question.id] as number) > 0 && (
                    <span className="text-sm text-gray-500 ml-2">
                      {responses[question.id]} / 5
                    </span>
                  )}
                </div>
              )}

              {/* Text question */}
              {question.type === "text" && (
                <div className="pl-9">
                  <Textarea
                    value={(responses[question.id] as string) || ""}
                    onChange={(e) => updateResponse(question.id, e.target.value)}
                    placeholder="Votre reponse..."
                    rows={3}
                    disabled={readOnly}
                    className="text-sm"
                  />
                </div>
              )}

              {/* Multiple choice question */}
              {question.type === "multiple_choice" && question.options && (
                <div className="space-y-2 pl-9">
                  {question.options.map((option) => {
                    const isSelected = responses[question.id] === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        disabled={readOnly}
                        onClick={() => updateResponse(question.id, option)}
                        className={cn(
                          "w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-all",
                          isSelected
                            ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                            : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50",
                          readOnly && "cursor-default"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center",
                              isSelected
                                ? "border-blue-500"
                                : "border-gray-300"
                            )}
                          >
                            {isSelected && (
                              <div className="w-2 h-2 rounded-full bg-blue-500" />
                            )}
                          </div>
                          {option}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Yes/No question */}
              {question.type === "yes_no" && (
                <div className="flex gap-3 pl-9">
                  {[
                    { label: "Oui", value: "oui" },
                    { label: "Non", value: "non" },
                  ].map(({ label, value }) => {
                    const isSelected = responses[question.id] === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={readOnly}
                        onClick={() => updateResponse(question.id, value)}
                        className={cn(
                          "flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all",
                          isSelected
                            ? value === "oui"
                              ? "border-green-500 bg-green-50 text-green-700"
                              : "border-red-500 bg-red-50 text-red-700"
                            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50",
                          readOnly && "cursor-default"
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Validation error */}
              {hasError && (
                <p className="text-xs text-red-600 mt-2 pl-9">
                  Cette question est obligatoire
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Submit bar */}
      {!readOnly && questions.length > 0 && (
        <>
          <Separator className="my-6" />
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Les champs marques d&apos;un <span className="text-red-500">*</span> sont obligatoires
            </p>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="gap-2"
            >
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
