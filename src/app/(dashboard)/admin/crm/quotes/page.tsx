"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import {
  evaluateProspectStatusFromQuotes,
  notifyQuoteStatusChange,
  notifyProspectWon,
} from "@/lib/crm/automations";
import { logCommercialAction } from "@/lib/crm/log-commercial-action";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Filter,
  FileText,
  MoreHorizontal,
  TrendingUp,
  Clock,
  XCircle,
  ChevronRight,
  Send,
  AlertTriangle,
  Download,
  FileDown,
  GraduationCap,
  Loader2,
} from "lucide-react";
import { downloadDevisPDF, generateDevisPDF, type DevisData } from "@/lib/devis-pdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import {
  cn,
  formatDate,
  formatCurrency,
  STATUS_COLORS,
  QUOTE_STATUS_LABELS,
} from "@/lib/utils";
import type { CrmQuote, Profile, QuoteStatus } from "@/lib/types";

const QUOTE_STATUSES: QuoteStatus[] = ["draft", "sent", "accepted", "rejected", "expired"];

interface QuoteStats {
  total: number;
  acceptedAmount: number;
  pendingAmount: number;
  rejectedThisMonth: number;
}

export default function QuotesPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const { entityId, entity } = useEntity();
  const router = useRouter();

  const [quotes, setQuotes] = useState<CrmQuote[]>([]);

  // Convert to formation
  const [convertDialog, setConvertDialog] = useState(false);
  const [convertQuote, setConvertQuote] = useState<CrmQuote | null>(null);
  const [converting, setConverting] = useState(false);

  // Email dialog
  const [emailDialog, setEmailDialog] = useState(false);
  const [emailForm, setEmailForm] = useState({ to: "", subject: "", body: "" });
  const [emailAttachment, setEmailAttachment] = useState<{ filename: string; content: string } | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [stats, setStats] = useState<QuoteStats>({ total: 0, acceptedAmount: 0, pendingAmount: 0, rejectedThisMonth: 0 });

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | "all">("all");

  // Dialogs
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<CrmQuote | null>(null);



  useEffect(() => {
    if (entityId === undefined) return;
    fetchQuotes();
    fetchProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, search, statusFilter]);

  const fetchProfiles = useCallback(async () => {
    let query = supabase.from("profiles").select("id, first_name, last_name, email").order("first_name");
    if (entityId) query = query.eq("entity_id", entityId);
    const { data } = await query;
    setProfiles((data as Profile[]) ?? []);
  }, [supabase, entityId]);

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("crm_quotes")
        .select(`
          *,
          client:clients!crm_quotes_client_id_fkey(id, company_name),
          prospect:crm_prospects!crm_quotes_prospect_id_fkey(id, company_name)
        `)
        .order("created_at", { ascending: false });

      if (entityId) query = query.eq("entity_id", entityId);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (search.trim()) query = query.ilike("reference", `%${search.trim()}%`);

      const { data, error } = await query;
      if (error) throw error;
      const list = (data as CrmQuote[]) ?? [];
      setQuotes(list);

      // Stats from all quotes
      let allQuery = supabase.from("crm_quotes").select("status, amount, created_at");
      if (entityId) allQuery = allQuery.eq("entity_id", entityId);
      const { data: allData } = await allQuery;
      if (allData) {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const acceptedAmount = allData
          .filter((q) => q.status === "accepted")
          .reduce((sum, q) => sum + (q.amount ?? 0), 0);
        const pendingAmount = allData
          .filter((q) => q.status === "sent")
          .reduce((sum, q) => sum + (q.amount ?? 0), 0);
        const rejectedThisMonth = allData.filter(
          (q) => q.status === "rejected" && q.created_at >= startOfMonth
        ).length;
        setStats({ total: allData.length, acceptedAmount, pendingAmount, rejectedThisMonth });
      }
    } catch (err) {
      console.error("fetchQuotes error:", err);
      toast({ title: "Erreur", description: "Impossible de charger les devis.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [supabase, entityId, statusFilter, search, toast]);

  async function handleDelete() {
    if (!selectedQuote) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("crm_quotes").delete().eq("id", selectedQuote.id);
      if (error) throw error;
      toast({ title: "Devis supprimé", description: `Le devis ${selectedQuote.reference} a été supprimé.` });
      setDeleteDialogOpen(false);
      setSelectedQuote(null);
      fetchQuotes();
    } catch (err) {
      console.error("handleDelete error:", err);
      toast({ title: "Erreur", description: "Impossible de supprimer ce devis.", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  async function handleStatusChange(quote: CrmQuote, newStatus: QuoteStatus) {
    try {
      const { error } = await supabase
        .from("crm_quotes")
        .update({ status: newStatus })
        .eq("id", quote.id);
      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();

      // Log commercial action for quote status change
      if (user && entityId) {
        const actionTypeMap: Record<string, "quote_sent" | "quote_accepted" | "quote_rejected"> = {
          sent: "quote_sent",
          accepted: "quote_accepted",
          rejected: "quote_rejected",
        };
        const commercialActionType = actionTypeMap[newStatus];
        if (commercialActionType) {
          logCommercialAction({
            supabase,
            entityId,
            authorId: user.id,
            actionType: commercialActionType,
            prospectId: quote.prospect_id,
            clientId: quote.client_id,
            subject: `Devis ${quote.reference}`,
            metadata: { quote_id: quote.id, amount: quote.amount },
          });
        }
      }

      // Auto-create follow-up task when quote is sent
      if (newStatus === "sent") {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 7);
        await supabase.from("crm_tasks").insert({
          entity_id: entityId,
          title: `Relance devis: ${quote.reference}`,
          description: `Relance pour le devis ${quote.reference} envoyé le ${new Date().toLocaleDateString("fr-FR")}`,
          due_date: dueDate.toISOString().split("T")[0],
          priority: "medium",
          status: "pending",
          assigned_to: quote.created_by || user?.id,
          prospect_id: quote.prospect_id,
          client_id: quote.client_id,
          created_by: user?.id,
        });
      }

      // Auto-transition prospect status based on quotes
      if (quote.prospect_id && entityId) {
        const newProspectStatus = await evaluateProspectStatusFromQuotes(supabase, quote.prospect_id, entityId);

        // Notify if prospect was won
        if (newProspectStatus === "won") {
          const { data: prospect } = await supabase
            .from("crm_prospects")
            .select("company_name, assigned_to")
            .eq("id", quote.prospect_id)
            .single();
          if (prospect) {
            await notifyProspectWon(supabase, entityId, quote.prospect_id, prospect.company_name, prospect.assigned_to);
          }
        }
      }

      // Instant notification for accepted/rejected
      if (entityId && (newStatus === "accepted" || newStatus === "rejected")) {
        await notifyQuoteStatusChange(
          supabase, entityId, quote.reference, quote.id, newStatus,
          quote.created_by || user?.id || null, quote.prospect_id
        );
      }

      toast({
        title: "Statut mis à jour",
        description: `Le devis ${quote.reference} est maintenant "${QUOTE_STATUS_LABELS[newStatus]}".${newStatus === "sent" ? " Une tâche de relance a été créée pour J+7." : ""}`,
      });
      fetchQuotes();
    } catch (err) {
      console.error("handleStatusChange error:", err);
      toast({ title: "Erreur", description: "Impossible de changer le statut.", variant: "destructive" });
    }
  }

  async function handleDownloadDevis(quote: CrmQuote) {
    try {
      let meta: Record<string, unknown> = {};
      try { meta = quote.notes ? JSON.parse(quote.notes) : {}; } catch { /* notes is plain text */ }

      // Fetch prospect or client details for the PDF
      let prospectName = "";
      let prospectEmail: string | undefined;
      let prospectPhone: string | undefined;
      let prospectSiret: string | undefined;

      if (quote.prospect_id) {
        const { data: p } = await supabase
          .from("crm_prospects")
          .select("company_name, email, phone, siret, notes")
          .eq("id", quote.prospect_id)
          .single();
        if (p) {
          prospectName = p.company_name;
          prospectEmail = p.email ?? undefined;
          prospectPhone = p.phone ?? undefined;
          prospectSiret = p.siret ?? undefined;
        }
      } else if (quote.client_id) {
        const { data: c } = await supabase
          .from("clients")
          .select("company_name, email, phone, siret")
          .eq("id", quote.client_id)
          .single();
        if (c) {
          prospectName = c.company_name;
          prospectEmail = c.email ?? undefined;
          prospectPhone = c.phone ?? undefined;
          prospectSiret = c.siret ?? undefined;
        }
      }

      const lines = Array.isArray(meta.lines) ? meta.lines : [];
      let tvaRate = 20;
      if (typeof meta.tva === "number") {
        tvaRate = meta.tva;
      } else if (typeof meta.tva === "string") {
        tvaRate = parseFloat(String(meta.tva).replace(",", ".")) || 20;
      }

      const devisData: DevisData = {
        reference: quote.reference ?? `DEV-${quote.id.slice(0, 6).toUpperCase()}`,
        date_creation: quote.created_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        date_echeance: quote.valid_until ?? quote.created_at?.slice(0, 10) ?? "",
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
        prospect_name: prospectName,
        prospect_address: (meta.prospect_address as string) || undefined,
        prospect_email: prospectEmail,
        prospect_phone: prospectPhone,
        prospect_siret: prospectSiret,
      };

      if (devisData.lines.length === 0 && quote.amount && quote.amount > 0) {
        const amountHT = quote.amount / (1 + tvaRate / 100);
        devisData.lines = [{ description: "Formation", quantity: 1, unit_price: Math.round(amountHT * 100) / 100 }];
      }

      await downloadDevisPDF(devisData, entity?.name);
    } catch (err) {
      console.error("PDF download error:", err);
      toast({ title: "Erreur", description: "Impossible de générer le PDF.", variant: "destructive" });
    }
  }

  async function handleSendByEmail(quote: CrmQuote) {
    try {
      let meta: Record<string, unknown> = {};
      try { meta = quote.notes ? JSON.parse(quote.notes) : {}; } catch { /* */ }

      let prospectName = "";
      let prospectEmail = "";
      if (quote.prospect_id) {
        const { data: p } = await supabase
          .from("crm_prospects").select("company_name, email").eq("id", quote.prospect_id).single();
        if (p) { prospectName = p.company_name; prospectEmail = p.email ?? ""; }
      } else if (quote.client_id) {
        const { data: c } = await supabase
          .from("clients").select("company_name, email").eq("id", quote.client_id).single();
        if (c) { prospectName = c.company_name; prospectEmail = c.email ?? ""; }
      }

      const lines = Array.isArray(meta.lines) ? meta.lines : [];
      let tvaRate = 20;
      if (typeof meta.tva === "number") tvaRate = meta.tva;
      else if (typeof meta.tva === "string") tvaRate = parseFloat(String(meta.tva).replace(",", ".")) || 20;

      const devisData: DevisData = {
        reference: quote.reference ?? "",
        date_creation: quote.created_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        date_echeance: quote.valid_until ?? "",
        tva: tvaRate,
        lines: lines.map((l: Record<string, unknown>) => ({
          description: String(l.description ?? ""),
          quantity: Number(l.quantity ?? 1),
          unit_price: Number(l.unit_price ?? 0),
        })),
        prospect_name: prospectName,
        prospect_email: prospectEmail,
      };

      if (devisData.lines.length === 0 && quote.amount && quote.amount > 0) {
        const amountHT = quote.amount / (1 + tvaRate / 100);
        devisData.lines = [{ description: "Formation", quantity: 1, unit_price: Math.round(amountHT * 100) / 100 }];
      }

      const doc = await generateDevisPDF(devisData, entity?.name);
      const blob = doc.output("blob");
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(blob);
      });

      const entityName = entity?.name || "MR FORMATION";
      setEmailAttachment({ filename: `devis-${quote.reference}.pdf`, content: base64 });
      setEmailForm({
        to: prospectEmail,
        subject: `Devis ${quote.reference} - ${entityName}`,
        body: `Bonjour,\n\nVeuillez trouver ci-joint notre devis ${quote.reference}.\n\nN'hésitez pas à nous contacter pour toute question.\n\nCordialement,\n${entityName}`,
      });
      setEmailDialog(true);
    } catch (err) {
      console.error("handleSendByEmail error:", err);
      toast({ title: "Erreur", description: "Impossible de préparer l'email", variant: "destructive" });
    }
  }

  async function confirmSendEmail() {
    if (!emailForm.to.trim()) {
      toast({ title: "L'adresse email est requise", variant: "destructive" });
      return;
    }
    setSendingEmail(true);
    try {
      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailForm.to.trim(),
          subject: emailForm.subject,
          body: emailForm.body,
          attachments: emailAttachment ? [{ ...emailAttachment, type: "application/pdf" }] : undefined,
        }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        toast({ title: "Devis envoyé par email" });
        setEmailDialog(false);
      } else {
        toast({ title: "Erreur d'envoi", description: result.error ?? "Échec", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setSendingEmail(false);
    }
  }

  function handleConvertToFormation(quote: CrmQuote) {
    if ((quote as any).converted_session_id) {
      router.push(`/admin/formations/${(quote as any).converted_session_id}`);
      return;
    }
    setConvertQuote(quote);
    setConvertDialog(true);
  }

  async function confirmConvert() {
    if (!convertQuote) return;
    setConverting(true);
    try {
      let meta: Record<string, unknown> = {};
      try { meta = convertQuote.notes ? JSON.parse(convertQuote.notes) : {}; } catch { /* plain text */ }

      const sessionPayload = {
        training_id: convertQuote.training_id || undefined,
        program_id: convertQuote.program_id || undefined,
        client_id: convertQuote.client_id || undefined,
        start_date: (convertQuote as any).training_start || (meta.training_start as string) || undefined,
        end_date: (convertQuote as any).training_end || (meta.training_end as string) || undefined,
        max_participants: (convertQuote as any).effectifs || (meta.effectifs ? Number(meta.effectifs) : undefined),
        price: convertQuote.amount || undefined,
        status: "planned",
        mode: "presentiel",
        notes: `Créé depuis le devis ${convertQuote.reference}`,
      };

      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessionPayload),
      });

      const result = await res.json();
      if (!res.ok || !result.data) {
        toast({ title: "Erreur", description: result.error || "Impossible de créer la formation", variant: "destructive" });
        setConverting(false);
        return;
      }

      await supabase
        .from("crm_quotes")
        .update({ converted_session_id: result.data.id })
        .eq("id", convertQuote.id);

      toast({ title: "Formation créée !", description: `Session créée depuis le devis ${convertQuote.reference}` });
      setConvertDialog(false);
      setConvertQuote(null);
      router.push(`/admin/formations/${result.data.id}`);
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setConverting(false);
    }
  }

  function openDeleteDialog(quote: CrmQuote) {
    setSelectedQuote(quote);
    setDeleteDialogOpen(true);
  }

  const getProfileName = (profileId: string | null | undefined) => {
    if (!profileId) return "—";
    const p = profiles.find((pr) => pr.id === profileId);
    if (!p) return "—";
    return [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || "—";
  };

  const isExpired = (validUntil: string | null) => {
    if (!validUntil) return false;
    return new Date(validUntil) < new Date();
  };

  const getEntityName = (quote: CrmQuote) => {
    return quote.client?.company_name ?? quote.prospect?.company_name ?? "—";
  };

  const hasActiveFilters = search || statusFilter !== "all";

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Devis</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gérez vos propositions commerciales et suivez leur progression
          </p>
        </div>
        <Button onClick={() => router.push("/admin/crm/quotes/new")} className="gap-2">
          <Plus className="h-4 w-4" />
          Nouveau devis
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total devis</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Montant accepté</p>
              <p className="text-lg font-bold text-green-600">{formatCurrency(stats.acceptedAmount)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-100">
              <Clock className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">En attente</p>
              <p className="text-lg font-bold text-yellow-600">{formatCurrency(stats.pendingAmount)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Refusés ce mois</p>
              <p className="text-2xl font-bold text-red-600">{stats.rejectedThisMonth}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Relance Alert */}
      {(() => {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const relanceQuotes = quotes.filter(
          (q) => q.status === "sent" && q.created_at < sevenDaysAgo
        );
        if (relanceQuotes.length === 0) return null;
        return (
          <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">
                {relanceQuotes.length} devis en attente de relance
              </p>
              <p className="text-xs text-amber-600">
                Ces devis sont en statut &quot;Envoyé&quot; depuis plus de 7 jours sans réponse.
              </p>
            </div>
          </div>
        );
      })()}

      {/* Pipeline */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium text-gray-700">Pipeline :</span>
            {QUOTE_STATUSES.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && <ChevronRight className="h-4 w-4 text-gray-300" />}
                <button
                  onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all border",
                    STATUS_COLORS[s],
                    statusFilter === s && "ring-2 ring-offset-1 ring-violet-400"
                  )}
                >
                  {QUOTE_STATUS_LABELS[s]}
                  <span className="font-bold">{quotes.filter((q) => q.status === s).length}</span>
                </button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher par référence…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as QuoteStatus | "all")}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  {QUOTE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{QUOTE_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter("all"); }}>
                  Réinitialiser
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
            </div>
          ) : quotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-lg font-medium text-gray-700">Aucun devis trouvé</p>
              <p className="text-sm text-muted-foreground mt-1">
                {hasActiveFilters ? "Essayez de modifier vos filtres." : "Créez votre premier devis."}
              </p>
              {!hasActiveFilters && (
                <Button onClick={() => router.push("/admin/crm/quotes/new")} className="mt-4 gap-2">
                  <Plus className="h-4 w-4" />
                  Nouveau devis
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50/80">
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Référence</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Client / Prospect</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Montant</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Statut</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Valide jusqu&apos;au</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Créé par</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {quotes.map((quote) => {
                    const expired = isExpired(quote.valid_until) && quote.status === "sent";
                    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
                    const needsRelance = quote.status === "sent" && quote.created_at < sevenDaysAgo;
                    return (
                      <tr key={quote.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-violet-100">
                              <FileText className="h-4 w-4 text-violet-600" />
                            </div>
                            <span className="font-mono font-medium text-gray-900">{quote.reference}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {quote.client ? (
                              <Badge variant="outline" className="text-xs border-green-300 text-green-700">Client</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs border-blue-300 text-blue-700">Prospect</Badge>
                            )}
                            <span className="text-gray-700">{getEntityName(quote)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-gray-900">{formatCurrency(quote.amount)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Select value={quote.status} onValueChange={(v) => handleStatusChange(quote, v as QuoteStatus)}>
                              <SelectTrigger className="h-auto w-auto border-0 bg-transparent shadow-none p-0 focus:ring-0">
                                <Badge className={cn("border-0 text-xs", STATUS_COLORS[quote.status])}>
                                  {QUOTE_STATUS_LABELS[quote.status]}
                                </Badge>
                              </SelectTrigger>
                              <SelectContent>
                                {QUOTE_STATUSES.map((s) => (
                                  <SelectItem key={s} value={s}>{QUOTE_STATUS_LABELS[s]}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {needsRelance && (
                              <Badge className="border-0 text-[10px] bg-amber-100 text-amber-700">
                                Relance
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {quote.valid_until ? (
                            <span className={cn("text-sm", expired && "text-red-600 font-medium")}>
                              {expired && "Expiré · "}
                              {formatDate(quote.valid_until)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{getProfileName(quote.created_by)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(quote.created_at)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => handleDownloadDevis(quote)}
                          >
                            <FileDown className="h-3 w-3" /> PDF
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem onClick={() => handleDownloadDevis(quote)} className="gap-2">
                                <Download className="h-4 w-4" />
                                Télécharger PDF
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleSendByEmail(quote)} className="gap-2">
                                <Send className="h-4 w-4" />
                                Envoyer par email
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => router.push(`/admin/crm/quotes/new?edit=${quote.id}`)} className="gap-2">
                                <Pencil className="h-4 w-4" />
                                Modifier
                              </DropdownMenuItem>
                              {quote.status === "accepted" && (
                                <DropdownMenuItem
                                  onClick={() => handleConvertToFormation(quote)}
                                  className="gap-2 text-green-600 focus:text-green-600"
                                >
                                  <GraduationCap className="h-4 w-4" />
                                  {(quote as any).converted_session_id ? "Voir la formation créée" : "Créer une formation"}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => openDeleteDialog(quote)} className="gap-2 text-red-600 focus:text-red-600">
                                <Trash2 className="h-4 w-4" />
                                Supprimer
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Convert to formation Dialog */}
      <Dialog open={convertDialog} onOpenChange={setConvertDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Créer une formation depuis ce devis</DialogTitle>
          </DialogHeader>
          {convertQuote && (() => {
            let meta: Record<string, unknown> = {};
            try { meta = convertQuote.notes ? JSON.parse(convertQuote.notes) : {}; } catch { /* */ }
            const start = (convertQuote as any).training_start || meta.training_start;
            const end = (convertQuote as any).training_end || meta.training_end;
            const eff = (convertQuote as any).effectifs || meta.effectifs;
            return (
              <div className="space-y-3 text-sm">
                <div className="p-3 bg-muted/30 rounded-lg space-y-1">
                  <p><span className="font-medium text-gray-600">Devis :</span> {convertQuote.reference}</p>
                  {convertQuote.prospect && (
                    <p><span className="font-medium text-gray-600">Client :</span> {convertQuote.prospect.company_name}</p>
                  )}
                  {convertQuote.client && (
                    <p><span className="font-medium text-gray-600">Client :</span> {convertQuote.client.company_name}</p>
                  )}
                  {start && (
                    <p><span className="font-medium text-gray-600">Dates :</span> {formatDate(start as string)} → {end ? formatDate(end as string) : "—"}</p>
                  )}
                  {eff && (
                    <p><span className="font-medium text-gray-600">Participants :</span> {String(eff)}</p>
                  )}
                  <p><span className="font-medium text-gray-600">Montant :</span> {formatCurrency(convertQuote.amount)}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Une nouvelle session de formation sera créée avec ces informations pré-remplies.
                </p>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertDialog(false)}>Annuler</Button>
            <Button onClick={confirmConvert} disabled={converting} className="gap-2">
              {converting && <Loader2 className="h-4 w-4 animate-spin" />}
              <GraduationCap className="h-4 w-4" />
              Confirmer et créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Dialog */}
      <Dialog open={emailDialog} onOpenChange={setEmailDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Envoyer le devis par email</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Destinataire *</Label>
              <Input
                type="email"
                value={emailForm.to}
                onChange={(e) => setEmailForm((f) => ({ ...f, to: e.target.value }))}
                placeholder="email@exemple.fr"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Objet</Label>
              <Input
                value={emailForm.subject}
                onChange={(e) => setEmailForm((f) => ({ ...f, subject: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea
                value={emailForm.body}
                onChange={(e) => setEmailForm((f) => ({ ...f, body: e.target.value }))}
                rows={5}
              />
            </div>
            {emailAttachment && (
              <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg text-xs text-muted-foreground">
                <FileText className="h-4 w-4" />
                {emailAttachment.filename}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialog(false)}>Annuler</Button>
            <Button onClick={confirmSendEmail} disabled={sendingEmail}>
              {sendingEmail && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Send className="h-4 w-4 mr-2" /> Envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Supprimer le devis</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer le devis{" "}
              <span className="font-semibold text-gray-900">{selectedQuote?.reference}</span> ?
              Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" disabled={deleting}>Annuler</Button></DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="gap-2">
              {deleting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

