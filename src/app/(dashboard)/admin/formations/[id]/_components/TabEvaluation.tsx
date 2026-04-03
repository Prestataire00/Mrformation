"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import type { Session, Questionnaire, EvaluationType } from "@/lib/types";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

const EVAL_TYPES: { type: EvaluationType; label: string; short: string }[] = [
  { type: "eval_preformation", label: "Évaluation Pré-formation", short: "Pré-formation" },
  { type: "eval_pendant", label: "Évaluation Pendant la Formation", short: "Pendant" },
  { type: "eval_postformation", label: "Évaluation Post-formation", short: "Post-formation" },
  { type: "auto_eval_pre", label: "Auto-évaluation Pré-formation", short: "Auto-éval. pré" },
  { type: "auto_eval_post", label: "Auto-évaluation Post-formation", short: "Auto-éval. post" },
];

export function TabEvaluation({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ mass: true });

  const [massSelections, setMassSelections] = useState<Record<string, string>>({});
  const [learnerSelections, setLearnerSelections] = useState<Record<string, string>>({});

  const assignments = formation.formation_evaluation_assignments || [];
  const enrollments = formation.enrollments || [];

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

  useEffect(() => { fetchQuestionnaires(); }, [fetchQuestionnaires]);

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

  const getQuestionnairesForType = (evalType: EvaluationType) =>
    questionnaires.filter(
      (q) => q.quality_indicator_type === evalType || q.type === "evaluation" || q.type === "survey"
    );

  const getCurrentAssignment = (evalType: EvaluationType, learnerId: string | null) =>
    assignments.find((a) => a.evaluation_type === evalType && a.learner_id === learnerId);

  const handleAssign = async (
    evalType: EvaluationType,
    questionnaireId: string,
    learnerId: string | null
  ) => {
    if (!questionnaireId) return;
    const key = learnerId ? `${learnerId}-${evalType}` : `mass-${evalType}`;
    setSaving(key);

    try {
      const existing = getCurrentAssignment(evalType, learnerId);
      if (existing) {
        const { error: delErr } = await supabase
          .from("formation_evaluation_assignments")
          .delete()
          .eq("id", existing.id)
          .eq("session_id", formation.id);
        if (delErr) throw delErr;
      }

      const { error } = await supabase.from("formation_evaluation_assignments").insert({
        session_id: formation.id,
        questionnaire_id: questionnaireId,
        evaluation_type: evalType,
        learner_id: learnerId,
      });
      if (error) throw error;
      toast({ title: "Évaluation attribuée" });
      await onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible d'attribuer l'évaluation";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const toggleExpanded = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  // Compact eval row: label + select + button inline
  const renderEvalRow = (
    evalType: EvaluationType,
    label: string,
    learnerId: string | null
  ) => {
    const currentValue = learnerId
      ? learnerSelections[`${learnerId}-${evalType}`] || ""
      : massSelections[evalType] || "";
    const available = getQuestionnairesForType(evalType);
    const saveKey = learnerId ? `${learnerId}-${evalType}` : `mass-${evalType}`;
    const isSaving = saving === saveKey;
    const existing = getCurrentAssignment(evalType, learnerId);

    return (
      <div key={`${learnerId || "mass"}-${evalType}`} className="flex items-center gap-2 py-1.5">
        <span className="text-xs font-medium text-muted-foreground w-[130px] shrink-0 truncate" title={label}>
          {label}
        </span>
        {existing && (
          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full shrink-0 truncate max-w-[150px]" title={existing.questionnaire?.title}>
            {existing.questionnaire?.title || "Attribué"}
          </span>
        )}
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
          <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
            <SelectValue placeholder="Questionnaire..." />
          </SelectTrigger>
          <SelectContent>
            {available.map((q) => (
              <SelectItem key={q.id} value={q.id}>
                {q.title}
              </SelectItem>
            ))}
            {available.length === 0 && (
              <SelectItem value="_none" disabled>
                Aucun disponible
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="h-7 text-xs shrink-0"
          onClick={() => handleAssign(evalType, currentValue, learnerId)}
          disabled={!currentValue || isSaving}
        >
          {isSaving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          Attribuer
        </Button>
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
    <div className="space-y-4">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Évaluations
      </h3>

      {/* Attribution en masse */}
      <div className="border rounded-lg overflow-hidden">
        <div
          className="flex items-center justify-between px-4 py-2.5 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => toggleExpanded("mass")}
        >
          <div className="flex items-center gap-2">
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded.mass ? "" : "-rotate-90"}`} />
            <span className="text-sm font-medium">Attribution en masse</span>
            <span className="text-xs text-muted-foreground">tous les apprenants</span>
          </div>
        </div>
        {expanded.mass && (
          <div className="px-4 py-2 space-y-0.5">
            {EVAL_TYPES.map((et) => renderEvalRow(et.type, et.short, null))}
          </div>
        )}
      </div>

      {/* Par apprenant */}
      {enrollments.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Aucun apprenant inscrit.
        </p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          {enrollments.map((enrollment, index) => {
            const learner = enrollment.learner;
            if (!learner) return null;

            const learnerId = learner.id;
            const isExpanded = expanded[learnerId];
            const learnerAssignments = assignments.filter((a) => a.learner_id === learnerId);
            const massAssignments = assignments.filter((a) => a.learner_id === null);
            const allAssignments = [...massAssignments, ...learnerAssignments];

            return (
              <div key={enrollment.id} className={index > 0 ? "border-t" : ""}>
                <div
                  className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => toggleExpanded(learnerId)}
                >
                  <div className="flex items-center gap-2">
                    <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
                    <span className="text-sm font-medium">{learner.first_name} {learner.last_name}</span>
                    {allAssignments.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {allAssignments.length} attribuée{allAssignments.length > 1 ? "s" : ""}
                      </span>
                    )}
                    {allAssignments.length === 0 && (
                      <span className="text-xs text-muted-foreground italic">Aucune</span>
                    )}
                  </div>
                </div>
                {isExpanded && (
                  <div className="px-4 pb-3 space-y-1">
                    {/* Current assignments */}
                    {allAssignments.length > 0 && (
                      <div className="mb-2 space-y-0.5">
                        {allAssignments.map((a) => (
                          <div key={a.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                              {EVAL_TYPES.find((e) => e.type === a.evaluation_type)?.short || a.evaluation_type}
                            </span>
                            <span>{a.questionnaire?.title || "Questionnaire"}</span>
                            {a.learner_id === null && <span className="text-xs italic">(masse)</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {EVAL_TYPES.map((et) => renderEvalRow(et.type, et.short, learnerId))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
