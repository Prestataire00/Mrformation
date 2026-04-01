"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import {
  Loader2, Link2, Send, ExternalLink, Mail, Plus, Copy, ChevronDown, ChevronRight, BarChart3, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

interface QQuestion {
  id: string;
  text: string;
  type: string;
  is_required: boolean;
  order_index: number;
}

interface QItem {
  id: string;
  title: string;
  type: string;
  is_active: boolean;
  quality_indicator_type: string | null;
  questions: QQuestion[];
  questions_count: number;
  response_count: number;
  enrolled_count: number;
  assigned_sessions: string[];
}

interface SessionItem {
  id: string;
  title: string;
  start_date: string | null;
}

interface LearnerItem {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  client_id: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  satisfaction: "Satisfaction",
  evaluation: "Évaluation",
  survey: "Enquête",
};

const TYPE_COLORS: Record<string, string> = {
  satisfaction: "bg-green-100 text-green-700",
  evaluation: "bg-blue-100 text-blue-700",
  survey: "bg-violet-100 text-violet-700",
};

const QUESTION_TYPE_LABELS: Record<string, string> = {
  rating: "Note 1-5",
  text: "Texte libre",
  multiple_choice: "Choix multiple",
  yes_no: "Oui/Non",
};

const DEFAULT_EMAIL_BODY = (name: string, link: string) =>
  `Bonjour ${name},\n\nNous vous invitons à remplir le questionnaire suivant :\n\n${link}\n\nMerci,\nL'équipe formation`;

