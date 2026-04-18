"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import {
  ArrowLeft,
  Building2,
  User,
  Mail,
  Phone,
  FileText,
  Send,
  Clock,
  CheckCircle,
  MessageSquare,
  StickyNote,
  Trash2,
  Pencil,
  ChevronRight,
  Plus,
  BookOpen,
  Upload,
  ClipboardList,
  Loader2,
  ExternalLink,
  Download,
  MoreHorizontal,
  Search,
  AlertTriangle,
} from "lucide-react";
import { downloadDevisPDF, type DevisData } from "@/lib/devis-pdf";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatDate } from "@/lib/utils";
import { logCommercialAction } from "@/lib/crm/log-commercial-action";
import { DORMANCY_THRESHOLD_DAYS } from "@/lib/crm/constants";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import type { CrmProspect, CrmQuote, ProspectStatus, Training } from "@/lib/types";
import { detectOPCO } from "@/lib/ai/opco-mapping";
import { getScoreCategory } from "@/lib/ai/prospect-scoring";
import ProspectTasksSection from "../liste/_components/ProspectTasksSection";
import ProspectCommentsSection from "../liste/_components/ProspectCommentsSection";
import ProspectEmailSection from "../liste/_components/ProspectEmailSection";

// ── Constants ───────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  new:       { label: "Lead",        color: "#374151" },
  contacted: { label: "Contacté",    color: "#f97316" },
  qualified: { label: "Qualifié",    color: "#8b5cf6" },
  proposal:  { label: "Proposition", color: "#2563EB" },
  won:       { label: "Gagné",       color: "#22c55e" },
  lost:      { label: "Refus",       color: "#ef4444" },
  dormant:   { label: "Dormant",     color: "#9ca3af" },
};

const STATUS_OPTIONS: ProspectStatus[] = ["new", "contacted", "qualified", "proposal", "won", "lost", "dormant"];

interface ActivityEntry {
  id: string;
  type: string;
  content: string;
  date: string;
  author: string;
  metadata?: Record<string, unknown>;
}

const ACTION_ICONS: Record<string, { icon: string; color: string }> = {
  call: { icon: "📞", color: "text-green-600" },
  email: { icon: "📧", color: "text-blue-600" },
  meeting: { icon: "🤝", color: "text-purple-600" },
  comment: { icon: "💬", color: "text-amber-600" },
  status_change: { icon: "🔄", color: "text-blue-500" },
  quote_sent: { icon: "📄", color: "text-indigo-600" },
  quote_accepted: { icon: "✅", color: "text-green-600" },
  quote_rejected: { icon: "❌", color: "text-red-500" },
  task_created: { icon: "📋", color: "text-orange-500" },
  document_sent: { icon: "📎", color: "text-teal-600" },
  relance: { icon: "🔔", color: "text-amber-500" },
  creation: { icon: "➕", color: "text-green-500" },
  note: { icon: "📝", color: "text-gray-500" },
};

