"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import {
  Loader2, Plus, CheckCircle, Lock, Banknote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/utils";

interface Lot {
  id: string;
  lot_reference: string;
  factor_name: string;
  total_amount: number;
  advance_rate: number;
  advance_amount: number;
  status: string;
  notes: string | null;
  invoice_count: number;
  created_at: string;
}

interface EligibleInvoice {
  id: string;
  reference: string;
  recipient_name: string;
  amount: number;
  session_title: string;
}

const LOT_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  sent: "Envoyé au factor",
  paid: "Payé",
  closed: "Clôturé",
};

const LOT_STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  closed: "bg-purple-100 text-purple-700",
};

export default function AffacturagePage() {
  const supabase = createClient();
  const { entityId } = useEntity();
  const { toast } = useToast();

  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [factorName, setFactorName] = useState("");
  const [lotReference, setLotReference] = useState("");
  const [advanceRate, setAdvanceRate] = useState("90");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Step 2 — invoice selection
  const [eligibleInvoices, setEligibleInvoices] = useState<EligibleInvoice[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  const fetchLots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/affacturage");
      const data = await res.json();
      setLots(data.lots ?? []);
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les lots", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchLots();
  }, [fetchLots]);

  const fetchEligibleInvoices = useCallback(async () => {
    if (!entityId) return;
    setLoadingInvoices(true);
    try {
      const { data: invoices } = await supabase
        .from("formation_invoices")
        .select("id, reference, recipient_name, amount, session_id")
        .eq("entity_id", entityId)
        .eq("is_factored", false)
        .eq("is_avoir", false)
        .in("status", ["pending", "sent", "late"])
        .order("created_at", { ascending: false });

      if (!invoices || invoices.length === 0) {
        setEligibleInvoices([]);
        setLoadingInvoices(false);
        return;
      }

      const sessionIds = [...new Set(invoices.map((i) => i.session_id))];
      const { data: sessions } = await supabase
        .from("sessions")
        .select("id, title")
        .in("id", sessionIds);

      const sessionMap = new Map((sessions ?? []).map((s) => [s.id, s.title]));

      setEligibleInvoices(
        invoices.map((inv) => ({
          id: inv.id,
          reference: inv.reference,
          recipient_name: inv.recipient_name,
          amount: Number(inv.amount),
          session_title: sessionMap.get(inv.session_id) || "—",
        }))
      );
    } catch {
      setEligibleInvoices([]);
    } finally {
      setLoadingInvoices(false);
    }
  }, [supabase, entityId]);

  const openDialog = () => {
    setStep(1);
    setFactorName("");
    setLotReference("");
    setAdvanceRate("90");
    setNotes("");
    setSelectedIds(new Set());
    setDialogOpen(true);
  };

  const goToStep2 = () => {
    if (!factorName.trim()) {
      toast({ title: "Le nom du factor est requis", variant: "destructive" });
      return;
    }
    fetchEligibleInvoices();
    setStep(2);
  };

  const toggleInvoice = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedTotal = eligibleInvoices
    .filter((inv) => selectedIds.has(inv.id))
    .reduce((sum, inv) => sum + inv.amount, 0);
  const rate = parseFloat(advanceRate) || 90;
  const selectedAdvance = Math.round(selectedTotal * (rate / 100) * 100) / 100;

  const handleCreate = async () => {
    if (selectedIds.size === 0) {
      toast({ title: "Sélectionnez au moins une facture", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/affacturage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factor_name: factorName.trim(),
          lot_reference: lotReference.trim() || undefined,
          advance_rate: rate,
          notes: notes || undefined,
          invoice_ids: Array.from(selectedIds),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Lot créé", description: data.lot.lot_reference });
        setDialogOpen(false);
        fetchLots();
      } else {
        toast({ title: "Erreur", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (lotId: string, status: string) => {
    try {
      const res = await fetch(`/api/affacturage/${lotId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        toast({ title: status === "paid" ? "Lot marqué payé" : "Lot clôturé" });
        fetchLots();
      } else {
        const data = await res.json();
        toast({ title: "Erreur", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    }
  };

  // Stats
  const totalCeded = lots.reduce((sum, l) => sum + Number(l.total_amount), 0);
  const totalAdvanced = lots.reduce((sum, l) => sum + Number(l.advance_amount), 0);
  const lotsEnCours = lots.filter((l) => l.status === "pending" || l.status === "sent").length;
  const lotsClotures = lots.filter((l) => l.status === "paid" || l.status === "closed").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Affacturage</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cession de créances à un organisme financier
          </p>
        </div>
        <Button
          onClick={openDialog}
          style={{ background: "#DC2626" }}
          className="text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4 mr-2" /> Créer un lot
        </Button>
      </div>

      {/* Stats */}
      <div className="mb-6 space-y-1 text-sm text-gray-700">
        <p>Total cédé : <strong>{formatCurrency(totalCeded)}</strong></p>
        <p>Montant avancé : <strong className="text-green-600">{formatCurrency(totalAdvanced)}</strong></p>
        <p>Lots en cours : <strong className="text-blue-600">{lotsEnCours}</strong></p>
        <p>Lots clôturés : <strong className="text-purple-600">{lotsClotures}</strong></p>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Référence</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Factor</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">Factures</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Total</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Avance</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Statut</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Date</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {lots.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center text-gray-400">
                  Aucun lot d&apos;affacturage
                </td>
              </tr>
            ) : (
              lots.map((lot) => {
                const badge = LOT_STATUS_COLORS[lot.status] ?? LOT_STATUS_COLORS.pending;
                return (
                  <tr key={lot.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{lot.lot_reference}</td>
                    <td className="px-4 py-3 text-gray-700">{lot.factor_name}</td>
                    <td className="px-4 py-3 text-center">{lot.invoice_count}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(lot.total_amount)}</td>
                    <td className="px-4 py-3 text-right font-medium text-green-600">
                      {formatCurrency(lot.advance_amount)}
                      <span className="text-xs text-muted-foreground ml-1">({lot.advance_rate}%)</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`${badge} hover:${badge} text-xs`}>
                        {LOT_STATUS_LABELS[lot.status] || lot.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {new Date(lot.created_at).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {(lot.status === "pending" || lot.status === "sent") && (
                          <button
                            onClick={() => handleUpdateStatus(lot.id, "paid")}
                            className="text-green-600 hover:text-green-800 text-xs font-medium flex items-center gap-1"
                          >
                            <CheckCircle className="h-3 w-3" /> Payé
                          </button>
                        )}
                        {lot.status === "paid" && (
                          <button
                            onClick={() => handleUpdateStatus(lot.id, "closed")}
                            className="text-purple-600 hover:text-purple-800 text-xs font-medium flex items-center gap-1"
                          >
                            <Lock className="h-3 w-3" /> Clôturer
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Dialog — Créer un lot */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {step === 1 ? "Créer un lot d'affacturage" : "Sélectionner les factures"}
            </DialogTitle>
          </DialogHeader>

          {step === 1 ? (
            <>
              <div className="space-y-4">
                <div>
                  <Label>Nom du factor *</Label>
                  <Input
                    value={factorName}
                    onChange={(e) => setFactorName(e.target.value)}
                    placeholder="Ex: BPI France, Crédit Agricole..."
                  />
                </div>
                <div>
                  <Label>Référence du lot</Label>
                  <Input
                    value={lotReference}
                    onChange={(e) => setLotReference(e.target.value)}
                    placeholder="Auto-généré si vide"
                  />
                </div>
                <div>
                  <Label>Taux d&apos;avance (%)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    step={0.5}
                    value={advanceRate}
                    onChange={(e) => setAdvanceRate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Notes optionnelles..."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
                <Button onClick={goToStep2}>Suivant</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              {loadingInvoices ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : eligibleInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Aucune facture éligible (non payée, non cédée, hors avoirs)
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {eligibleInvoices.map((inv) => (
                      <label
                        key={inv.id}
                        className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg cursor-pointer hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={selectedIds.has(inv.id)}
                          onCheckedChange={() => toggleInvoice(inv.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold">{inv.reference}</span>
                            <span className="text-xs text-muted-foreground truncate">{inv.session_title}</span>
                          </div>
                          <span className="text-xs text-gray-600">{inv.recipient_name}</span>
                        </div>
                        <span className="text-sm font-medium">{formatCurrency(inv.amount)}</span>
                      </label>
                    ))}
                  </div>
                  <div className="border-t pt-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {selectedIds.size} facture{selectedIds.size !== 1 ? "s" : ""} sélectionnée{selectedIds.size !== 1 ? "s" : ""}
                      </span>
                      <span className="font-semibold">{formatCurrency(selectedTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Avance ({rate}%)</span>
                      <span className="font-semibold text-green-600">{formatCurrency(selectedAdvance)}</span>
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setStep(1)}>Retour</Button>
                <Button onClick={handleCreate} disabled={saving || selectedIds.size === 0}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Créer le lot
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
