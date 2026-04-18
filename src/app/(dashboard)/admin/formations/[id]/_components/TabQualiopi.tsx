"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { CheckCircle, XCircle, Loader2, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import type { Session } from "@/lib/types";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

interface QualiopiItem {
  id: string;
  label: string;
  category: "documents" | "evaluations" | "sous_traitance";
  type: "auto" | "auto_percent" | "manual";
  value: boolean;
  percent?: number;
  subLabel?: string;
}

export function TabQualiopi({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [manualChecks, setManualChecks] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [responseCounts, setResponseCounts] = useState<Record<string, { total: number; done: number }>>({});

  const docs = formation.formation_convention_documents || [];
  const evalAssignments = formation.formation_evaluation_assignments || [];
  const satisAssignments = formation.formation_satisfaction_assignments || [];
  const elearningAssignments = formation.formation_elearning_assignments || [];
  const enrollments = formation.enrollments || [];
  const isSubcontracted = formation.is_subcontracted === true;
  const learnerCount = enrollments.length || 1;

  // Load manual checks from formation notes/metadata
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("sessions")
        .select("notes")
        .eq("id", formation.id)
        .single();
      if (data?.notes) {
        try {
          const parsed = JSON.parse(data.notes);
          if (parsed.qualiopi_manual) {
            setManualChecks(parsed.qualiopi_manual);
          }
        } catch { /* notes is not JSON, ignore */ }
      }
      setLoading(false);
    })();
  }, [formation.id, supabase]);

  // Fetch response counts for evaluation assignments
  const fetchResponseCounts = useCallback(async () => {
    const counts: Record<string, { total: number; done: number }> = {};

    // Evaluation assignments
    const preFormation = evalAssignments.filter(a => a.evaluation_type === "eval_preformation");
    const postFormation = evalAssignments.filter(a => a.evaluation_type === "eval_postformation");

    for (const [key, assignments] of [
      ["eval_preformation", preFormation],
      ["eval_postformation", postFormation],
    ] as const) {
      const total = assignments.length > 0 ? learnerCount : 0;
      let done = 0;
      for (const a of assignments) {
        const { count } = await supabase
          .from("questionnaire_responses")
          .select("id", { count: "exact", head: true })
          .eq("questionnaire_id", a.questionnaire_id)
          .eq("session_id", formation.id);
        done += count || 0;
      }
      counts[key] = { total, done: Math.min(done, total) };
    }

    // Satisfaction assignments
    const satisTotal = satisAssignments.length > 0 ? learnerCount : 0;
    let satisDone = 0;
    for (const a of satisAssignments) {
      const { count } = await supabase
        .from("questionnaire_responses")
        .select("id", { count: "exact", head: true })
        .eq("questionnaire_id", a.questionnaire_id)
        .eq("session_id", formation.id);
      satisDone += count || 0;
    }
    counts["satisfaction"] = { total: satisTotal, done: Math.min(satisDone, satisTotal) };

    setResponseCounts(counts);
  }, [evalAssignments, satisAssignments, formation.id, learnerCount, supabase]);

  useEffect(() => {
    fetchResponseCounts();
  }, [fetchResponseCounts]);

  // Helper: check if any doc of a type matches a condition
  const hasDoc = (docType: string, condition: (d: typeof docs[0]) => boolean) =>
    docs.some(d => d.doc_type === docType && condition(d));

  const hasAnySigned = (docType: string) => hasDoc(docType, d => d.is_signed === true);
  const hasAnySent = (docType: string) => hasDoc(docType, d => d.is_sent === true);
  const allSent = (docType: string) => {
    const typeDocs = docs.filter(d => d.doc_type === docType);
    return typeDocs.length > 0 && typeDocs.every(d => d.is_sent === true);
  };

  const getPercent = (key: string): number => {
    const c = responseCounts[key];
    if (!c || c.total === 0) return 0;
    return Math.round((c.done / c.total) * 100);
  };

  // Build checklist items
  const items = useMemo<QualiopiItem[]>(() => {
    const list: QualiopiItem[] = [
      {
        id: "convention_signed",
        label: "Convention signée",
        category: "documents",
        type: "auto",
        value: hasAnySigned("convention_entreprise"),
      },
      {
        id: "convocation_sent",
        label: "Convocation envoyée",
        category: "documents",
        type: "auto",
        value: allSent("convocation"),
        subLabel: `${docs.filter(d => d.doc_type === "convocation" && d.is_sent).length}/${docs.filter(d => d.doc_type === "convocation").length}`,
      },
      {
        id: "convention_intervention_signed",
        label: "Contrat intervention formateur signé",
        category: "documents",
        type: "auto",
        value: hasAnySigned("convention_intervention"),
      },
      {
        id: "eval_preformation",
        label: "Questionnaire positionnement rempli",
        category: "evaluations",
        type: "auto_percent",
        value: getPercent("eval_preformation") === 100,
        percent: getPercent("eval_preformation"),
      },
      {
        id: "eval_postformation",
        label: "Questionnaire fin de formation rempli",
        category: "evaluations",
        type: "auto_percent",
        value: getPercent("eval_postformation") === 100,
        percent: getPercent("eval_postformation"),
      },
      {
        id: "satisfaction_learner",
        label: "Questionnaire satisfaction apprenant rempli",
        category: "evaluations",
        type: "auto_percent",
        value: getPercent("satisfaction") === 100,
        percent: getPercent("satisfaction"),
      },
      {
        id: "certificat_sent",
        label: "Certificat de réalisation envoyé",
        category: "documents",
        type: "auto",
        value: allSent("certificat_realisation"),
        subLabel: `${docs.filter(d => d.doc_type === "certificat_realisation" && d.is_sent).length}/${docs.filter(d => d.doc_type === "certificat_realisation").length}`,
      },
      {
        id: "support_cours",
        label: "Support de cours déposé",
        category: "documents",
        type: "auto",
        value: elearningAssignments.length > 0,
      },
    ];

    // Sous-traitance items
    if (isSubcontracted) {
      list.push(
        {
          id: "contrat_sous_traitance_sent",
          label: "Contrat sous-traitance envoyé",
          category: "sous_traitance",
          type: "auto",
          value: hasAnySent("contrat_sous_traitance"),
        },
        {
          id: "docs_formation_sent",
          label: "Documents formation envoyés au formateur",
          category: "sous_traitance",
          type: "auto",
          value: docs.filter(d => d.owner_type === "trainer" && d.is_sent).length > 0,
        },
        {
          id: "docs_post_formation_received",
          label: "Documents post-formation reçus",
          category: "sous_traitance",
          type: "manual",
          value: manualChecks["docs_post_formation_received"] || false,
        }
      );
    }

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, evalAssignments, satisAssignments, elearningAssignments, responseCounts, manualChecks, isSubcontracted]);

  // Calculate global score
  const score = useMemo(() => {
    if (items.length === 0) return 0;
    let totalWeight = 0;
    let achieved = 0;
    for (const item of items) {
      totalWeight += 1;
      if (item.type === "auto_percent") {
        achieved += (item.percent || 0) / 100;
      } else if (item.value) {
        achieved += 1;
      }
    }
    return Math.round((achieved / totalWeight) * 100);
  }, [items]);

  const scoreColor = score >= 67 ? "text-green-700 bg-green-100" : score >= 34 ? "text-amber-700 bg-amber-100" : "text-red-700 bg-red-100";
  const scoreBarColor = score >= 67 ? "bg-green-500" : score >= 34 ? "bg-amber-500" : "bg-red-500";

  // Persist score to DB for listing views
  useEffect(() => {
    if (loading || score === 0) return;
    supabase.from("sessions").update({ qualiopi_score: score }).eq("id", formation.id);
  }, [score, loading, formation.id, supabase]);

  // Toggle manual check
  const handleManualToggle = async (itemId: string, checked: boolean) => {
    const newChecks = { ...manualChecks, [itemId]: checked };
    setManualChecks(newChecks);

    try {
      // Read current notes, merge qualiopi_manual
      const { data: current } = await supabase
        .from("sessions")
        .select("notes")
        .eq("id", formation.id)
        .single();

      let notesObj: Record<string, unknown> = {};
      try { notesObj = JSON.parse(current?.notes || "{}"); } catch { /* ignore */ }
      notesObj.qualiopi_manual = newChecks;

      await supabase
        .from("sessions")
        .update({ notes: JSON.stringify(notesObj) })
        .eq("id", formation.id);
    } catch {
      toast({ title: "Erreur lors de la sauvegarde", variant: "destructive" });
    }
  };

  const renderDot = (item: QualiopiItem) => {
    if (item.type === "auto_percent") {
      const p = item.percent || 0;
      const color = p === 0 ? "bg-red-500" : p < 100 ? "bg-amber-500" : "bg-green-500";
      return <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} />;
    }
    return (
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${item.value ? "bg-green-500" : "bg-red-500"}`} />
    );
  };

  const renderBadge = (item: QualiopiItem) => {
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
    eval_preformation: "evaluations",
    eval_postformation: "evaluations",
    satisfaction_learner: "evaluations",
    certificat_sent: "documents",
    support_cours: "elearning",
    contrat_sous_traitance_sent: "documents",
    docs_formation_sent: "documents",
  };

  const goToTab = (tab: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.location.href = url.toString();
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
        <Badge className={`text-lg font-bold px-4 py-1.5 ${scoreColor}`}>
          {score}%
        </Badge>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${scoreBarColor}`}
          style={{ width: `${score}%` }}
        />
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
    </div>
  );
}

