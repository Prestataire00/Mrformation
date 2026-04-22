"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Plus, CheckCircle, Loader2, Trash2, Undo2, FileDown, Send, Upload, Eye, Pencil,
} from "lucide-react";
import { useEntity } from "@/contexts/EntityContext";
import { ImportInvoiceDialog } from "./ImportInvoiceDialog";
import { downloadInvoicePDF, invoicePDFBase64 } from "@/lib/invoice-pdf-export";
import type { InvoicePdfData } from "@/lib/invoice-pdf-export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/utils";
import type { Session } from "@/lib/types";

interface Invoice {
  id: string;
  recipient_type: string;
  recipient_id: string;
  recipient_name: string;
  amount: number;
  prefix: string;
  number: number;
  global_number: number;
  fiscal_year: number;
  reference: string;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;
  is_avoir: boolean;
  parent_invoice_id: string | null;
  created_at: string;
  reminder_count?: number;
  auto_generated?: boolean;
  external_reference?: string | null;
}

const REMINDER_BADGES: Record<number, { label: string; className: string }> = {
  1: { label: "1 relance", className: "bg-amber-100 text-amber-700" },
  2: { label: "2 relances", className: "bg-orange-100 text-orange-700" },
  3: { label: "Mise en demeure", className: "bg-red-100 text-red-700" },
};

interface Charge {
  id: string;
  label: string;
  amount: number;
  created_at: string;
}

interface Stats {
  total_invoiced: number;
  total_paid: number;
  total_pending: number;
  total_late: number;
  total_charges: number;
}

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  pending: { label: "En attente", className: "bg-gray-100 text-gray-700" },
  sent: { label: "Envoyée", className: "bg-blue-100 text-blue-700" },
  paid: { label: "Payée", className: "bg-green-100 text-green-700" },
  late: { label: "En retard", className: "bg-red-100 text-red-700" },
  cancelled: { label: "Annulée", className: "bg-gray-100 text-gray-500 line-through" },
};

const RECIPIENT_LABELS: Record<string, string> = {
  learner: "Apprenant",
  company: "Entreprise",
  financier: "Financeur",
};

const SECTION_CONFIG = [
  { type: "learner", title: "Factures Apprenants", icon: "👤" },
  { type: "company", title: "Factures Entreprises", icon: "🏢" },
  { type: "financier", title: "Factures Financeurs", icon: "🏛️" },
] as const;

