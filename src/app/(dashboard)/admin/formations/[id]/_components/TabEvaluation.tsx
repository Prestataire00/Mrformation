"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, ChevronDown, Trash2, QrCode, Send, Users, ClipboardCheck, CheckCircle2, TrendingUp, Mail, BarChart3 } from "lucide-react";
import { StatusCell } from "@/components/formations/StatusCell";
import type { StatusType } from "@/components/formations/StatusCell";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
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
  const [gridView, setGridView] = useState(true);

  // QR Code dialog
  const [qrDialog, setQrDialog] = useState<{ open: boolean; url: string; title: string; qrDataUrl: string }>({ open: false, url: "", title: "", qrDataUrl: "" });
  // Email dialog
  const [emailDialog, setEmailDialog] = useState<{ open: boolean; email: string; subject: string; body: string }>({ open: false, email: "", subject: "", body: "" });
  const [sendingEmail, setSendingEmail] = useState(false);

  // Response counts per questionnaire
  const [responseCounts, setResponseCounts] = useState<Record<string, number>>({});
  const [responsesDialogOpen, setResponsesDialogOpen] = useState(false);
  const [responsesData, setResponsesData] = useState<Array<{ learner_name: string; responded: boolean; responded_at: string | null }>>([]);
  const [responsesTitle, setResponsesTitle] = useState("");

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

  // Fetch response counts per questionnaire
  useEffect(() => {
    const fetchCounts = async () => {
      const counts: Record<string, number> = {};
      for (const a of assignments) {
        const { count } = await supabase
          .from("questionnaire_responses")
          .select("id", { count: "exact", head: true })
          .eq("questionnaire_id", a.questionnaire_id)
          .eq("session_id", formation.id);
        counts[`${a.questionnaire_id}-${a.evaluation_type}`] = count || 0;
      }
      setResponseCounts(counts);
    };
    if (assignments.length > 0) fetchCounts();
  }, [assignments, formation.id, supabase]);

  // Show responses detail
  const handleShowResponses = async (questionnaireId: string, title: string) => {
    const learnerList = enrollments.filter(e => e.learner).map(e => ({
      id: e.learner!.id,
      name: `${e.learner!.first_name} ${e.learner!.last_name}`,
    }));
    const { data: responses } = await supabase
      .from("questionnaire_responses")
      .select("learner_id, created_at")
      .eq("questionnaire_id", questionnaireId)
      .eq("session_id", formation.id);
    const respondedMap = new Map((responses || []).map((r: { learner_id: string; created_at: string }) => [r.learner_id, r.created_at]));
    setResponsesData(learnerList.map(l => ({
      learner_name: l.name,
      responded: respondedMap.has(l.id),
      responded_at: respondedMap.get(l.id) || null,
    })));
    setResponsesTitle(title);
    setResponsesDialogOpen(true);
  };

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
      console.error("[handleAssign] error:", err);
      const message = err instanceof Error ? err.message : "Impossible d'attribuer l'évaluation";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const handleRemove = async (assignmentId: string) => {
    setSaving(assignmentId);
    try {
      const { error } = await supabase
        .from("formation_evaluation_assignments")
        .delete()
        .eq("id", assignmentId)
        .eq("session_id", formation.id);
      if (error) throw error;
      toast({ title: "Attribution supprimée" });
      await onRefresh();
    } catch (err: unknown) {
      console.error("[handleRemove] error:", err);
      const message = err instanceof Error ? err.message : "Impossible de supprimer";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const toggleExpanded = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  // ── Relaunch all non-respondents ──
  const handleRelaunchAll = async () => {
    const pendingLearners = enrollments.filter(e => {
      if (!e.learner?.email) return false;
      const hasAssignment = assignments.some(a => a.learner_id === e.learner!.id || a.learner_id === null);
      const responseCount = Object.entries(responseCounts).reduce((sum, [, c]) => sum + c, 0);
      return hasAssignment && responseCount === 0;
    });

    if (pendingLearners.length === 0) {
      toast({ title: "Aucun apprenant à relancer" });
      return;
    }

    if (!confirm(`Envoyer un rappel à ${pendingLearners.length} apprenant${pendingLearners.length > 1 ? "s" : ""} ?`)) return;

    setSaving("relaunch-all");
    try {
      const res = await fetch("/api/questionnaires/relaunch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: formation.id, learner_ids: pendingLearners.map(e => e.learner!.id) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Envoi échoué");
      toast({ title: "Rappels envoyés", description: `${data.sent} envoyé${data.sent > 1 ? "s" : ""}${data.failed > 0 ? `, ${data.failed} échec(s)` : ""}` });
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const buildQuestionnaireUrl = (questionnaireId: string) => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/learner/questionnaires/${questionnaireId}?session_id=${formation.id}`;
  };

  const handleShowQR = async (questionnaireId: string, title: string) => {
    const url = buildQuestionnaireUrl(questionnaireId);
    try {
      const qrDataUrl = await QRCode.toDataURL(url, { width: 256, margin: 2 });
      setQrDialog({ open: true, url, title, qrDataUrl });
    } catch {
      toast({ title: "Erreur de génération QR", variant: "destructive" });
    }
  };

  const handleSendQuestionnaireEmail = async () => {
    setSendingEmail(true);
    try {
      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailDialog.email,
          subject: emailDialog.subject,
          body: emailDialog.body,
          session_id: formation.id,
        }),
      });
      if (!res.ok) throw new Error("Envoi échoué");
      toast({ title: "Email envoyé" });
      setEmailDialog({ open: false, email: "", subject: "", body: "" });
    } catch {
      toast({ title: "Erreur d'envoi", variant: "destructive" });
    } finally {
      setSendingEmail(false);
    }
  };

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
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full truncate max-w-[150px]" title={existing.questionnaire?.title}>
              {existing.questionnaire?.title || "Attribué"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-blue-600"
              title="QR Code"
              onClick={() => handleShowQR(existing.questionnaire_id, existing.questionnaire?.title || "Questionnaire")}
            >
              <QrCode className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-green-600"
              title="Envoyer par email"
              onClick={() => {
                const url = buildQuestionnaireUrl(existing.questionnaire_id);
                setEmailDialog({
                  open: true,
                  email: "",
                  subject: `Questionnaire — ${formation.title}`,
                  body: `Bonjour,\n\nVeuillez remplir le questionnaire suivant :\n${url}\n\nCordialement,`,
                });
              }}
            >
              <Send className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-red-600"
              onClick={() => handleRemove(existing.id)}
              disabled={saving === existing.id}
            >
              {saving === existing.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            </Button>
            {/* Response count */}
            {(() => {
              const count = responseCounts[`${existing.questionnaire_id}-${evalType}`] || 0;
              const total = enrollments.length || 1;
              const pct = Math.round((count / total) * 100);
              const color = pct === 0 ? "text-red-600 bg-red-50" : pct < 100 ? "text-amber-600 bg-amber-50" : "text-green-600 bg-green-50";
              return (
                <button
                  onClick={() => handleShowResponses(existing.questionnaire_id, existing.questionnaire?.title || "Questionnaire")}
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${color} hover:opacity-80`}
                  title="Consulter les réponses"
                >
                  {pct}% ({count}/{total})
                </button>
              );
            })()}
          </div>
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

  // ── Grid helper: get status for a cell ──
  const getCellStatus = (evalType: EvaluationType, learnerId: string | null): StatusType => {
    const assignment = assignments.find(
      a => a.evaluation_type === evalType && a.learner_id === learnerId
    );
    if (!assignment) return "not_assigned";
    const count = responseCounts[`${assignment.questionnaire_id}-${evalType}`] || 0;
    if (count > 0) return "completed";
    return "assigned";
  };

  // ── Avatar color helper ──
  const getAvatarColor = (name: string) => {
    const colors = ["bg-blue-100 text-blue-700", "bg-purple-100 text-purple-700", "bg-pink-100 text-pink-700", "bg-amber-100 text-amber-700", "bg-emerald-100 text-emerald-700", "bg-indigo-100 text-indigo-700", "bg-rose-100 text-rose-700", "bg-teal-100 text-teal-700"];
    return colors[name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length];
  };

  // ── Hero metrics ──
  const totalLearners = enrollments.length;
  const totalAssigned = assignments.length;
  const totalResponded = Object.values(responseCounts).reduce((s, c) => s + c, 0);
  const completionRate = totalAssigned > 0 ? Math.round((totalResponded / (totalAssigned * totalLearners || 1)) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* ═══ HERO STATS ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-500" />
            <div>
              <p className="text-xl font-bold">{totalLearners}</p>
              <p className="text-xs text-muted-foreground">Apprenants</p>
            </div>
          </div>
        </div>
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-purple-500" />
            <div>
              <p className="text-xl font-bold">{questionnaires.length}</p>
              <p className="text-xs text-muted-foreground">Questionnaires</p>
            </div>
          </div>
        </div>
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <div>
              <p className="text-xl font-bold">{completionRate}%</p>
              <p className="text-xs text-muted-foreground">Taux réponse</p>
            </div>
          </div>
        </div>
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-amber-500" />
            <div>
              <p className="text-xl font-bold">{totalResponded}</p>
              <p className="text-xs text-muted-foreground">Réponses</p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ TOGGLE + ACTIONS ═══ */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant={gridView ? "default" : "ghost"} className="text-xs h-7" onClick={() => setGridView(true)}>
          Grille
        </Button>
        <Button size="sm" variant={!gridView ? "default" : "ghost"} className="text-xs h-7" onClick={() => setGridView(false)}>
          Détail
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={handleRelaunchAll} disabled={saving === "relaunch-all"}>
          {saving === "relaunch-all" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />} Relancer les non-répondus
        </Button>
      </div>

      {/* ═══ VUE GRILLE ═══ */}
      {gridView && enrollments.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b">
                  <th className="text-left px-4 py-2.5 font-medium text-xs uppercase text-muted-foreground sticky left-0 bg-muted/30 min-w-[160px]">
                    Apprenant
                  </th>
                  {EVAL_TYPES.map(et => (
                    <th key={et.type} className="text-center px-2 py-2.5 font-medium text-[10px] uppercase text-gray-500 whitespace-nowrap">
                      {et.short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {enrollments.map((enrollment, idx) => {
                  const learner = enrollment.learner;
                  if (!learner) return null;
                  const fullName = `${learner.first_name} ${learner.last_name}`;
                  return (
                    <tr key={enrollment.id} className={cn("border-b last:border-b-0 hover:bg-muted/10", idx % 2 === 1 && "bg-gray-50/30")}>
                      <td className="px-4 py-2.5 sticky left-0" style={{ background: idx % 2 === 1 ? "#f9fafb" : "#fff" }}>
                        <div className="flex items-center gap-2">
                          <div className={cn("h-7 w-7 rounded-md flex items-center justify-center text-[10px] font-semibold shrink-0", getAvatarColor(fullName))}>
                            {learner.first_name?.charAt(0)}{learner.last_name?.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{fullName}</p>
                            {learner.email && <p className="text-[11px] text-muted-foreground truncate">{learner.email}</p>}
                          </div>
                        </div>
                      </td>
                      {EVAL_TYPES.map(et => {
                        const status = getCellStatus(et.type, learner.id);
                        const count = responseCounts[`${assignments.find(a => a.evaluation_type === et.type && a.learner_id === learner.id)?.questionnaire_id}-${et.type}`] || 0;
                        return (
                          <td key={et.type} className="text-center px-2 py-2">
                            <StatusCell
                              status={status}
                              size="sm"
                              score={status === "completed" && count > 0 ? undefined : undefined}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t bg-gray-50/50 flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><StatusCell status="completed" size="sm" /> Répondu</span>
            <span className="flex items-center gap-1"><StatusCell status="assigned" size="sm" /> En attente</span>
            <span className="flex items-center gap-1"><StatusCell status="not_assigned" size="sm" /> Non attribué</span>
          </div>
        </div>
      )}

      {/* ═══ VUE DÉTAIL (existante) ═══ */}
      {!gridView && (
      <>

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
      </>
      )}

      {/* Responses Dialog */}
      <Dialog open={responsesDialogOpen} onOpenChange={setResponsesDialogOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Réponses — {responsesTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 py-2">
            {responsesData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucun apprenant inscrit</p>
            ) : (
              responsesData.map((r, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-b-0">
                  <span className="text-sm">{r.learner_name}</span>
                  {r.responded ? (
                    <span className="text-xs text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full">
                      Répondu {r.responded_at ? `le ${new Date(r.responded_at).toLocaleDateString("fr-FR")}` : ""}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">Non répondu</span>
                  )}
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResponsesDialogOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={qrDialog.open} onOpenChange={(o) => setQrDialog(prev => ({ ...prev, open: o }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>QR Code — {qrDialog.title}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            {qrDialog.qrDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDialog.qrDataUrl} alt="QR Code" className="w-64 h-64" />
            )}
            <p className="text-xs text-muted-foreground break-all text-center select-all">{qrDialog.url}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => {
                navigator.clipboard.writeText(qrDialog.url);
                toast({ title: "Lien copié" });
              }}>
                Copier le lien
              </Button>
              <Button size="sm" variant="outline" onClick={() => {
                const a = document.createElement("a");
                a.href = qrDialog.qrDataUrl;
                a.download = `qr-${qrDialog.title}.png`;
                a.click();
              }}>
                Télécharger
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Email Dialog */}
      <Dialog open={emailDialog.open} onOpenChange={(o) => setEmailDialog(prev => ({ ...prev, open: o }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Envoyer le questionnaire</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Email *</label>
              <Input value={emailDialog.email} onChange={(e) => setEmailDialog(prev => ({ ...prev, email: e.target.value }))} type="email" placeholder="email@exemple.com" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Sujet</label>
              <Input value={emailDialog.subject} onChange={(e) => setEmailDialog(prev => ({ ...prev, subject: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Message</label>
              <textarea
                className="w-full border rounded-md p-2 text-sm resize-none"
                rows={4}
                value={emailDialog.body}
                onChange={(e) => setEmailDialog(prev => ({ ...prev, body: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialog(prev => ({ ...prev, open: false }))}>Annuler</Button>
            <Button onClick={handleSendQuestionnaireEmail} disabled={sendingEmail || !emailDialog.email.trim()}>
              {sendingEmail && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
