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
import {
  EditCommercialActionDialog,
  type EditableCommercialAction,
} from "@/components/crm/EditCommercialActionDialog";
import { isCompanyQueryValid } from "@/lib/crm/company-search-query";

// ── Constants ───────────────────────────────────────────────────────────────

// h-23 AC-4b : feature flag pour le bouton "Enrichir" post-création.
// false par défaut depuis h-23 (recherche entreprise UPFRONT à la création via AddProspectDialog).
// Passer à true si besoin de réactiver (cas Sellsy import sans données entreprise).
const FEATURE_ENRICH_POST_CREATE = false;

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
  /**
   * Valeurs brutes BDD nécessaires pour pré-remplir le dialog d'édition.
   * Non définies pour les items synthétiques (creation) ou les logs auto.
   */
  rawSubject?: string | null;
  rawContent?: string | null;
}

/**
 * Types d'actions saisies manuellement par Loris (donc modifiables /
 * supprimables). Les autres types (status_change, quote_*, task_created,
 * document_sent) sont des LOGS SYSTÈME — non modifiables pour préserver
 * l'intégrité de l'historique commercial.
 */
const EDITABLE_ACTION_TYPES = new Set([
  "call",
  "email",
  "meeting",
  "comment",
  "relance",
]);

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
  // Édition / suppression d'une action commerciale manuelle
  const [editingAction, setEditingAction] = useState<EditableCommercialAction | null>(null);
  const [deletingActionId, setDeletingActionId] = useState<string | null>(null);

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
          rawSubject: a.subject,
          rawContent: a.content,
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

  /**
   * Supprime une action commerciale manuelle. RLS crm_commercial_actions
   * (USING + WITH CHECK entity_id = user_entity_id() + role admin/super_admin/
   * commercial) protège contre les suppressions cross-entité.
   *
   * Try/catch/finally pour éviter le state bloqué si le client Supabase
   * throw (réseau down, abort) sans retourner d'objet { error }.
   */
  async function handleDeleteAction(actionId: string) {
    if (!confirm("Supprimer cette action ? Cette opération est irréversible.")) return;
    setDeletingActionId(actionId);
    try {
      const { error } = await supabase
        .from("crm_commercial_actions")
        .delete()
        .eq("id", actionId);
      if (error) {
        toast({
          title: "Erreur",
          description: error.message,
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Action supprimée" });
      if (prospect) fetchTimeline(prospect);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast({
        title: "Erreur",
        description: message,
        variant: "destructive",
      });
    } finally {
      setDeletingActionId(null);
    }
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

  const [entrepriseSearchOpen, setEntrepriseSearchOpen] = useState(false);

  const handleEnrichEntreprise = async (siretOverride?: string) => {
    const siretToUse = siretOverride || prospect?.siret;
    if (!siretToUse) {
      // Pas de SIRET → ouvrir recherche par nom
      setEntrepriseSearchOpen(true);
      return;
    }
    setEnriching(true);
    try {
      const res = await fetch(`/api/pappers/company?siret=${siretToUse}`);
      const data = await res.json();

      if (!res.ok) {
        const errorMessages: Record<number, string> = {
          404: "Ce SIRET/SIREN n'a pas été trouvé. Vérifiez le numéro ou recherchez par nom.",
          429: "Trop de requêtes. Réessayez dans quelques secondes.",
          503: "Service Annuaire Entreprises en maintenance.",
        };
        const message = errorMessages[data.status_code || res.status] || data.error || "Erreur inattendue";
        toast({ title: "Enrichissement impossible", description: message, variant: "destructive" });
        if (res.status === 404) setEntrepriseSearchOpen(true);
        return;
      }

      const detail = data.data || data;
      setEnrichData(detail);
      const opco = detectOPCO(detail.naf_code);
      toast({
        title: data.cached ? "Données entreprise (cache)" : "Données entreprise récupérées",
        description: opco ? `OPCO probable : ${opco.opco}` : "OPCO non détecté",
      });
      // Auto-update NAF + address + SIRET if missing
      const autoUpdate: Record<string, string> = {};
      if (detail.naf_code && !prospect?.naf_code) autoUpdate.naf_code = detail.naf_code;
      if (detail.address && !prospect?.address) autoUpdate.address = detail.address;
      if (detail.city && !prospect?.city) autoUpdate.city = detail.city;
      if (detail.postal_code && !prospect?.postal_code) autoUpdate.postal_code = detail.postal_code;
      if (detail.siret && !prospect?.siret) autoUpdate.siret = detail.siret;
      if (Object.keys(autoUpdate).length > 0 && prospect) {
        await supabase.from("crm_prospects").update(autoUpdate).eq("id", prospect.id);
        fetchProspect();
      }
    } catch (err) {
      toast({ title: "Erreur enrichissement", description: err instanceof Error ? err.message : "Service indisponible", variant: "destructive" });
    } finally {
      setEnriching(false);
    }
  };

  const handleEntrepriseSearchSelect = async (siret: string) => {
    setEntrepriseSearchOpen(false);
    await handleEnrichEntreprise(siret);
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
    // P6 (code review h-23) — re-ajouter le guard entityId pour eviter un flash
    // 403 transitoire pendant le chargement du profile.
    if (!prospect || !entityId) return;
    setConverting(true);
    try {
      // h-23 task 3 : route API transactionnelle (fonction SQL RPC).
      // Remplace les 3 inserts/update inline non-transactionnels.
      const res = await fetch(
        `/api/crm/prospects/${prospect.id}/convert`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      );
      const result = await res.json();

      if (!res.ok) {
        // 409 doublon : message serveur explicite + référence client existant si dispo.
        // P9 (code review h-23) : strip "(id=...)" du message pour eviter UUID double
        // (le serveur RAISE EXCEPTION inclut deja l'UUID, et on l'ajoute en lien).
        if (res.status === 409 && result.existingClientId) {
          const cleanedError = String(result.error || "").replace(/\s*\(id=[^)]*\)\s*/g, "");
          toast({
            title: "Doublon détecté",
            description: `${cleanedError} — fiche client : /admin/clients/${result.existingClientId}`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Erreur de conversion",
            description: result.error || `Erreur HTTP ${res.status}`,
            variant: "destructive",
          });
        }
        return;
      }

      toast({
        title: "Prospect converti en client",
        description: "Redirection vers la fiche client...",
      });
      setConvertDialogOpen(false);
      router.push(`/admin/clients/${result.clientId}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Erreur lors de la conversion";
      toast({
        title: "Erreur",
        description: message,
        variant: "destructive",
      });
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
          {/* 2026-05-19 : bouton "Note" retiré sur demande Wissam. Le bouton
              "Action" couvre déjà l'ajout d'une note via le formulaire timeline.
              Code `showNoteForm` / `handleAddNote` conservé pour réversibilité. */}
          {!prospect.converted_client_id ? (
            <Button size="sm" variant="outline" className="text-xs h-8 gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
              onClick={() => setConvertDialogOpen(true)}
            >
              <CheckCircle className="w-3 h-3" /> Convertir en client
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="text-xs h-8 gap-1.5 border-green-300 text-green-700 bg-green-50"
              onClick={() => router.push(`/admin/clients/${prospect.converted_client_id}`)}
            >
              <CheckCircle className="w-3 h-3" /> Voir le client
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
                {/* h-23 AC-6 : tab limité aux emails uniquement (commentaires migrés dans Timeline) */}
                📧 Emails
              </TabsTrigger>
            </TabsList>

            <TabsContent value="commercial">
              <ProspectTasksSection
                prospectId={prospect.id}
                prospectName={prospect.company_name}
              />
            </TabsContent>
            <TabsContent value="communication">
              {/* h-23 AC-6 : tab "📧 Emails" — emails uniquement,
                  les commentaires internes ont été migrés vers Timeline. */}
              <ProspectEmailSection
                prospectId={prospect.id}
                prospect={prospect}
              />
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
                    const isEditable = EDITABLE_ACTION_TYPES.has(a.type);
                    return (
                      <div
                        key={a.id}
                        className="group flex items-start gap-3 rounded-lg border border-gray-100 px-4 py-3 hover:bg-muted/30 transition-colors"
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
                        <div className="text-right shrink-0 flex items-start gap-2">
                          <div>
                            <p className="text-xs text-muted-foreground">{formatDate(a.date)}</p>
                            {a.author && <p className="text-xs text-muted-foreground">{a.author}</p>}
                          </div>
                          {isEditable && (
                            <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() =>
                                  setEditingAction({
                                    id: a.id,
                                    action_type: a.type as EditableCommercialAction["action_type"],
                                    subject: a.rawSubject ?? null,
                                    content: a.rawContent ?? null,
                                  })
                                }
                                title="Modifier"
                                aria-label="Modifier l'action"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                                onClick={() => handleDeleteAction(a.id)}
                                disabled={deletingActionId === a.id}
                                title="Supprimer"
                                aria-label="Supprimer l'action"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* h-23 AC-6 : commentaires internes migrés ici (depuis Communication).
                    Séparation propre : Communication = emails / Timeline = actions + commentaires. */}
                <div className="border-t pt-4 mt-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <MessageSquare className="h-4 w-4" /> Commentaires internes
                  </h3>
                  <ProspectCommentsSection prospectId={prospect.id} />
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

            {/* h-23 AC-4b : bouton "Enrichir" masqué derrière feature flag.
                Recherche entreprise est désormais utilisée UPFRONT à la création (AddProspectDialog).
                Code conservé pour réversibilité si besoin futur (ex: import Sellsy sans données).
                Réactiver en mettant FEATURE_ENRICH_POST_CREATE à true. */}
            {FEATURE_ENRICH_POST_CREATE && (
              <Button size="sm" variant="outline" className="w-full text-xs h-7 gap-1" onClick={() => handleEnrichEntreprise()} disabled={enriching}>
                {enriching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                {prospect.siret ? "Enrichir via Annuaire Entreprises" : "Rechercher l'entreprise"}
              </Button>
            )}

            {/* Résultat enrichissement entreprise */}
            {enrichData && (
              <div className="text-xs space-y-1 p-2 bg-blue-50 rounded-lg">
                {!!enrichData.naf_label && <p><span className="text-muted-foreground">NAF :</span> <strong>{String(enrichData.naf_code)}</strong> — {String(enrichData.naf_label)}</p>}
                {!!enrichData.employees && <p><span className="text-muted-foreground">Effectif :</span> <strong>{String(enrichData.employees)}</strong></p>}
                {(() => { const opco = detectOPCO(String(enrichData.naf_code || "")); return opco ? <p><span className="text-muted-foreground">OPCO :</span> <strong className="text-blue-600">{opco.opco}</strong> <Badge variant="outline" className="text-[9px] ml-1">{opco.confidence}</Badge></p> : null; })()}
                {(() => { const dirs = enrichData.dirigeants as Array<Record<string, string>> | undefined; return dirs && dirs.length > 0 ? <p><span className="text-muted-foreground">Dirigeant :</span> <strong>{dirs[0].prenom} {dirs[0].nom}</strong></p> : null; })()}
              </div>
            )}

            {/* 2026-05-19 : bouton "Analyser ce prospect (IA)" + bloc résultats
                Insights IA retirés sur demande Wissam (feature inutile en pratique).
                Code handler `handleAiInsights` conservé pour réversibilité. */}
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Convertir en entreprise cliente</DialogTitle>
          </DialogHeader>
          <div className="text-sm space-y-3">
            <p className="text-muted-foreground">Un nouveau client sera créé dans l&apos;onglet <strong>Entreprises</strong> avec les données suivantes :</p>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1.5">
              <p><strong>Entreprise :</strong> {prospect?.company_name}</p>
              {prospect?.siret && <p className="text-xs text-muted-foreground">SIRET : {prospect.siret}</p>}
              {prospect?.contact_name && <p className="text-xs text-muted-foreground">Contact : {prospect.contact_name}</p>}
              {prospect?.email && <p className="text-xs text-muted-foreground">Email : {prospect.email}</p>}
              {prospect?.phone && <p className="text-xs text-muted-foreground">Tél : {prospect.phone}</p>}
              {(prospect?.address || prospect?.city) && (
                <p className="text-xs text-muted-foreground">Adresse : {[prospect.address, prospect.postal_code, prospect.city].filter(Boolean).join(" ")}</p>
              )}
            </div>
            {prospect?.contact_name && (
              <p className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded">
                Le contact <strong>{prospect.contact_name}</strong> sera automatiquement créé comme contact principal du client.
              </p>
            )}
            <p className="text-xs text-muted-foreground">Le prospect passera en statut &quot;Gagné&quot; et un lien vers le client sera ajouté.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setConvertDialogOpen(false)}>Annuler</Button>
            <Button size="sm" onClick={handleConvertToClient} disabled={converting} className="gap-1.5 bg-green-600 hover:bg-green-700">
              {converting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Convertir en client
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

      {/* Recherche entreprise dialog */}
      <Dialog open={entrepriseSearchOpen} onOpenChange={setEntrepriseSearchOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Rechercher l&apos;entreprise (Annuaire Entreprises)</DialogTitle>
          </DialogHeader>
          <EntrepriseSearchPanel companyName={prospect?.company_name || ""} onSelect={handleEntrepriseSearchSelect} />
        </DialogContent>
      </Dialog>

      {/* Mini-dialog édition d'une action commerciale manuelle */}
      <EditCommercialActionDialog
        open={editingAction !== null}
        onOpenChange={(o) => { if (!o) setEditingAction(null); }}
        action={editingAction}
        onUpdated={() => { if (prospect) fetchTimeline(prospect); }}
      />
    </div>
  );
}

function EntrepriseSearchPanel({ companyName, onSelect }: { companyName: string; onSelect: (siret: string) => void }) {
  const [query, setQuery] = useState(companyName);
  const [results, setResults] = useState<Array<{ company_name: string; siret: string; city: string; naf_code: string | null }>>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    // data.gouv exige ≥ 3 caractères (cf. company-search-query).
    if (!isCompanyQueryValid(query)) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/pappers/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (res.ok) setResults(data.data || []);
    } catch { /* ignore */ }
    finally { setSearching(false); }
  };

  useEffect(() => { if (isCompanyQueryValid(companyName)) handleSearch(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          className="flex-1 border rounded-md px-3 py-1.5 text-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Nom de l'entreprise..."
        />
        <button
          onClick={handleSearch}
          disabled={searching}
          className="px-3 py-1.5 bg-[#374151] text-white text-sm rounded-md disabled:opacity-50"
        >
          {searching ? "..." : "Chercher"}
        </button>
      </div>
      <div className="max-h-60 overflow-y-auto space-y-1">
        {results.map((r) => (
          <button
            key={r.siret}
            onClick={() => onSelect(r.siret)}
            className="w-full text-left p-2 rounded-md hover:bg-gray-50 border text-sm flex justify-between items-center"
          >
            <div>
              <p className="font-medium">{r.company_name}</p>
              <p className="text-xs text-muted-foreground">{r.city} — SIRET: {r.siret}</p>
            </div>
            <span className="text-xs text-gray-400">{r.naf_code}</span>
          </button>
        ))}
        {!searching && results.length === 0 && query.length >= 2 && (
          <p className="text-xs text-muted-foreground text-center py-4">Aucun résultat</p>
        )}
      </div>
    </div>
  );
}
