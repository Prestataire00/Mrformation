"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Star, Loader2, BarChart3, ClipboardList, CheckCircle, Clock,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";

interface SessionResult {
  session_id: string;
  session_title: string;
  start_date: string | null;
  end_date: string | null;
  response_count: number;
  average_rating: number | null;
}

interface TrainerQuestionnaire {
  assignment_id: string;
  questionnaire_id: string;
  questionnaire_title: string;
  session_id: string;
  session_title: string;
  is_completed: boolean;
}

export default function TrainerEvaluationsPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [sessionResults, setSessionResults] = useState<SessionResult[]>([]);
  const [trainerQuests, setTrainerQuests] = useState<TrainerQuestionnaire[]>([]);
  const [trainerId, setTrainerId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Find trainer
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

      // Get trainer's session IDs
      const { data: trainerSessions } = await supabase
        .from("formation_trainers")
        .select("session_id")
        .eq("trainer_id", trainer.id);

      const sessionIds = (trainerSessions ?? []).map((ts) => ts.session_id);

      if (sessionIds.length === 0) {
        setLoading(false);
        return;
      }

      // Fetch sessions info
      const { data: sessions } = await supabase
        .from("sessions")
        .select("id, title, start_date, end_date")
        .in("id", sessionIds)
        .order("start_date", { ascending: false });

      // Fetch all responses for these sessions
      const { data: responses } = await supabase
        .from("questionnaire_responses")
        .select("session_id, responses")
        .in("session_id", sessionIds);

      // Compute average rating per session
      const resultMap = new Map<string, { ratings: number[]; count: number }>();
      for (const r of responses ?? []) {
        if (!r.session_id) continue;
        if (!resultMap.has(r.session_id)) {
          resultMap.set(r.session_id, { ratings: [], count: 0 });
        }
        const entry = resultMap.get(r.session_id)!;
        entry.count++;

        // Extract numeric ratings from responses JSONB
        const resp = r.responses as Record<string, unknown>;
        for (const val of Object.values(resp)) {
          const num = Number(val);
          if (!isNaN(num) && num >= 1 && num <= 5) {
            entry.ratings.push(num);
          }
        }
      }

      const results: SessionResult[] = (sessions ?? []).map((s) => {
        const entry = resultMap.get(s.id);
        const avg = entry && entry.ratings.length > 0
          ? entry.ratings.reduce((a, b) => a + b, 0) / entry.ratings.length
          : null;
        return {
          session_id: s.id,
          session_title: s.title,
          start_date: s.start_date,
          end_date: s.end_date,
          response_count: entry?.count ?? 0,
          average_rating: avg ? Math.round(avg * 10) / 10 : null,
        };
      });

      setSessionResults(results);

      // PARTIE C — Questionnaires du formateur à remplir
      const { data: assignments } = await supabase
        .from("formation_satisfaction_assignments")
        .select("id, questionnaire_id, session_id, questionnaire:questionnaires(title)")
        .eq("target_type", "trainer")
        .eq("target_id", trainer.id);

      if (assignments && assignments.length > 0) {
        // Check which ones are already completed
        const { data: existingResponses } = await supabase
          .from("questionnaire_responses")
          .select("questionnaire_id, session_id")
          .eq("learner_id", trainer.id);

        const completedSet = new Set(
          (existingResponses ?? []).map((r) => `${r.questionnaire_id}::${r.session_id}`)
        );

        // Get session titles for these assignments
        const assignmentSessionIds = [...new Set(assignments.map((a) => a.session_id))];
        const { data: assignmentSessions } = await supabase
          .from("sessions")
          .select("id, title")
          .in("id", assignmentSessionIds);

        const sessionTitleMap = new Map(
          (assignmentSessions ?? []).map((s) => [s.id, s.title])
        );

        const quests: TrainerQuestionnaire[] = assignments.map((a) => ({
          assignment_id: a.id,
          questionnaire_id: a.questionnaire_id,
          questionnaire_title: (a.questionnaire as unknown as { title: string })?.title || "Questionnaire",
          session_id: a.session_id,
          session_title: sessionTitleMap.get(a.session_id) || "Formation",
          is_completed: completedSet.has(`${a.questionnaire_id}::${a.session_id}`),
        }));

        setTrainerQuests(quests);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Render stars
  const renderStars = (rating: number) => {
    const full = Math.floor(rating);
    const hasHalf = rating - full >= 0.3;
    const stars: JSX.Element[] = [];
    for (let i = 0; i < 5; i++) {
      if (i < full) {
        stars.push(<Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />);
      } else if (i === full && hasHalf) {
        stars.push(<Star key={i} className="h-4 w-4 fill-amber-200 text-amber-400" />);
      } else {
        stars.push(<Star key={i} className="h-4 w-4 text-gray-300" />);
      }
    }
    return <div className="flex items-center gap-0.5">{stars}</div>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Global stats
  const totalResponses = sessionResults.reduce((sum, s) => sum + s.response_count, 0);
  const allRatings = sessionResults.filter((s) => s.average_rating !== null);
  const globalAverage = allRatings.length > 0
    ? Math.round((allRatings.reduce((sum, s) => sum + s.average_rating!, 0) / allRatings.length) * 10) / 10
    : null;
  const pendingQuests = trainerQuests.filter((q) => !q.is_completed).length;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mes Évaluations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Résultats de satisfaction et questionnaires à remplir
        </p>
      </div>

      {/* Stats globales */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-blue-500" />
            <div>
              <p className="text-xs text-muted-foreground">Réponses reçues</p>
              <p className="text-xl font-bold">{totalResponses}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Star className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-xs text-muted-foreground">Note moyenne</p>
              <p className="text-xl font-bold">
                {globalAverage !== null ? `${globalAverage}/5` : "—"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <ClipboardList className="h-5 w-5 text-violet-500" />
            <div>
              <p className="text-xs text-muted-foreground">À remplir</p>
              <p className="text-xl font-bold text-violet-600">{pendingQuests}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SECTION 1 — Satisfaction de mes apprenants */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Satisfaction de mes apprenants
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sessionResults.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Aucune session trouvée</p>
          ) : (
            <div className="space-y-3">
              {sessionResults.map((s) => (
                <div key={s.session_id} className="p-4 bg-muted/30 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium text-sm">{s.session_title}</p>
                      {s.start_date && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(s.start_date).toLocaleDateString("fr-FR")}
                          {s.end_date && ` — ${new Date(s.end_date).toLocaleDateString("fr-FR")}`}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs">
                        {s.response_count} réponse{s.response_count !== 1 ? "s" : ""}
                      </Badge>
                      {s.average_rating !== null && (
                        <div className="flex items-center gap-2">
                          {renderStars(s.average_rating)}
                          <span className="text-sm font-semibold">{s.average_rating}/5</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {s.average_rating !== null && (
                    <Progress value={(s.average_rating / 5) * 100} className="h-1.5" />
                  )}
                  {s.response_count === 0 && (
                    <p className="text-xs text-muted-foreground italic mt-1">Aucune évaluation reçue</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SECTION 2 — Mes questionnaires à remplir */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4" /> Mes questionnaires à remplir
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trainerQuests.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Aucun questionnaire attribué</p>
          ) : (
            <div className="space-y-2">
              {trainerQuests.map((q) => (
                <div
                  key={q.assignment_id}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{q.questionnaire_title}</span>
                    <span className="text-xs text-muted-foreground">({q.session_title})</span>
                    {q.is_completed ? (
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs">
                        <CheckCircle className="h-3 w-3 mr-1" /> Rempli
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-xs">
                        <Clock className="h-3 w-3 mr-1" /> À remplir
                      </Badge>
                    )}
                  </div>
                  {!q.is_completed && (
                    <Link href={`/learner/questionnaires/${q.questionnaire_id}?session_id=${q.session_id}`}>
                      <Button variant="outline" size="sm" className="h-7 text-xs">
                        <ExternalLink className="h-3 w-3 mr-1" /> Remplir
                      </Button>
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
