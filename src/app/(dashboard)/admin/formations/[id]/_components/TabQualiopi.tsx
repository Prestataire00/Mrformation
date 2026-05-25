"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CheckCircle, XCircle, Loader2, Shield, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import type { Session } from "@/lib/types";
import {
  buildQualiopiItems,
  scoreFromItems,
  type QualiopiScoreItem,
} from "@/lib/services/qualiopi-score";
import { QualiopiSparkline } from "./QualiopiSparkline";
import { QualiopiHistoryDetail } from "./QualiopiHistoryDetail";

interface Props {
  formation: Session;
}

export function TabQualiopi({ formation }: Props) {
  // Manual checks : lus depuis formation.qualiopi_manual (nouvelle colonne BDD).
  // Plus de lecture/parsing de sessions.notes (champ partagé avec d'autres features).
  // Note de design : l'init lit la prop UNE fois (useState n'observe pas les
  // changements). C'est volontaire — le parent ne re-fetch pas la formation
  // après un toggle local, et utiliser useEffect pour synchroniser créerait
  // une race condition avec les updates optimistes. Si un jour le parent
  // se met à re-fetch sur fenêtre revisible/etc., voir le rollback dans
  // handleManualToggle pour ajuster.
  const [manualChecks, setManualChecks] = useState<Record<string, boolean>>(
    formation.qualiopi_manual ?? {},
  );
  const [loading, setLoading] = useState(true);
  const [responseCounts, setResponseCounts] = useState<Record<string, { total: number; done: number }>>({});

  const [historyOpen, setHistoryOpen] = useState(false);

  // Audit blanc IA
  const [auditRunning, setAuditRunning] = useState(false);
  const [auditResult, setAuditResult] = useState<{
    overall_verdict: string;
    findings: Array<{ critere: number; status: string; question: string; recommendation: string }>;
    action_plan: Array<{ title: string; priority: string; estimated_effort?: string }>;
  } | null>(null);

  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setLoading(false);
  }, []);

  // Fetch response counts for evaluation assignments
  const fetchResponseCounts = useCallback(async () => {
    const evalAssignments = formation.formation_evaluation_assignments || [];
    const satisAssignments = formation.formation_satisfaction_assignments || [];
    const enrollmentsCount = (formation.enrollments || []).length || 1;

    const preFormationIds = evalAssignments
      .filter(a => a.evaluation_type === "eval_preformation")
      .map(a => a.questionnaire_id) as string[];
    const postFormationIds = evalAssignments
      .filter(a => a.evaluation_type === "eval_postformation")
      .map(a => a.questionnaire_id) as string[];
    const satisfactionIds = satisAssignments
      .map(a => a.questionnaire_id) as string[];

    const allIds = [...preFormationIds, ...postFormationIds, ...satisfactionIds];
    if (allIds.length === 0) {
      setResponseCounts({});
      return;
    }

    // 1 seul round-trip Supabase via RPC count_responses_by_questionnaire.
    const { data: grouped, error } = await supabase.rpc("count_responses_by_questionnaire", {
      p_session_id: formation.id,
      p_questionnaire_ids: allIds,
    });
    if (error) {
      console.warn("[qualiopi] count_responses_by_questionnaire failed:", error.message);
      setResponseCounts({});
      return;
    }

    const countsByQId = new Map<string, number>(
      (grouped as Array<{ questionnaire_id: string; response_count: number }> | null ?? [])
        .map(r => [r.questionnaire_id, Number(r.response_count)]),
    );

    const sumFor = (ids: string[]) =>
      ids.reduce((s, qid) => s + (countsByQId.get(qid) ?? 0), 0);

    const counts: Record<string, { total: number; done: number }> = {
      eval_preformation: {
        total: preFormationIds.length > 0 ? enrollmentsCount : 0,
        done: Math.min(sumFor(preFormationIds), preFormationIds.length > 0 ? enrollmentsCount : 0),
      },
      eval_postformation: {
        total: postFormationIds.length > 0 ? enrollmentsCount : 0,
        done: Math.min(sumFor(postFormationIds), postFormationIds.length > 0 ? enrollmentsCount : 0),
      },
      satisfaction: {
        total: satisfactionIds.length > 0 ? enrollmentsCount : 0,
        done: Math.min(sumFor(satisfactionIds), satisfactionIds.length > 0 ? enrollmentsCount : 0),
      },
    };

    setResponseCounts(counts);
  }, [
    formation.id,
    formation.formation_evaluation_assignments,
    formation.formation_satisfaction_assignments,
    formation.enrollments,
    supabase,
  ]);

  useEffect(() => {
    fetchResponseCounts();
  }, [fetchResponseCounts]);

  // Délégation à la lib unique src/lib/services/qualiopi-score.ts
  const items: QualiopiScoreItem[] = useMemo(
    () => buildQualiopiItems(formation, { responseCounts, manualChecks }),
    [formation, responseCounts, manualChecks],
  );

  // Évite une seconde construction des items côté lib — on dérive du tableau déjà mémoïsé.
  const score: number = useMemo(
    () => scoreFromItems(items),
    [items],
  );

  const scoreColor = score >= 67 ? "text-green-700 bg-green-100" : score >= 34 ? "text-amber-700 bg-amber-100" : "text-red-700 bg-red-100";
  const scoreBarColor = score >= 67 ? "bg-green-500" : score >= 34 ? "bg-amber-500" : "bg-red-500";

  // Persiste qualiopi_score pour les listes formations. Awaited + error handling.
  // 0 est une valeur légitime (formation totalement vide) — on persiste aussi.
  useEffect(() => {
    if (loading) return;
    (async () => {
      const { error } = await supabase
        .from("sessions")
        .update({ qualiopi_score: score })
        .eq("id", formation.id);
      if (error) console.warn("[qualiopi] persist score failed:", error.message);
    })();
  }, [score, loading, formation.id, supabase]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleManualToggle = async (itemId: string, checked: boolean) => {
    // On capture la valeur précédente DE CE seul item pour pouvoir rollback
    // l'item concerné sans écraser d'autres toggles concurrents en vol.
    const previousValueForItem = manualChecks[itemId] ?? false;
    setManualChecks(curr => ({ ...curr, [itemId]: checked }));
    const { error } = await supabase
      .from("sessions")
      .update({ qualiopi_manual: { ...manualChecks, [itemId]: checked } })
      .eq("id", formation.id);
    if (error) {
      // Rollback fonctionnel : ne touche que l'item échoué, préserve les autres.
      setManualChecks(curr => ({ ...curr, [itemId]: previousValueForItem }));
      toast({
        title: "Échec de la sauvegarde",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const renderDot = (item: QualiopiScoreItem) => {
    if (item.type === "auto_percent") {
      const p = item.percent || 0;
      const color = p === 0 ? "bg-red-500" : p < 100 ? "bg-amber-500" : "bg-green-500";
      return <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} />;
    }
    return (
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${item.value ? "bg-green-500" : "bg-red-500"}`} />
    );
  };

  const renderBadge = (item: QualiopiScoreItem) => {
    if (item.type === "auto_percent") {
      const p = item.percent || 0;
      const color = p === 0 ? "bg-red-50 text-red-700" : p < 100 ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700";
      return <Badge variant="outline" className={`text-xs border-0 ${color}`}>{p}%</Badge>;
    }
    if (item.value) {
      return (
        <Badge variant="outline" className="text-xs border-0 bg-green-50 text-green-700 gap-1">
          <CheckCircle className="h-3 w-3" /> Oui
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-xs border-0 bg-red-50 text-red-700 gap-1">
        <XCircle className="h-3 w-3" /> Non
      </Badge>
    );
  };

  // Map items to target tabs for "Traiter" action
  const itemTabMap: Record<string, string> = {
    convention_signed: "documents",
    convocation_sent: "documents",
    convention_intervention_signed: "documents",
    eval_preformation: "questionnaires",
    eval_postformation: "questionnaires",
    satisfaction_learner: "questionnaires",
    certificat_sent: "documents",
    support_cours: "elearning",
    docs_formation_sent: "documents",
  };

  const goToTab = (tab: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set("tab", tab);
    router.replace(`${window.location.pathname}?${params.toString()}`);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const docItems = items.filter(i => i.category === "documents");
  const evalItems = items.filter(i => i.category === "evaluations");
  const subItems = items.filter(i => i.category === "sous_traitance");

  return (
    <div className="space-y-6">
      {/* Score global */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold">Conformité Qualiopi</h3>
            <p className="text-xs text-muted-foreground">{items.filter(i => i.value).length}/{items.length} critères validés</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <QualiopiSparkline sessionId={formation.id} />
          <button
            onClick={() => setHistoryOpen(true)}
            className="text-[11px] text-blue-600 hover:underline"
          >
            Voir l&apos;historique
          </button>
          <Badge className={`text-lg font-bold px-4 py-1.5 ${scoreColor}`}>{score}%</Badge>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${scoreBarColor}`}
          style={{ width: `${score}%` }}
        />
      </div>

      {/* ═══ AUDIT BLANC IA ═══ */}
      <div className="rounded-xl bg-gradient-to-br from-[#374151] to-[#1f2937] text-white p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Auditeur IA Qualiopi
            </h3>
            <p className="text-xs text-white/70 mt-1">
              Simulation d&apos;audit blanc pour identifier les écarts potentiels
            </p>
          </div>
          <Button
            onClick={async () => {
              // Annule un audit en cours si l'utilisateur reclique avant la fin
              abortRef.current?.abort();
              const ctrl = new AbortController();
              abortRef.current = ctrl;

              setAuditRunning(true);
              try {
                const res = await fetch("/api/ai/qualiopi-mock-audit", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ mode: "formation", session_id: formation.id }),
                  signal: ctrl.signal,
                });
                if (!res.ok) throw new Error("Audit échoué");
                const data = await res.json();
                setAuditResult(data);
                toast({ title: "Audit blanc terminé" });
              } catch (err) {
                if ((err as Error).name === "AbortError") return; // annulation volontaire, pas d'erreur
                toast({ title: "Erreur", description: "Audit IA échoué", variant: "destructive" });
              } finally {
                setAuditRunning(false);
              }
            }}
            disabled={auditRunning}
            variant="secondary"
            size="sm"
            className="bg-white text-gray-800 hover:bg-gray-100"
          >
            {auditRunning ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Analyse...</> : <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Lancer un audit blanc</>}
          </Button>
        </div>
        {auditResult && (
          <div className="bg-white/10 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Badge className={auditResult.overall_verdict === "conforme" ? "bg-green-500" : auditResult.overall_verdict === "ecarts_majeurs" ? "bg-red-500" : "bg-amber-500"}>
                {auditResult.overall_verdict === "conforme" ? "Conforme" : auditResult.overall_verdict === "ecarts_majeurs" ? "Écarts majeurs" : "À améliorer"}
              </Badge>
              <span className="text-xs text-white/60">
                {auditResult.findings.filter(f => f.status !== "conforme").length} point(s) d&apos;attention
              </span>
            </div>
            {auditResult.findings.filter(f => f.status !== "conforme").slice(0, 3).map((f, i) => (
              <div key={i} className="text-xs text-white/80">
                <span className="font-medium">C{f.critere}</span> — {f.question}
                {f.recommendation && <p className="text-white/60 mt-0.5">💡 {f.recommendation}</p>}
              </div>
            ))}
            {auditResult.action_plan.length > 0 && (
              <p className="text-xs text-white/60">{auditResult.action_plan.length} action(s) recommandée(s)</p>
            )}
          </div>
        )}
      </div>

      {/* Documents */}
      <div className="border rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-muted/30">
          <span className="text-sm font-medium">Documents & Conventions</span>
        </div>
        <div className="divide-y">
          {docItems.map((item) => (
            <div key={item.id} className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-3">
                {renderDot(item)}
                <span className="text-sm">{item.label}</span>
                {item.subLabel && <span className="text-xs text-muted-foreground">({item.subLabel})</span>}
                {!item.value && itemTabMap[item.id] && (
                  <button onClick={() => goToTab(itemTabMap[item.id])} className="text-[10px] text-blue-600 hover:underline">Traiter →</button>
                )}
              </div>
              {renderBadge(item)}
            </div>
          ))}
        </div>
      </div>

      {/* Evaluations */}
      <div className="border rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-muted/30">
          <span className="text-sm font-medium">Questionnaires & Evaluations</span>
        </div>
        <div className="divide-y">
          {evalItems.map((item) => (
            <div key={item.id} className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-3">
                {renderDot(item)}
                <span className="text-sm">{item.label}</span>
                {!item.value && itemTabMap[item.id] && (
                  <button onClick={() => goToTab(itemTabMap[item.id])} className="text-[10px] text-blue-600 hover:underline">Traiter →</button>
                )}
              </div>
              {renderBadge(item)}
            </div>
          ))}
        </div>
      </div>

      {/* Sous-traitance (conditional) */}
      {subItems.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/30">
            <span className="text-sm font-medium">Sous-traitance</span>
          </div>
          <div className="divide-y">
            {subItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-3">
                  {item.type === "manual" ? (
                    <Checkbox
                      checked={item.value}
                      onCheckedChange={(checked) => handleManualToggle(item.id, checked === true)}
                    />
                  ) : (
                    renderDot(item)
                  )}
                  <span className="text-sm">{item.label}</span>
                </div>
                {item.type !== "manual" && renderBadge(item)}
              </div>
            ))}
          </div>
        </div>
      )}

      <QualiopiHistoryDetail
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        sessionId={formation.id}
        formationTitle={formation.title ?? "Formation"}
        currentScore={score}
      />
    </div>
  );
}

