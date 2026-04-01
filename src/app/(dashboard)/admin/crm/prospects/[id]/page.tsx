"use client";

import { useEffect, useState, useCallback } from "react";
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
  TrendingUp,
  Download,
  MoreHorizontal,
  Search,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CrmProspect, CrmQuote, ProspectStatus, Training } from "@/lib/types";
import ProspectTasksSection from "../liste/_components/ProspectTasksSection";
import ProspectCommentsSection from "../liste/_components/ProspectCommentsSection";
import ProspectEmailSection from "../liste/_components/ProspectEmailSection";

// ── Constants ───────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  new:       { label: "Lead",        color: "#3DB5C5" },
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialogs
  const [editOpen, setEditOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
  });
  const [newNote, setNewNote] = useState("");
  const [newStatus, setNewStatus] = useState<ProspectStatus>("new");

  // Activity log (unified timeline)
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [actionOpen, setActionOpen] = useState(false);
  const [actionForm, setActionForm] = useState({ type: "call", subject: "", content: "" });

  // Training linking
  const [linkTrainingOpen, setLinkTrainingOpen] = useState(false);
  const [existingTrainings, setExistingTrainings] = useState<Training[]>([]);
  const [trainingSearch, setTrainingSearch] = useState("");
  const [loadingTrainings, setLoadingTrainings] = useState(false);
  const [linkedTraining, setLinkedTraining] = useState<Training | null>(null);
  const [linkingSaving, setLinkingSaving] = useState(false);

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
    });
    setEditOpen(true);
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
        updated_at: new Date().toISOString(),
      })
      .eq("id", prospect.id);
    setSaving(false);
    if (error) {
      console.error("handleSaveEdit error:", error);
      return;
    }
    setEditOpen(false);
    fetchProspect();
  }

  async function handleChangeStatus() {
    if (!prospect) return;
    const oldStatus = prospect.status;
    setSaving(true);
    const { error } = await supabase
      .from("crm_prospects")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", prospect.id);
    setSaving(false);
    if (error) {
      console.error("handleChangeStatus error:", error);
      return;
    }

    // Log commercial action
    const { data: { user } } = await supabase.auth.getUser();
    if (user && entityId) {
      logCommercialAction({
        supabase,
        entityId,
        authorId: user.id,
        actionType: "status_change",
        prospectId: prospect.id,
        subject: `${STATUS_CONFIG[oldStatus]?.label ?? oldStatus} → ${STATUS_CONFIG[newStatus]?.label ?? newStatus}`,
        metadata: { from: oldStatus, to: newStatus },
      });
    }

    setStatusOpen(false);
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
    setSaving(false);
    if (error) {
      console.error("handleAddNote error:", error);
      return;
    }
    setNoteOpen(false);
    setNewNote("");
    fetchProspect();
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
    setActionOpen(false);
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

  // ── Render ────────────────────────────────────────────────────────────────

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

  const statusInfo = STATUS_CONFIG[prospect.status] ?? { label: prospect.status, color: "#6b7280" };
  const amount = Number(prospect.amount) || 0;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Breadcrumb + Back */}
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => router.push("/admin/crm/prospects")}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Tunnel de Vente
        </button>
        <ChevronRight className="w-3 h-3 text-muted-foreground" />
        <span className="font-medium">{prospect.company_name}</span>
      </div>

      {/* ── Header: Infos entreprise ─────────────────────────────────────── */}
      <Card>
        <CardContent className="py-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Entreprise</p>
              <p className="text-sm"><span className="font-medium">Commercial :</span> MR FORMATION</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm font-medium">Statut :</span>
                <Badge
                  className="text-white text-xs"
                  style={{ backgroundColor: statusInfo.color }}
                >
                  {statusInfo.label}
                </Badge>
              </div>
              {amount > 0 && (
                <p className="text-sm mt-1">
                  <span className="font-medium">Montant HT :</span>{" "}
                  {amount.toLocaleString("fr-FR")} EUR
                </p>
              )}
            </div>
            {prospect.source && (
              <Badge variant="secondary" className="text-xs">
                {prospect.source}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Contacts ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Contacts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="bg-muted/40 rounded-lg p-4 space-y-1.5 text-sm">
            <p className="flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="font-medium">Nom :</span> {prospect.company_name}
            </p>
            {prospect.contact_name && (
              <p className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="font-medium">Contact :</span> {prospect.contact_name}
              </p>
            )}
            {prospect.email && (
              <p className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="font-medium">Email :</span> {prospect.email}
              </p>
            )}
            {prospect.phone && (
              <p className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="font-medium">Téléphone :</span> {prospect.phone}
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-2">
            {prospect.email && (
              <Button
                size="sm"
                variant="default"
                className="text-xs h-8"
                onClick={() => router.push(`/admin/crm/prospects/${prospect.id}/email`)}
              >
                <Send className="w-3 h-3 mr-1.5" />
                Email
              </Button>
            )}
            <Button
              size="sm"
              variant="default"
              className="text-xs h-8"
              onClick={() => router.push(`/admin/crm/quotes/new?prospect_id=${prospect.id}`)}
            >
              <FileText className="w-3 h-3 mr-1.5" />
              Devis
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-8"
              onClick={() => setActionOpen(true)}
            >
              <Plus className="w-3 h-3 mr-1.5" />
              Action
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-8"
              onClick={() => setNoteOpen(true)}
            >
              <StickyNote className="w-3 h-3 mr-1.5" />
              Note
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-8"
              onClick={() => { setNewStatus(prospect.status as ProspectStatus); setStatusOpen(true); }}
            >
              <TrendingUp className="w-3 h-3 mr-1.5" />
              Statut
            </Button>
            <Button size="sm" variant="ghost" className="text-xs h-8" onClick={openEdit}>
              <Pencil className="w-3 h-3 mr-1.5" />
              Modifier
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Devis ────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Devis</CardTitle>
        </CardHeader>
        <CardContent>
          {quotes.length === 0 ? (
            <p className="text-sm text-muted-foreground mb-3">Aucun devis pour ce lead.</p>
          ) : (
            <div className="space-y-2 mb-3">
              {quotes.map((q) => (
                <div
                  key={q.id}
                  className="rounded-lg border border-gray-200 bg-white overflow-hidden"
                >
                  {/* Quote header */}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30">
                    <div className="flex items-center gap-3 text-sm">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">
                        {formatDate(q.created_at)} — {q.reference}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {q.status === "accepted" ? "Accepté" : q.status === "rejected" ? "Refusé" : q.status === "sent" ? "Envoyé" : "Brouillon"}
                      </Badge>
                      <span className="font-semibold text-sm">
                        {q.amount ? `${q.amount.toLocaleString("fr-FR")} EUR` : "—"}
                      </span>
                    </div>
                  </div>
                  {/* Action bar */}
                  <div className="flex items-center gap-1 px-3 py-1.5 border-t border-gray-100">
                    <button
                      onClick={() => router.push(`/admin/crm/quotes/new?prospect_id=${prospect.id}&edit=${q.id}`)}
                      className="flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 transition"
                    >
                      <Pencil className="w-3 h-3" />
                      Modifier
                    </button>
                    <div className="w-px h-4 bg-gray-200" />
                    <button
                      onClick={() => handleDownloadDevis(q)}
                      className="flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium text-[#3DB5C5] hover:bg-[#e8f7f9] transition"
                    >
                      <Download className="w-3 h-3" />
                      Voir / Télécharger
                    </button>
                    <div className="w-px h-4 bg-gray-200" />
                    <button
                      onClick={() => router.push(`/admin/crm/prospects/${prospect.id}/email?subject=${encodeURIComponent(`Devis ${q.reference ?? ""}`)}`)}
                      className="flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 transition"
                    >
                      <Send className="w-3 h-3" />
                      Envoyer par email
                    </button>
                    <div className="w-px h-4 bg-gray-200" />
                    <button
                      onClick={() => handleDeleteQuote(q.id)}
                      className="flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50 transition"
                    >
                      <Trash2 className="w-3 h-3" />
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Button
            size="sm"
            variant="default"
            className="text-xs h-8"
            onClick={() => router.push(`/admin/crm/quotes/new?prospect_id=${prospect.id}`)}
          >
            <Plus className="w-3 h-3 mr-1.5" />
            CRÉER UN DEVIS
          </Button>
        </CardContent>
      </Card>

      {/* ── Questionnaires ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Questionnaires</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground uppercase tracking-wide font-medium mb-3">
            Pas de questionnaire attribué
          </p>
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-8"
            onClick={() => router.push("/admin/questionnaires")}
          >
            <ClipboardList className="w-3 h-3 mr-1.5" />
            Attribuer un questionnaire
          </Button>
        </CardContent>
      </Card>

      {/* ── Suivi de l'opportunité ───────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Suivi de l&apos;opportunité</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            <Button
              size="sm"
              variant="default"
              className="text-xs h-8"
              onClick={() => {
                setNewStatus(prospect.status);
                setStatusOpen(true);
              }}
            >
              <TrendingUp className="w-3 h-3 mr-1.5" />
              MODIFIER LE STATUT
            </Button>
            <Button
              size="sm"
              variant="default"
              className="text-xs h-8"
              onClick={() => setNoteOpen(true)}
            >
              <StickyNote className="w-3 h-3 mr-1.5" />
              AJOUTER UNE NOTE
            </Button>
          </div>

          {/* Tabbed tracking: Timeline / Commercial / Communication */}
          <Tabs defaultValue="timeline" className="w-full">
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
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs gap-1.5"
                  onClick={() => setActionOpen(true)}
                >
                  <Plus className="h-3 w-3" /> Ajouter une action
                </Button>
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
        </CardContent>
      </Card>

      {/* ── Formation ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Formation</CardTitle>
        </CardHeader>
        <CardContent>
          {linkedTraining ? (
            <div>
              <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3 mb-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{linkedTraining.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {linkedTraining.category && (
                      <span className="text-xs text-gray-500">{linkedTraining.category}</span>
                    )}
                    {linkedTraining.duration_hours && (
                      <span className="text-xs text-gray-500">{linkedTraining.duration_hours}h</span>
                    )}
                    {linkedTraining.price_per_person && (
                      <span className="text-xs text-gray-500">{Number(linkedTraining.price_per_person).toLocaleString("fr-FR")} €/pers</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-8"
                  onClick={openLinkTrainingDialog}
                >
                  <ExternalLink className="w-3 h-3 mr-1.5" />
                  Changer de formation
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-8 text-red-500 hover:text-red-600"
                  onClick={handleUnlinkTraining}
                >
                  <Trash2 className="w-3 h-3 mr-1.5" />
                  Dissocier
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <div className="bg-muted/40 rounded-lg p-4 mb-3">
                <p className="text-sm text-muted-foreground">
                  Connectez ce prospect à une formation existante.
                </p>
              </div>
              <Button
                size="sm"
                variant="default"
                className="text-xs h-8"
                onClick={openLinkTrainingDialog}
              >
                <ExternalLink className="w-3 h-3 mr-1.5" />
                CONNECTER À UNE FORMATION
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Documents ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Pas de documents pour ce lead.
          </p>
          <Button size="sm" variant="outline" className="text-xs h-8">
            <Upload className="w-3 h-3 mr-1.5" />
            AJOUTER
          </Button>
        </CardContent>
      </Card>

      {/* ── Supprimer le Lead ────────────────────────────────────────────── */}
      <Card className="border-red-200 bg-red-50/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-red-600">Supprimer le Lead</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Vous pouvez supprimer le lead après la suppression de ses documents et de ses notes...
          </p>
          <Button
            size="sm"
            variant="destructive"
            className="text-xs h-8"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="w-3 h-3 mr-1.5" />
            Supprimer
          </Button>
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* DIALOGS                                                          */}
      {/* ══════════════════════════════════════════════════════════════════ */}

      {/* ── Edit Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Modifier le lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Entreprise</label>
                <Input
                  value={editForm.company_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, company_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">SIRET</label>
                <Input
                  value={editForm.siret}
                  onChange={(e) => setEditForm((f) => ({ ...f, siret: e.target.value }))}
                  maxLength={14}
                  className="font-mono text-sm"
                  placeholder="14 chiffres"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Code NAF</label>
              <Input
                value={editForm.naf_code}
                onChange={(e) => setEditForm((f) => ({ ...f, naf_code: e.target.value }))}
                placeholder="Ex : 8559A"
                className="max-w-[200px]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Contact</label>
              <Input
                value={editForm.contact_name}
                onChange={(e) => setEditForm((f) => ({ ...f, contact_name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Email</label>
                <Input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Téléphone</label>
                <Input
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Source</label>
              <Select
                value={editForm.source}
                onValueChange={(v) => setEditForm((f) => ({ ...f, source: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner…" />
                </SelectTrigger>
                <SelectContent>
                  {["Bouche à oreille", "Réseaux sociaux", "Site web", "Email", "Téléphone", "Événement", "Partenaire", "Autre"].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Montant HT (EUR)</label>
              <Input
                type="number"
                placeholder="0.00"
                step="0.01"
                min="0"
                value={editForm.amount}
                onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Notes</label>
              <Textarea
                rows={4}
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm">Annuler</Button>
            </DialogClose>
            <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
              {saving ? "Enregistrement..." : "ENREGISTRER"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Status Dialog ────────────────────────────────────────────────── */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Modifier le statut du prospect</DialogTitle>
          </DialogHeader>
          <Select value={newStatus} onValueChange={(v) => setNewStatus(v as ProspectStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_CONFIG[s]?.label ?? s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm">Annuler</Button>
            </DialogClose>
            <Button size="sm" onClick={handleChangeStatus} disabled={saving}>
              {saving ? "..." : "ENREGISTRER"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Note Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter une note</DialogTitle>
          </DialogHeader>
          <Textarea
            rows={4}
            placeholder="Saisissez votre note..."
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
          />
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm">Annuler</Button>
            </DialogClose>
            <Button size="sm" onClick={handleAddNote} disabled={saving || !newNote.trim()}>
              {saving ? "..." : "AJOUTER"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* ── Quick Action Dialog ──────────────────────────────────────── */}
      <Dialog open={actionOpen} onOpenChange={setActionOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter une action commerciale</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Type</label>
              <Select value={actionForm.type} onValueChange={(v) => setActionForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUICK_ACTION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Sujet <span className="text-red-500">*</span></label>
              <Input
                value={actionForm.subject}
                onChange={(e) => setActionForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="Ex: Relance devis, RDV découverte..."
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Détails</label>
              <Textarea
                value={actionForm.content}
                onChange={(e) => setActionForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="Notes complémentaires..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionOpen(false)}>Annuler</Button>
            <Button onClick={handleAddAction} disabled={saving || !actionForm.subject.trim()}>
              {saving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
