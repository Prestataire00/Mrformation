"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Euro, Receipt, Plus, CheckCircle, Clock, AlertTriangle,
  Loader2, FileDown, Trash2, Undo2, Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  reference: string;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;
  is_avoir: boolean;
  parent_invoice_id: string | null;
  created_at: string;
}

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
  const supabase = createClient();

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
    amount: "",
    due_date: "",
    notes: "",
  });
  const [savingInvoice, setSavingInvoice] = useState(false);

  // Charge dialog
  const [chargeDialog, setChargeDialog] = useState(false);
  const [chargeLabel, setChargeLabel] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [savingCharge, setSavingCharge] = useState(false);

  // Prefix
  const prefixKey = `invoice_prefix_${formation.id}`;
  const [prefix, setPrefix] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(prefixKey) || "FAC";
    }
    return "FAC";
  });
  const [prefixDraft, setPrefixDraft] = useState(prefix);

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

  // ── Create invoice ──

  const handleCreateInvoice = async (isAvoir = false, parentInvoice?: Invoice) => {
    const recipientName = isAvoir && parentInvoice
      ? parentInvoice.recipient_name
      : invoiceForm.recipient_name.trim();
    const recipientType = isAvoir && parentInvoice
      ? parentInvoice.recipient_type
      : invoiceForm.recipient_type;
    const amount = isAvoir && parentInvoice
      ? -Math.abs(parentInvoice.amount)
      : parseFloat(invoiceForm.amount);

    if (!recipientName) {
      toast({ title: "Le nom du destinataire est requis", variant: "destructive" });
      return;
    }

    setSavingInvoice(true);
    try {
      const res = await fetch(`/api/formations/${formation.id}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient_type: recipientType,
          recipient_id: parentInvoice?.recipient_id ?? crypto.randomUUID(),
          recipient_name: recipientName,
          amount,
          prefix: isAvoir ? "AV" : prefix,
          due_date: isAvoir ? null : invoiceForm.due_date || null,
          notes: isAvoir ? `Avoir sur ${parentInvoice?.reference}` : invoiceForm.notes || null,
          is_avoir: isAvoir,
          parent_invoice_id: parentInvoice?.id ?? null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: isAvoir ? "Avoir créé" : "Facture créée", description: data.invoice.reference });
        if (!isAvoir) {
          setInvoiceDialog(false);
          setInvoiceForm({ recipient_type: "learner", recipient_name: "", amount: "", due_date: "", notes: "" });
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
    setSavingCharge(true);
    const { error } = await supabase.from("formation_charges").insert({
      session_id: formation.id,
      entity_id: formation.entity_id,
      label: chargeLabel.trim(),
      amount: parseFloat(chargeAmount),
    });
    setSavingCharge(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Charge ajoutée" });
      setChargeDialog(false);
      setChargeLabel("");
      setChargeAmount("");
      fetchData();
    }
  };

  // ── Delete charge ──

  const handleDeleteCharge = async (id: string) => {
    const { error } = await supabase.from("formation_charges").delete().eq("id", id);
    if (error) {
      toast({ title: "Erreur", variant: "destructive" });
    } else {
      toast({ title: "Charge supprimée" });
      fetchData();
    }
  };

  // ── Save prefix ──

  const savePrefix = () => {
    const val = prefixDraft.trim().toUpperCase() || "FAC";
    setPrefix(val);
    setPrefixDraft(val);
    localStorage.setItem(prefixKey, val);
    toast({ title: `Préfixe mis à jour : ${val}` });
  };

  // ── Render invoice row ──

  const renderInvoice = (inv: Invoice) => {
    const badge = STATUS_BADGES[inv.status] ?? STATUS_BADGES.pending;
    return (
      <div key={inv.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="font-mono text-sm font-semibold">{inv.reference}</span>
          {inv.is_avoir && (
            <Badge variant="outline" className="text-xs border-purple-300 text-purple-600">Avoir</Badge>
          )}
          <span className="text-sm truncate">{inv.recipient_name}</span>
          <span className={`text-sm font-medium ${inv.is_avoir ? "text-purple-600" : ""}`}>
            {formatCurrency(inv.amount)}
          </span>
          <Badge className={`${badge.className} hover:${badge.className} text-xs`}>
            {badge.label}
          </Badge>
          {inv.due_date && (
            <span className="text-xs text-muted-foreground">
              Éch. {new Date(inv.due_date).toLocaleDateString("fr-FR")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {inv.status !== "paid" && inv.status !== "cancelled" && !inv.is_avoir && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-green-600"
              onClick={() => handleUpdateStatus(inv.id, "paid")}
            >
              <CheckCircle className="h-3 w-3 mr-1" /> Payée
            </Button>
          )}
          {!inv.is_avoir && inv.status !== "cancelled" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-purple-600"
              onClick={() => handleCreateInvoice(true, inv)}
              disabled={savingInvoice}
            >
              <Undo2 className="h-3 w-3 mr-1" /> Avoir
            </Button>
          )}
        </div>
      </div>
    );
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
      {/* SECTION 1 — Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Receipt className="h-5 w-5 text-blue-500" />
            <div>
              <p className="text-xs text-muted-foreground">Total facturé</p>
              <p className="text-xl font-bold">{formatCurrency(stats.total_invoiced)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-xs text-muted-foreground">Payé</p>
              <p className="text-xl font-bold text-green-600">{formatCurrency(stats.total_paid)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-xs text-muted-foreground">En attente</p>
              <p className="text-xl font-bold text-amber-600">{formatCurrency(stats.total_pending)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div>
              <p className="text-xs text-muted-foreground">En retard</p>
              <p className="text-xl font-bold text-red-600">{formatCurrency(stats.total_late)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SECTION 2 — Factures par type */}
      {SECTION_CONFIG.map(({ type, title, icon }) => {
        const sectionInvoices = invoices.filter((i) => i.recipient_type === type);
        return (
          <Card key={type}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <span>{icon}</span> {title} ({sectionInvoices.length})
                </CardTitle>
                <Button
                  size="sm"
                  onClick={() => {
                    setInvoiceForm((f) => ({ ...f, recipient_type: type }));
                    setInvoiceDialog(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" /> Créer une facture
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {sectionInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Aucune facture</p>
              ) : (
                <div className="space-y-2">{sectionInvoices.map(renderInvoice)}</div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* SECTION 3 — Charges */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileDown className="h-4 w-4" /> Charges ({charges.length})
            </CardTitle>
            <Button size="sm" onClick={() => setChargeDialog(true)}>
              <Plus className="h-4 w-4 mr-1" /> Ajouter une charge
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {charges.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Aucune charge</p>
          ) : (
            <div className="space-y-2">
              {charges.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-sm">{c.label}</span>
                    <span className="text-sm font-medium">{formatCurrency(c.amount)}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-500"
                    onClick={() => handleDeleteCharge(c.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <div className="flex justify-end pt-2 border-t">
                <span className="text-sm font-semibold">
                  Total charges : {formatCurrency(stats.total_charges)}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SECTION 4 — Préfixe */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4" /> Préfixe de facturation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Input
              value={prefixDraft}
              onChange={(e) => setPrefixDraft(e.target.value)}
              className="w-32 uppercase"
              placeholder="FAC"
            />
            <span className="text-sm text-muted-foreground">
              Aperçu : <span className="font-mono font-semibold">{prefixDraft.trim().toUpperCase() || "FAC"}-1</span>
            </span>
            <Button size="sm" variant="outline" onClick={savePrefix}>
              Sauvegarder
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Dialog — Créer une facture */}
      <Dialog open={invoiceDialog} onOpenChange={setInvoiceDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Créer une facture</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Type de destinataire</Label>
              <Select
                value={invoiceForm.recipient_type}
                onValueChange={(v) => setInvoiceForm((f) => ({ ...f, recipient_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="learner">Apprenant</SelectItem>
                  <SelectItem value="company">Entreprise</SelectItem>
                  <SelectItem value="financier">Financeur</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nom du destinataire *</Label>
              <Input
                value={invoiceForm.recipient_name}
                onChange={(e) => setInvoiceForm((f) => ({ ...f, recipient_name: e.target.value }))}
                placeholder={RECIPIENT_LABELS[invoiceForm.recipient_type] || "Nom"}
              />
            </div>
            <div>
              <Label>Montant (EUR) *</Label>
              <Input
                type="number"
                step="0.01"
                value={invoiceForm.amount}
                onChange={(e) => setInvoiceForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>Date d&apos;échéance</Label>
              <Input
                type="date"
                value={invoiceForm.due_date}
                onChange={(e) => setInvoiceForm((f) => ({ ...f, due_date: e.target.value }))}
              />
            </div>
            <div>
              <Label>Préfixe</Label>
              <Input value={prefix} disabled className="w-32 uppercase" />
            </div>
            <div>
              <Label>Notes</Label>
              <Input
                value={invoiceForm.notes}
                onChange={(e) => setInvoiceForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Notes optionnelles..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceDialog(false)}>Annuler</Button>
            <Button onClick={() => handleCreateInvoice(false)} disabled={savingInvoice}>
              {savingInvoice && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog — Ajouter une charge */}
      <Dialog open={chargeDialog} onOpenChange={setChargeDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ajouter une charge</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Libellé *</Label>
              <Input
                value={chargeLabel}
                onChange={(e) => setChargeLabel(e.target.value)}
                placeholder="Location salle, matériel..."
              />
            </div>
            <div>
              <Label>Montant (EUR) *</Label>
              <Input
                type="number"
                step="0.01"
                value={chargeAmount}
                onChange={(e) => setChargeAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChargeDialog(false)}>Annuler</Button>
            <Button onClick={handleCreateCharge} disabled={savingCharge || !chargeLabel.trim() || !chargeAmount}>
              {savingCharge && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
