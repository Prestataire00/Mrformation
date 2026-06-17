"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { useEntity } from "@/contexts/EntityContext";
import { ImportInvoiceDialog } from "./ImportInvoiceDialog";
import { downloadInvoicePDF, invoicePDFBase64 } from "@/lib/invoice-pdf-export";
import type { InvoicePdfData } from "@/lib/invoice-pdf-export";
import { buildInvoiceLines } from "@/lib/utils/invoice-builder";
import { getFormationKind, getLearnersForCompany, getAmountForCompany } from "@/lib/utils/formation-companies";
import { getDefaultRecipientType, type Invoice, type Charge, type Stats } from "@/lib/utils/finances-display";
import { FinancesKpiBand } from "./finances/FinancesKpiBand";
import { InvoiceSection } from "./finances/InvoiceSection";
import { ChargesPanel } from "./finances/ChargesPanel";

const MODE_LABELS: Record<string, string> = {
  presentiel: "En présentiel",
  distanciel: "À distance",
  hybride: "Hybride",
};
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
import { invoiceDisplayRef } from "@/lib/utils/invoice-display-ref";
import type { Session } from "@/lib/types";


interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

const SECTION_CONFIG = [
  { type: "learner", title: "Apprenants", icon: "👤" },
  { type: "company", title: "Entreprises", icon: "🏢" },
  { type: "financier", title: "Financeurs", icon: "🏛️" },
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
    recipient_siret: "",
    recipient_address: "",
    due_date: "",
    notes: "",
    external_reference: "",
    funding_type: "" as string,
    lines: [{ description: "", quantity: "1", unit_price: "" }] as { description: string; quantity: string; unit_price: string }[],
  });
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);

  // Picker entreprise (Story 3.6) : en INTER, on demande explicitement à l'admin
  // quelle entreprise facturer (plus de fallback arbitraire sur formation_companies[0]).
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  // E2-S08 : orchestration state-driven (remplace setTimeout 50ms). Stocke le
  // clientId à pré-remplir une fois le picker fermé. Un useEffect réagit à la
  // fermeture du picker + à la présence d'un clientId en attente pour
  // déclencher le pré-remplissage (sans dépendre du timing du fade-out).
  const [pendingCompanyPrefill, setPendingCompanyPrefill] = useState<string | null>(null);

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
  const entityTvaExempt = (entity as unknown as Record<string, unknown>)?.tva_exempt === true;
  const entityTvaRate = Number((entity as unknown as Record<string, unknown>)?.tva_rate) || 20;
  const invoiceTvaAmount = entityTvaExempt ? 0 : Math.round(invoiceSubtotal * (entityTvaRate / 100) * 100) / 100;
  const invoiceTotal = Math.round((invoiceSubtotal + invoiceTvaAmount) * 100) / 100;

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

  // Crée un formulaire de facture vierge (fonction → `lines` jamais partagé).
  const createEmptyInvoiceForm = () => ({
    recipient_type: "learner",
    recipient_name: "",
    recipient_id: "",
    recipient_siret: "",
    recipient_address: "",
    due_date: "",
    notes: "",
    external_reference: "",
    funding_type: "",
    lines: [{ description: "", quantity: "1", unit_price: "" }],
  });

  // Ouvre le dialogue de création (le useEffect ci-dessous applique le
  // type par défaut + déclenche picker/préremplissage — spec §4.1/§4.2).
  const openCreateInvoice = () => {
    setEditingInvoiceId(null);
    setInvoiceForm(createEmptyInvoiceForm());
    setInvoiceDialog(true);
  };

  // Changement de type de destinataire (à l'ouverture du dialogue ET via le
  // Select). Spec §4.1 : le picker entreprise se déclenche ICI sur INTER,
  // plus à l'ouverture du dialogue.
  const handleRecipientTypeChange = (newType: string) => {
    setInvoiceForm((f) => ({
      ...f,
      recipient_type: newType,
      recipient_name: "",
      recipient_id: "",
      recipient_siret: "",
      recipient_address: "",
    }));
    const kind = getFormationKind(formation);
    if (newType === "company" && kind === "inter") {
      setCompanyPickerOpen(true);
    } else if (newType === "company" && kind === "intra") {
      // E2-S08 : appel direct (sans setTimeout). `prefillInvoiceLines` lit le
      // type via l'override (1er arg) — la mise à jour de invoiceForm faite
      // juste au-dessus n'a pas besoin d'être "vue" via closure.
      prefillInvoiceLines("company");
    }
    // learner / financier : le préremplissage attend le choix du destinataire
    // précis (handleRecipientSelect s'en charge).
  };

  // À l'ouverture du dialogue (création), applique le type par défaut puis
  // délègue à handleRecipientTypeChange (picker INTER / préremplissage INTRA).
  useEffect(() => {
    if (invoiceDialog && !editingInvoiceId) {
      handleRecipientTypeChange(getDefaultRecipientType(formation));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceDialog, editingInvoiceId, formation.id]);

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

  /**
   * Construit les lignes auto du formulaire via le builder unifié
   * `buildInvoiceLines`. Le montant est dérivé du type de destinataire ;
   * la sortie numérique du builder est formatée en chaînes (décimale
   * virgule) pour les champs du formulaire. L'admin reste libre d'éditer.
   */
  const buildAutoLines = (recipientType: string, recipientId?: string): { description: string; quantity: string; unit_price: string }[] => {
    let amount = 0;
    if (recipientType === "company" && recipientId) {
      amount = getAmountForCompany(formation, recipientId) ?? 0;
    } else if (recipientType === "financier" && recipientId) {
      const fin = (formation.formation_financiers || []).find((f) => f.id === recipientId);
      // amount_granted = montant accordé après accord OPCO ; amount = montant
      // saisi à la création du dossier. On privilégie l'accordé, repli sur le saisi.
      amount = Number(fin?.amount_granted) || Number(fin?.amount) || 0;
    } else {
      // learner (ou type/id incomplet) : suggestion = total_price ÷ nb apprenants.
      const realCount = (formation.enrollments || []).filter((e) => e.learner).length;
      const total = formation.total_price || 0;
      amount = realCount > 1 ? total / realCount : total;
    }
    const { lines } = buildInvoiceLines(formation, {
      type: recipientType === "company" || recipientType === "financier" ? recipientType : "learner",
      id: recipientId ?? "",
      amount,
    });
    return lines.map((l) => ({
      description: l.description,
      quantity: String(l.quantity),
      unit_price: l.unit_price.toFixed(2).replace(".", ","),
    }));
  };

  /**
   * Auto-remplit la facture depuis les données de la formation.
   * Tous les champs auto-remplis SAUF si l'admin a déjà tapé quelque chose
   * (on respecte la saisie utilisateur — pas d'écrasement).
   */
  const prefillInvoiceLines = (overrideRecipientType?: string, overrideRecipientId?: string) => {
    const enrollments = formation.enrollments || [];
    const recipientType = overrideRecipientType || invoiceForm.recipient_type;

    // Story h-4 : si company, filtrer les apprenants par client_id de l'enrollment
    // pour les notes "Participants" — sinon on listait TOUS les apprenants de
    // la session INTER (y compris ceux d'autres entreprises).
    const filterCompanyId = recipientType === "company"
      ? (overrideRecipientId || invoiceForm.recipient_id || null)
      : null;
    const participantsSource = filterCompanyId
      ? enrollments.filter((e) => e.client_id === filterCompanyId)
      : enrollments;

    const participantNames = participantsSource
      .filter((e) => e.learner)
      .map((e) => `${e.learner!.last_name?.toUpperCase()} ${e.learner!.first_name}`)
      .join(", ");

    const updates: Partial<typeof invoiceForm> = {};

    // Auto-fill recipient depuis override (ex. picker modal en INTER, ou INTRA
    // qui passe l'unique entreprise) — Story 3.6.
    // Plus de fallback arbitraire sur formation_companies[0] : si aucun override
    // et aucun recipient_id déjà saisi, l'admin saisit manuellement.
    let recipientIdForLines: string | undefined = overrideRecipientId || invoiceForm.recipient_id || undefined;
    if (!invoiceForm.recipient_id && overrideRecipientId) {
      // Resolve l'entreprise par client_id (jamais par name)
      const fc = (formation.formation_companies || []).find((c) => c.client_id === overrideRecipientId);
      const client = fc?.client as unknown as Record<string, string | null> | undefined;
      if (fc && client && (recipientType === "company" || !overrideRecipientType)) {
        updates.recipient_type = "company";
        updates.recipient_name = client.company_name || "";
        updates.recipient_id = fc.client_id || "";
        updates.recipient_siret = client.siret || "";
        updates.recipient_address = [client.address, client.postal_code, client.city].filter(Boolean).join(" ");
        recipientIdForLines = fc.client_id || undefined;
      }
    } else if (!invoiceForm.recipient_id && !overrideRecipientId && recipientType === "company") {
      // INTRA : auto-fill avec l'unique entreprise rattachée (comportement legacy attendu).
      // En INTER, prefillInvoiceLines n'est appelé qu'avec un overrideRecipientId issu du picker,
      // donc on ne tombe jamais ici avec plusieurs entreprises.
      const companies = formation.formation_companies || [];
      if (companies.length === 1) {
        const only = companies[0];
        const client = only.client as unknown as Record<string, string | null> | undefined;
        if (client) {
          updates.recipient_type = "company";
          updates.recipient_name = client.company_name || "";
          updates.recipient_id = only.client_id || "";
          updates.recipient_siret = client.siret || "";
          updates.recipient_address = [client.address, client.postal_code, client.city].filter(Boolean).join(" ");
          recipientIdForLines = only.client_id || undefined;
        }
      }
    }

    // Lignes : remplit toujours (sauf si lignes déjà non-vides avec contenu).
    // En multi-entreprises, le helper PR 14 utilise companyId pour produire les lignes
    // (INTRA = 1 ligne globale, INTER = N lignes par apprenant) avec le bon montant.
    const linesAreEmpty = invoiceForm.lines.every((l) => !l.description.trim() && !parseFloat(l.unit_price.replace(",", ".")));
    if (linesAreEmpty) {
      updates.lines = buildAutoLines(updates.recipient_type ?? recipientType, recipientIdForLines);
    }

    // Date d'échéance = end_date + 30 jours (sauf si déjà saisie)
    if (!invoiceForm.due_date && formation.end_date) {
      const due = new Date(formation.end_date);
      due.setDate(due.getDate() + 30);
      updates.due_date = due.toISOString().split("T")[0];
    }

    // Notes avec liste des participants (sauf si déjà saisies). On garde
    // la liste en notes en plus des lignes individuelles : c'est utile pour
    // l'apprenant destinataire (dont la ligne ne montre qu'un nom général)
    // et c'est une trace résumée pour l'entreprise.
    if (!invoiceForm.notes && participantNames) {
      updates.notes = `Participants : ${participantNames}`;
    }

    setInvoiceForm((f) => ({ ...f, ...updates }));
  };

  // Auto-fill recipient details + (re)génère les lignes (1 par apprenant pour
  // entreprise/financeur, 1 globale pour apprenant)
  const handleRecipientSelect = (name: string) => {
    const updates: Partial<typeof invoiceForm> = { recipient_name: name };
    const enrollments = formation.enrollments || [];

    if (invoiceForm.recipient_type === "company") {
      // Story 3.6 : lookup d'abord par client_id (cas idéal si l'UI passe l'id),
      // fallback par company_name pour rétro-compat avec le Select actuel
      // (qui passe le name comme value).
      const fc = (formation.formation_companies || []).find(
        (c) => c.client_id === name || c.client?.company_name === name
      );
      const client = fc?.client as unknown as Record<string, string | null> | undefined;
      if (fc && client) {
        updates.recipient_id = fc.client_id || "";
        updates.recipient_siret = client.siret || "";
        updates.recipient_address = [client.address, client.postal_code, client.city].filter(Boolean).join(" ");
      }
    } else if (invoiceForm.recipient_type === "learner") {
      const enrollment = enrollments.find(e =>
        e.learner && `${e.learner.last_name?.toUpperCase()} ${e.learner.first_name}` === name
      );
      if (enrollment?.learner) {
        updates.recipient_id = enrollment.learner.id;
        updates.recipient_siret = "";
        const learnerAddr = (enrollment.learner as unknown as Record<string, string | null>);
        updates.recipient_address = [learnerAddr.address, learnerAddr.postal_code, learnerAddr.city].filter(Boolean).join(" ");
      }
    } else if (invoiceForm.recipient_type === "financier") {
      const fin = (formation.formation_financiers || []).find(f => f.name === name);
      if (fin) {
        updates.recipient_id = fin.id;
        updates.recipient_siret = "";
        updates.recipient_address = "";
      }
    }

    // (Re)génère les lignes selon le recipient_type — sauf si admin a déjà tapé.
    // Passe l'id du destinataire (companyId) pour activer le helper PR 14 multi-entreprises.
    if (invoiceForm.lines.every((l) => !l.description.trim() && !parseFloat(l.unit_price.replace(",", ".")))) {
      updates.lines = buildAutoLines(invoiceForm.recipient_type, updates.recipient_id);
    }

    // Date d'échéance auto = end_date + 30 jours (si pas déjà saisie)
    if (!invoiceForm.due_date && formation.end_date) {
      const due = new Date(formation.end_date);
      due.setDate(due.getDate() + 30);
      updates.due_date = due.toISOString().split("T")[0];
    }

    // Notes avec participants (si pas déjà saisies)
    if (!invoiceForm.notes) {
      const participantNames = enrollments
        .filter((e) => e.learner)
        .map((e) => `${e.learner!.last_name?.toUpperCase()} ${e.learner!.first_name}`)
        .join(", ");
      if (participantNames) updates.notes = `Participants : ${participantNames}`;
    }

    setInvoiceForm(f => ({ ...f, ...updates }));
  };

  // Story 3.6 : appelé après que l'admin a choisi l'entreprise à facturer
  // dans le picker (INTER). E2-S08 : orchestration state-driven — on enregistre
  // le clientId en "pending" puis on ferme le picker. Le useEffect ci-dessous
  // détectera la fermeture du picker + le clientId pending et lancera le
  // pré-remplissage (sans setTimeout, sans race condition).
  const handleCompanyPicked = (clientId: string) => {
    setPendingCompanyPrefill(clientId);
    setCompanyPickerOpen(false);
  };

  // E2-S08 : orchestration state-driven du pré-remplissage post-picker.
  // Déclenchement : picker fermé (companyPickerOpen=false) ET clientId en
  // attente. Reset du pending pour éviter les ré-exécutions.
  useEffect(() => {
    if (!companyPickerOpen && pendingCompanyPrefill) {
      const clientId = pendingCompanyPrefill;
      setPendingCompanyPrefill(null);
      prefillInvoiceLines("company", clientId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyPickerOpen, pendingCompanyPrefill]);

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

    // amount stocké en HT (la TVA est calculée au rendu PDF depuis entity.tva_rate).
    const amount = isAvoir && parentInvoice
      ? -Math.abs(parentInvoice.amount)
      : invoiceSubtotal;

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
          recipient_siret: invoiceForm.recipient_siret || null,
          recipient_address: invoiceForm.recipient_address || null,
          amount,
          prefix: isAvoir ? "AV" : prefix,
          due_date: isAvoir ? null : invoiceForm.due_date || null,
          notes: isAvoir ? `Avoir sur ${parentInvoice?.reference}` : invoiceForm.notes || null,
          is_avoir: isAvoir,
          parent_invoice_id: parentInvoice?.id ?? null,
          external_reference: invoiceForm.external_reference || null,
          funding_type: isAvoir ? null : invoiceForm.funding_type || null,
          lines: parsedLines,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: isAvoir ? "Avoir créé" : "Facture créée", description: data.invoice.reference });
        if (data.warning) {
          toast({ title: "Attention", description: data.warning, variant: "destructive" });
        }
        if (!isAvoir) {
          setInvoiceDialog(false);
          setInvoiceForm({ recipient_type: "learner", recipient_name: "", recipient_id: "", recipient_siret: "", recipient_address: "", due_date: "", notes: "", external_reference: "", funding_type: "", lines: [{ description: "", quantity: "1", unit_price: "" }] });
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

    const invRecord = inv as unknown as Record<string, string | null>;
    setInvoiceForm({
      recipient_type: inv.recipient_type,
      recipient_name: inv.recipient_name,
      recipient_id: inv.recipient_id,
      recipient_siret: invRecord.recipient_siret || "",
      recipient_address: invRecord.recipient_address || "",
      due_date: inv.due_date ? inv.due_date.split("T")[0] : "",
      notes: inv.notes || "",
      external_reference: inv.external_reference || "",
      funding_type: invRecord.funding_type || "",
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
          recipient_siret: invoiceForm.recipient_siret || null,
          recipient_address: invoiceForm.recipient_address || null,
          due_date: invoiceForm.due_date || null,
          notes: invoiceForm.notes || null,
          external_reference: invoiceForm.external_reference || null,
          funding_type: invoiceForm.funding_type || null,
          // amount stocké en HT (la TVA est calculée au rendu PDF depuis entity.tva_rate).
          amount: invoiceSubtotal,
          lines: parsedLines,
        }),
      });
      if (res.ok) {
        toast({ title: "Facture mise à jour" });
        setInvoiceDialog(false);
        setEditingInvoiceId(null);
        setInvoiceForm({ recipient_type: "learner", recipient_name: "", recipient_id: "", recipient_siret: "", recipient_address: "", due_date: "", notes: "", external_reference: "", funding_type: "", lines: [{ description: "", quantity: "1", unit_price: "" }] });
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

  // ── Add charge ── (le formulaire est porté par ChargesPanel)

  const handleAddCharge = async (label: string, amount: number): Promise<void> => {
    try {
      const { error } = await supabase.from("formation_charges").insert({
        session_id: formation.id,
        entity_id: formation.entity_id,
        label,
        amount,
      });
      if (error) throw error;
      toast({ title: "Charge ajoutée" });
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible d'ajouter la charge";
      toast({ title: "Erreur", description: message, variant: "destructive" });
      throw err; // ChargesPanel doit savoir que l'ajout a échoué.
    }
  };

  // ── Delete charge ──

  const handleDeleteCharge = async (id: string) => {
    try {
      const { error } = await supabase
        .from("formation_charges")
        .delete()
        .eq("id", id)
        .eq("session_id", formation.id)
        .eq("entity_id", formation.entity_id);
      if (error) throw error;
      toast({ title: "Charge supprimée" });
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible de supprimer la charge";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  // ── Invoice PDF helpers ──

  const buildInvoicePdfData = (inv: Invoice): InvoicePdfData => {
    const entityRec = (entity as unknown as Record<string, unknown>) || {};
    const str = (k: string): string => (typeof entityRec[k] === "string" ? (entityRec[k] as string) : "");
    const strOrNull = (k: string): string | null => (typeof entityRec[k] === "string" ? (entityRec[k] as string) : null);

    // Apprenants : filtrer par entreprise si destinataire = company, sinon tous
    const allEnrollments = formation.enrollments || [];
    const learnerEnrollments = inv.recipient_type === "company"
      ? getLearnersForCompany(formation, inv.recipient_id)
      : allEnrollments;
    // La liste « Apprenant(s) » n'apparaît sur le PDF qu'en Intra ; en Inter
    // les lignes nominatives la rendent redondante (cf. spec §3.3/§3.4).
    const sessionLearners = getFormationKind(formation) === "intra"
      ? learnerEnrollments
          .filter((e) => e.learner)
          .map((e) => `${e.learner!.last_name?.toUpperCase()} ${e.learner!.first_name}`)
      : [];

    // Formateurs
    const sessionTrainers = (formation.formation_trainers || [])
      .filter((ft) => ft.trainer)
      .map((ft) => `${ft.trainer!.last_name?.toUpperCase()} ${ft.trainer!.first_name}`);

    return {
      entityName: entity?.name || "MR FORMATION",
      entityAddress: str("address") || "24/26 Boulevard Gay Lussac",
      entityPostalCode: str("postal_code") || "13014",
      entityCity: str("city") || "Marseille",
      entitySiret: str("siret") || "91311329600036",
      entityNda: str("nda") || "93132013113",
      entityPhone: str("phone") || "0750461245",
      entityEmail: str("email") || "contact@mrformation.fr",
      entityWebsite: strOrNull("website"),
      entityTvaExempt: entityRec.tva_exempt === true,
      entityTvaRate: Number(entityRec.tva_rate) || 20,
      entityFooterText: str("invoice_footer_text"),
      entityLogo: "",
      entityStampUrl: strOrNull("stamp_url"),
      entityBankName: strOrNull("bank_name"),
      entityBankIban: str("bank_iban"),
      entityBankBic: strOrNull("bank_bic"),
      entityBankBeneficiary: strOrNull("bank_beneficiary"),
      entityPenaltyText: strOrNull("invoice_penalty_text"),
      reference: invoiceDisplayRef(inv),
      createdAt: inv.created_at,
      dueDate: inv.due_date,
      status: inv.status,
      isAvoir: inv.is_avoir,
      notes: inv.notes,
      recipientName: inv.recipient_name,
      recipientType: inv.recipient_type,
      recipientSiret: (inv as unknown as Record<string, string>).recipient_siret || undefined,
      recipientAddress: (inv as unknown as Record<string, string>).recipient_address || undefined,
      sessionTitle: formation.title,
      sessionStartDate: formation.start_date,
      sessionEndDate: formation.end_date,
      sessionDuration: formation.planned_hours ? Number(formation.planned_hours) : null,
      sessionMode: MODE_LABELS[formation.mode] || formation.mode || null,
      sessionLocation: formation.location || null,
      sessionTrainers,
      sessionLearners,
      amount: inv.amount,
      learnerCount: allEnrollments.length || undefined,
    };
  };

  // h-12 : charge les formation_invoice_lines pour les passer au builder PDF.
  // Sans ça, le PDF affichait 1 seule ligne avec inv.amount comme prix (souvent
  // 0€ ou agrégé), perdant le détail des lignes saisies par l'admin.
  const buildPdfDataWithLines = async (inv: Invoice): Promise<InvoicePdfData> => {
    const pdfData = buildInvoicePdfData(inv);
    const { data: lines } = await supabase
      .from("formation_invoice_lines")
      .select("description, quantity, unit_price")
      .eq("invoice_id", inv.id)
      .order("order_index", { ascending: true });
    if (lines && lines.length > 0) {
      pdfData.lines = lines.map((l) => ({
        description: l.description as string,
        quantity: Number(l.quantity) || 1,
        unit_price: Number(l.unit_price) || 0,
      }));
    }
    return pdfData;
  };

  const handleDownloadPdf = async (inv: Invoice) => {
    try {
      const pdfData = await buildPdfDataWithLines(inv);
      await downloadInvoicePDF(pdfData);
      toast({ title: `PDF ${invoiceDisplayRef(inv)} téléchargé` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur PDF";
      toast({ title: "Génération PDF impossible", description: message, variant: "destructive" });
    }
  };

  const handleSendInvoiceEmail = async (inv: Invoice) => {
    // Find recipient email — selon le type de destinataire (les 3 types
    // sont gérés : le bouton « Email » est affiché sur toutes les factures).
    let email: string | null = null;
    if (inv.recipient_type === "company") {
      const company = formation.formation_companies?.find((c) => c.client_id === inv.recipient_id);
      email = company?.email || (company?.client as unknown as Record<string, string>)?.email || null;
    } else if (inv.recipient_type === "learner") {
      const enr = formation.enrollments?.find((e) => e.learner?.id === inv.recipient_id);
      email = (enr?.learner as unknown as Record<string, string> | undefined)?.email || null;
    } else if (inv.recipient_type === "financier") {
      // L'email du financeur est porté par le financeur maître lié.
      const ff = formation.formation_financiers?.find((f) => f.id === inv.recipient_id);
      if (ff?.financeur_id) {
        const { data: fin } = await supabase
          .from("financeurs")
          .select("email")
          .eq("id", ff.financeur_id)
          .maybeSingle();
        email = (fin as { email?: string } | null)?.email || null;
      }
    }
    if (!email) {
      toast({ title: "Pas d'email pour ce destinataire", variant: "destructive" });
      return;
    }

    try {
      toast({ title: "Génération du PDF et envoi..." });
      const pdfData = await buildPdfDataWithLines(inv);
      const base64 = await invoicePDFBase64(pdfData);
      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email,
          subject: `${inv.is_avoir ? "Avoir" : "Facture"} ${invoiceDisplayRef(inv)} — ${formation.title}`,
          body: `Bonjour,\n\nVeuillez trouver ci-joint ${inv.is_avoir ? "l'avoir" : "la facture"} ${invoiceDisplayRef(inv)} relative à la formation "${formation.title}".\n\nCordialement,\nL'équipe formation`,
          session_id: formation.id,
          attachments: [{
            filename: `${invoiceDisplayRef(inv)}.pdf`,
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

      toast({ title: `Facture ${invoiceDisplayRef(inv)} envoyée par email` });
      fetchData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur d'envoi";
      toast({ title: "Envoi impossible", description: message, variant: "destructive" });
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
      {/* Zone 1 — Indicateurs */}
      <FinancesKpiBand stats={stats} objectif={formation.total_price ?? null} />

      {/* Zone 2 — Barre d'action */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">Factures</h3>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { setImportRecipientType("company"); setImportDialogOpen(true); }}
            className="text-sm text-muted-foreground hover:underline"
          >
            Importer une facture
          </button>
          <Button size="sm" onClick={openCreateInvoice}>
            <Plus className="h-4 w-4 mr-1" /> Créer une facture
          </Button>
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

      {/* Zone 3 — Sections par type (vides masquées) ou état vide global */}
      {invoices.length === 0 ? (
        <div className="text-center py-10 border border-dashed rounded-lg">
          <p className="text-sm text-muted-foreground">Aucune facture pour cette formation.</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={openCreateInvoice}>
            <Plus className="h-4 w-4 mr-1" /> Créer une facture
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {SECTION_CONFIG.map(({ type, title, icon }) => (
            <InvoiceSection
              key={type}
              title={title}
              icon={icon}
              invoices={invoices.filter((i) => i.recipient_type === type)}
              onDownloadPdf={handleDownloadPdf}
              onSendEmail={handleSendInvoiceEmail}
              onMarkPaid={(inv) => handleUpdateStatus(inv.id, "paid")}
              onEdit={handleEditInvoice}
              onCreateAvoir={(inv) => handleCreateInvoice(true, inv)}
            />
          ))}
        </div>
      )}

      {/* Zone 5 — Charges & marge */}
      <ChargesPanel
        charges={charges}
        totalInvoiced={stats.total_invoiced}
        totalCharges={stats.total_charges}
        onAddCharge={handleAddCharge}
        onDeleteCharge={handleDeleteCharge}
      />

      {/* Dialog -- Créer une facture avec lignes */}
      <Dialog open={invoiceDialog} onOpenChange={setInvoiceDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingInvoiceId ? "Modifier la facture" : "Créer une facture"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Destinataire */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Type de destinataire</Label>
                  <Select
                    value={invoiceForm.recipient_type}
                    onValueChange={handleRecipientTypeChange}
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
                        onValueChange={(v) => handleRecipientSelect(v)}
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">SIRET</Label>
                  <Input value={invoiceForm.recipient_siret} onChange={(e) => setInvoiceForm((f) => ({ ...f, recipient_siret: e.target.value }))} placeholder="N° SIRET" className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Adresse</Label>
                  <Input value={invoiceForm.recipient_address} onChange={(e) => setInvoiceForm((f) => ({ ...f, recipient_address: e.target.value }))} placeholder="Adresse complète" className="h-8 text-sm" />
                </div>
              </div>
            </div>

            {/* Lignes de produits */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Produits</Label>
                <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={() => prefillInvoiceLines()}>
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
                <div className="w-56 space-y-0.5 text-sm">
                  <div className="flex justify-between text-gray-500">
                    <span>Total HT</span>
                    <span>{invoiceSubtotal.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €</span>
                  </div>
                  {entityTvaExempt ? (
                    <div className="text-[10px] text-gray-500 italic text-right">TVA non applicable, art. 261-4-4° du CGI</div>
                  ) : (
                    <div className="flex justify-between text-gray-500">
                      <span>TVA ({entityTvaRate}%)</span>
                      <span>{invoiceTvaAmount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-gray-900 border-t pt-1">
                    <span>Total TTC</span>
                    <span>{invoiceTotal.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €</span>
                  </div>
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
              <Label className="text-xs">Source de financement (BPF)</Label>
              <Select
                value={invoiceForm.funding_type || "__none__"}
                onValueChange={(v) => setInvoiceForm((f) => ({ ...f, funding_type: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Sélectionner le type de financement…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Non renseigné —</SelectItem>
                  <SelectItem value="entreprise_privee">Entreprise privée (plan de développement)</SelectItem>
                  <SelectItem value="plan_developpement">Plan de développement des compétences</SelectItem>
                  <SelectItem value="cpf">CPF (Compte Personnel de Formation)</SelectItem>
                  <SelectItem value="apprentissage">Apprentissage</SelectItem>
                  <SelectItem value="professionnalisation">Contrat de professionnalisation</SelectItem>
                  <SelectItem value="reconversion_alternance">Reconversion ou promotion par alternance (Pro-A)</SelectItem>
                  <SelectItem value="conge_transition">Congé de transition professionnelle (CTP)</SelectItem>
                  <SelectItem value="dispositif_chomeurs">Dispositif demandeurs d&apos;emploi</SelectItem>
                  <SelectItem value="pole_emploi">France Travail (Pôle Emploi)</SelectItem>
                  <SelectItem value="conseil_regional">Conseil Régional</SelectItem>
                  <SelectItem value="etat">État</SelectItem>
                  <SelectItem value="pouvoir_public_agents">Pouvoirs publics — agents</SelectItem>
                  <SelectItem value="instances_europeennes">Instances européennes</SelectItem>
                  <SelectItem value="non_salaries">Travailleurs non-salariés</SelectItem>
                  <SelectItem value="individuel">Particulier (financement individuel)</SelectItem>
                  <SelectItem value="organisme_formation">Organisme de formation</SelectItem>
                  <SelectItem value="autres_publics">Autres publics</SelectItem>
                  <SelectItem value="autre">Autre</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-gray-500 mt-1">
                Cette valeur est utilisée pour la déclaration BPF (catégories de financement).
              </p>
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

      {/* Picker entreprise (Story 3.6) — en INTER, ouverte à la création d'une facture
          pour demander explicitement quelle entreprise est facturée. */}
      <Dialog open={companyPickerOpen} onOpenChange={setCompanyPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>À quelle entreprise facturez-vous ?</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground mb-3">
            Cette formation est rattachée à plusieurs entreprises. Choisissez celle à facturer.
          </div>
          <div className="space-y-2">
            {(formation.formation_companies || []).map((fc) => (
              <Button
                key={fc.client_id}
                variant="outline"
                className="w-full justify-between"
                onClick={() => handleCompanyPicked(fc.client_id)}
              >
                <span className="font-medium">
                  {fc.client?.company_name || `Client ${fc.client_id.slice(0, 8)}`}
                </span>
                {fc.amount != null && (
                  <span className="text-xs text-muted-foreground">
                    {formatCurrency(fc.amount)}
                  </span>
                )}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setCompanyPickerOpen(false);
                setInvoiceDialog(false); // annule la création
              }}
            >
              Annuler
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