/**
 * Utility: compute Qualiopi score from formation data (for list views).
 * Returns 0-100.
 */
export function computeQualiopiScore(formation: Session): number {
  const docs = formation.formation_convention_documents || [];
  const evalAssignments = formation.formation_evaluation_assignments || [];
  const satisAssignments = formation.formation_satisfaction_assignments || [];
  const elearningAssignments = formation.formation_elearning_assignments || [];

  let total = 8; // base items count
  let achieved = 0;

  // Convention signed
  if (docs.some(d => d.doc_type === "convention_entreprise" && d.is_signed)) achieved++;
  // Convocations sent
  const convocs = docs.filter(d => d.doc_type === "convocation");
  if (convocs.length > 0 && convocs.every(d => d.is_sent)) achieved++;
  // Convention intervention signed
  if (docs.some(d => d.doc_type === "convention_intervention" && d.is_signed)) achieved++;
  // Eval preformation assigned
  if (evalAssignments.some(a => a.evaluation_type === "eval_preformation")) achieved += 0.5;
  // Eval postformation assigned
  if (evalAssignments.some(a => a.evaluation_type === "eval_postformation")) achieved += 0.5;
  // Satisfaction assigned
  if (satisAssignments.length > 0) achieved += 0.5;
  // Certificat sent
  const certs = docs.filter(d => d.doc_type === "certificat_realisation");
  if (certs.length > 0 && certs.every(d => d.is_sent)) achieved++;
  // Support cours
  if (elearningAssignments.length > 0) achieved++;

  return Math.round((achieved / total) * 100);
}
