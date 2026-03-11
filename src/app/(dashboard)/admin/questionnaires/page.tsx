"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { Questionnaire, Question, Session } from "@/lib/types";
import { cn, formatDate, truncate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  List,
  Send,
  ChevronUp,
  ChevronDown,
  X,
  BarChart2,
  HelpCircle,
  CheckSquare,
  AlignLeft,
  Star,
  ToggleLeft,
  Download,
  FileSpreadsheet,
  User,
  LayoutDashboard,
} from "lucide-react";
import { exportToPDF } from "@/lib/pdf-export";
import Link from "next/link";

type QuestionnaireType = "satisfaction" | "evaluation" | "survey";
type QuestionType = "rating" | "text" | "multiple_choice" | "yes_no";

type QuestionnaireWithStats = Questionnaire & {
  questions: Question[];
  responses_count: number;
  avg_rating: number | null;
};

const TYPE_LABELS: Record<QuestionnaireType, string> = {
  satisfaction: "Satisfaction",
  evaluation: "Évaluation",
  survey: "Enquête",
};

const TYPE_COLORS: Record<QuestionnaireType, string> = {
  satisfaction: "bg-green-100 text-green-700",
  evaluation: "bg-blue-100 text-blue-700",
  survey: "bg-purple-100 text-purple-700",
};

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  rating: "Note (1-5)",
  text: "Texte libre",
  multiple_choice: "Choix multiple",
  yes_no: "Oui / Non",
};

const QuestionTypeIcon = ({ type }: { type: QuestionType }) => {
  if (type === "rating") return <Star className="h-3.5 w-3.5" />;
  if (type === "text") return <AlignLeft className="h-3.5 w-3.5" />;
  if (type === "multiple_choice") return <CheckSquare className="h-3.5 w-3.5" />;
  return <ToggleLeft className="h-3.5 w-3.5" />;
};

type QualityIndicatorType =
  | "eval_preformation" | "eval_pendant" | "eval_postformation"
  | "auto_eval_pre" | "auto_eval_post"
  | "satisfaction_chaud" | "satisfaction_froid"
  | "quest_financeurs" | "quest_formateurs" | "quest_managers"
  | "quest_entreprises" | "autres_quest";

const QUALITY_INDICATOR_OPTIONS: { value: QualityIndicatorType; label: string }[] = [
  { value: "eval_preformation", label: "Évaluation Préformation" },
  { value: "eval_pendant", label: "Évaluation Pendant la formation" },
  { value: "eval_postformation", label: "Évaluation Postformation" },
  { value: "auto_eval_pre", label: "Auto-Évaluation Préformation" },
  { value: "auto_eval_post", label: "Auto-Évaluation Postformation" },
  { value: "satisfaction_chaud", label: "Satisfaction à chaud" },
  { value: "satisfaction_froid", label: "Satisfaction à froid" },
  { value: "quest_financeurs", label: "Questionnaires aux financeurs" },
  { value: "quest_formateurs", label: "Questionnaires aux formateurs" },
  { value: "quest_managers", label: "Questionnaires aux managers" },
  { value: "quest_entreprises", label: "Questionnaires aux entreprises" },
  { value: "autres_quest", label: "Autres Questionnaires" },
];

interface QuestionnaireFormData {
  title: string;
  description: string;
  type: QuestionnaireType;
  quality_indicator_type: QualityIndicatorType | "";
}

interface QuestionFormData {
  text: string;
  type: QuestionType;
  is_required: boolean;
  options: string[];
}

const emptyQForm: QuestionnaireFormData = {
  title: "",
  description: "",
  type: "satisfaction",
  quality_indicator_type: "",
};

const emptyQuestionForm: QuestionFormData = {
  text: "",
  type: "rating",
  is_required: true,
  options: ["", ""],
};

