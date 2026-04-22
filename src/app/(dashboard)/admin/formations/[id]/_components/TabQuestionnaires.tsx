"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ClipboardList, Target, Clock, TrendingUp, CheckCircle2,
  AlertCircle, Plus, ChevronRight, Mail, Eye, X, Loader2, BarChart3, Pencil, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import type { Session } from "@/lib/types";
import { AdminFillQuestionnaireDialog } from "@/components/questionnaires/AdminFillQuestionnaireDialog";

interface Props { formation: Session; onRefresh: () => Promise<void>; }

type StageColor = "blue" | "amber" | "emerald" | "purple";
interface ItemType { category: "evaluation" | "satisfaction"; type: string; label: string; icon: string; description: string; target: "learner" | "company"; }
interface Stage { id: string; order: number; icon: typeof Target; title: string; timing: string; objective: string; color: StageColor; itemTypes: ItemType[]; }

const STAGES: Stage[] = [
  { id: "before", order: 1, icon: Target, title: "Avant la formation", timing: "7 jours avant", objective: "Connaître le niveau et les attentes des apprenants", color: "blue",
    itemTypes: [
      { category: "evaluation", type: "eval_preformation", label: "Questionnaire de positionnement", icon: "📋", description: "Diagnostique le niveau de départ", target: "learner" },
      { category: "evaluation", type: "auto_eval_pre", label: "Auto-évaluation pré-formation", icon: "💭", description: "L'apprenant s'auto-évalue sur les compétences visées", target: "learner" },
    ],
  },
  { id: "during", order: 2, icon: Clock, title: "Pendant la formation", timing: "À mi-parcours", objective: "Ajuster la pédagogie en temps réel", color: "amber",
    itemTypes: [
      { category: "evaluation", type: "eval_pendant", label: "Évaluation intermédiaire", icon: "📋", description: "Vérifie la compréhension et détecte les points à renforcer", target: "learner" },
    ],
  },
  { id: "after", order: 3, icon: CheckCircle2, title: "Fin de la formation", timing: "Le dernier jour", objective: "Valider les acquis et mesurer la satisfaction à chaud", color: "emerald",
    itemTypes: [
      { category: "evaluation", type: "eval_postformation", label: "Évaluation des acquis", icon: "📋", description: "Mesure ce que les apprenants ont appris", target: "learner" },
      { category: "evaluation", type: "auto_eval_post", label: "Auto-évaluation post-formation", icon: "💭", description: "L'apprenant s'auto-évalue sur ce qu'il a appris", target: "learner" },
      { category: "satisfaction", type: "satisfaction_chaud", label: "Satisfaction à chaud", icon: "😊", description: "Ressenti immédiat sur la formation", target: "learner" },
    ],
  },
  { id: "follow_up", order: 4, icon: TrendingUp, title: "30 jours après", timing: "Envoi automatique J+30", objective: "Mesurer l'impact concret sur le terrain", color: "purple",
    itemTypes: [
      { category: "satisfaction", type: "satisfaction_froid", label: "Satisfaction à froid", icon: "😊", description: "Recul de l'apprenant sur l'impact de la formation", target: "learner" },
      { category: "satisfaction", type: "satisfaction_entreprise", label: "Satisfaction entreprise", icon: "🏢", description: "Retour du manager sur la mise en pratique", target: "company" },
    ],
  },
];