export default function FormulairesPage() {
  const supabase = createClient();
  const { entityId } = useEntity();
  const { toast } = useToast();
  const router = useRouter();

  const [questionnaires, setQuestionnaires] = useState<QItem[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Auto-send links
  interface AutoSendLink {
    questionnaire_id: string;
    questionnaire_title: string;
    session_id: string;
    session_title: string;
    session_end_date: string | null;
    auto_send: boolean;
  }
  const [autoSendLinks, setAutoSendLinks] = useState<AutoSendLink[]>([]);
  const [triggeringAutoSend, setTriggeringAutoSend] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Quick create
  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createType, setCreateType] = useState("satisfaction");
  const [creating, setCreating] = useState(false);

  // Assign dialog
  const [assignDialog, setAssignDialog] = useState(false);
  const [assignQ, setAssignQ] = useState<QItem | null>(null);
  const [assignSessionId, setAssignSessionId] = useState("");
  const [autoSend, setAutoSend] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // Send dialog
  const [sendDialog, setSendDialog] = useState(false);
  const [sendQ, setSendQ] = useState<QItem | null>(null);
  const [sendSessionId, setSendSessionId] = useState("");
  const [segmentation, setSegmentation] = useState<"all" | "company" | "individual">("all");
  const [selectedLearnerId, setSelectedLearnerId] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [sessionLearners, setSessionLearners] = useState<LearnerItem[]>([]);
  const [loadingLearners, setLoadingLearners] = useState(false);
  const [sending, setSending] = useState(false);
  const [emailBody, setEmailBody] = useState("");

  const fetchData = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);

    const [qRes, sRes, qsRes, rRes] = await Promise.all([
      supabase
        .from("questionnaires")
        .select("id, title, type, is_active, quality_indicator_type, questions(id, text, type, is_required, order_index)")
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false }),
      supabase
        .from("sessions")
        .select("id, title, start_date")
        .eq("entity_id", entityId)
        .order("start_date", { ascending: false }),
      supabase
        .from("questionnaire_sessions")
        .select("questionnaire_id, session_id, auto_send_on_completion, session:sessions(id, title, end_date)"),
      supabase
        .from("questionnaire_responses")
        .select("questionnaire_id"),
    ]);

    // Build response counts
    const responseCounts: Record<string, number> = {};
    (rRes.data ?? []).forEach((r: any) => {
      responseCounts[r.questionnaire_id] = (responseCounts[r.questionnaire_id] || 0) + 1;
    });

    // Build assigned sessions + auto-send links
    const assignedMap: Record<string, string[]> = {};
    const autoLinks: AutoSendLink[] = [];
    (qsRes.data ?? []).forEach((qs: any) => {
      const session = qs.session as any;
      const title = session?.title;
      if (title) {
        if (!assignedMap[qs.questionnaire_id]) assignedMap[qs.questionnaire_id] = [];
        assignedMap[qs.questionnaire_id].push(title);
      }
      if (qs.auto_send_on_completion && session) {
        const qTitle = (qRes.data ?? []).find((q: any) => q.id === qs.questionnaire_id)?.title ?? "";
        autoLinks.push({
          questionnaire_id: qs.questionnaire_id,
          questionnaire_title: qTitle,
          session_id: qs.session_id,
          session_title: title || "",
          session_end_date: session.end_date,
          auto_send: true,
        });
      }
    });
    setAutoSendLinks(autoLinks);

    setQuestionnaires(
      (qRes.data ?? []).map((q: any) => ({
        id: q.id,
        title: q.title,
        type: q.type,
        is_active: q.is_active,
        quality_indicator_type: q.quality_indicator_type,
        questions: (q.questions ?? []).sort((a: QQuestion, b: QQuestion) => a.order_index - b.order_index),
        questions_count: Array.isArray(q.questions) ? q.questions.length : 0,
        response_count: responseCounts[q.id] || 0,
        enrolled_count: 0,
        assigned_sessions: assignedMap[q.id] || [],
      }))
    );
    setSessions((sRes.data as SessionItem[]) ?? []);
    setLoading(false);
  }, [supabase, entityId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filtered
  const filtered = questionnaires.filter(q => {
    if (typeFilter !== "all" && q.type !== typeFilter) return false;
    if (statusFilter === "active" && !q.is_active) return false;
    if (statusFilter === "inactive" && q.is_active) return false;
    return true;
  });

  // Quick create
  async function handleCreate() {
    if (!createTitle.trim() || !entityId) return;
    setCreating(true);
    const { error } = await supabase.from("questionnaires").insert({
      entity_id: entityId,
      title: createTitle.trim(),
      type: createType,
      is_active: true,
    });
    setCreating(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Questionnaire créé" });
      setShowCreate(false);
      setCreateTitle("");
      fetchData();
    }
  }

  // Trigger auto-send manually
  async function handleTriggerAutoSend() {
    setTriggeringAutoSend(true);
    try {
      const res = await fetch("/api/questionnaires/auto-send", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast({ title: `Envoi terminé — ${data.totalSent || 0} email(s) envoyé(s)` });
      } else {
        toast({ title: "Erreur", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de déclencher l'envoi", variant: "destructive" });
    }
    setTriggeringAutoSend(false);
  }

  // Disable auto-send for a specific link
  async function handleDisableAutoSend(questionnaireId: string, sessionId: string) {
    const { error } = await supabase
      .from("questionnaire_sessions")
      .update({ auto_send_on_completion: false })
      .eq("questionnaire_id", questionnaireId)
      .eq("session_id", sessionId);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Envoi auto désactivé" });
      fetchData();
    }
  }

  // Delete
  async function handleDelete(q: QItem) {
    if (!confirm(`Supprimer "${q.title}" et toutes ses réponses ?`)) return;
    const { error } = await supabase.from("questionnaires").delete().eq("id", q.id);
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else { toast({ title: "Questionnaire supprimé" }); fetchData(); }
  }

  // Duplicate
  async function handleDuplicate(q: QItem) {
    if (!entityId) return;
    const { data: newQ, error } = await supabase
      .from("questionnaires")
      .insert({
        entity_id: entityId,
        title: `${q.title} (copie)`,
        type: q.type,
        is_active: true,
        quality_indicator_type: q.quality_indicator_type,
      })
      .select("id")
      .single();

    if (error || !newQ) {
      toast({ title: "Erreur", description: error?.message, variant: "destructive" });
      return;
    }

    // Copy questions
    if (q.questions.length > 0) {
      const questionsCopy = q.questions.map((question) => ({
        questionnaire_id: newQ.id,
        text: question.text,
        type: question.type,
        is_required: question.is_required,
        order_index: question.order_index,
      }));
      await supabase.from("questions").insert(questionsCopy);
    }

    toast({ title: "Questionnaire dupliqué" });
    fetchData();
  }

  // Learners fetch
  const fetchLearners = useCallback(async (sessionId: string) => {
    setLoadingLearners(true);
    const { data } = await supabase
      .from("enrollments")
      .select("learner_id, learner:learners!enrollments_learner_id_fkey(id, first_name, last_name, email, client_id)")
      .eq("session_id", sessionId)
      .neq("status", "cancelled");
    setSessionLearners((data ?? []).map((e: any) => e.learner as LearnerItem).filter(Boolean));
    setLoadingLearners(false);
  }, [supabase]);

  // Assign
  const openAssign = (q: QItem) => { setAssignQ(q); setAssignSessionId(""); setAutoSend(false); setAssignDialog(true); };
  const handleAssign = async () => {
    if (!assignQ || !assignSessionId) return;
    setAssigning(true);
    const { error } = await supabase.from("questionnaire_sessions").upsert({
      questionnaire_id: assignQ.id, session_id: assignSessionId, auto_send_on_completion: autoSend,
    }, { onConflict: "questionnaire_id,session_id" });
    setAssigning(false);
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else { toast({ title: "Questionnaire attribué" }); setAssignDialog(false); fetchData(); }
  };

  // Send
  const openSend = (q: QItem) => {
    setSendQ(q); setSendSessionId(""); setSegmentation("all");
    setSelectedLearnerId(""); setSelectedCompanyId(""); setSessionLearners([]);
    setEmailBody(""); setSendDialog(true);
  };

  const handleSendSessionChange = (sessionId: string) => {
    setSendSessionId(sessionId); setSegmentation("all"); setSelectedLearnerId(""); setSelectedCompanyId("");
    if (sessionId) fetchLearners(sessionId); else setSessionLearners([]);
  };

  const handleSendEmails = async () => {
    if (!sendQ || !sendSessionId) return;
    let targets = sessionLearners.filter(l => l.email);
    if (segmentation === "company" && selectedCompanyId) targets = targets.filter(l => l.client_id === selectedCompanyId);
    else if (segmentation === "individual" && selectedLearnerId) targets = targets.filter(l => l.id === selectedLearnerId);
    if (targets.length === 0) { toast({ title: "Aucun destinataire", variant: "destructive" }); return; }

    setSending(true);
    const baseUrl = window.location.origin;
    let sent = 0;
    for (const learner of targets) {
      const link = `${baseUrl}/learner/questionnaires/${sendQ.id}?session_id=${sendSessionId}`;
      const body = emailBody.trim() || DEFAULT_EMAIL_BODY(learner.first_name, link);
      const finalBody = body.includes(link) ? body : `${body}\n\n${link}`;
      try {
        const res = await fetch("/api/emails/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: learner.email, subject: `Questionnaire — ${sendQ.title}`, body: finalBody }),
        });
        if (res.ok) sent++;
      } catch { /* continue */ }
    }
    setSending(false);
    toast({ title: `${sent} email${sent > 1 ? "s" : ""} envoyé${sent > 1 ? "s" : ""}` });
    setSendDialog(false);
  };

  const companies = Array.from(new Map(sessionLearners.filter(l => l.client_id).map(l => [l.client_id, l.client_id])).keys());

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;

  return (
    <div className="p-6 space-y-4">
      {/* Header compact */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-bold text-gray-900">Formulaires</h1>
          <span className="text-xs text-gray-500"><span className="font-bold text-sm text-gray-900">{questionnaires.length}</span> questionnaire{questionnaires.length > 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" /> Nouveau
          </Button>
          <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => router.push("/admin/questionnaires")}>
            Gérer les questionnaires
          </Button>
          <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => router.push("/admin/questionnaires/dashboard")}>
            <BarChart3 className="h-3.5 w-3.5" /> Dashboard
          </Button>
        </div>
      </div>

      {/* Quick create inline */}
      {showCreate && (
        <div className="border rounded-lg p-4 bg-gray-50/50 space-y-3">
          <div className="flex items-center gap-3">
            <Input value={createTitle} onChange={e => setCreateTitle(e.target.value)} placeholder="Titre du questionnaire..." autoFocus className="h-8 text-sm flex-1"
              onKeyDown={e => { if (e.key === "Enter" && createTitle.trim()) handleCreate(); if (e.key === "Escape") setShowCreate(false); }} />
            <Select value={createType} onValueChange={setCreateType}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="satisfaction">Satisfaction</SelectItem>
                <SelectItem value="evaluation">Évaluation</SelectItem>
                <SelectItem value="survey">Enquête</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" className="text-xs h-8" onClick={handleCreate} disabled={creating || !createTitle.trim()}>Créer</Button>
            <Button size="sm" variant="ghost" className="text-xs h-8" onClick={() => setShowCreate(false)}>Annuler</Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {["all", "satisfaction", "evaluation", "survey"].map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={cn("px-2.5 py-1 text-[11px] font-medium rounded-md transition", typeFilter === t ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100")}>
              {t === "all" ? "Tous" : TYPE_LABELS[t]}
            </button>
          ))}
          <div className="w-px h-4 bg-gray-200 mx-1" />
          {["all", "active", "inactive"].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn("px-2.5 py-1 text-[11px] font-medium rounded-md transition", statusFilter === s ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100")}>
              {s === "all" ? "Tous statuts" : s === "active" ? "Actifs" : "Inactifs"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="w-8"></th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Titre</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">Réponses</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Attribué à</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">Statut</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">Aucun questionnaire</td></tr>
            ) : filtered.map(q => (
              <>
                <tr key={q.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="pl-3">
                    <button onClick={() => setExpandedId(expandedId === q.id ? null : q.id)} className="p-1 text-gray-400 hover:text-gray-600">
                      {expandedId === q.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-gray-900">{q.title}</span>
                    <span className="text-[10px] text-gray-400 ml-2">{q.questions_count} question{q.questions_count > 1 ? "s" : ""}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge className={cn("text-[10px]", TYPE_COLORS[q.type] ?? "bg-gray-100 text-gray-700")}>{TYPE_LABELS[q.type] ?? q.type}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={cn("text-xs font-medium", q.response_count > 0 ? "text-green-600" : "text-gray-400")}>
                      {q.response_count}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {q.assigned_sessions.length > 0 ? (
                      <span className="text-xs text-gray-600">{q.assigned_sessions.slice(0, 2).join(", ")}{q.assigned_sessions.length > 2 ? ` +${q.assigned_sessions.length - 2}` : ""}</span>
                    ) : (
                      <span className="text-xs text-gray-300">Non attribué</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <div className={cn("w-2 h-2 rounded-full mx-auto", q.is_active ? "bg-green-500" : "bg-gray-300")} title={q.is_active ? "Actif" : "Inactif"} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openAssign(q)} className="text-[10px] text-gray-500 hover:text-gray-700 px-1.5 py-0.5 rounded hover:bg-gray-100">Attribuer</button>
                      <button onClick={() => openSend(q)} className="text-[10px] text-[#3DB5C5] hover:underline px-1.5 py-0.5">Envoyer</button>
                      <button onClick={() => router.push("/admin/questionnaires/dashboard")} className="text-[10px] text-gray-500 hover:text-gray-700 px-1.5 py-0.5 rounded hover:bg-gray-100">Résultats</button>
                      <button onClick={() => handleDuplicate(q)} className="text-[10px] text-gray-400 hover:text-gray-600 px-1.5 py-0.5" title="Dupliquer">
                        <Copy className="h-3 w-3" />
                      </button>
                      <button onClick={() => handleDelete(q)} className="text-[10px] text-red-400 hover:text-red-600 px-1.5 py-0.5" title="Supprimer">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
                {/* Expanded questions */}
                {expandedId === q.id && (
                  <tr key={`${q.id}-expand`}>
                    <td colSpan={7} className="px-8 py-3 bg-gray-50/50 border-b">
                      {q.questions.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">Aucune question — <button onClick={() => router.push("/admin/questionnaires")} className="text-[#3DB5C5] hover:underline">ajouter des questions</button></p>
                      ) : (
                        <div className="space-y-1">
                          {q.questions.map((question, i) => (
                            <div key={question.id} className="flex items-center gap-3 text-xs">
                              <span className="text-gray-400 w-4 text-right">{i + 1}.</span>
                              <span className="text-gray-700 flex-1">{question.text}</span>
                              <Badge variant="outline" className="text-[9px] h-4">{QUESTION_TYPE_LABELS[question.type] ?? question.type}</Badge>
                              {question.is_required && <span className="text-red-400 text-[9px]">requis</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Auto-send control section */}
      {autoSendLinks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Send className="h-4 w-4 text-[#3DB5C5]" />
              Envois automatiques ({autoSendLinks.length})
            </h2>
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1.5"
              onClick={handleTriggerAutoSend}
              disabled={triggeringAutoSend}
            >
              {triggeringAutoSend ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Déclencher maintenant
            </Button>
          </div>
          <div className="border rounded-lg bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Questionnaire</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Formation</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Fin de session</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500">Statut</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500"></th>
                </tr>
              </thead>
              <tbody>
                {autoSendLinks.map((link) => {
                  const today = new Date().toISOString().split("T")[0];
                  const isEnded = link.session_end_date && link.session_end_date <= today;
                  const isFuture = link.session_end_date && link.session_end_date > today;
                  return (
                    <tr key={`${link.questionnaire_id}-${link.session_id}`} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 text-gray-700 font-medium">{link.questionnaire_title}</td>
                      <td className="px-4 py-2.5 text-gray-600">{link.session_title}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">
                        {link.session_end_date ? new Date(link.session_end_date).toLocaleDateString("fr-FR") : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {isEnded ? (
                          <Badge className="bg-green-100 text-green-700 text-[10px]">Terminée — envoi prévu</Badge>
                        ) : isFuture ? (
                          <Badge className="bg-blue-100 text-blue-700 text-[10px]">En attente (session pas finie)</Badge>
                        ) : (
                          <Badge className="bg-gray-100 text-gray-500 text-[10px]">Pas de date</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => handleDisableAutoSend(link.questionnaire_id, link.session_id)}
                          className="text-[10px] text-red-400 hover:text-red-600 hover:underline"
                        >
                          Désactiver
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-gray-400">
            Le cron vérifie chaque matin à 8h. Utilisez &quot;Déclencher maintenant&quot; pour envoyer immédiatement. Les apprenants ayant déjà répondu ne sont pas re-contactés.
          </p>
        </div>
      )}

      {/* Assign Dialog */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Attribuer &quot;{assignQ?.title}&quot;</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Formation</Label>
              <Select value={assignSessionId} onValueChange={setAssignSessionId}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                <SelectContent>
                  {sessions.map(s => <SelectItem key={s.id} value={s.id}>{s.title}{s.start_date ? ` (${new Date(s.start_date).toLocaleDateString("fr-FR")})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={autoSend} onCheckedChange={setAutoSend} />Envoi auto à la fin de session</label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog(false)}>Annuler</Button>
            <Button onClick={handleAssign} disabled={assigning || !assignSessionId}>{assigning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Attribuer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Dialog */}
      <Dialog open={sendDialog} onOpenChange={setSendDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Envoyer &quot;{sendQ?.title}&quot;</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Formation</Label>
              <Select value={sendSessionId} onValueChange={handleSendSessionChange}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                <SelectContent>
                  {sessions.map(s => <SelectItem key={s.id} value={s.id}>{s.title}{s.start_date ? ` (${new Date(s.start_date).toLocaleDateString("fr-FR")})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {sendSessionId && !loadingLearners && (
              <>
                <div className="space-y-2">
                  <Label>Destinataires</Label>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" name="seg" checked={segmentation === "all"} onChange={() => setSegmentation("all")} />
                      Tous ({sessionLearners.filter(l => l.email).length})
                    </label>
                    {companies.length > 0 && (
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="radio" name="seg" checked={segmentation === "company"} onChange={() => setSegmentation("company")} />
                        Par entreprise
                      </label>
                    )}
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" name="seg" checked={segmentation === "individual"} onChange={() => setSegmentation("individual")} />
                      Individuel
                    </label>
                  </div>
                </div>
                {segmentation === "company" && (
                  <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Entreprise..." /></SelectTrigger>
                    <SelectContent>{companies.map(cId => <SelectItem key={cId!} value={cId!}>Entreprise ({sessionLearners.filter(l => l.client_id === cId && l.email).length})</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {segmentation === "individual" && (
                  <Select value={selectedLearnerId} onValueChange={setSelectedLearnerId}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Apprenant..." /></SelectTrigger>
                    <SelectContent>{sessionLearners.filter(l => l.email).map(l => <SelectItem key={l.id} value={l.id}>{l.first_name} {l.last_name}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {/* Editable email body */}
                <div className="space-y-1.5">
                  <Label>Message email <span className="text-xs text-gray-400 font-normal">(personnalisable)</span></Label>
                  <Textarea
                    value={emailBody}
                    onChange={e => setEmailBody(e.target.value)}
                    placeholder={DEFAULT_EMAIL_BODY("{prénom}", "{lien}")}
                    rows={4}
                    className="text-sm resize-none"
                  />
                  <p className="text-[10px] text-gray-400">Le lien du questionnaire sera ajouté automatiquement si absent.</p>
                </div>
              </>
            )}
            {loadingLearners && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialog(false)}>Annuler</Button>
            <Button onClick={handleSendEmails} disabled={sending || !sendSessionId}>{sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}<Send className="h-3.5 w-3.5 mr-1.5" />Envoyer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
