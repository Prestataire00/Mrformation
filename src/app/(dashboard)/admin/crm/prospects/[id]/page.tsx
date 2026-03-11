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
import type { CrmProspect, CrmQuote, ProspectStatus } from "@/lib/types";

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
  type: "status_change" | "note" | "creation";
  content: string;
  date: string;
  author: string;
}

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
    contact_name: "",
    email: "",
    phone: "",
    source: "",
    notes: "",
  });
  const [newNote, setNewNote] = useState("");
  const [newStatus, setNewStatus] = useState<ProspectStatus>("new");

  // Activity log (built from notes)
  const [activities, setActivities] = useState<ActivityEntry[]>([]);

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
      buildActivities(data as CrmProspect);
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

  function buildActivities(p: CrmProspect) {
    const acts: ActivityEntry[] = [];

    // Creation
    acts.push({
      id: "creation",
      type: "creation",
      content: "Création du lead",
      date: p.created_at,
      author: "MR FORMATION",
    });

    // Parse notes for Sellsy info
    if (p.notes) {
      const parts = p.notes.split("|").map((s) => s.trim());
      parts.forEach((part, i) => {
        if (part.startsWith("Statut Sellsy:") || part.startsWith("Étape Sellsy:")) {
          acts.push({
            id: `note-${i}`,
            type: "note",
            content: part,
            date: p.created_at,
            author: "Import Sellsy",
          });
        }
      });
    }

    setActivities(acts.reverse());
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  function openEdit() {
    if (!prospect) return;
    setEditForm({
      company_name: prospect.company_name,
      siret: prospect.siret ?? "",
      contact_name: prospect.contact_name ?? "",
      email: prospect.email ?? "",
      phone: prospect.phone ?? "",
      source: prospect.source ?? "",
      notes: prospect.notes ?? "",
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
        contact_name: editForm.contact_name.trim() || null,
        email: editForm.email.trim() || null,
        phone: editForm.phone.trim() || null,
        source: editForm.source || null,
        notes: editForm.notes.trim() || null,
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

  async function handleDelete() {
    const { error } = await supabase.from("crm_prospects").delete().eq("id", prospectId);
    if (error) {
      console.error("handleDelete error:", error);
      return;
    }
    router.push("/admin/crm/prospects");
  }

  function extractAmount(notes: string | null): number {
    if (!notes) return 0;
    const match = notes.match(/Montant HT[^:]*:\s*([\d\s.,]+)/);
    if (!match) return 0;
    return parseFloat(match[1].replace(/\s/g, "").replace(",", ".")) || 0;
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
        lines: lines.map((l: Record<string, unknown>) => ({
          description: String(l.description ?? ""),
          quantity: Number(l.quantity ?? 1),
          unit_price: Number(l.unit_price ?? 0),
        })),
        prospect_name: prospect.company_name,
        prospect_email: prospect.email ?? undefined,
        prospect_phone: prospect.phone ?? undefined,
        prospect_siret: prospect.siret ?? undefined,
      };

      // If no lines parsed from JSON, create a single line from the amount or the prospect amount
      if (devisData.lines.length === 0) {
        const fallbackAmount = q.amount || extractAmount(prospect.notes);
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
  const amount = extractAmount(prospect.notes);

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
                ENVOYER UN EMAIL
              </Button>
            )}
            <Button size="sm" variant="default" className="text-xs h-8" onClick={openEdit}>
              <Pencil className="w-3 h-3 mr-1.5" />
              MODIFIER LE LEAD
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

          {/* Timeline */}
          <div className="space-y-3">
            {activities.map((a) => (
              <div
                key={a.id}
                className="flex items-start gap-3 bg-muted/40 rounded-lg px-4 py-3"
              >
                <div className="mt-0.5">
                  {a.type === "creation" && <CheckCircle className="w-4 h-4 text-green-500" />}
                  {a.type === "status_change" && <TrendingUp className="w-4 h-4 text-blue-500" />}
                  {a.type === "note" && <MessageSquare className="w-4 h-4 text-amber-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium uppercase">{a.content}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">
                    {formatDate(a.date)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {a.author}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Formation ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Formation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/40 rounded-lg p-4 mb-3">
            <p className="text-sm text-muted-foreground">
              Le lead est déjà un client, vous pouvez désormais le connecter à une formation.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="default"
              className="text-xs h-8"
              onClick={() => router.push("/admin/trainings")}
            >
              <ExternalLink className="w-3 h-3 mr-1.5" />
              CONNECTER À UNE FORMATION EXISTANTE
            </Button>
            <Button
              size="sm"
              variant="default"
              className="text-xs h-8"
              onClick={() => router.push("/admin/trainings")}
            >
              <BookOpen className="w-3 h-3 mr-1.5" />
              CRÉER UNE NOUVELLE FORMATION
            </Button>
          </div>
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
    </div>
  );
}