export function TabFinances({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const { entity } = useEntity();
  const supabase = createClient();
  const searchParams = useSearchParams();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [stats, setStats] = useState<Stats>({
    total_invoiced: 0, total_paid: 0, total_pending: 0, total_late: 0, total_charges: 0,
  });
  const [loading, setLoading] = useState(true);

  // Invoice dialog
  const [invoiceDialog, setInvoiceDialog] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    recipient_type: "learner",
    recipient_name: "",
    recipient_id: "",
    due_date: "",
    notes: "",
    external_reference: "",
    lines: [{ description: "", quantity: "1", unit_price: "" }] as { description: string; quantity: string; unit_price: string }[],
  });
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);

  // Invoice line helpers
  const addInvoiceLine = () => setInvoiceForm((f) => ({ ...f, lines: [...f.lines, { description: "", quantity: "1", unit_price: "" }] }));
  const updateInvoiceLine = (idx: number, field: string, value: string) => setInvoiceForm((f) => {
    const lines = [...f.lines];
    lines[idx] = { ...lines[idx], [field]: value };
    return { ...f, lines };
  });
  const removeInvoiceLine = (idx: number) => setInvoiceForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }));
  const calcLineTotal = (l: { quantity: string; unit_price: string }) => (parseFloat(l.quantity.replace(",", ".")) || 0) * (parseFloat(l.unit_price.replace(",", ".")) || 0);
  const invoiceSubtotal = invoiceForm.lines.reduce((s, l) => s + calcLineTotal(l), 0);
  const invoiceTotal = invoiceSubtotal; // TVA exonérée par défaut — à ajuster si entity.tva_exempt === false

  // Inline charge form
  const [chargeLabel, setChargeLabel] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [savingCharge, setSavingCharge] = useState(false);

  // Prefix — managed server-side (FAC for invoices, AV for avoirs)
  const prefix = "FAC";

  // Auto-generate
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [previewDialog, setPreviewDialog] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importRecipientType, setImportRecipientType] = useState("company");
  const [previewData, setPreviewData] = useState<{ preview: Array<{ recipientType: string; recipientName: string; amount: number; detail: string }>; warnings: string[] } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/formations/${formation.id}/invoices`);
      const data = await res.json();
      if (res.ok) {
        setInvoices(data.invoices);
        setCharges(data.charges);
        setStats(data.stats);
      } else {
        toast({ title: "Erreur", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les données financières", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [formation.id, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-open edit dialog from URL param ?edit_invoice=xxx
  useEffect(() => {
    const editId = searchParams.get("edit_invoice");
    if (editId && invoices.length > 0 && !editingInvoiceId) {
      const inv = invoices.find(i => i.id === editId);
      if (inv && inv.status === "pending" && !inv.is_avoir) {
        handleEditInvoice(inv);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, invoices]);

  // ── Create invoice ──

  // Pre-fill invoice lines from session data
  const prefillInvoiceLines = () => {
    const enrollCount = (formation.enrollments || []).length || 1;
    const totalPrice = formation.total_price || 0;
    const hours = formation.planned_hours;
    const desc = `Formation ${formation.title}${hours ? ` (${hours}h)` : ""}`;
    const unitPrice = enrollCount > 1 ? (totalPrice / enrollCount) : totalPrice;

    // Participant names
    const participantNames = (formation.enrollments || [])
      .filter(e => e.learner)
      .map(e => `${e.learner!.first_name} ${e.learner!.last_name}`)
      .join(", ");

    // Company SIRET + address (from first linked company)
    const firstCompany = (formation.formation_companies || [])[0]?.client as unknown as Record<string, string | null> | undefined;
    const companyInfo: string[] = [];
    if (firstCompany) {
      if (firstCompany.siret) companyInfo.push(`SIRET : ${firstCompany.siret}`);
      const addr = [firstCompany.address, firstCompany.postal_code, firstCompany.city].filter(Boolean).join(" ");
      if (addr) companyInfo.push(`Adresse : ${addr}`);
    }

    const notesParts: string[] = [];
    if (participantNames) notesParts.push(`Participants : ${participantNames}`);
    if (companyInfo.length > 0) notesParts.push(companyInfo.join("\n"));

    setInvoiceForm(f => ({
      ...f,
      lines: [{ description: desc, quantity: String(enrollCount), unit_price: unitPrice.toFixed(2).replace(".", ",") }],
      notes: notesParts.length > 0 ? notesParts.join("\n") : f.notes,
    }));
  };

  const handleCreateInvoice = async (isAvoir = false, parentInvoice?: Invoice) => {
    const recipientName = isAvoir && parentInvoice
      ? parentInvoice.recipient_name
      : invoiceForm.recipient_name.trim();
    const recipientType = isAvoir && parentInvoice
      ? parentInvoice.recipient_type
      : invoiceForm.recipient_type;

    if (!recipientName) {
      toast({ title: "Le nom du destinataire est requis", variant: "destructive" });
      return;
    }

    const amount = isAvoir && parentInvoice
      ? -Math.abs(parentInvoice.amount)
      : invoiceTotal;

    if (!isAvoir && amount <= 0) {
      toast({ title: "Montant invalide", description: "Ajoutez des lignes de produits", variant: "destructive" });
      return;
    }

    setSavingInvoice(true);
    try {
      // Build lines for server
      const parsedLines = isAvoir ? [] : invoiceForm.lines
        .filter(l => l.description.trim())
        .map(l => ({
          description: l.description.trim(),
          quantity: parseFloat(l.quantity.replace(",", ".")) || 1,
          unit_price: parseFloat(l.unit_price.replace(",", ".")) || 0,
        }));

      const res = await fetch(`/api/formations/${formation.id}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient_type: recipientType,
          recipient_id: parentInvoice?.recipient_id ?? (invoiceForm.recipient_id || crypto.randomUUID()),
          recipient_name: recipientName,
          amount,
          prefix: isAvoir ? "AV" : prefix,
          due_date: isAvoir ? null : invoiceForm.due_date || null,
          notes: isAvoir ? `Avoir sur ${parentInvoice?.reference}` : invoiceForm.notes || null,
          is_avoir: isAvoir,
          parent_invoice_id: parentInvoice?.id ?? null,
          external_reference: invoiceForm.external_reference || null,
          lines: parsedLines,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: isAvoir ? "Avoir créé" : "Facture créée", description: data.invoice.reference });
        if (!isAvoir) {
          setInvoiceDialog(false);
          setInvoiceForm({ recipient_type: "learner", recipient_name: "", recipient_id: "", due_date: "", notes: "", external_reference: "", lines: [{ description: "", quantity: "1", unit_price: "" }] });
        }
        fetchData();
      } else {
        toast({ title: "Erreur", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setSavingInvoice(false);
    }
  };

  // ── Edit existing invoice ──

  const handleEditInvoice = async (inv: Invoice) => {
    // Fetch existing lines
    const { data: lines } = await supabase
      .from("formation_invoice_lines")
      .select("description, quantity, unit_price")
      .eq("invoice_id", inv.id)
      .order("order_index");

    setInvoiceForm({
      recipient_type: inv.recipient_type,
      recipient_name: inv.recipient_name,
      recipient_id: inv.recipient_id,
      due_date: inv.due_date ? inv.due_date.split("T")[0] : "",
      notes: inv.notes || "",
      external_reference: inv.external_reference || "",
      lines: lines && lines.length > 0
        ? lines.map(l => ({ description: l.description, quantity: String(l.quantity), unit_price: String(l.unit_price) }))
        : [{ description: "", quantity: "1", unit_price: "" }],
    });
    setEditingInvoiceId(inv.id);
    setInvoiceDialog(true);
  };

  const handleUpdateInvoice = async () => {
    if (!editingInvoiceId) return;
    setSavingInvoice(true);
    try {
      const parsedLines = invoiceForm.lines
        .filter(l => l.description.trim())
        .map(l => ({
          description: l.description.trim(),
          quantity: parseFloat(l.quantity.replace(",", ".")) || 1,
          unit_price: parseFloat(l.unit_price.replace(",", ".")) || 0,
        }));

      const res = await fetch(`/api/formations/${formation.id}/invoices`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: editingInvoiceId,
          recipient_name: invoiceForm.recipient_name.trim(),
          recipient_type: invoiceForm.recipient_type,
          due_date: invoiceForm.due_date || null,
          notes: invoiceForm.notes || null,
          external_reference: invoiceForm.external_reference || null,
          amount: invoiceTotal,
          lines: parsedLines,
        }),
      });
      if (res.ok) {
        toast({ title: "Facture mise à jour" });
        setInvoiceDialog(false);
        setEditingInvoiceId(null);
        setInvoiceForm({ recipient_type: "learner", recipient_name: "", recipient_id: "", due_date: "", notes: "", external_reference: "", lines: [{ description: "", quantity: "1", unit_price: "" }] });
        fetchData();
      } else {
        const data = await res.json();
        toast({ title: "Erreur", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setSavingInvoice(false);
    }
  };

  // ── Update status ──

  const handleUpdateStatus = async (invoiceId: string, status: string) => {
    try {
      const res = await fetch(`/api/formations/${formation.id}/invoices`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId, status }),
      });
      if (res.ok) {
        toast({ title: status === "paid" ? "Facture marquée payée" : "Statut mis à jour" });
        fetchData();
      } else {
        const data = await res.json();
        toast({ title: "Erreur", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    }
  };

  // ── Create charge ──

  const handleCreateCharge = async () => {
    if (!chargeLabel.trim() || !chargeAmount) return;
    const parsedAmount = parseFloat(chargeAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast({ title: "Montant invalide", description: "Entrez un montant positif", variant: "destructive" });
      return;
    }
    setSavingCharge(true);
    try {
      const { error } = await supabase.from("formation_charges").insert({
        session_id: formation.id,
        entity_id: formation.entity_id,
        label: chargeLabel.trim(),
        amount: parsedAmount,
      });
      if (error) throw error;
      toast({ title: "Charge ajoutée" });
      setChargeLabel("");
      setChargeAmount("");
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible d'ajouter la charge";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setSavingCharge(false);
    }
  };

  // ── Delete charge ──

  const handleDeleteCharge = async (id: string) => {
    try {
      const { error } = await supabase.from("formation_charges").delete().eq("id", id).eq("session_id", formation.id);
      if (error) throw error;
      toast({ title: "Charge supprimée" });
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible de supprimer la charge";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  // ── Invoice PDF helpers ──

  const buildInvoicePdfData = (inv: Invoice): InvoicePdfData => ({
    entityName: entity?.name || "MR FORMATION",
    entityAddress: (entity as unknown as Record<string, string>)?.address || "24/26 Boulevard Gay Lussac",
    entityPostalCode: (entity as unknown as Record<string, string>)?.postal_code || "13014",
    entityCity: (entity as unknown as Record<string, string>)?.city || "Marseille",
    entitySiret: (entity as unknown as Record<string, string>)?.siret || "91311329600036",
    entityNda: (entity as unknown as Record<string, string>)?.nda || "93132013113",
    entityPhone: (entity as unknown as Record<string, string>)?.phone || "0750461245",
    entityEmail: (entity as unknown as Record<string, string>)?.email || "contact@mrformation.fr",
    entityTvaExempt: (entity as unknown as Record<string, unknown>)?.tva_exempt !== false,
    entityTvaRate: Number((entity as unknown as Record<string, unknown>)?.tva_rate) || 20,
    entityFooterText: (entity as unknown as Record<string, string>)?.invoice_footer_text || "TVA non applicable, article 261-4-4° du CGI.",
    entityLogo: "",
    reference: inv.reference,
    createdAt: inv.created_at,
    dueDate: inv.due_date,
    status: inv.status,
    isAvoir: inv.is_avoir,
    notes: inv.notes,
    recipientName: inv.recipient_name,
    recipientType: inv.recipient_type,
    sessionTitle: formation.title,
    sessionStartDate: formation.start_date,
    sessionEndDate: formation.end_date,
    sessionDuration: formation.planned_hours ? Number(formation.planned_hours) : null,
    amount: inv.amount,
  });

  const handleDownloadPdf = async (inv: Invoice) => {
    try {
      await downloadInvoicePDF(buildInvoicePdfData(inv));
      toast({ title: `PDF ${inv.reference} téléchargé` });
    } catch {
      toast({ title: "Erreur PDF", variant: "destructive" });
    }
  };

  const handleSendInvoiceEmail = async (inv: Invoice) => {
    // Find recipient email
    let email: string | null = null;
    if (inv.recipient_type === "company") {
      const company = formation.formation_companies?.find((c) => c.client_id === inv.recipient_id);
      email = company?.email || (company?.client as unknown as Record<string, string>)?.email || null;
    }
    if (!email) {
      toast({ title: "Pas d'email pour ce destinataire", variant: "destructive" });
      return;
    }

    try {
      toast({ title: "Génération du PDF et envoi..." });
      const base64 = await invoicePDFBase64(buildInvoicePdfData(inv));
      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email,
          subject: `${inv.is_avoir ? "Avoir" : "Facture"} ${inv.reference} — ${formation.title}`,
          body: `Bonjour,\n\nVeuillez trouver ci-joint ${inv.is_avoir ? "l'avoir" : "la facture"} ${inv.reference} relative à la formation "${formation.title}".\n\nCordialement,\nL'équipe formation`,
          session_id: formation.id,
          attachments: [{
            filename: `${inv.reference}.pdf`,
            content: base64,
            type: "application/pdf",
          }],
        }),
      });
      if (!res.ok) throw new Error("Erreur envoi");

      await supabase
        .from("formation_invoices")
        .update({ status: "sent", updated_at: new Date().toISOString() })
        .eq("id", inv.id);

      toast({ title: `Facture ${inv.reference} envoyée par email` });
      fetchData();
    } catch {
      toast({ title: "Erreur d'envoi", variant: "destructive" });
    }
  };

  const canAutoGenerate =
    formation.status === "completed" &&
    !(formation as unknown as { invoice_generated?: boolean }).invoice_generated &&
    invoices.length === 0;

  const handlePreviewAutoGenerate = async () => {
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/formations/${formation.id}/invoices/auto-generate`);
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setPreviewData(result);
      setPreviewDialog(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirmAutoGenerate = async () => {
    setAutoGenerating(true);
    try {
      const res = await fetch(`/api/formations/${formation.id}/invoices/auto-generate`, {
        method: "POST",
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      toast({
        title: `${result.count} facture(s) générée(s)`,
        description: `Total : ${formatCurrency(result.invoices.reduce((s: number, i: { amount: number }) => s + Number(i.amount), 0))}`,
      });
      setPreviewDialog(false);
      fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setAutoGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ═══ HERO ROW — Stats financières ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Facturé</p>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(stats.total_invoiced)}</p>
          {formation.total_price && stats.total_invoiced > 0 && (
            <div className="mt-1.5">
              <div className="bg-gray-100 rounded-full h-1.5">
                <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (stats.total_invoiced / formation.total_price) * 100)}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">sur {formatCurrency(formation.total_price)} objectif</p>
            </div>
          )}
        </div>
        <div className="border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Payé</p>
          <p className="text-xl font-bold text-green-700">{formatCurrency(stats.total_paid)}</p>
        </div>
        <div className="border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">En attente</p>
          <p className="text-xl font-bold text-amber-600">{formatCurrency(stats.total_pending)}</p>
        </div>
        <div className="border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Charges</p>
          <p className="text-xl font-bold text-red-600">{formatCurrency(stats.total_charges)}</p>
        </div>
      </div>

      {/* Auto-generate button */}
      {canAutoGenerate && (
        <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-900">Formation terminée — aucune facture générée</p>
            <p className="text-xs text-blue-700 mt-0.5">
              Génère automatiquement les factures selon le type de formation (intra/inter), les entreprises liées et les financeurs.
            </p>
          </div>
          <Button
            size="sm"
            className="shrink-0"
            onClick={handlePreviewAutoGenerate}
            disabled={previewLoading}
          >
            {previewLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Générer les factures
          </Button>
        </div>
      )}

      {/* Factures par type */}
      {SECTION_CONFIG.map(({ type, title, icon }) => {
        const sectionInvoices = invoices.filter((i) => i.recipient_type === type);
        return (
          <div key={type} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {icon} {title} ({sectionInvoices.length})
              </h3>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  setInvoiceForm((f) => ({ ...f, recipient_type: type }));
                  setInvoiceDialog(true);
                }}
              >
                <Plus className="h-3 w-3 mr-1" /> Facture
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => { setImportRecipientType(type); setImportDialogOpen(true); }}
              >
                <Upload className="h-3 w-3 mr-1" /> Importer
              </Button>
            </div>
            {sectionInvoices.length === 0 ? (
              <div className="text-center py-6 border border-dashed rounded-lg">
                <p className="text-sm text-muted-foreground">Aucune facture {title.toLowerCase()}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 text-xs gap-1"
                  onClick={() => { setInvoiceForm((f) => ({ ...f, recipient_type: type })); setInvoiceDialog(true); }}
                >
                  <Plus className="h-3 w-3" /> Créer
                </Button>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 border-b">
                    <th className="text-left py-1 font-medium">Réf.</th>
                    <th className="text-left py-1 font-medium">Destinataire</th>
                    <th className="text-right py-1 font-medium">Montant</th>
                    <th className="text-left py-1 pl-3 font-medium">Statut</th>
                    <th className="text-left py-1 font-medium">Échéance</th>
                    <th className="text-right py-1 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sectionInvoices.map((inv) => {
                    const badge = STATUS_BADGES[inv.status] ?? STATUS_BADGES.pending;
                    return (
                      <tr key={inv.id} className="border-b border-gray-100 last:border-0">
                        <td className="py-1.5 font-mono text-xs">
                          {inv.reference}
                          {inv.is_avoir && (
                            <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0 border-purple-300 text-purple-600">AV</Badge>
                          )}
                        </td>
                        <td className="py-1.5 truncate max-w-[160px]">{inv.recipient_name}</td>
                        <td className={`py-1.5 text-right font-medium ${inv.is_avoir ? "text-purple-600" : ""}`}>
                          {formatCurrency(inv.amount)}
                        </td>
                        <td className="py-1.5 pl-3">
                          <div className="flex items-center gap-1">
                            <Badge className={`${badge.className} hover:${badge.className} text-[10px] px-1.5 py-0`}>
                              {badge.label}
                            </Badge>
                            {inv.reminder_count && inv.reminder_count > 0 && REMINDER_BADGES[inv.reminder_count] && (
                              <Badge className={`${REMINDER_BADGES[inv.reminder_count].className} text-[10px] px-1.5 py-0`}>
                                {REMINDER_BADGES[inv.reminder_count].label}
                              </Badge>
                            )}
                            {inv.auto_generated && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 text-blue-600 border-blue-200">
                                Auto
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-1.5 text-xs text-muted-foreground">
                          {inv.due_date ? new Date(inv.due_date).toLocaleDateString("fr-FR") : "—"}
                        </td>
                        <td className="py-1.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[11px] px-1.5"
                              onClick={() => handleDownloadPdf(inv)}
                            >
                              <FileDown className="h-3 w-3 mr-0.5" /> PDF
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[11px] px-1.5 text-blue-600"
                              onClick={() => handleSendInvoiceEmail(inv)}
                            >
                              <Send className="h-3 w-3 mr-0.5" /> Email
                            </Button>
                            {inv.status !== "paid" && inv.status !== "cancelled" && !inv.is_avoir && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[11px] px-1.5 text-green-600"
                                onClick={() => handleUpdateStatus(inv.id, "paid")}
                              >
                                <CheckCircle className="h-3 w-3 mr-0.5" /> Payée
                              </Button>
                            )}
                            {inv.status === "pending" && !inv.is_avoir && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[11px] px-1.5 text-gray-600"
                                onClick={() => handleEditInvoice(inv)}
                              >
                                <Pencil className="h-3 w-3 mr-0.5" /> Modifier
                              </Button>
                            )}
                            {!inv.is_avoir && inv.status !== "cancelled" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[11px] px-1.5 text-purple-600"
                                onClick={() => handleCreateInvoice(true, inv)}
                                disabled={savingInvoice}
                              >
                                <Undo2 className="h-3 w-3 mr-0.5" /> Avoir
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      {/* Charges */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Charges ({charges.length})
          {charges.length > 0 && (
            <span className="ml-2 text-gray-500 normal-case font-normal">
              Total : {formatCurrency(stats.total_charges)}
            </span>
          )}
        </h3>
        {charges.length > 0 && (
          <table className="w-full text-sm">
            <tbody>
              {charges.map((c) => (
                <tr key={c.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-1.5">{c.label}</td>
                  <td className="py-1.5 text-right font-medium">{formatCurrency(c.amount)}</td>
                  <td className="py-1.5 text-right text-xs text-muted-foreground w-24">
                    {new Date(c.created_at).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="py-1.5 text-right w-8">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-red-500"
                      onClick={() => handleDeleteCharge(c.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {/* Inline add charge */}
        <div className="flex items-center gap-2">
          <Input
            value={chargeLabel}
            onChange={(e) => setChargeLabel(e.target.value)}
            placeholder="Libellé charge..."
            className="h-7 text-xs flex-1 max-w-[200px]"
          />
          <Input
            type="number"
            step="0.01"
            value={chargeAmount}
            onChange={(e) => setChargeAmount(e.target.value)}
            placeholder="Montant"
            className="h-7 text-xs w-24"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={handleCreateCharge}
            disabled={savingCharge || !chargeLabel.trim() || !chargeAmount}
          >
            {savingCharge ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
            Ajouter
          </Button>
        </div>
      </div>

      {/* Dialog -- Créer une facture avec lignes */}
      <Dialog open={invoiceDialog} onOpenChange={setInvoiceDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingInvoiceId ? "Modifier la facture" : "Créer une facture"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Destinataire */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type de destinataire</Label>
                <Select
                  value={invoiceForm.recipient_type}
                  onValueChange={(v) => setInvoiceForm((f) => ({ ...f, recipient_type: v }))}
                >
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="learner">Apprenant</SelectItem>
                    <SelectItem value="company">Entreprise</SelectItem>
                    <SelectItem value="financier">Financeur</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Destinataire *</Label>
                {(() => {
                  const options: Array<{ id: string; name: string }> = [];
                  if (invoiceForm.recipient_type === "learner") {
                    for (const e of formation.enrollments || []) {
                      if (e.learner) options.push({ id: e.learner.id, name: `${e.learner.last_name?.toUpperCase()} ${e.learner.first_name}` });
                    }
                  } else if (invoiceForm.recipient_type === "company") {
                    for (const c of formation.formation_companies || []) {
                      if (c.client) options.push({ id: c.client_id, name: c.client.company_name });
                    }
                  } else if (invoiceForm.recipient_type === "financier") {
                    for (const f of formation.formation_financiers || []) {
                      options.push({ id: f.id, name: f.name });
                    }
                  }
                  return options.length > 0 ? (
                    <Select
                      value={invoiceForm.recipient_name}
                      onValueChange={(v) => {
                        const opt = options.find((o) => o.name === v);
                        setInvoiceForm((f) => ({ ...f, recipient_name: v, recipient_id: opt?.id || "" }));
                      }}
                    >
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                      <SelectContent>
                        {options.map((o) => (
                          <SelectItem key={o.id} value={o.name}>{o.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={invoiceForm.recipient_name} onChange={(e) => setInvoiceForm((f) => ({ ...f, recipient_name: e.target.value }))} placeholder="Nom" className="h-8 text-sm" />
                  );
                })()}
              </div>
            </div>

            {/* Lignes de produits */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Produits</Label>
                <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={prefillInvoiceLines}>
                  Pré-remplir
                </Button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <div className="grid grid-cols-[1fr_60px_100px_90px_32px] gap-1 px-2 py-1.5 bg-gray-50 text-[10px] font-semibold text-gray-500 uppercase">
                  <span>Description</span><span>Qté</span><span>PU HT (€)</span><span>Total</span><span></span>
                </div>
                {invoiceForm.lines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_60px_100px_90px_32px] gap-1 px-2 py-1 border-t items-center">
                    <Input value={line.description} onChange={(e) => updateInvoiceLine(idx, "description", e.target.value)} placeholder="Description" className="h-7 text-xs border-0 shadow-none px-1" />
                    <Input value={line.quantity} onChange={(e) => updateInvoiceLine(idx, "quantity", e.target.value)} className="h-7 text-xs text-center" />
                    <Input value={line.unit_price} onChange={(e) => updateInvoiceLine(idx, "unit_price", e.target.value)} className="h-7 text-xs text-right" />
                    <span className="text-xs font-medium text-right pr-1">{calcLineTotal(line).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €</span>
                    <button onClick={() => removeInvoiceLine(idx)} className="p-0.5 text-gray-300 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                  </div>
                ))}
                <div className="px-2 py-1.5 border-t">
                  <button onClick={addInvoiceLine} className="text-xs text-[#374151] hover:underline flex items-center gap-1"><Plus className="h-3 w-3" /> Ajouter une ligne</button>
                </div>
              </div>
              <div className="flex justify-end mt-2">
                <div className="w-48 space-y-0.5 text-sm">
                  <div className="flex justify-between text-gray-500"><span>Total HT</span><span>{invoiceSubtotal.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €</span></div>
                  <div className="flex justify-between font-bold text-gray-900 border-t pt-1"><span>Total TTC</span><span>{invoiceTotal.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €</span></div>
                </div>
              </div>
            </div>

            {/* Infos complémentaires */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Date d&apos;échéance</Label>
                <Input type="date" value={invoiceForm.due_date} onChange={(e) => setInvoiceForm((f) => ({ ...f, due_date: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Référence externe</Label>
                <Input value={invoiceForm.external_reference} onChange={(e) => setInvoiceForm((f) => ({ ...f, external_reference: e.target.value }))} placeholder="N° commande client" className="h-8 text-sm" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Input value={invoiceForm.notes} onChange={(e) => setInvoiceForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Notes..." className="h-8 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setInvoiceDialog(false); setEditingInvoiceId(null); }}>Annuler</Button>
            <Button onClick={() => editingInvoiceId ? handleUpdateInvoice() : handleCreateInvoice(false)} disabled={savingInvoice}>
              {savingInvoice && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingInvoiceId ? "Enregistrer" : "Créer la facture"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ PREVIEW DIALOG ═══ */}
      <Dialog open={previewDialog} onOpenChange={setPreviewDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Aperçu des factures à générer</DialogTitle>
          </DialogHeader>

          {previewData && (
            <div className="space-y-4">
              {/* Warnings */}
              {previewData.warnings.length > 0 && (
                <div className="space-y-1.5">
                  {previewData.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                      <span className="shrink-0">⚠️</span>
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Preview list */}
              {previewData.preview.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Aucune facture à générer.</p>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Destinataire</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Type</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.preview.map((item, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="px-3 py-2">
                            <span className="font-medium">{item.recipientName}</span>
                            {item.detail && <span className="text-xs text-muted-foreground ml-1.5">({item.detail})</span>}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className="text-xs capitalize">{item.recipientType}</Badge>
                          </td>
                          <td className="px-3 py-2 text-right font-medium">{formatCurrency(item.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/30">
                        <td colSpan={2} className="px-3 py-2 text-sm font-medium">Total</td>
                        <td className="px-3 py-2 text-right font-bold">
                          {formatCurrency(previewData.preview.reduce((s, i) => s + i.amount, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDialog(false)}>Annuler</Button>
            {previewData && previewData.preview.length > 0 && (
              <Button onClick={handleConfirmAutoGenerate} disabled={autoGenerating}>
                {autoGenerating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirmer ({previewData.preview.length} facture{previewData.preview.length > 1 ? "s" : ""})
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Import dialog */}
      <ImportInvoiceDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        sessionId={formation.id}
        defaultRecipientType={importRecipientType}
        onSuccess={() => { fetchData(); onRefresh(); }}
      />
    </div>
  );
}
