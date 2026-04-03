"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Smile, Trash2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
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

const LEARNER_SATISFACTION_TYPES: { type: SatisfactionType; label: string; short: string }[] = [
  { type: "satisfaction_chaud", label: "Satisfaction à chaud", short: "À chaud" },
  { type: "satisfaction_froid", label: "Satisfaction à froid", short: "À froid" },
  { type: "autres_quest", label: "Autres questionnaires", short: "Autres" },
];

export function TabSatisfaction({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [satisfactionScores, setSatisfactionScores] = useState<Record<string, number | null>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ learners: true });

  const assignments = formation.formation_satisfaction_assignments || [];
  const enrollments = formation.enrollments || [];
  const trainers = formation.formation_trainers || [];
  const companies = formation.formation_companies || [];
  const financiers = formation.formation_financiers || [];

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
    const sel: Record<string, string> = {};
    for (const a of assignments) {
      const key = makeKey(a.satisfaction_type, a.target_type, a.target_id);
      sel[key] = a.questionnaire_id;
    }
    setSelections(sel);
  }, [assignments]);

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
        if (a.target_id && a.target_type === "learner") {
          query.eq("learner_id", a.target_id);
        }
        const { data } = await query;
        if (data && data.length > 0) {
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

  const getQuestionnairesForType = (satType: SatisfactionType) =>
    questionnaires.filter(
      (q) => q.quality_indicator_type === satType || q.type === "satisfaction" || q.type === "survey"
    );

  const getAssignment = (satType: SatisfactionType, targetType: SatisfactionTargetType, targetId: string | null) =>
    assignments.find(
      (a) => a.satisfaction_type === satType && a.target_type === targetType && a.target_id === targetId
    );

  const handleAssign = async (
    satType: SatisfactionType,
    targetType: SatisfactionTargetType,
    targetId: string | null,
    questionnaireId: string
  ) => {
    if (!questionnaireId) return;
    const key = makeKey(satType, targetType, targetId);
    setSaving(key);
    try {
      const existing = getAssignment(satType, targetType, targetId);
      if (existing) {
        const { error: delErr } = await supabase
          .from("formation_satisfaction_assignments")
          .delete()
          .eq("id", existing.id)
          .eq("session_id", formation.id);
        if (delErr) throw delErr;
      }
      const { error } = await supabase.from("formation_satisfaction_assignments").insert({
        session_id: formation.id,
        questionnaire_id: questionnaireId,
        satisfaction_type: satType,
        target_type: targetType,
        target_id: targetId,
      });
      if (error) throw error;
      toast({ title: "Questionnaire attribué" });
      await onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible d'attribuer";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const handleRemove = async (assignmentId: string) => {
    setSaving(assignmentId);
    try {
      const { error } = await supabase
        .from("formation_satisfaction_assignments")
        .delete()
        .eq("id", assignmentId)
        .eq("session_id", formation.id);
      if (error) throw error;
      toast({ title: "Questionnaire supprimé" });
      await onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible de supprimer";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const getScoreDisplay = (a: FormationSatisfactionAssignment) => {
    const key = `${a.questionnaire_id}-${a.target_type}-${a.target_id || "mass"}`;
    return satisfactionScores[key] ?? null;
  };

  const toggleExpanded = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  // Compact satisfaction row
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
      <div key={key} className="flex items-center gap-2 py-1.5">
        <span className="text-xs font-medium text-muted-foreground w-[90px] shrink-0 truncate" title={label}>
          {label}
        </span>
        {existing && (
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full truncate max-w-[120px]" title={existing.questionnaire?.title}>
              {existing.questionnaire?.title || "Attribué"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-red-600"
              onClick={() => handleRemove(existing.id)}
              disabled={saving === existing.id}
            >
              {saving === existing.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            </Button>
          </div>
        )}
        <Select
          value={currentValue}
          onValueChange={(val) => setSelections((prev) => ({ ...prev, [key]: val }))}
        >
          <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
            <SelectValue placeholder="Questionnaire..." />
          </SelectTrigger>
          <SelectContent>
            {available.map((q) => (
              <SelectItem key={q.id} value={q.id}>{q.title}</SelectItem>
            ))}
            {available.length === 0 && (
              <SelectItem value="_none" disabled>Aucun disponible</SelectItem>
            )}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="h-7 text-xs shrink-0"
          onClick={() => handleAssign(satType, targetType, targetId, currentValue)}
          disabled={!currentValue || isSaving}
        >
          {isSaving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          Attribuer
        </Button>
      </div>
    );
  };

  // Satisfaction score synthesis
  const renderScoreBadge = (targetType: SatisfactionTargetType, targetId: string | null) => {
    const targetAssignments = assignments.filter(
      (a) => a.target_type === targetType && (a.target_id === targetId || (targetId === null && a.target_id === null))
    );
    if (targetAssignments.length === 0) return null;

    const scores = targetAssignments.map((a) => getScoreDisplay(a)).filter((s): s is number => s !== null);
    if (scores.length === 0) return null;

    const avgScore = Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);

    return (
      <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
        <Smile className="h-3 w-3" /> {avgScore}%
      </span>
    );
  };

  // Generic section renderer
  const renderSection = (
    sectionKey: string,
    title: string,
    items: { id: string; name: string; targetType: SatisfactionTargetType; satTypes: { type: SatisfactionType; label: string }[] }[],
    emptyText: string
  ) => {
    const isExpanded = expanded[sectionKey];
    return (
      <div className="border rounded-lg overflow-hidden">
        <div
          className="flex items-center justify-between px-4 py-2.5 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => toggleExpanded(sectionKey)}
        >
          <div className="flex items-center gap-2">
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
            <span className="text-sm font-medium">{title}</span>
            <span className="text-xs text-muted-foreground">({items.length})</span>
          </div>
        </div>
        {isExpanded && (
          <div className="divide-y">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground px-4 py-3 italic">{emptyText}</p>
            ) : (
              items.map((item) => (
                <div key={item.id} className="px-4 py-2.5 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{item.name}</span>
                    {renderScoreBadge(item.targetType, item.id)}
                  </div>
                  {item.satTypes.map((st) =>
                    renderSatRow(st.type, st.label, item.targetType, item.id)
                  )}
                </div>
              ))
            )}
          </div>
        )}
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
        Satisfaction & Qualité
      </h3>

      {/* Apprenants */}
      {renderSection(
        "learners",
        "Questionnaires apprenants",
        [
          // Mass attribution entry
          ...([{
            id: "__mass__",
            name: "Attribution en masse",
            targetType: "learner" as SatisfactionTargetType,
            satTypes: LEARNER_SATISFACTION_TYPES.map((st) => ({ type: st.type, label: st.short })),
          }]),
          // Per learner
          ...enrollments
            .filter((e) => e.learner)
            .map((e) => ({
              id: e.learner!.id,
              name: `${e.learner!.first_name} ${e.learner!.last_name}`,
              targetType: "learner" as SatisfactionTargetType,
              satTypes: LEARNER_SATISFACTION_TYPES.map((st) => ({ type: st.type, label: st.short })),
            })),
        ],
        "Aucun apprenant inscrit"
      )}

      {/* Formateurs */}
      {renderSection(
        "trainers",
        "Questionnaires formateurs",
        trainers
          .filter((ft) => ft.trainer)
          .map((ft) => ({
            id: ft.trainer!.id,
            name: `${ft.trainer!.first_name} ${ft.trainer!.last_name}`,
            targetType: "trainer" as SatisfactionTargetType,
            satTypes: [{ type: "quest_formateurs" as SatisfactionType, label: "Questionnaire" }],
          })),
        "Aucun formateur"
      )}

      {/* Manager */}
      {renderSection(
        "manager",
        "Questionnaire manager",
        formation.manager
          ? [{
              id: formation.manager_id!,
              name: `${formation.manager.first_name} ${formation.manager.last_name}`,
              targetType: "manager" as SatisfactionTargetType,
              satTypes: [{ type: "quest_managers" as SatisfactionType, label: "Questionnaire" }],
            }]
          : [],
        "Aucun manager attribué"
      )}

      {/* Financeurs */}
      {renderSection(
        "financiers",
        "Questionnaires financeurs",
        financiers.map((f) => ({
          id: f.id,
          name: f.name,
          targetType: "financier" as SatisfactionTargetType,
          satTypes: [{ type: "quest_financeurs" as SatisfactionType, label: "Questionnaire" }],
        })),
        "Aucun financeur"
      )}

      {/* Entreprises */}
      {renderSection(
        "companies",
        "Questionnaires entreprises",
        companies
          .filter((fc) => fc.client)
          .map((fc) => ({
            id: fc.client!.id,
            name: fc.client!.company_name,
            targetType: "company" as SatisfactionTargetType,
            satTypes: [{ type: "quest_entreprises" as SatisfactionType, label: "Questionnaire" }],
          })),
        "Aucune entreprise"
      )}
    </div>
  );
}