export default function QuestionnairesPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const { entityId } = useEntity();

  const [questionnaires, setQuestionnaires] = useState<QuestionnaireWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // Questionnaire add/edit dialog
  const [qDialogOpen, setQDialogOpen] = useState(false);
  const [editingQ, setEditingQ] = useState<QuestionnaireWithStats | null>(null);
  const [qForm, setQForm] = useState<QuestionnaireFormData>(emptyQForm);
  const [saving, setSaving] = useState(false);

  // Questions builder dialog
  const [questionsDialogOpen, setQuestionsDialogOpen] = useState(false);
  const [selectedQ, setSelectedQ] = useState<QuestionnaireWithStats | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionForm, setQuestionForm] = useState<QuestionFormData>(emptyQuestionForm);
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [showAddQuestion, setShowAddQuestion] = useState(false);

  // Distribute dialog
  const [distributeDialogOpen, setDistributeDialogOpen] = useState(false);
  const [distributeQ, setDistributeQ] = useState<QuestionnaireWithStats | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [trainings, setTrainings] = useState<Array<{ id: string; title: string }>>([]);
  const [selectedSession, setSelectedSession] = useState<string>("");
  const [selectedTraining, setSelectedTraining] = useState<string>("");
  const [distributeMode, setDistributeMode] = useState<"session" | "training">("session");
  const [distributing, setDistributing] = useState(false);
  const [autoSendOnCompletion, setAutoSendOnCompletion] = useState(false);

  // Stats dialog
  const [statsDialogOpen, setStatsDialogOpen] = useState(false);
  const [statsQ, setStatsQ] = useState<QuestionnaireWithStats | null>(null);
  const [statsResponses, setStatsResponses] = useState<Array<{ id: string; learner_id: string; session_id: string | null; responses: Record<string, unknown>; submitted_at: string; learner?: { first_name: string; last_name: string; email: string } | null; session?: { title: string } | null }>>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsTab, setStatsTab] = useState<"aggregate" | "individual">("aggregate");

  // Delete
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [qToDelete, setQToDelete] = useState<QuestionnaireWithStats | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchQuestionnaires = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("questionnaires")
      .select("*, questions(*), responses:questionnaire_responses(id)")
      .order("created_at", { ascending: false });
    if (entityId) query = query.eq("entity_id", entityId);
    const { data, error } = await query;

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les questionnaires.", variant: "destructive" });
    } else {
      const mapped = (data || []).map((q: Record<string, unknown>) => {
        const qs = (q.questions as Question[]) || [];
        const responses = (q.responses as { id: string }[]) || [];
        return {
          ...q,
          questions: qs.sort((a, b) => a.order_index - b.order_index),
          responses_count: responses.length,
          avg_rating: null,
        };
      });
      setQuestionnaires(mapped as QuestionnaireWithStats[]);
    }
    setLoading(false);
  }, [entityId]);

  useEffect(() => {
    fetchQuestionnaires();
  }, [fetchQuestionnaires]);

  const fetchSessions = useCallback(async () => {
    let sessionsQ = supabase.from("sessions").select("id, title, start_date, training_id").order("start_date", { ascending: false });
    let trainingsQ = supabase.from("trainings").select("id, title").order("title");
    if (entityId) {
      sessionsQ = sessionsQ.eq("entity_id", entityId);
      trainingsQ = trainingsQ.eq("entity_id", entityId);
    }
    const [{ data: s }, { data: t }] = await Promise.all([sessionsQ, trainingsQ]);
    setSessions((s as Session[]) || []);
    setTrainings((t as Array<{ id: string; title: string }>) || []);
  }, [entityId]);

  const filtered = questionnaires.filter((q) => {
    const matchSearch =
      search === "" ||
      q.title.toLowerCase().includes(search.toLowerCase()) ||
      q.description?.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "all" || q.type === typeFilter;
    return matchSearch && matchType;
  });

  // Questionnaire CRUD
  const openAddQ = () => {
    setEditingQ(null);
    setQForm(emptyQForm);
    setQDialogOpen(true);
  };

  const openEditQ = (q: QuestionnaireWithStats) => {
    setEditingQ(q);
    setQForm({ title: q.title, description: q.description || "", type: q.type, quality_indicator_type: ((q as unknown as Record<string, unknown>).quality_indicator_type as QualityIndicatorType | "") || "" });
    setQDialogOpen(true);
  };

  const handleSaveQ = async () => {
    if (!qForm.title.trim()) {
      toast({ title: "Titre requis", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      title: qForm.title.trim(),
      description: qForm.description.trim() || null,
      type: qForm.type,
      quality_indicator_type: qForm.quality_indicator_type || null,
    };
    if (editingQ) {
      const { error } = await supabase.from("questionnaires").update(payload).eq("id", editingQ.id);
      if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); setSaving(false); return; }
      toast({ title: "Questionnaire mis à jour" });
    } else {
      const { error } = await supabase.from("questionnaires").insert({ ...payload, is_active: true, entity_id: entityId });
      if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); setSaving(false); return; }
      toast({ title: "Questionnaire créé" });
    }
    setSaving(false);
    setQDialogOpen(false);
    await fetchQuestionnaires();
  };

  const handleToggleActive = async (q: QuestionnaireWithStats) => {
    const { error } = await supabase.from("questionnaires").update({ is_active: !q.is_active }).eq("id", q.id);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    await fetchQuestionnaires();
  };

  // Questions builder
  const openQuestionsDialog = async (q: QuestionnaireWithStats) => {
    setSelectedQ(q);
    setQuestionsDialogOpen(true);
    setShowAddQuestion(false);
    setQuestionForm(emptyQuestionForm);
    setQuestionsLoading(true);
    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .eq("questionnaire_id", q.id)
      .order("order_index");
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); }
    else { setQuestions((data as Question[]) || []); }
    setQuestionsLoading(false);
  };

  const handleAddQuestion = async () => {
    if (!selectedQ || !questionForm.text.trim()) {
      toast({ title: "Texte de la question requis", variant: "destructive" });
      return;
    }
    if (questionForm.type === "multiple_choice") {
      const validOpts = questionForm.options.filter((o) => o.trim());
      if (validOpts.length < 2) {
        toast({ title: "Au moins 2 options requises pour le choix multiple", variant: "destructive" });
        return;
      }
    }
    setAddingQuestion(true);
    const nextOrder = questions.length > 0 ? Math.max(...questions.map((q) => q.order_index)) + 1 : 1;
    const payload = {
      questionnaire_id: selectedQ.id,
      text: questionForm.text.trim(),
      type: questionForm.type,
      is_required: questionForm.is_required,
      options: questionForm.type === "multiple_choice"
        ? questionForm.options.filter((o) => o.trim())
        : null,
      order_index: nextOrder,
    };
    const { error } = await supabase.from("questions").insert(payload);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); }
    else {
      toast({ title: "Question ajoutée" });
      setQuestionForm(emptyQuestionForm);
      setShowAddQuestion(false);
      const { data } = await supabase.from("questions").select("*").eq("questionnaire_id", selectedQ.id).order("order_index");
      setQuestions((data as Question[]) || []);
      await fetchQuestionnaires();
    }
    setAddingQuestion(false);
  };

  const handleDeleteQuestion = async (questionId: string) => {
    const { error } = await supabase.from("questions").delete().eq("id", questionId);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    setQuestions((prev) => prev.filter((q) => q.id !== questionId));
    await fetchQuestionnaires();
  };

  const handleReorderQuestion = async (questionId: string, direction: "up" | "down") => {
    const idx = questions.findIndex((q) => q.id === questionId);
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === questions.length - 1) return;

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    const newQuestions = [...questions];
    const temp = newQuestions[idx].order_index;
    newQuestions[idx] = { ...newQuestions[idx], order_index: newQuestions[swapIdx].order_index };
    newQuestions[swapIdx] = { ...newQuestions[swapIdx], order_index: temp };
    [newQuestions[idx], newQuestions[swapIdx]] = [newQuestions[swapIdx], newQuestions[idx]];
    setQuestions(newQuestions);

    await Promise.all([
      supabase.from("questions").update({ order_index: newQuestions[idx].order_index }).eq("id", newQuestions[idx].id),
      supabase.from("questions").update({ order_index: newQuestions[swapIdx].order_index }).eq("id", newQuestions[swapIdx].id),
    ]);
  };

  // Distribute
  const openDistribute = async (q: QuestionnaireWithStats) => {
    setDistributeQ(q);
    setSelectedSession("");
    setSelectedTraining("");
    setDistributeMode("session");
    setDistributeDialogOpen(true);
    await fetchSessions();
  };

  const handleDistribute = async () => {
    if (!distributeQ) return;
    setDistributing(true);

    if (distributeMode === "training" && selectedTraining) {
      // Associate to all sessions of the selected training
      const trainingSessions = sessions.filter((s: any) => s.training_id === selectedTraining);
      if (trainingSessions.length === 0) {
        toast({ title: "Aucune session trouvée pour cette formation", variant: "destructive" });
        setDistributing(false);
        return;
      }
      const inserts = trainingSessions.map((s) => ({ questionnaire_id: distributeQ.id, session_id: s.id, auto_send_on_completion: autoSendOnCompletion }));
      const { error } = await supabase.from("questionnaire_sessions").upsert(inserts, { onConflict: "questionnaire_id,session_id" });
      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Distribution enregistrée", description: `"${distributeQ.title}" associé à ${trainingSessions.length} session(s)${autoSendOnCompletion ? " — envoi auto activé" : ""}.` });
      }
    } else if (selectedSession) {
      const { error } = await supabase.from("questionnaire_sessions").upsert({
        questionnaire_id: distributeQ.id,
        session_id: selectedSession,
        auto_send_on_completion: autoSendOnCompletion,
      }, { onConflict: "questionnaire_id,session_id" });
      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Distribution enregistrée", description: `"${distributeQ.title}" associé à la session${autoSendOnCompletion ? " — envoi auto activé" : ""}.` });
      }
    } else {
      toast({ title: "Sélectionnez une session ou une formation", variant: "destructive" });
      setDistributing(false);
      return;
    }

    setDistributing(false);
    setDistributeDialogOpen(false);
  };

  // Stats
  const openStats = async (q: QuestionnaireWithStats) => {
    setStatsQ(q);
    setStatsTab("aggregate");
    setStatsDialogOpen(true);
    setStatsLoading(true);
    const { data } = await supabase
      .from("questionnaire_responses")
      .select("*, learner:learners(first_name, last_name, email), session:sessions(title)")
      .eq("questionnaire_id", q.id)
      .order("submitted_at", { ascending: false });
    setStatsResponses((data as typeof statsResponses) || []);
    setStatsLoading(false);
  };

  const getQuestionStats = (questionId: string, questionType: string) => {
    const values = statsResponses
      .map((r) => r.responses?.[questionId])
      .filter((v) => v !== undefined && v !== null && v !== "");
    if (values.length === 0) return null;

    if (questionType === "rating") {
      const nums = values.map(Number).filter((n) => !isNaN(n));
      const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
      const distribution = [1, 2, 3, 4, 5].map((n) => nums.filter((v) => v === n).length);
      return { avg, distribution, count: nums.length };
    }
    if (questionType === "multiple_choice" || questionType === "yes_no") {
      const counts: Record<string, number> = {};
      values.forEach((v) => {
        const key = String(v);
        counts[key] = (counts[key] || 0) + 1;
      });
      return { counts, total: values.length };
    }
    // text
    return { texts: values.map(String), count: values.length };
  };

  const exportCSV = () => {
    if (!statsQ || statsResponses.length === 0) return;
    const questions = statsQ.questions;
    const headers = ["Apprenant", "Email", "Session", "Date de soumission", ...questions.map((q) => q.text)];
    const rows = statsResponses.map((r) => {
      const learnerName = r.learner ? `${r.learner.first_name} ${r.learner.last_name}` : "—";
      const email = r.learner?.email || "—";
      const sessionTitle = r.session?.title || "—";
      const date = new Date(r.submitted_at).toLocaleDateString("fr-FR");
      const answers = questions.map((q) => {
        const val = r.responses?.[q.id];
        return val !== undefined && val !== null ? String(val) : "";
      });
      return [learnerName, email, sessionTitle, date, ...answers];
    });

    const csvContent = [headers, ...rows].map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")
    ).join("\n");

    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `questionnaire-${statsQ.title.replace(/[^a-zA-Z0-9]/g, "_")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: "Export CSV téléchargé" });
  };

  const exportStatsPDF = () => {
    if (!statsQ) return;
    const questions = statsQ.questions;
    let content = `RÉSULTATS — ${statsQ.title}\n`;
    content += `Type: ${TYPE_LABELS[statsQ.type]} | ${statsResponses.length} réponse(s)\n`;
    content += `Exporté le ${new Date().toLocaleDateString("fr-FR")}\n\n`;
    content += "═".repeat(60) + "\n\n";

    questions.forEach((q, idx) => {
      content += `${idx + 1}. ${q.text}\n`;
      content += `   Type: ${QUESTION_TYPE_LABELS[q.type as QuestionType]}\n`;
      const stats = getQuestionStats(q.id, q.type);
      if (!stats) { content += "   Aucune réponse\n\n"; return; }

      if ("avg" in stats) {
        content += `   Moyenne: ${(stats as any).avg.toFixed(1)} / 5 (${(stats as any).count} réponses)\n`;
        content += `   Distribution: ${(stats as any).distribution.map((c: number, i: number) => `${i + 1}★=${c}`).join(", ")}\n`;
      } else if ("counts" in stats) {
        const s = stats as any;
        Object.entries(s.counts as Record<string, number>).forEach(([key, count]) => {
          const pct = Math.round((count / s.total) * 100);
          content += `   ${key}: ${count} (${pct}%)\n`;
        });
      } else if ("texts" in stats) {
        const s = stats as any;
        s.texts.slice(0, 10).forEach((t: string) => {
          content += `   • ${t}\n`;
        });
        if (s.texts.length > 10) content += `   ... et ${s.texts.length - 10} autre(s)\n`;
      }
      content += "\n";
    });

    exportToPDF(`Résultats — ${statsQ.title}`, content, `resultats-${statsQ.title}`);
    toast({ title: "Export PDF téléchargé" });
  };

  // Delete
  const openDelete = (q: QuestionnaireWithStats) => {
    setQToDelete(q);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!qToDelete) return;
    setDeleting(true);
    const { error } = await supabase.from("questionnaires").delete().eq("id", qToDelete.id);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); }
    else {
      toast({ title: "Questionnaire supprimé" });
      setDeleteDialogOpen(false);
      setQToDelete(null);
      await fetchQuestionnaires();
    }
    setDeleting(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Questionnaires</h1>
          <p className="text-sm text-gray-500 mt-1">
            {questionnaires.length} questionnaire{questionnaires.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/questionnaires/dashboard">
            <Button variant="outline" className="gap-2">
              <LayoutDashboard className="h-4 w-4" />
              Tableau de bord
            </Button>
          </Link>
          <Button onClick={openAddQ} className="gap-2">
            <Plus className="h-4 w-4" />
            Nouveau questionnaire
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Rechercher un questionnaire..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            <SelectItem value="satisfaction">Satisfaction</SelectItem>
            <SelectItem value="evaluation">Évaluation</SelectItem>
            <SelectItem value="survey">Enquête</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 min-w-[200px]">Titre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Questions</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Réponses</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Créé le</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Actif</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    <HelpCircle className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                    <p className="font-medium">Aucun questionnaire trouvé</p>
                    <p className="text-xs mt-1">Créez votre premier questionnaire.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((q) => (
                  <tr key={q.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{truncate(q.title, 45)}</p>
                      {q.description && (
                        <p className="text-xs text-gray-400 mt-0.5">{truncate(q.description, 60)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={cn("text-xs font-normal", TYPE_COLORS[q.type])}>
                        {TYPE_LABELS[q.type]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-700">{q.questions.length}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-700">{q.responses_count}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {formatDate(q.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <Switch
                        checked={q.is_active}
                        onCheckedChange={() => handleToggleActive(q)}
                        className="scale-75"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditQ(q)} className="gap-2">
                            <Pencil className="h-4 w-4" />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openQuestionsDialog(q)} className="gap-2">
                            <List className="h-4 w-4" />
                            Gérer les questions
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openDistribute(q)} className="gap-2">
                            <Send className="h-4 w-4" />
                            Distribuer
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openStats(q)} className="gap-2">
                            <BarChart2 className="h-4 w-4" />
                            Voir les stats
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openDelete(q)} className="gap-2 text-red-600 focus:text-red-600">
                            <Trash2 className="h-4 w-4" />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t bg-gray-50 text-xs text-gray-500">
            {filtered.length} questionnaire{filtered.length !== 1 ? "s" : ""} affiché{filtered.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Add/Edit Questionnaire Dialog */}
      <Dialog open={qDialogOpen} onOpenChange={setQDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingQ ? "Modifier le questionnaire" : "Nouveau questionnaire"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="q_title">Titre <span className="text-red-500">*</span></Label>
              <Input
                id="q_title"
                value={qForm.title}
                onChange={(e) => setQForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Ex: Évaluation de satisfaction — Groupe A"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q_desc">Description</Label>
              <Textarea
                id="q_desc"
                value={qForm.description}
                onChange={(e) => setQForm((p) => ({ ...p, description: e.target.value }))}
                rows={3}
                placeholder="Description optionnelle..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q_type">Type</Label>
              <Select value={qForm.type} onValueChange={(v) => setQForm((p) => ({ ...p, type: v as QuestionnaireType }))}>
                <SelectTrigger id="q_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="satisfaction">Satisfaction</SelectItem>
                  <SelectItem value="evaluation">Évaluation</SelectItem>
                  <SelectItem value="survey">Enquête</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q_indicator">Indicateur qualité (Suivi Qualité)</Label>
              <Select value={qForm.quality_indicator_type || "_none"} onValueChange={(v) => setQForm((p) => ({ ...p, quality_indicator_type: v === "_none" ? "" : v as QualityIndicatorType }))}>
                <SelectTrigger id="q_indicator">
                  <SelectValue placeholder="Aucun (non lié au suivi qualité)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Aucun</SelectItem>
                  {QUALITY_INDICATOR_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">Associe ce questionnaire à une colonne du tableau de suivi qualité</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSaveQ} disabled={saving}>
              {saving ? "Enregistrement..." : editingQ ? "Mettre à jour" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Questions Builder Dialog */}
      <Dialog open={questionsDialogOpen} onOpenChange={setQuestionsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <List className="h-5 w-5" />
              Questions — {selectedQ?.title}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* Existing questions */}
            {questionsLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
              ))
            ) : questions.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <HelpCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Aucune question. Ajoutez-en une ci-dessous.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {questions.map((question, idx) => (
                  <div
                    key={question.id}
                    className="flex items-start gap-3 p-3 border rounded-lg bg-white hover:bg-gray-50"
                  >
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleReorderQuestion(question.id, "up")}
                        disabled={idx === 0}
                        className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleReorderQuestion(question.id, "down")}
                        disabled={idx === questions.length - 1}
                        className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600 shrink-0 mt-0.5">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{question.text}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                          <QuestionTypeIcon type={question.type as QuestionType} />
                          {QUESTION_TYPE_LABELS[question.type as QuestionType]}
                        </span>
                        {question.is_required && (
                          <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded">Obligatoire</span>
                        )}
                        {question.options && question.options.length > 0 && (
                          <span className="text-xs text-gray-400">
                            {question.options.length} option{question.options.length !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      {question.options && question.options.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {question.options.map((opt, i) => (
                            <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                              {opt}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteQuestion(question.id)}
                      className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add question form */}
            {showAddQuestion ? (
              <div className="border-2 border-dashed border-blue-200 rounded-lg p-4 space-y-3 bg-blue-50/30">
                <p className="text-sm font-medium text-gray-700">Nouvelle question</p>
                <div className="space-y-1.5">
                  <Label htmlFor="nq_text">Texte de la question <span className="text-red-500">*</span></Label>
                  <Input
                    id="nq_text"
                    value={questionForm.text}
                    onChange={(e) => setQuestionForm((p) => ({ ...p, text: e.target.value }))}
                    placeholder="Ex: Comment évaluez-vous la qualité de cette formation ?"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="nq_type">Type de réponse</Label>
                    <Select
                      value={questionForm.type}
                      onValueChange={(v) => setQuestionForm((p) => ({ ...p, type: v as QuestionType, options: v === "multiple_choice" ? ["", ""] : [] }))}
                    >
                      <SelectTrigger id="nq_type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rating">Note (1-5)</SelectItem>
                        <SelectItem value="text">Texte libre</SelectItem>
                        <SelectItem value="multiple_choice">Choix multiple</SelectItem>
                        <SelectItem value="yes_no">Oui / Non</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Obligatoire</Label>
                    <div className="flex items-center gap-2 pt-2">
                      <Checkbox
                        id="nq_required"
                        checked={questionForm.is_required}
                        onCheckedChange={(v) => setQuestionForm((p) => ({ ...p, is_required: !!v }))}
                      />
                      <label htmlFor="nq_required" className="text-sm text-gray-700 cursor-pointer">
                        Réponse obligatoire
                      </label>
                    </div>
                  </div>
                </div>

                {/* Options for multiple choice */}
                {questionForm.type === "multiple_choice" && (
                  <div className="space-y-2">
                    <Label>Options de réponse</Label>
                    {questionForm.options.map((opt, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          value={opt}
                          onChange={(e) => {
                            const newOpts = [...questionForm.options];
                            newOpts[i] = e.target.value;
                            setQuestionForm((p) => ({ ...p, options: newOpts }));
                          }}
                          placeholder={`Option ${i + 1}`}
                          className="text-sm"
                        />
                        {questionForm.options.length > 2 && (
                          <button
                            onClick={() => {
                              const newOpts = questionForm.options.filter((_, idx) => idx !== i);
                              setQuestionForm((p) => ({ ...p, options: newOpts }));
                            }}
                            className="p-2 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => setQuestionForm((p) => ({ ...p, options: [...p.options, ""] }))}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Ajouter une option
                    </Button>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button onClick={handleAddQuestion} disabled={addingQuestion} size="sm">
                    {addingQuestion ? "Ajout..." : "Ajouter la question"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowAddQuestion(false);
                      setQuestionForm(emptyQuestionForm);
                    }}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full gap-2 border-dashed"
                onClick={() => setShowAddQuestion(true)}
              >
                <Plus className="h-4 w-4" />
                Ajouter une question
              </Button>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setQuestionsDialogOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Distribute Dialog */}
      <Dialog open={distributeDialogOpen} onOpenChange={setDistributeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Distribuer — {distributeQ?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-gray-600">
              Associez ce questionnaire à une session spécifique ou à toutes les sessions d&apos;une formation.
            </p>

            {/* Mode toggle */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
              <button
                onClick={() => { setDistributeMode("session"); setSelectedTraining(""); }}
                className={cn("flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors", distributeMode === "session" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700")}
              >
                Par session
              </button>
              <button
                onClick={() => { setDistributeMode("training"); setSelectedSession(""); }}
                className={cn("flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors", distributeMode === "training" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700")}
              >
                Par formation
              </button>
            </div>

            {distributeMode === "session" ? (
              <div className="space-y-1.5">
                <Label htmlFor="d_session">Session <span className="text-red-500">*</span></Label>
                <Select value={selectedSession} onValueChange={setSelectedSession}>
                  <SelectTrigger id="d_session">
                    <SelectValue placeholder="Sélectionner une session..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.title} — {formatDate(s.start_date)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="d_training">Formation <span className="text-red-500">*</span></Label>
                <Select value={selectedTraining} onValueChange={setSelectedTraining}>
                  <SelectTrigger id="d_training">
                    <SelectValue placeholder="Sélectionner une formation..." />
                  </SelectTrigger>
                  <SelectContent>
                    {trainings.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTraining && (
                  <p className="text-xs text-gray-400">
                    {sessions.filter((s: any) => s.training_id === selectedTraining).length} session(s) seront associées
                  </p>
                )}
              </div>
            )}

            {/* Auto-send toggle */}
            <div className="flex items-start gap-3 rounded-lg border border-dashed border-gray-200 p-3 bg-gray-50">
              <Switch
                id="auto_send"
                checked={autoSendOnCompletion}
                onCheckedChange={setAutoSendOnCompletion}
                className="mt-0.5"
              />
              <div>
                <Label htmlFor="auto_send" className="text-sm font-medium cursor-pointer">
                  Envoi automatique à la fin de la session
                </Label>
                <p className="text-xs text-gray-500 mt-0.5">
                  Le questionnaire sera envoyé par email à tous les apprenants inscrits dès que la session passe au statut <strong>Terminée</strong>.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDistributeDialogOpen(false)}>Annuler</Button>
            <Button
              onClick={handleDistribute}
              disabled={distributing || (distributeMode === "session" ? !selectedSession : !selectedTraining)}
            >
              {distributing ? "Association..." : "Distribuer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stats Dialog */}
      <Dialog open={statsDialogOpen} onOpenChange={setStatsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart2 className="h-5 w-5" />
              Résultats — {statsQ?.title}
            </DialogTitle>
          </DialogHeader>

          {statsLoading ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-20 rounded-lg bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-blue-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-blue-700">{statsResponses.length}</p>
                  <p className="text-xs text-blue-600 mt-0.5">Réponse{statsResponses.length !== 1 ? "s" : ""}</p>
                </div>
                <div className="p-3 bg-green-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-green-700">{statsQ?.questions.length || 0}</p>
                  <p className="text-xs text-green-600 mt-0.5">Question{(statsQ?.questions.length || 0) !== 1 ? "s" : ""}</p>
                </div>
                <div className="p-3 bg-purple-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-purple-700">
                    {(() => {
                      const ratingQs = statsQ?.questions.filter((q) => q.type === "rating") || [];
                      if (ratingQs.length === 0) return "—";
                      const allAvgs = ratingQs.map((q) => {
                        const s = getQuestionStats(q.id, "rating");
                        return s && "avg" in s ? s.avg : null;
                      }).filter((v): v is number => v !== null);
                      return allAvgs.length > 0 ? (allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length).toFixed(1) : "—";
                    })()}
                  </p>
                  <p className="text-xs text-purple-600 mt-0.5">Note moyenne /5</p>
                </div>
              </div>

              {/* Export buttons */}
              {statsResponses.length > 0 && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={exportCSV}>
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Exporter CSV
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={exportStatsPDF}>
                    <Download className="h-3.5 w-3.5" />
                    Exporter PDF
                  </Button>
                </div>
              )}

              {statsResponses.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <BarChart2 className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-medium">Aucune réponse pour le moment</p>
                  <p className="text-xs mt-1">Distribuez ce questionnaire pour commencer à collecter des réponses.</p>
                </div>
              ) : (
                <>
                  {/* Tabs: Aggregate / Individual */}
                  <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                    <button
                      onClick={() => setStatsTab("aggregate")}
                      className={cn("flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors", statsTab === "aggregate" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700")}
                    >
                      Vue agrégée
                    </button>
                    <button
                      onClick={() => setStatsTab("individual")}
                      className={cn("flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors", statsTab === "individual" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700")}
                    >
                      Réponses individuelles
                    </button>
                  </div>

                  {statsTab === "aggregate" ? (
                    <div className="space-y-3">
                      {statsQ?.questions.map((q, idx) => {
                        const stats = getQuestionStats(q.id, q.type);
                        return (
                          <div key={q.id} className="p-3 border rounded-lg">
                            <div className="flex items-start gap-2 mb-2">
                              <span className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600 shrink-0 mt-0.5">{idx + 1}</span>
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-900">{q.text}</p>
                                <span className="text-[10px] text-gray-400">{QUESTION_TYPE_LABELS[q.type as QuestionType]}</span>
                              </div>
                            </div>

                            {(() => {
                              if (!stats) return <p className="text-xs text-gray-400 ml-7">Aucune réponse</p>;
                              const s = stats as any;
                              if (q.type === "rating" && s.avg !== undefined) {
                                return (
                                  <div className="ml-7 space-y-2">
                                    <div className="flex items-center gap-2">
                                      <div className="flex gap-0.5">
                                        {Array.from({ length: 5 }).map((_, i) => (
                                          <Star key={i} className={cn("h-4 w-4", i < Math.round(s.avg) ? "text-yellow-400 fill-yellow-400" : "text-gray-200 fill-gray-200")} />
                                        ))}
                                      </div>
                                      <span className="text-sm font-bold text-gray-800">{s.avg.toFixed(1)}</span>
                                      <span className="text-xs text-gray-400">({s.count} rép.)</span>
                                    </div>
                                    <div className="space-y-1">
                                      {s.distribution.map((count: number, i: number) => {
                                        const pct = s.count > 0 ? (count / s.count) * 100 : 0;
                                        return (
                                          <div key={i} className="flex items-center gap-2 text-xs">
                                            <span className="w-8 text-right text-gray-500">{i + 1} ★</span>
                                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                              <div className="h-full bg-yellow-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                            </div>
                                            <span className="w-8 text-gray-500">{count}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              }
                              if ((q.type === "multiple_choice" || q.type === "yes_no") && s.counts) {
                                return (
                                  <div className="ml-7 space-y-1.5">
                                    {Object.entries(s.counts as Record<string, number>)
                                      .sort(([, a], [, b]) => (b as number) - (a as number))
                                      .map(([key, count]) => {
                                        const pct = s.total > 0 ? ((count as number) / s.total) * 100 : 0;
                                        return (
                                          <div key={key} className="flex items-center gap-2 text-xs">
                                            <span className="w-24 truncate text-gray-700 font-medium">{key}</span>
                                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                              <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                            </div>
                                            <span className="w-16 text-right text-gray-500">{count as number} ({Math.round(pct)}%)</span>
                                          </div>
                                        );
                                      })}
                                  </div>
                                );
                              }
                              if (s.texts) {
                                return (
                                  <div className="ml-7 space-y-1 max-h-32 overflow-y-auto">
                                    {s.texts.map((t: string, i: number) => (
                                      <div key={i} className="text-xs text-gray-600 p-2 bg-gray-50 rounded border border-gray-100">
                                        &ldquo;{t}&rdquo;
                                      </div>
                                    ))}
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Individual responses tab */
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {statsResponses.map((resp) => (
                        <div key={resp.id} className="p-3 border rounded-lg hover:bg-gray-50">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-gray-400" />
                              <span className="text-sm font-medium text-gray-900">
                                {resp.learner ? `${resp.learner.first_name} ${resp.learner.last_name}` : "Apprenant inconnu"}
                              </span>
                              {resp.learner?.email && (
                                <span className="text-xs text-gray-400">{resp.learner.email}</span>
                              )}
                            </div>
                            <span className="text-xs text-gray-400">
                              {new Date(resp.submitted_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          {resp.session && (
                            <p className="text-[10px] text-gray-400 mb-2">Session: {resp.session.title}</p>
                          )}
                          <div className="space-y-1.5">
                            {statsQ?.questions.map((q) => {
                              const val = resp.responses?.[q.id];
                              return (
                                <div key={q.id} className="flex items-start gap-2 text-xs">
                                  <span className="text-gray-500 shrink-0 w-1/3 truncate">{q.text}</span>
                                  <span className="text-gray-900 font-medium">
                                    {q.type === "rating" && val ? (
                                      <span className="flex gap-0.5">
                                        {Array.from({ length: 5 }).map((_, i) => (
                                          <Star key={i} className={cn("h-3 w-3", i < Number(val) ? "text-yellow-400 fill-yellow-400" : "text-gray-200")} />
                                        ))}
                                      </span>
                                    ) : val !== undefined && val !== null ? String(val) : (
                                      <span className="text-gray-300">—</span>
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setStatsDialogOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer le questionnaire</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Supprimer <strong>&quot;{qToDelete?.title}&quot;</strong> ? Toutes les questions et réponses associées seront supprimées. Cette action est irréversible.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Suppression..." : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
