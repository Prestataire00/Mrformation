"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Smile, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import type {
  Session, Questionnaire, SatisfactionType, SatisfactionTargetType,
  FormationSatisfactionAssignment,
} from "@/lib/types";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

// Questionnaire types for apprenants
const LEARNER_SATISFACTION_TYPES: { type: SatisfactionType; label: string }[] = [
  { type: "satisfaction_chaud", label: "Satisfaction à chaud" },
  { type: "satisfaction_froid", label: "Satisfaction à froid" },
  { type: "autres_quest", label: "Autres questionnaires" },
];

export function TabSatisfaction({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  // Satisfaction scores per questionnaire+target
  const [satisfactionScores, setSatisfactionScores] = useState<Record<string, number | null>>({});

  const assignments = formation.formation_satisfaction_assignments || [];
  const enrollments = formation.enrollments || [];
  const trainers = formation.formation_trainers || [];
  const companies = formation.formation_companies || [];
  const financiers = formation.formation_financiers || [];

  // Fetch questionnaires
  const fetchQuestionnaires = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("entity_id")
      .eq("id", user.id)
      .single();
    if (!profile) return;
    const { data } = await supabase
      .from("questionnaires")
      .select("id, title, type, quality_indicator_type, is_active")
      .eq("entity_id", profile.entity_id)
      .eq("is_active", true)
      .order("title");
    setQuestionnaires((data as Questionnaire[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchQuestionnaires();
  }, [fetchQuestionnaires]);

  // Initialize selections from existing assignments
  useEffect(() => {
    const sel: Record<string, string> = {};
    for (const a of assignments) {
      const key = makeKey(a.satisfaction_type, a.target_type, a.target_id);
      sel[key] = a.questionnaire_id;
    }
    setSelections(sel);
  }, [assignments]);

  // Fetch satisfaction scores from questionnaire_responses
  useEffect(() => {
    if (assignments.length === 0) return;
    const fetchScores = async () => {
      const scores: Record<string, number | null> = {};
      for (const a of assignments) {
        const query = supabase
          .from("questionnaire_responses")
          .select("responses")
          .eq("questionnaire_id", a.questionnaire_id)
          .eq("session_id", formation.id);

        if (a.target_id && (a.target_type === "learner")) {
          query.eq("learner_id", a.target_id);
        }

        const { data } = await query;
        if (data && data.length > 0) {
          // Calculate average rating from responses
          let totalRating = 0;
          let ratingCount = 0;
          for (const resp of data) {
            const responses = resp.responses as Record<string, unknown>;
            for (const val of Object.values(responses)) {
              if (typeof val === "number" && val >= 1 && val <= 5) {
                totalRating += val;
                ratingCount++;
              }
            }
          }
          const key = `${a.questionnaire_id}-${a.target_type}-${a.target_id || "mass"}`;
          scores[key] = ratingCount > 0 ? Math.round((totalRating / ratingCount / 5) * 100) : null;
        }
      }
      setSatisfactionScores(scores);
    };
    fetchScores();
  }, [assignments, formation.id, supabase]);

  function makeKey(satType: string, targetType: string, targetId: string | null): string {
    return `${satType}-${targetType}-${targetId || "mass"}`;
  }

  // Get questionnaires relevant to a satisfaction type
  const getQuestionnairesForType = (satType: SatisfactionType) => {
    return questionnaires.filter(
      (q) =>
        q.quality_indicator_type === satType ||
        q.type === "satisfaction" ||
        q.type === "survey"
    );
  };

  // Find existing assignment
  const getAssignment = (satType: SatisfactionType, targetType: SatisfactionTargetType, targetId: string | null) => {
    return assignments.find(
      (a) => a.satisfaction_type === satType && a.target_type === targetType && a.target_id === targetId
    );
  };

  // Assign questionnaire
  const handleAssign = async (
    satType: SatisfactionType,
    targetType: SatisfactionTargetType,
    targetId: string | null,
    questionnaireId: string
  ) => {
    if (!questionnaireId) return;
    const key = makeKey(satType, targetType, targetId);
    setSaving(key);

    const existing = getAssignment(satType, targetType, targetId);
    if (existing) {
      await supabase
        .from("formation_satisfaction_assignments")
        .delete()
        .eq("id", existing.id);
    }

    const { error } = await supabase.from("formation_satisfaction_assignments").insert({
      session_id: formation.id,
      questionnaire_id: questionnaireId,
      satisfaction_type: satType,
      target_type: targetType,
      target_id: targetId,
    });

    setSaving(null);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Questionnaire attribué" });
      onRefresh();
    }
  };

  // Remove assignment
  const handleRemove = async (assignmentId: string) => {
    setSaving(assignmentId);
    const { error } = await supabase
      .from("formation_satisfaction_assignments")
      .delete()
      .eq("id", assignmentId);
    setSaving(null);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Questionnaire supprimé" });
      onRefresh();
    }
  };

  // Get satisfaction score display for an assignment
  const getScoreDisplay = (a: FormationSatisfactionAssignment) => {
    const key = `${a.questionnaire_id}-${a.target_type}-${a.target_id || "mass"}`;
    const score = satisfactionScores[key];
    if (score === undefined || score === null) return null;
    return score;
  };

  // Render a satisfaction assignment row
  const renderSatRow = (
    satType: SatisfactionType,
    label: string,
    targetType: SatisfactionTargetType,
    targetId: string | null
  ) => {
    const key = makeKey(satType, targetType, targetId);
    const currentValue = selections[key] || "";
    const available = getQuestionnairesForType(satType);
    const isSaving = saving === key;
    const existing = getAssignment(satType, targetType, targetId);

    return (
      <div key={key} className="space-y-2">
        <p className="font-semibold text-sm">{label}</p>
        {existing && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="font-medium">
              {existing.questionnaire?.title || "Questionnaire"}
            </span>
            <button
              className="text-red-500 hover:text-red-700 text-xs underline flex items-center gap-1"
              onClick={() => handleRemove(existing.id)}
              disabled={saving === existing.id}
            >
              {saving === existing.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              Supprimer ce questionnaire
            </button>
          </div>
        )}
        <div className="flex items-center gap-3">
          <Select
            value={currentValue}
            onValueChange={(val) => {
              setSelections((prev) => ({ ...prev, [key]: val }));
            }}
          >
            <SelectTrigger className="w-[400px]">
              <SelectValue placeholder="Sélectionner un questionnaire..." />
            </SelectTrigger>
            <SelectContent>
              {available.map((q) => (
                <SelectItem key={q.id} value={q.id}>
                  {q.title}
                </SelectItem>
              ))}
              {available.length === 0 && (
                <SelectItem value="_none" disabled>
                  Aucun questionnaire disponible
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <Button
            className="bg-teal-500 hover:bg-teal-600 text-white"
            onClick={() => handleAssign(satType, targetType, targetId, currentValue)}
            disabled={!currentValue || isSaving}
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Attribuer
          </Button>
        </div>
      </div>
    );
  };

  // Render satisfaction synthesis for a target
  const renderSatisfactionSynthesis = (targetType: SatisfactionTargetType, targetId: string | null) => {
    const targetAssignments = assignments.filter(
      (a) => a.target_type === targetType && (a.target_id === targetId || (targetId === null && a.target_id === null))
    );
    if (targetAssignments.length === 0) return null;

    const scores = targetAssignments
      .map((a) => getScoreDisplay(a))
      .filter((s): s is number => s !== null);

    if (scores.length === 0) return null;

    const avgScore = Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);

    return (
      <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
        <Smile className="h-8 w-8 text-green-500" />
        <div>
          <p className="text-sm font-semibold text-green-700">
            MOYENNE DE SATISFACTION {avgScore}%
          </p>
          <p className="text-xs text-green-600">
            Synthèse satisfaction ({scores.length} questionnaire{scores.length > 1 ? "s" : ""})
          </p>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">{formation.title}</h2>

      {/* ===== SECTION: QUESTIONNAIRES POUR APPRENANTS ===== */}
      <Card>
        <CardContent className="pt-6 space-y-6">
          <h3 className="text-lg font-bold uppercase">Questionnaires pour apprenants</h3>

          {/* Mass attribution */}
          <div className="space-y-4 border-b pb-6">
            <p className="font-semibold text-sm text-muted-foreground uppercase">
              Attribution en masse à tous les apprenants
            </p>
            {LEARNER_SATISFACTION_TYPES.map((st) =>
              renderSatRow(st.type, st.label, "learner", null)
            )}
          </div>

          {/* Per learner */}
          {enrollments.map((enrollment) => {
            const learner = enrollment.learner;
            if (!learner) return null;

            const learnerAssignments = assignments.filter(
              (a) => a.target_type === "learner" && a.target_id === learner.id
            );
            const massAssignments = assignments.filter(
              (a) => a.target_type === "learner" && a.target_id === null
            );

            return (
              <div key={enrollment.id} className="space-y-4 border-b pb-6 last:border-b-0">
                <h4 className="font-bold">
                  {learner.first_name} {learner.last_name}
                </h4>

                {renderSatisfactionSynthesis("learner", learner.id)}

                {/* Show current assignments */}
                {[...massAssignments, ...learnerAssignments].length > 0 && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    {[...massAssignments, ...learnerAssignments].map((a) => (
                      <p key={a.id}>
                        {LEARNER_SATISFACTION_TYPES.find((s) => s.type === a.satisfaction_type)?.label || a.satisfaction_type}
                        {" → "}
                        <span className="font-medium">
                          {a.questionnaire?.title || "Questionnaire"}
                        </span>
                        {a.target_id === null && " (en masse)"}
                      </p>
                    ))}
                  </div>
                )}

                {LEARNER_SATISFACTION_TYPES.map((st) =>
                  renderSatRow(st.type, st.label, "learner", learner.id)
                )}
              </div>
            );
          })}

          {enrollments.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucun apprenant inscrit.</p>
          )}
        </CardContent>
      </Card>

      {/* ===== SECTION: QUESTIONNAIRES POUR FORMATEURS ===== */}
      <Card>
        <CardContent className="pt-6 space-y-6">
          <h3 className="text-lg font-bold uppercase">Questionnaires pour formateurs</h3>

          {trainers.length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              Aucun formateur attribué à cette formation...
            </p>
          )}

          {trainers.map((ft) => {
            const trainer = ft.trainer;
            if (!trainer) return null;

            return (
              <div key={ft.id} className="space-y-4 border-b pb-6 last:border-b-0">
                <h4 className="font-bold">
                  {trainer.first_name} {trainer.last_name}
                </h4>

                {renderSatisfactionSynthesis("trainer", trainer.id)}

                {renderSatRow("quest_formateurs", "Questionnaire formateur", "trainer", trainer.id)}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ===== SECTION: QUESTIONNAIRES POUR MANAGER ===== */}
      <Card>
        <CardContent className="pt-6 space-y-6">
          <h3 className="text-lg font-bold uppercase">Questionnaires pour manager</h3>

          {!formation.manager_id ? (
            <p className="text-sm text-muted-foreground italic">
              Aucun manager attribué à cette formation...
            </p>
          ) : (
            <div className="space-y-4">
              {formation.manager && (
                <h4 className="font-bold">
                  {formation.manager.first_name} {formation.manager.last_name}
                </h4>
              )}
              {renderSatRow("quest_managers", "Questionnaire manager", "manager", formation.manager_id)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== SECTION: QUESTIONNAIRES POUR FINANCEUR ===== */}
      <Card>
        <CardContent className="pt-6 space-y-6">
          <h3 className="text-lg font-bold uppercase">Questionnaires pour financeur</h3>

          {financiers.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Aucun financeur attribué à cette formation...
            </p>
          ) : (
            financiers.map((fin) => (
              <div key={fin.id} className="space-y-4 border-b pb-6 last:border-b-0">
                <h4 className="font-bold">{fin.name}</h4>
                {renderSatRow("quest_financeurs", "Questionnaire financeur", "financier", fin.id)}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ===== SECTION: QUESTIONNAIRES POUR ENTREPRISES ===== */}
      <Card>
        <CardContent className="pt-6 space-y-6">
          <h3 className="text-lg font-bold uppercase">Questionnaires pour entreprises</h3>

          {companies.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Aucune entreprise attribuée à cette formation...
            </p>
          ) : (
            companies.map((fc) => {
              const client = fc.client;
              if (!client) return null;

              return (
                <div key={fc.id} className="space-y-4 border-b pb-6 last:border-b-0">
                  <h4 className="font-bold">{client.company_name}</h4>
                  {renderSatRow("quest_entreprises", "Questionnaire entreprise", "company", client.id)}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
