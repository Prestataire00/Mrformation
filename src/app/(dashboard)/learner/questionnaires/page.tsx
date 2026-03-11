"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ClipboardList,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Calendar,
} from "lucide-react";

type QuestionnaireType = "satisfaction" | "evaluation" | "survey";

interface LearnerQuestionnaire {
  id: string;
  title: string;
  description: string | null;
  type: QuestionnaireType;
  session_id: string;
  session_title: string;
  session_start_date: string;
  is_completed: boolean;
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

export default function LearnerQuestionnairesPage() {
  const supabase = createClient();
  const router = useRouter();
  const { entityId } = useEntity();

  const [questionnaires, setQuestionnaires] = useState<LearnerQuestionnaire[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadQuestionnaires();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  async function loadQuestionnaires() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // Find learner record
    const { data: learner } = await supabase
      .from("learners")
      .select("id")
      .eq("profile_id", user.id)
      .single();

    if (!learner) {
      setLoading(false);
      return;
    }

    // Get sessions the learner is enrolled in
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("session_id")
      .eq("learner_id", learner.id)
      .neq("status", "cancelled");

    if (!enrollments || enrollments.length === 0) {
      setQuestionnaires([]);
      setLoading(false);
      return;
    }

    const sessionIds = enrollments.map((e) => e.session_id);

    // Get questionnaire-session links for enrolled sessions
    const { data: qSessions } = await supabase
      .from("questionnaire_sessions")
      .select("questionnaire_id, session_id")
      .in("session_id", sessionIds);

    if (!qSessions || qSessions.length === 0) {
      setQuestionnaires([]);
      setLoading(false);
      return;
    }

    const questionnaireIds = [...new Set(qSessions.map((qs) => qs.questionnaire_id))];

    // Fetch active questionnaires filtered by entity
    let qQuery = supabase
      .from("questionnaires")
      .select("id, title, description, type")
      .eq("is_active", true)
      .in("id", questionnaireIds);

    if (entityId) {
      qQuery = qQuery.eq("entity_id", entityId);
    }

    const { data: questionnairesData } = await qQuery;

    if (!questionnairesData || questionnairesData.length === 0) {
      setQuestionnaires([]);
      setLoading(false);
      return;
    }

    // Fetch session details
    const { data: sessionsData } = await supabase
      .from("sessions")
      .select("id, title, start_date")
      .in("id", sessionIds);

    const sessionsMap = new Map(
      (sessionsData || []).map((s) => [s.id, s])
    );

    // Check which questionnaires the learner already answered
    const { data: existingResponses } = await supabase
      .from("questionnaire_responses")
      .select("questionnaire_id, session_id")
      .eq("learner_id", learner.id);

    const responseKeys = new Set(
      (existingResponses || []).map((r) => `${r.questionnaire_id}__${r.session_id}`)
    );

    // Build the list: one entry per questionnaire-session pair
    const result: LearnerQuestionnaire[] = [];

    for (const qs of qSessions) {
      const questionnaire = questionnairesData.find((q) => q.id === qs.questionnaire_id);
      if (!questionnaire) continue;

      const session = sessionsMap.get(qs.session_id);
      if (!session) continue;

      result.push({
        id: questionnaire.id,
        title: questionnaire.title,
        description: questionnaire.description,
        type: questionnaire.type as QuestionnaireType,
        session_id: qs.session_id,
        session_title: session.title,
        session_start_date: session.start_date,
        is_completed: responseKeys.has(`${questionnaire.id}__${qs.session_id}`),
      });
    }

    // Sort: incomplete first, then by session date
    result.sort((a, b) => {
      if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
      return new Date(b.session_start_date).getTime() - new Date(a.session_start_date).getTime();
    });

    setQuestionnaires(result);
    setLoading(false);
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes Questionnaires</h1>
          <p className="text-gray-500 text-sm mt-1">
            Remplissez les questionnaires associes a vos formations
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : questionnaires.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Aucun questionnaire disponible</p>
          <p className="text-sm mt-1">
            Vous n&apos;avez pas de questionnaires a remplir pour le moment.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {questionnaires.map((q, idx) => (
            <button
              key={`${q.id}-${q.session_id}-${idx}`}
              onClick={() =>
                router.push(`/learner/questionnaires/${q.id}?session_id=${q.session_id}`)
              }
              className="w-full text-left bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 text-base">
                      {q.title}
                    </h3>
                    <Badge className={cn("text-xs font-normal", TYPE_COLORS[q.type])}>
                      {TYPE_LABELS[q.type]}
                    </Badge>
                  </div>

                  {q.description && (
                    <p className="text-gray-500 text-sm mt-1 line-clamp-2">
                      {q.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {q.session_title} &mdash; {formatDate(q.session_start_date)}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {q.is_completed ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 text-sm font-medium rounded-lg">
                      <CheckCircle2 className="w-4 h-4" />
                      Complete
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-orange-50 text-orange-700 text-sm font-medium rounded-lg">
                      <AlertCircle className="w-4 h-4" />
                      A remplir
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
