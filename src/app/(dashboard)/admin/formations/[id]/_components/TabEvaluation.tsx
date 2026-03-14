"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import type { Session, Questionnaire, EvaluationType } from "@/lib/types";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

const EVAL_TYPES: { type: EvaluationType; label: string }[] = [
  { type: "eval_preformation", label: "Attribuer une Évaluation Pré-formation" },
  { type: "eval_pendant", label: "Attribuer une Évaluation Pendant la Formation" },
  { type: "eval_postformation", label: "Attribuer une Évaluation Post-formation" },
  { type: "auto_eval_pre", label: "Attribuer une Auto-évaluation Pré-formation" },
  { type: "auto_eval_post", label: "Attribuer une Auto-évaluation Post-formation" },
];

export function TabEvaluation({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // Selections for mass assignment
  const [massSelections, setMassSelections] = useState<Record<string, string>>({});
  // Selections per learner: key = `${learnerId}-${evalType}`
  const [learnerSelections, setLearnerSelections] = useState<Record<string, string>>({});

  const assignments = formation.formation_evaluation_assignments || [];
  const enrollments = formation.enrollments || [];

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
    const mass: Record<string, string> = {};
    const perLearner: Record<string, string> = {};
    for (const a of assignments) {
      if (a.learner_id === null) {
        mass[a.evaluation_type] = a.questionnaire_id;
      } else {
        perLearner[`${a.learner_id}-${a.evaluation_type}`] = a.questionnaire_id;
      }
    }
    setMassSelections(mass);
    setLearnerSelections(perLearner);
  }, [assignments]);

  // Get questionnaires relevant to an evaluation type
  const getQuestionnairesForType = (evalType: EvaluationType) => {
    // Show questionnaires matching quality_indicator_type or evaluation type
    return questionnaires.filter(
      (q) =>
        q.quality_indicator_type === evalType ||
        q.type === "evaluation" ||
        q.type === "survey"
    );
  };

  // Get current assignment for a type + learner
  const getCurrentAssignment = (evalType: EvaluationType, learnerId: string | null) => {
    return assignments.find(
      (a) => a.evaluation_type === evalType && a.learner_id === learnerId
    );
  };

  // Assign questionnaire
  const handleAssign = async (
    evalType: EvaluationType,
    questionnaireId: string,
    learnerId: string | null
  ) => {
    if (!questionnaireId) return;
    const key = learnerId ? `${learnerId}-${evalType}` : `mass-${evalType}`;
    setSaving(key);

    // Delete existing assignment if any
    const existing = getCurrentAssignment(evalType, learnerId);
    if (existing) {
      await supabase
        .from("formation_evaluation_assignments")
        .delete()
        .eq("id", existing.id);
    }

    // Insert new
    const { error } = await supabase.from("formation_evaluation_assignments").insert({
      session_id: formation.id,
      questionnaire_id: questionnaireId,
      evaluation_type: evalType,
      learner_id: learnerId,
    });

    setSaving(null);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Évaluation attribuée" });
      onRefresh();
    }
  };

  // Render an evaluation row (select + button)
  const renderEvalRow = (
    evalType: EvaluationType,
    label: string,
    learnerId: string | null
  ) => {
    const selectionKey = learnerId ? `${learnerId}-${evalType}` : evalType;
    const currentValue = learnerId
      ? learnerSelections[`${learnerId}-${evalType}`] || ""
      : massSelections[evalType] || "";
    const available = getQuestionnairesForType(evalType);
    const saveKey = learnerId ? `${learnerId}-${evalType}` : `mass-${evalType}`;
    const isSaving = saving === saveKey;

    return (
      <div key={`${learnerId || "mass"}-${evalType}`} className="space-y-2">
        <p className="font-semibold text-sm">{label}</p>
        <div className="flex items-center gap-3">
          <Select
            value={currentValue}
            onValueChange={(val) => {
              if (learnerId) {
                setLearnerSelections((prev) => ({
                  ...prev,
                  [`${learnerId}-${evalType}`]: val,
                }));
              } else {
                setMassSelections((prev) => ({ ...prev, [evalType]: val }));
              }
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
            onClick={() => handleAssign(evalType, currentValue, learnerId)}
            disabled={!currentValue || isSaving}
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Attribuer
          </Button>
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

      {/* Section 1: Attribution en masse */}
      <Card>
        <CardContent className="pt-6 space-y-6">
          <h3 className="text-lg font-bold">
            Attribuer les évaluations en masse à tous les apprenants
          </h3>
          {EVAL_TYPES.map((et) =>
            renderEvalRow(et.type, et.label, null)
          )}
        </CardContent>
      </Card>

      {/* Section 2: Par apprenant */}
      {enrollments.map((enrollment) => {
        const learner = enrollment.learner;
        if (!learner) return null;

        const learnerAssignments = assignments.filter(
          (a) => a.learner_id === learner.id
        );
        const massAssignments = assignments.filter(
          (a) => a.learner_id === null
        );
        const hasAny = learnerAssignments.length > 0 || massAssignments.length > 0;

        return (
          <Card key={enrollment.id}>
            <CardContent className="pt-6 space-y-6">
              <h3 className="text-lg font-bold">
                {learner.first_name} {learner.last_name}
              </h3>

              {!hasAny && (
                <p className="text-sm font-semibold text-muted-foreground uppercase">
                  Pas de questionnaire attribué
                </p>
              )}

              {hasAny && (
                <div className="text-sm text-muted-foreground">
                  {[...massAssignments, ...learnerAssignments].map((a) => (
                    <p key={a.id}>
                      {EVAL_TYPES.find((e) => e.type === a.evaluation_type)?.label || a.evaluation_type}
                      {" → "}
                      <span className="font-medium">
                        {a.questionnaire?.title || "Questionnaire"}
                      </span>
                      {a.learner_id === null && " (en masse)"}
                    </p>
                  ))}
                </div>
              )}

              {EVAL_TYPES.map((et) =>
                renderEvalRow(et.type, et.label, learner.id)
              )}
            </CardContent>
          </Card>
        );
      })}

      {enrollments.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            Aucun apprenant inscrit.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