const SC: Record<StageColor, Record<string, string>> = {
  blue: { border: "border-blue-200", bg: "bg-blue-50", text: "text-blue-700", num: "bg-blue-600 text-white" },
  amber: { border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-700", num: "bg-amber-600 text-white" },
  emerald: { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700", num: "bg-emerald-600 text-white" },
  purple: { border: "border-purple-200", bg: "bg-purple-50", text: "text-purple-700", num: "bg-purple-600 text-white" },
};

export function TabQuestionnaires({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [questionnaires, setQuestionnaires] = useState<Array<{ id: string; title: string; type: string; questions?: unknown[] }>>([]);
  const [evalAssignments, setEvalAssignments] = useState<Array<Record<string, unknown>>>([]);
  const [satisAssignments, setSatisAssignments] = useState<Array<Record<string, unknown>>>([]);
  const [responses, setResponses] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [detailItem, setDetailItem] = useState<{ stage: Stage; item: ItemType } | null>(null);

  const enrollments = (formation.enrollments || []).filter(e => e.learner);
  const companies = formation.formation_companies || [];

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [qR, eR, sR, rR] = await Promise.all([
      supabase.from("questionnaires").select("id, title, type").eq("entity_id", formation.entity_id).eq("is_active", true).order("title"),
      supabase.from("formation_evaluation_assignments").select("*, questionnaire:questionnaires(title)").eq("session_id", formation.id),
      supabase.from("formation_satisfaction_assignments").select("*, questionnaire:questionnaires(title)").eq("session_id", formation.id),
      supabase.from("questionnaire_responses").select("id, questionnaire_id, learner_id").eq("session_id", formation.id),
    ]);
    if (qR.data) setQuestionnaires(qR.data);
    if (eR.data) setEvalAssignments(eR.data);
    if (sR.data) setSatisAssignments(sR.data);
    if (rR.data) setResponses(rR.data);
    setLoading(false);
  }, [formation.id, formation.entity_id, supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getAssignments = (item: ItemType) =>
    item.category === "evaluation"
      ? evalAssignments.filter(a => a.evaluation_type === item.type)
      : satisAssignments.filter(a => (a as Record<string, unknown>).satisfaction_type === item.type);

  const getStats = (item: ItemType) => {
    const assignments = getAssignments(item);
    if (!assignments.length) return { configured: false, responded: 0, total: 0 };
    const total = item.target === "learner" ? enrollments.length : companies.length;
    const responded = assignments.reduce((s, a) => s + responses.filter(r => r.questionnaire_id === a.questionnaire_id).length, 0);
    return { configured: true, responded: Math.min(responded, total), total };
  };

  const totalSlots = STAGES.reduce((s, st) => s + st.itemTypes.length, 0);
  const totalConfigured = STAGES.reduce((s, st) => s + st.itemTypes.filter(it => getStats(it).configured).length, 0);

  if (loading) return <div className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>;

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-[#374151] to-[#1f2937] text-white p-6">
        <h2 className="text-xl font-bold mb-1 flex items-center gap-2"><ClipboardList className="h-5 w-5" /> Parcours questionnaires</h2>
        <p className="text-sm text-white/80 max-w-2xl">Tous les questionnaires organisés dans l&apos;ordre chronologique. Configurez une fois, les envois sont automatiques.</p>
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-white/10 rounded-lg p-3"><p className="text-[11px] text-white/60 uppercase">Configurés</p><p className="text-2xl font-bold mt-1">{totalConfigured}<span className="text-sm text-white/60">/{totalSlots}</span></p></div>
          <div className="bg-white/10 rounded-lg p-3"><p className="text-[11px] text-white/60 uppercase">Réponses</p><p className="text-2xl font-bold mt-1">{responses.length}</p></div>
          <div className="bg-white/10 rounded-lg p-3"><p className="text-[11px] text-white/60 uppercase">Complétion</p><p className="text-2xl font-bold mt-1">{totalSlots > 0 ? Math.round((totalConfigured / totalSlots) * 100) : 0}%</p></div>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-4">
        {STAGES.map((stage, idx) => {
          const c = SC[stage.color];
          const Icon = stage.icon;
          return (
            <div key={stage.id} className="relative">
              {idx < STAGES.length - 1 && <div className={cn("absolute left-[22px] top-14 bottom-0 w-0.5 -mb-4", c.bg)} />}
              <div className={cn("rounded-xl border-2 bg-white", c.border)}>
                <div className="flex items-start gap-4 p-4 pb-3">
                  <div className={cn("w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm shrink-0 shadow-sm", c.num)}>{stage.order}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-bold text-base text-gray-900">{stage.title}</h3>
                      <Badge variant="outline" className={cn("text-[10px]", c.bg, c.text, c.border)}><Clock className="h-2.5 w-2.5 mr-1" />{stage.timing}</Badge>
                    </div>
                    <p className="text-xs text-gray-600"><Target className="h-3 w-3 inline mr-1 text-gray-400" /><strong>Objectif :</strong> {stage.objective}</p>
                  </div>
                </div>
                <div className="border-t bg-gray-50/50 divide-y">
                  {stage.itemTypes.map(item => {
                    const stats = getStats(item);
                    return (
                      <button key={`${item.category}-${item.type}`} onClick={() => setDetailItem({ stage, item })} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white transition text-left group">
                        <span className="text-2xl shrink-0">{item.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{item.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {stats.configured ? (
                            <>
                              <div className={cn("flex items-center justify-center w-10 h-10 rounded-full text-xs font-bold border-2",
                                stats.total > 0 && stats.responded === stats.total ? "border-emerald-500 text-emerald-700 bg-emerald-50" :
                                stats.responded > 0 ? "border-blue-500 text-blue-700 bg-blue-50" : "border-amber-400 text-amber-700 bg-amber-50"
                              )}>
                                {stats.total > 0 ? Math.round((stats.responded / stats.total) * 100) : 0}%
                              </div>
                              <div className="text-right"><p className="text-xs font-semibold text-gray-700">{stats.responded}/{stats.total}</p><p className="text-[10px] text-muted-foreground">réponses</p></div>
                            </>
                          ) : (
                            <Badge variant="outline" className="text-[10px] bg-gray-50 text-gray-500"><Plus className="h-2.5 w-2.5 mr-0.5" />À configurer</Badge>
                          )}
                          <ChevronRight className="h-4 w-4 text-gray-400 group-hover:translate-x-0.5 transition" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Side panel */}
      <Dialog open={!!detailItem} onOpenChange={(o: boolean) => !o && setDetailItem(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          {detailItem && <ItemDetail stage={detailItem.stage} item={detailItem.item} formation={formation} questionnaires={questionnaires} assignments={getAssignments(detailItem.item)} enrollments={enrollments} companies={companies} responses={responses} supabase={supabase} toast={toast} onRefresh={async () => { await fetchData(); await onRefresh(); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══ Side panel detail ═══
function ItemDetail({ stage, item, formation, questionnaires, assignments, enrollments, companies, responses, supabase, toast, onRefresh }: Record<string, unknown> & { stage: Stage; item: ItemType }) {
  const [selectedQId, setSelectedQId] = useState("");
  const [saving, setSaving] = useState(false);
  const [adminFillTarget, setAdminFillTarget] = useState<{ learnerId: string; learnerName: string } | null>(null);
  const sb = supabase as ReturnType<typeof createClient>;
  const t = toast as (p: Record<string, unknown>) => void;
  const current = (assignments as Array<Record<string, unknown>>)[0];
  const enr = enrollments as Array<Record<string, unknown>>;
  const comp = companies as Array<Record<string, unknown>>;
  const resp = responses as Array<Record<string, unknown>>;
  const qs = questionnaires as Array<{ id: string; title: string; type: string }>;
  const fm = formation as Session;
  const available = qs.filter(q => q.type === "evaluation" || q.type === "survey" || q.type === item.category);
  const total = item.target === "learner" ? enr.length : comp.length;
  const responded = current ? resp.filter(r => r.questionnaire_id === current.questionnaire_id).length : 0;

  const handleAssign = async () => {
    if (!selectedQId) return;
    setSaving(true);
    try {
      const table = item.category === "evaluation" ? "formation_evaluation_assignments" : "formation_satisfaction_assignments";
      if (current) await sb.from(table).delete().eq("id", current.id);
      const ins: Record<string, unknown> = { session_id: fm.id, questionnaire_id: selectedQId };
      if (item.category === "evaluation") { ins.evaluation_type = item.type; ins.learner_id = null; }
      else { ins.satisfaction_type = item.type; ins.target_type = item.target || "learner"; }
      const { error } = await sb.from(table).insert(ins);
      if (error) throw error;
      t({ title: "Questionnaire attribué" });
      await (onRefresh as () => Promise<void>)();
    } catch (err: unknown) { t({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleRemove = async () => {
    if (!current) return;
    setSaving(true);
    const table = item.category === "evaluation" ? "formation_evaluation_assignments" : "formation_satisfaction_assignments";
    await sb.from(table).delete().eq("id", current.id);
    t({ title: "Questionnaire retiré" });
    await (onRefresh as () => Promise<void>)();
    setSaving(false);
  };

  return (
    <>
      <DialogHeader className="pb-4 border-b">
        <p className="text-xs text-muted-foreground uppercase">Étape {stage.order} — {stage.title}</p>
        <DialogTitle className="flex items-center gap-2"><span className="text-2xl">{item.icon}</span>{item.label}</DialogTitle>
        <p className="text-sm text-muted-foreground">{item.description}</p>
      </DialogHeader>
      <div className="space-y-5 py-4">
        {current ? (
          <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 mb-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><p className="font-semibold text-sm text-emerald-900">Attribué : {(current.questionnaire as Record<string, string>)?.title}</p></div>
            <div className="grid grid-cols-3 gap-2 text-center pt-3 border-t border-emerald-200">
              <div><p className="text-lg font-bold text-emerald-900">{total}</p><p className="text-[10px] text-emerald-700 uppercase">Attribués</p></div>
              <div><p className="text-lg font-bold text-emerald-900">{responded}</p><p className="text-[10px] text-emerald-700 uppercase">Répondus</p></div>
              <div><p className="text-lg font-bold text-emerald-900">{total > 0 ? Math.round((responded / total) * 100) : 0}%</p><p className="text-[10px] text-emerald-700 uppercase">Complétion</p></div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border-2 border-dashed border-gray-300 p-4 text-center">
            <AlertCircle className="h-6 w-6 text-gray-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-700">Aucun questionnaire attribué</p>
          </div>
        )}
        <div className="space-y-2">
          <h4 className="font-semibold text-sm">{current ? "Changer" : "Attribuer"}</h4>
          <div className="flex gap-2">
            <Select value={selectedQId} onValueChange={setSelectedQId}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="Choisir..." /></SelectTrigger>
              <SelectContent>{available.map(q => <SelectItem key={q.id} value={q.id}>{q.title}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={handleAssign} disabled={!selectedQId || saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Attribuer"}</Button>
          </div>
        </div>
        {current && (
          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-start" onClick={async () => {
              try {
                const pending = enr.filter(e => !resp.some(r => r.questionnaire_id === current.questionnaire_id && r.learner_id === (e as Record<string, unknown>).learner_id));
                if (!pending.length) { t({ title: "Tous ont répondu" }); return; }
                const res = await fetch("/api/questionnaires/relaunch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: fm.id, learner_ids: pending.map(e => ((e as Record<string, unknown>).learner as Record<string, string>)?.id).filter(Boolean) }) });
                if (!res.ok) throw new Error("Envoi échoué");
                const d = await res.json();
                t({ title: "Rappels envoyés", description: `${d.sent} envoyé(s)` });
              } catch { t({ title: "Erreur", variant: "destructive" }); }
            }}><Mail className="h-4 w-4 mr-2" />Relancer les non-répondants</Button>
            <Button variant="outline" className="w-full justify-start text-red-600 hover:bg-red-50" onClick={handleRemove} disabled={saving}><X className="h-4 w-4 mr-2" />Retirer</Button>
          </div>
        )}

        {/* Liste apprenants avec saisie admin */}
        {current && enr.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Réponses par apprenant</h4>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {enr.map((enrollment) => {
                const learner = (enrollment as Record<string, unknown>).learner as { id: string; first_name: string; last_name: string } | null;
                if (!learner) return null;
                const hasResponded = resp.some(r => r.questionnaire_id === current.questionnaire_id && r.learner_id === learner.id);
                const adminFilled = resp.find(r => r.questionnaire_id === current.questionnaire_id && r.learner_id === learner.id && (r as Record<string, unknown>).fill_mode && (r as Record<string, unknown>).fill_mode !== "learner");
                const learnerName = `${learner.last_name?.toUpperCase()} ${learner.first_name}`;

                return (
                  <div key={learner.id} className="flex items-center justify-between p-2 rounded border text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm truncate">{learnerName}</span>
                      {hasResponded ? (
                        <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 shrink-0">Répondu</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] shrink-0">En attente</Badge>
                      )}
                      {adminFilled && (
                        <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700 border-orange-200 shrink-0">
                          <ShieldAlert className="h-2.5 w-2.5 mr-0.5" />
                          Saisie admin
                        </Badge>
                      )}
                    </div>
                    {!hasResponded && (
                      <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 shrink-0"
                        onClick={() => setAdminFillTarget({ learnerId: learner.id, learnerName })}>
                        <Pencil className="h-3 w-3" /> Saisir
                      </Button>
                    )}
                    {adminFilled && (
                      <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 shrink-0"
                        onClick={() => setAdminFillTarget({ learnerId: learner.id, learnerName })}>
                        <Pencil className="h-3 w-3" /> Modifier
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Admin fill dialog */}
      {adminFillTarget && current && (
        <AdminFillQuestionnaireDialog
          open={!!adminFillTarget}
          onClose={() => setAdminFillTarget(null)}
          questionnaireId={current.questionnaire_id as string}
          learnerId={adminFillTarget.learnerId}
          learnerName={adminFillTarget.learnerName}
          sessionId={fm.id}
          onSuccess={async () => { setAdminFillTarget(null); await (onRefresh as () => Promise<void>)(); }}
        />
      )}
    </>
  );
}