const QUICK_ACTION_TYPES = [
  { value: "call", label: "Appel" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Rendez-vous" },
  { value: "relance", label: "Relance" },
  { value: "comment", label: "Commentaire" },
];

// ── Page ────────────────────────────────────────────────────────────────────

export default function ProspectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const { entityId } = useEntity();
  const prospectId = params.id as string;

  const [prospect, setProspect] = useState<CrmProspect | null>(null);
  const [quotes, setQuotes] = useState<CrmQuote[]>([]);
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialogs (kept: delete, link training)
  const [deleteOpen, setDeleteOpen] = useState(false);

  // IA state
  const [enriching, setEnriching] = useState(false);
  const [enrichData, setEnrichData] = useState<Record<string, unknown> | null>(null);
  const [aiInsights, setAiInsights] = useState<Record<string, unknown> | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [scoringLoading, setScoringLoading] = useState(false);

  // Tab control
  const [activeTab, setActiveTab] = useState("timeline");

  // Inline form toggles
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [showActionForm, setShowActionForm] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // Forms
  const [editForm, setEditForm] = useState({
    company_name: "",
    siret: "",
    naf_code: "",
    contact_name: "",
    email: "",
    phone: "",
    source: "",
    notes: "",
    amount: "",
    address: "",
    city: "",
    postal_code: "",
  });
  const [newNote, setNewNote] = useState("");

  // Activity log (unified timeline)
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [actionForm, setActionForm] = useState({ type: "call", subject: "", content: "" });

  // Conversion to client
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [converting, setConverting] = useState(false);

  // Training linking
  const [linkTrainingOpen, setLinkTrainingOpen] = useState(false);
  const [existingTrainings, setExistingTrainings] = useState<Training[]>([]);
  const [trainingSearch, setTrainingSearch] = useState("");
  const [loadingTrainings, setLoadingTrainings] = useState(false);
  const [linkedTraining, setLinkedTraining] = useState<Training | null>(null);
  const [linkingSaving, setLinkingSaving] = useState(false);

  // Custom fields
  const [customFields, setCustomFields] = useState<{id: string; field_name: string; field_type: string; options: string[]}[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchProspect = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("crm_prospects")
      .select("*")
      .eq("id", prospectId)
      .single();

    if (data) {
      setProspect(data as CrmProspect);
      fetchTimeline(data as CrmProspect);

      // Fetch linked training if any
      if (data.linked_training_id) {
        const { data: trainingData } = await supabase
          .from("trainings")
          .select("*")
          .eq("id", data.linked_training_id)
          .single();
        setLinkedTraining((trainingData as Training) ?? null);
      } else {
        setLinkedTraining(null);
      }
    }

    // Fetch linked quotes
    const { data: quotesData } = await supabase
      .from("crm_quotes")
      .select("*")
      .eq("prospect_id", prospectId)
      .order("created_at", { ascending: false });

    setQuotes((quotesData as CrmQuote[]) ?? []);
    setLoading(false);
  }, [prospectId, supabase]);

  useEffect(() => {
    fetchProspect();
  }, [fetchProspect]);

  // Fetch custom fields when entityId is available
  useEffect(() => {
    if (!entityId) return;
    (async () => {
      const { data: fields } = await supabase
        .from("crm_custom_fields")
        .select("id, field_name, field_type, options")
        .eq("entity_id", entityId)
        .order("sort_order");
      if (fields) setCustomFields(fields as {id: string; field_name: string; field_type: string; options: string[]}[]);

      const { data: values } = await supabase
        .from("crm_custom_field_values")
        .select("field_id, value")
        .eq("prospect_id", prospectId);
      if (values) {
        const map: Record<string, string> = {};
        values.forEach((v: { field_id: string; value: string | null }) => { map[v.field_id] = v.value || ""; });
        setCustomValues(map);
      }
    })();
  }, [entityId, prospectId, supabase]);

  const fetchTimeline = useCallback(async (p: CrmProspect) => {
    const acts: ActivityEntry[] = [];

    // Creation event
    acts.push({
      id: "creation",
      type: "creation",
      content: `Lead créé${p.source ? ` — Source: ${p.source}` : ""}`,
      date: p.created_at,
      author: "",
    });

    // Fetch commercial actions from DB
    const { data: actions } = await supabase
      .from("crm_commercial_actions")
      .select("id, action_type, subject, content, metadata, created_at, author:profiles(first_name, last_name)")
      .eq("prospect_id", p.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (actions) {
      for (const a of actions) {
        const authorName = (a.author as any)?.first_name
          ? `${(a.author as any).first_name} ${(a.author as any).last_name}`
          : "";
        acts.push({
          id: a.id,
          type: a.action_type,
          content: a.subject || a.content || a.action_type,
          date: a.created_at,
          author: authorName,
          metadata: a.metadata as Record<string, unknown> | undefined,
        });
      }
    }

    // Sort by date descending
    acts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setActivities(acts);
  }, [supabase]);

  // ── Fetch trainings for linking dialog ──────────────────────────────────
  async function openLinkTrainingDialog() {
    setLinkTrainingOpen(true);
    setTrainingSearch("");
    if (existingTrainings.length > 0) return; // already loaded
    setLoadingTrainings(true);
    const { data } = await supabase
      .from("trainings")
      .select("*")
      .eq("entity_id", entityId)
      .eq("is_active", true)
      .order("title");
    setExistingTrainings((data as Training[]) ?? []);
    setLoadingTrainings(false);
  }

  async function handleLinkTraining(training: Training) {
    setLinkingSaving(true);
    const { error } = await supabase
      .from("crm_prospects")
      .update({ linked_training_id: training.id, updated_at: new Date().toISOString() })
      .eq("id", prospectId);
    if (!error) {
      setLinkedTraining(training);
      setProspect((prev) => prev ? { ...prev, linked_training_id: training.id } : prev);
    }
    setLinkingSaving(false);
    setLinkTrainingOpen(false);
  }

  async function handleUnlinkTraining() {
    const { error } = await supabase
      .from("crm_prospects")
      .update({ linked_training_id: null, updated_at: new Date().toISOString() })
      .eq("id", prospectId);
    if (!error) {
      setLinkedTraining(null);
      setProspect((prev) => prev ? { ...prev, linked_training_id: null } : prev);
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  function openEdit() {
    if (!prospect) return;
    setEditForm({
      company_name: prospect.company_name,
      siret: prospect.siret ?? "",
      naf_code: prospect.naf_code ?? "",
      contact_name: prospect.contact_name ?? "",
      email: prospect.email ?? "",
      phone: prospect.phone ?? "",
      source: prospect.source ?? "",
      notes: prospect.notes ?? "",
      amount: prospect.amount ? String(prospect.amount) : "",
      address: prospect.address ?? "",
      city: prospect.city ?? "",
      postal_code: prospect.postal_code ?? "",
    });
  }

  async function handleSaveEdit() {
    if (!prospect) return;
    setSaving(true);
    const { error } = await supabase
      .from("crm_prospects")
      .update({
        company_name: editForm.company_name.trim(),
        siret: editForm.siret.trim() || null,
        naf_code: editForm.naf_code.trim() || null,
        contact_name: editForm.contact_name.trim() || null,
        email: editForm.email.trim() || null,
        phone: editForm.phone.trim() || null,
        source: editForm.source || null,
        notes: editForm.notes.trim() || null,
        amount: editForm.amount ? parseFloat(editForm.amount) : null,
        address: editForm.address.trim() || null,
        city: editForm.city.trim() || null,
        postal_code: editForm.postal_code.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", prospect.id);
    if (error) {
      console.error("handleSaveEdit error:", error);
      setSaving(false);
      return;
    }

    // Save custom field values
    for (const [fieldId, value] of Object.entries(customValues)) {
      await supabase.from("crm_custom_field_values").upsert({
        prospect_id: prospect.id,
        field_id: fieldId,
        value: value || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "prospect_id,field_id" });
    }

    setSaving(false);
    fetchProspect();
  }

  async function handleAddNote() {
    if (!prospect || !newNote.trim()) return;
    setSaving(true);
    const currentNotes = prospect.notes ? prospect.notes + "\n" : "";
    const { error } = await supabase
      .from("crm_prospects")
      .update({
        notes: currentNotes + `[${new Date().toLocaleDateString("fr-FR")}] ${newNote.trim()}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", prospect.id);

    // Also log as commercial action for timeline
    const { data: { user } } = await supabase.auth.getUser();
    if (user && entityId) {
      await logCommercialAction({
        supabase,
        entityId,
        authorId: user.id,
        actionType: "comment",
        prospectId: prospect.id,
        subject: "Note",
        content: newNote.trim(),
      });
    }

    setSaving(false);
    if (error) {
      toast({ title: "Erreur", description: "Impossible d'ajouter la note", variant: "destructive" });
      return;
    }
    toast({ title: "Note ajoutée" });
    setShowNoteForm(false);
    setNewNote("");
    fetchProspect();
    fetchTimeline(prospect);
  }

  async function handleAddAction() {
    if (!prospect || !actionForm.subject.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user && entityId) {
      await logCommercialAction({
        supabase,
        entityId,
        authorId: user.id,
        actionType: actionForm.type as import("@/lib/types").CommercialActionType,
        prospectId: prospect.id,
        subject: actionForm.subject.trim(),
        content: actionForm.content.trim() || undefined,
      });
    }
    setSaving(false);
    setShowActionForm(false);
    setActionForm({ type: "call", subject: "", content: "" });
    if (prospect) fetchTimeline(prospect);
  }

  async function handleDelete() {
    const { error } = await supabase.from("crm_prospects").delete().eq("id", prospectId);
    if (error) {
      console.error("handleDelete error:", error);
      return;
    }
    router.push("/admin/crm/prospects");
  }

  function extractAmount(_notes: string | null): number {
    return 0;
  }

  // ── Devis actions ──────────────────────────────────────────────────────────

  async function handleDownloadDevis(q: CrmQuote) {
    if (!prospect) return;
    try {
      let meta: Record<string, unknown> = {};
      try { meta = q.notes ? JSON.parse(q.notes) : {}; } catch { /* notes is plain text */ }

      const lines = Array.isArray(meta.lines) ? meta.lines : [];
      // Parse TVA: could be number or string like "20,00"
      let tvaRate = 20;
      if (typeof meta.tva === "number") {
        tvaRate = meta.tva;
      } else if (typeof meta.tva === "string") {
        tvaRate = parseFloat(String(meta.tva).replace(",", ".")) || 20;
      }

      const devisData: DevisData = {
        reference: q.reference ?? `DEV-${q.id.slice(0, 6).toUpperCase()}`,
        date_creation: q.created_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        date_echeance: q.valid_until ?? q.created_at?.slice(0, 10) ?? "",
        training_start: (meta.training_start as string) || undefined,
        training_end: (meta.training_end as string) || undefined,
        tva: tvaRate,
        effectifs: meta.effectifs ? Number(meta.effectifs) : undefined,
        duration: (meta.duration as string) || undefined,
        notes: (meta.notes_text as string) || undefined,
        mention: (meta.mention as string) || undefined,
        training_title: (meta.training_title as string) || undefined,
        signer_name: (meta.signer_name as string) || undefined,
        validity_days: meta.validity_days ? Number(meta.validity_days) : 30,
        lines: lines.map((l: Record<string, unknown>) => ({
          description: String(l.description ?? ""),
          quantity: Number(l.quantity ?? 1),
          unit_price: Number(l.unit_price ?? 0),
        })),
        prospect_name: prospect.company_name,
        prospect_address: (meta.prospect_address as string) || undefined,
        prospect_email: prospect.email ?? undefined,
        prospect_phone: prospect.phone ?? undefined,
        prospect_siret: prospect.siret ?? undefined,
      };

      // If no lines parsed from JSON, create a single line from the amount or the prospect amount
      if (devisData.lines.length === 0) {
        const fallbackAmount = q.amount || Number(prospect.amount) || 0;
        if (fallbackAmount > 0) {
          const amountHT = fallbackAmount / (1 + tvaRate / 100);
          devisData.lines = [{ description: "Formation", quantity: 1, unit_price: Math.round(amountHT * 100) / 100 }];
        }
      }

      await downloadDevisPDF(devisData);
    } catch (err) {
      console.error("PDF download error:", err);
    }
  }

  async function handleDeleteQuote(quoteId: string) {
    if (!confirm("Supprimer ce devis ?")) return;
    const { error } = await supabase.from("crm_quotes").delete().eq("id", quoteId);
    if (error) {
      console.error("handleDeleteQuote error:", error);
      return;
    }
    setQuotes((prev) => prev.filter((q) => q.id !== quoteId));
  }

  // ── AI Functions ──────────────────────────────────────────────────────────

  const handleEnrichPappers = async () => {
    if (!prospect?.siret) return;
    setEnriching(true);
    try {
      const res = await fetch(`/api/pappers/company?siret=${prospect.siret}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur Pappers");
      setEnrichData(data);
      const opco = detectOPCO(data.naf_code);
      toast({
        title: "Données Pappers récupérées",
        description: opco ? `OPCO probable : ${opco.opco}` : "OPCO non détecté",
      });
      // Auto-update NAF + address if missing
      const autoUpdate: Record<string, string> = {};
      if (data.naf_code && !prospect.naf_code) autoUpdate.naf_code = data.naf_code;
      if (data.address && !prospect.address) autoUpdate.address = data.address;
      if (data.city && !prospect.city) autoUpdate.city = data.city;
      if (data.postal_code && !prospect.postal_code) autoUpdate.postal_code = data.postal_code;
      if (Object.keys(autoUpdate).length > 0) {
        await supabase.from("crm_prospects").update(autoUpdate).eq("id", prospect.id);
        fetchProspect();
      }
    } catch (err) {
      toast({ title: "Erreur Pappers", description: err instanceof Error ? err.message : "Service indisponible", variant: "destructive" });
    } finally {
      setEnriching(false);
    }
  };

  const handleAiInsights = async () => {
    if (!prospect) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/enrich-prospect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: prospect.company_name,
          siret: prospect.siret,
          naf_code: prospect.naf_code || enrichData?.naf_code,
          naf_label: enrichData?.naf_label,
          employees: enrichData?.employees,
          notes: prospect.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur IA");
      setAiInsights(data.insights);
    } catch (err) {
      toast({ title: "Service IA indisponible", description: err instanceof Error ? err.message : "Réessayez plus tard", variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const handleRecalcScore = async () => {
    if (!prospect) return;
    setScoringLoading(true);
    try {
      const res = await fetch("/api/ai/score-prospect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospect_id: prospect.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur scoring");
      setProspect((prev) => prev ? { ...prev, score: data.score } : prev);
      toast({ title: `Score : ${data.score}/100` });
    } catch (err) {
      toast({ title: "Erreur scoring", description: err instanceof Error ? err.message : "Réessayez", variant: "destructive" });
    } finally {
      setScoringLoading(false);
    }
  };

  const scoreCategory = prospect?.score ? getScoreCategory(prospect.score) : null;

  // Dormancy detection from timeline activities
  const isDormant = useMemo(() => {
    if (!prospect || prospect.status === "won" || prospect.status === "lost") return false;
    const realActions = activities.filter((a) => a.type !== "creation");
    if (realActions.length === 0) return true;
    const latestAction = new Date(realActions[0].date);
    const daysSince = Math.floor((Date.now() - latestAction.getTime()) / (1000 * 60 * 60 * 24));
    return daysSince >= DORMANCY_THRESHOLD_DAYS;
  }, [activities, prospect]);

  const daysSinceLastAction = useMemo(() => {
    const realActions = activities.filter((a) => a.type !== "creation");
    if (realActions.length === 0) return null;
    return Math.floor((Date.now() - new Date(realActions[0].date).getTime()) / (1000 * 60 * 60 * 24));
  }, [activities]);

  // ── Render ────────────────────────────────────────────────────────────────

  const handleConvertToClient = async () => {
    if (!prospect || !entityId) return;
    setConverting(true);
    try {
      const { data: newClient, error: clientErr } = await supabase
        .from("clients")
        .insert({
          entity_id: entityId,
          company_name: prospect.company_name,
          siret: prospect.siret || null,
          email: prospect.email || null,
          phone: prospect.phone || null,
          address: prospect.address || null,
          city: prospect.city || null,
          postal_code: prospect.postal_code || null,
          status: "active",
        })
        .select("id")
        .single();
      if (clientErr) throw clientErr;

      const { error: updateErr } = await supabase
        .from("crm_prospects")
        .update({ converted_client_id: newClient.id, status: "won" })
        .eq("id", prospect.id);
      if (updateErr) throw updateErr;

      toast({ title: "Prospect converti en client" });
      setConvertDialogOpen(false);
      router.push(`/admin/clients/${newClient.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur lors de la conversion";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setConverting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!prospect) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Prospect introuvable.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/admin/crm/prospects")}>
          Retour au tunnel
        </Button>
      </div>
    );
  }

  const amount = Number(prospect.amount) || 0;

  return (
    <div className="space-y-0">
      {/* ── HEADER HUBSPOT STYLE ────────────────────────────────────────── */}
      <div className="bg-white border-b px-6 py-5">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
          <button
            onClick={() => router.push("/admin/crm/prospects")}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Tunnel de Vente
          </button>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">{prospect.company_name}</span>
        </div>

        {/* Main info line */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center text-lg font-bold text-gray-400 shrink-0">
              {prospect.company_name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-900">{prospect.company_name}</h1>
                {scoreCategory && (
                  <Badge className={`text-xs ${scoreCategory.color}`} title={`Score : ${prospect.score}/100`}>
                    {scoreCategory.emoji} {prospect.score}
                  </Badge>
                )}
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleRecalcScore} disabled={scoringLoading} title="Recalculer le score">
                  {scoringLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="text-xs">📊</span>}
                </Button>
              </div>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                {prospect.contact_name && (
                  <span className="flex items-center gap-1"><User className="w-3 h-3" />{prospect.contact_name}</span>
                )}
                {prospect.email && (
                  <a href={`mailto:${prospect.email}`} className="flex items-center gap-1 text-[#374151] hover:underline"><Mail className="w-3 h-3" />{prospect.email}</a>
                )}
                {prospect.phone && (
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{prospect.phone}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Select value={prospect.status} onValueChange={async (v) => {
              const oldStatus = prospect.status;
              setProspect(prev => prev ? {...prev, status: v as ProspectStatus} : prev);
              const { error } = await supabase.from("crm_prospects").update({ status: v, updated_at: new Date().toISOString() }).eq("id", prospectId);
              if (error) { setProspect(prev => prev ? {...prev, status: oldStatus as ProspectStatus} : prev); return; }
              const { data: { user } } = await supabase.auth.getUser();
              if (user && entityId) {
                logCommercialAction({ supabase, entityId, authorId: user.id, actionType: "status_change", prospectId: prospect.id, subject: `${STATUS_CONFIG[oldStatus]?.label} \u2192 ${STATUS_CONFIG[v]?.label}`, metadata: { from: oldStatus, to: v } });
              }
              if (prospect) fetchTimeline(prospect);
            }}>
              <SelectTrigger className="h-7 w-auto border-0 bg-transparent p-0 gap-1">
                <Badge className="text-white text-xs px-3 py-1" style={{ backgroundColor: (STATUS_CONFIG[prospect.status] ?? { color: "#6b7280" }).color }}>
                  {(STATUS_CONFIG[prospect.status] ?? { label: prospect.status }).label}
                </Badge>
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(s => (
                  <SelectItem key={s} value={s}>{STATUS_CONFIG[s]?.label ?? s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {amount > 0 && (
              <span className="text-sm font-bold text-gray-700">{amount.toLocaleString("fr-FR")} €</span>
            )}
            {prospect.source && (
              <Badge variant="secondary" className="text-xs">{prospect.source}</Badge>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {prospect.email && (
            <Button size="sm" className="text-xs h-8 gap-1.5" style={{ background: "#374151" }}
              onClick={() => setActiveTab("communication")}
            >
              <Send className="w-3 h-3" /> Email
            </Button>
          )}
          <Button size="sm" variant="outline" className="text-xs h-8 gap-1.5"
            onClick={() => router.push(`/admin/crm/quotes/new?prospect_id=${prospect.id}`)}
          >
            <FileText className="w-3 h-3" /> Devis
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-8 gap-1.5"
            onClick={() => { setShowActionForm(true); setActiveTab("timeline"); }}
          >
            <Plus className="w-3 h-3" /> Action
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-8 gap-1.5"
            onClick={() => { setShowNoteForm(true); setActiveTab("timeline"); }}
          >
            <StickyNote className="w-3 h-3" /> Note
          </Button>
          {prospect.status === "won" && !prospect.converted_client_id && (
            <Button size="sm" variant="outline" className="text-xs h-8 gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
              onClick={() => setConvertDialogOpen(true)}
            >
              <CheckCircle className="w-3 h-3" /> Convertir en client
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-xs h-8 gap-1.5" onClick={() => { openEdit(); setEditMode(true); }}>
            <Pencil className="w-3 h-3" /> Modifier
          </Button>
          <Button size="sm" variant="ghost" className="text-xs h-8 gap-1.5 text-red-500 hover:text-red-600 hover:bg-red-50"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* ── DORMANCY BANNER ─────────────────────────────────────────────── */}
      {isDormant && (
        <div className="mx-6 mt-4 flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-orange-800">
              Prospect dormant
              {daysSinceLastAction !== null
                ? ` — Aucune action depuis ${daysSinceLastAction} jour(s)`
                : " — Aucune action commerciale enregistrée"}
            </p>
            <p className="text-xs text-orange-600 mt-0.5">
              Planifiez un appel ou une relance pour relancer ce prospect.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto text-xs shrink-0 border-orange-300 text-orange-700 hover:bg-orange-100"
            onClick={() => { setShowActionForm(true); setActiveTab("timeline"); }}
          >
            <Plus className="w-3 h-3 mr-1" /> Action
          </Button>
        </div>
      )}

      {/* ── 2 COLONNES ──────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row gap-0 min-h-0 md:min-h-[calc(100vh-200px)]">
        {/* ── GAUCHE: Activité (2/3) ── */}
        <div className="flex-1 border-r bg-gray-50/50 p-6">
          {/* Tabs */}

          {/* Tabbed tracking: Timeline / Commercial / Communication */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 gap-6 mb-4">
              <TabsTrigger
                value="timeline"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none bg-transparent px-1 pb-2.5 text-sm font-medium"
              >
                <Clock className="h-4 w-4 mr-1.5" />
                Timeline
              </TabsTrigger>
              <TabsTrigger
                value="commercial"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none bg-transparent px-1 pb-2.5 text-sm font-medium"
              >
                <ClipboardList className="h-4 w-4 mr-1.5" />
                Tâches
              </TabsTrigger>
              <TabsTrigger
                value="communication"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none bg-transparent px-1 pb-2.5 text-sm font-medium"
              >
                <Send className="h-4 w-4 mr-1.5" />
                Communication
              </TabsTrigger>
            </TabsList>

            <TabsContent value="commercial">
              <ProspectTasksSection
                prospectId={prospect.id}
                prospectName={prospect.company_name}
              />
            </TabsContent>
            <TabsContent value="communication">
              <div className="space-y-6">
                <ProspectEmailSection
                  prospectId={prospect.id}
                  prospect={prospect}
                />
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <MessageSquare className="h-4 w-4" /> Commentaires internes
                  </h3>
                  <ProspectCommentsSection prospectId={prospect.id} />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="timeline">
              <div className="space-y-4">
                {showNoteForm ? (
                  <div className="border rounded-lg p-3 mb-3 bg-gray-50/50 space-y-2">
                    <Textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Ajouter une note..."
                      rows={2}
                      autoFocus
                      className="text-sm resize-none"
                      onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey && newNote.trim()) handleAddNote(); if (e.key === "Escape") { setShowNoteForm(false); setNewNote(""); } }}
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400">Ctrl+Enter pour envoyer</span>
                      <div className="flex-1" />
                      <Button size="sm" variant="ghost" className="text-xs h-6" onClick={() => { setShowNoteForm(false); setNewNote(""); }}>Annuler</Button>
                      <Button size="sm" className="text-xs h-6" onClick={handleAddNote} disabled={saving || !newNote.trim()}>Ajouter</Button>
                    </div>
                  </div>
                ) : null}
                {showActionForm ? (
                  <div className="border rounded-lg p-3 mb-3 bg-gray-50/50 space-y-2">
                    <div className="flex items-center gap-2">
                      <Select value={actionForm.type} onValueChange={(v) => setActionForm(f => ({...f, type: v}))}>
                        <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {QUICK_ACTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input value={actionForm.subject} onChange={(e) => setActionForm(f => ({...f, subject: e.target.value}))} placeholder="Sujet..." className="h-8 text-xs flex-1" onKeyDown={(e) => { if (e.key === "Enter" && actionForm.subject.trim()) handleAddAction(); if (e.key === "Escape") setShowActionForm(false); }} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400">Enter pour enregistrer</span>
                      <div className="flex-1" />
                      <Button size="sm" variant="ghost" className="text-xs h-6" onClick={() => setShowActionForm(false)}>Annuler</Button>
                      <Button size="sm" className="text-xs h-6" onClick={handleAddAction} disabled={saving || !actionForm.subject.trim()}>Enregistrer</Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => setShowActionForm(true)}>
                    <Plus className="h-3 w-3" /> Ajouter une action
                  </Button>
                )}
                <div className="space-y-2">
                  {activities.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">Aucune activité enregistrée</p>
                  )}
                  {activities.map((a) => {
                    const cfg = ACTION_ICONS[a.type] || ACTION_ICONS.note;
                    return (
                      <div
                        key={a.id}
                        className="flex items-start gap-3 rounded-lg border border-gray-100 px-4 py-3 hover:bg-muted/30 transition-colors"
                      >
                        <span className="text-base mt-0.5">{cfg.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{a.content}</p>
                          {a.metadata && a.type === "status_change" && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {STATUS_CONFIG[(a.metadata.from as string)]?.label ?? a.metadata.from} → {STATUS_CONFIG[(a.metadata.to as string)]?.label ?? a.metadata.to}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-muted-foreground">{formatDate(a.date)}</p>
                          {a.author && <p className="text-xs text-muted-foreground">{a.author}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* ── DROITE: Infos & Devis (1/3) ── */}
        <div className="w-full md:w-80 shrink-0 bg-white border-t md:border-t-0 p-6 space-y-6 overflow-y-auto">
          {/* Infos */}
          {editMode ? (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Modifier</h3>
              <div className="space-y-2">
                <Input value={editForm.company_name} onChange={e => setEditForm(f => ({...f, company_name: e.target.value}))} placeholder="Nom entreprise" className="h-8 text-xs" />
                <Input value={editForm.contact_name} onChange={e => setEditForm(f => ({...f, contact_name: e.target.value}))} placeholder="Contact" className="h-8 text-xs" />
                <Input value={editForm.email} onChange={e => setEditForm(f => ({...f, email: e.target.value}))} placeholder="Email" className="h-8 text-xs" />
                <Input value={editForm.phone} onChange={e => setEditForm(f => ({...f, phone: e.target.value}))} placeholder="Téléphone" className="h-8 text-xs" />
                <Input value={editForm.siret} onChange={e => setEditForm(f => ({...f, siret: e.target.value}))} placeholder="SIRET" className="h-8 text-xs" />
                <Input value={editForm.address} onChange={e => setEditForm(f => ({...f, address: e.target.value}))} placeholder="Adresse" className="h-8 text-xs" />
                <div className="grid grid-cols-2 gap-2">
                  <Input value={editForm.postal_code} onChange={e => setEditForm(f => ({...f, postal_code: e.target.value}))} placeholder="Code postal" className="h-8 text-xs" />
                  <Input value={editForm.city} onChange={e => setEditForm(f => ({...f, city: e.target.value}))} placeholder="Ville" className="h-8 text-xs" />
                </div>
                <Input value={editForm.source} onChange={e => setEditForm(f => ({...f, source: e.target.value}))} placeholder="Source" className="h-8 text-xs" />
                <Input type="number" value={editForm.amount} onChange={e => setEditForm(f => ({...f, amount: e.target.value}))} placeholder="Montant HT" className="h-8 text-xs" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="text-xs h-7 flex-1" onClick={() => setEditMode(false)}>Annuler</Button>
                <Button size="sm" className="text-xs h-7 flex-1" onClick={async () => { await handleSaveEdit(); setEditMode(false); }} disabled={saving}>Sauvegarder</Button>
              </div>
            </div>
          ) : (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Informations</h3>
              <div className="space-y-2 text-sm">
                {prospect.siret && (
                  <div className="flex justify-between"><span className="text-muted-foreground">SIRET</span><span className="font-medium">{prospect.siret}</span></div>
                )}
                {prospect.naf_code && (
                  <div className="flex justify-between"><span className="text-muted-foreground">NAF</span><span className="font-medium">{prospect.naf_code}</span></div>
                )}
                {(prospect.address || prospect.city || prospect.postal_code) && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Adresse</span><span className="font-medium text-right">{[prospect.address, prospect.postal_code, prospect.city].filter(Boolean).join(", ")}</span></div>
                )}
                {prospect.source && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Source</span><span className="font-medium">{prospect.source}</span></div>
                )}
                <div className="flex justify-between"><span className="text-muted-foreground">Créé le</span><span className="font-medium">{formatDate(prospect.created_at)}</span></div>
                {amount > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Montant HT</span><span className="font-bold text-gray-900">{amount.toLocaleString("fr-FR")} €</span></div>
                )}
              </div>
            </div>
          )}

          {customFields.length > 0 && (
            <>
              <hr className="border-gray-100" />
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Champs personnalis&#233;s</h3>
                <div className="space-y-2 text-sm">
                  {customFields.map(f => (
                    <div key={f.id} className="flex justify-between">
                      <span className="text-muted-foreground">{f.field_name}</span>
                      <span className="font-medium">{customValues[f.id] || "\u2014"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ═══ IA SECTION ═══ */}
          <hr className="border-gray-100" />
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Intelligence commerciale</h3>

            {/* Bouton Enrichir Pappers */}
            {prospect.siret && (
              <Button size="sm" variant="outline" className="w-full text-xs h-7 gap-1" onClick={handleEnrichPappers} disabled={enriching}>
                {enriching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                Enrichir via Pappers
              </Button>
            )}

            {/* Résultat Pappers */}
            {enrichData && (
              <div className="text-xs space-y-1 p-2 bg-blue-50 rounded-lg">
                {!!enrichData.naf_label && <p><span className="text-muted-foreground">NAF :</span> <strong>{String(enrichData.naf_code)}</strong> — {String(enrichData.naf_label)}</p>}
                {!!enrichData.employees && <p><span className="text-muted-foreground">Effectif :</span> <strong>{String(enrichData.employees)}</strong></p>}
                {(() => { const opco = detectOPCO(String(enrichData.naf_code || "")); return opco ? <p><span className="text-muted-foreground">OPCO :</span> <strong className="text-blue-600">{opco.opco}</strong> <Badge variant="outline" className="text-[9px] ml-1">{opco.confidence}</Badge></p> : null; })()}
                {(() => { const dirs = enrichData.dirigeants as Array<Record<string, string>> | undefined; return dirs && dirs.length > 0 ? <p><span className="text-muted-foreground">Dirigeant :</span> <strong>{dirs[0].prenom} {dirs[0].nom}</strong></p> : null; })()}
              </div>
            )}

            {/* Bouton Insights IA */}
            <Button size="sm" variant="outline" className="w-full text-xs h-7 gap-1" onClick={handleAiInsights} disabled={aiLoading}>
              {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <span>✨</span>}
              Analyser ce prospect (IA)
            </Button>

            {/* Résultats IA */}
            {aiInsights && (
              <div className="text-xs space-y-2 p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                <p className="font-semibold text-indigo-800 flex items-center gap-1">✨ Insights IA</p>
                {Array.isArray(aiInsights.suggested_trainings) && (
                  <div>
                    <p className="text-muted-foreground mb-1">Formations suggérées :</p>
                    <div className="flex flex-wrap gap-1">
                      {(aiInsights.suggested_trainings as string[]).map((t, i) => (
                        <Badge key={i} variant="outline" className="text-[9px]">{t}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {!!aiInsights.sales_pitch && <p className="italic text-indigo-700">{String(aiInsights.sales_pitch)}</p>}
                {!!aiInsights.estimated_budget && <p><span className="text-muted-foreground">Budget estimé :</span> <strong>{String(aiInsights.estimated_budget)}</strong></p>}
                {!!aiInsights.key_contact_role && <p><span className="text-muted-foreground">Contact idéal :</span> <strong>{String(aiInsights.key_contact_role)}</strong></p>}
                {!!aiInsights.opco_tips && <p><span className="text-muted-foreground">Conseil OPCO :</span> {String(aiInsights.opco_tips)}</p>}
              </div>
            )}
          </div>

          <hr className="border-gray-100" />

          {/* Devis */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Devis ({quotes.length})</h3>
              <Button size="sm" variant="ghost" className="text-xs h-6 px-2 gap-1"
                onClick={() => router.push(`/admin/crm/quotes/new?prospect_id=${prospect.id}`)}
              >
                <Plus className="w-3 h-3" /> Créer
              </Button>
            </div>
            {quotes.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucun devis</p>
            ) : (
              <div className="space-y-2">
                {quotes.map((q) => (
                  <div key={q.id} className="rounded-lg border border-gray-100 p-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium">{q.reference}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {q.status === "accepted" ? "Accepté" : q.status === "rejected" ? "Refusé" : q.status === "sent" ? "Envoyé" : "Brouillon"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{formatDate(q.created_at)}</span>
                      <span className="text-sm font-semibold">{q.amount ? `${q.amount.toLocaleString("fr-FR")} €` : "—"}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                      {/* Bouton principal : signature ou état */}
                      {(q as unknown as Record<string, unknown>).signed_at ? (
                        <span className="text-[10px] text-green-600 font-medium">✓ Signé</span>
                      ) : (q as unknown as Record<string, unknown>).signature_requested_at ? (
                        <span className="text-[10px] text-indigo-600 font-medium">En attente de signature</span>
                      ) : q.status !== "accepted" ? (
                        <button
                          onClick={async () => {
                            {
                              toast({ title: "Envoi en cours..." });
                              fetch("/api/crm/quotes/sign-request", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ quote_id: q.id }),
                              })
                                .then(async (res) => {
                                  const text = await res.text();
                                  if (!res.ok) {
                                    let msg = `Erreur ${res.status}`;
                                    try { msg = JSON.parse(text).error || msg; } catch { msg = text.slice(0, 200) || msg; }
                                    toast({ title: "Erreur", description: String(msg), variant: "destructive" });
                                    return;
                                  }
                                  const data = JSON.parse(text);
                                  toast({ title: "Envoyé pour signature", description: `Email envoyé à ${data.email_sent_to}` });
                                  fetchProspect();
                                })
                                .catch((err) => {
                                  toast({ title: "Erreur réseau", description: String(err?.message || err), variant: "destructive" });
                                });
                            }
                          }}
                          className="text-[10px] text-indigo-600 hover:underline font-medium"
                        >
                          ✉ Envoyer pour signature
                        </button>
                      ) : null}
                      <span className="text-gray-300">·</span>
                      <button onClick={() => handleDownloadDevis(q)} className="text-[10px] text-[#374151] hover:underline">PDF</button>
                      <span className="text-gray-300">·</span>
                      <button onClick={() => handleDeleteQuote(q.id)} className="text-[10px] text-red-400 hover:underline">Suppr.</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <hr className="border-gray-100" />

          {/* Formation */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Formation liée</h3>
            {linkedTraining ? (
              <div>
                <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 mb-2">
                  <p className="text-sm font-medium text-gray-900">{linkedTraining.title}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                    {linkedTraining.duration_hours && <span>{linkedTraining.duration_hours}h</span>}
                    {linkedTraining.price_per_person && <span>{Number(linkedTraining.price_per_person).toLocaleString("fr-FR")} €/pers</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={openLinkTrainingDialog} className="text-[10px] text-[#374151] hover:underline">Changer</button>
                  <button onClick={handleUnlinkTraining} className="text-[10px] text-red-400 hover:underline">Dissocier</button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="text-xs h-7 gap-1 w-full" onClick={openLinkTrainingDialog}>
                <ExternalLink className="w-3 h-3" /> Lier une formation
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* DIALOGS                                                          */}
      {/* ══════════════════════════════════════════════════════════════════ */}

      {/* ── Delete Dialog ────────────────────────────────────────────────── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600">Confirmer la suppression</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Cette action est irréversible. Le prospect <strong>{prospect.company_name}</strong> sera définitivement supprimé.
          </p>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm">Annuler</Button>
            </DialogClose>
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              SUPPRIMER
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Convert to Client Dialog ────────────────────────────────────── */}
      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Convertir en client</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>Un nouveau client sera créé avec les données suivantes :</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Entreprise :</strong> {prospect?.company_name}</li>
              {prospect?.siret && <li><strong>SIRET :</strong> {prospect.siret}</li>}
              {prospect?.email && <li><strong>Email :</strong> {prospect.email}</li>}
              {prospect?.phone && <li><strong>Téléphone :</strong> {prospect.phone}</li>}
            </ul>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setConvertDialogOpen(false)}>Annuler</Button>
            <Button size="sm" onClick={handleConvertToClient} disabled={converting} className="gap-1.5">
              {converting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Convertir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Link Training Dialog ───────────────────────────────────────── */}
      <Dialog open={linkTrainingOpen} onOpenChange={setLinkTrainingOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Connecter à une formation existante</DialogTitle>
          </DialogHeader>
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Rechercher une formation…"
              value={trainingSearch}
              onChange={(e) => setTrainingSearch(e.target.value)}
              className="pl-8 text-sm"
            />
          </div>
          <div className="max-h-[350px] overflow-y-auto space-y-1">
            {loadingTrainings ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : existingTrainings
                .filter((t) => {
                  const q = trainingSearch.toLowerCase();
                  return !q || t.title.toLowerCase().includes(q) || (t.category ?? "").toLowerCase().includes(q);
                })
                .length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-8">
                Aucune formation trouvée
              </p>
            ) : (
              existingTrainings
                .filter((t) => {
                  const q = trainingSearch.toLowerCase();
                  return !q || t.title.toLowerCase().includes(q) || (t.category ?? "").toLowerCase().includes(q);
                })
                .map((t) => (
                  <button
                    key={t.id}
                    disabled={linkingSaving}
                    onClick={() => handleLinkTraining(t)}
                    className="flex w-full items-center gap-3 rounded-lg border border-gray-100 bg-white p-3 text-left hover:border-blue-300 hover:bg-blue-50/50 transition-all disabled:opacity-50"
                  >
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                      <BookOpen className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{t.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {t.category && (
                          <span className="text-xs text-gray-400">{t.category}</span>
                        )}
                        {t.duration_hours && (
                          <span className="text-xs text-gray-400">{t.duration_hours}h</span>
                        )}
                        {t.price_per_person && (
                          <span className="text-xs text-gray-400">{Number(t.price_per_person).toLocaleString("fr-FR")} €/pers</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
                  </button>
                ))
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
