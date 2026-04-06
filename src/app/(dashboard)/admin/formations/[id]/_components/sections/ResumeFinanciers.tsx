"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Trash2, Loader2, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";
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
import type { Session, FormationFinancier, Financeur, OpcoStatus } from "@/lib/types";

const FINANCIER_TYPES: Record<string, string> = {
  opco: "OPCO",
  pole_emploi: "Pôle Emploi",
  cpf: "CPF",
  entreprise: "Entreprise",
  region: "Région",
  autre: "Autre",
};

const STATUS_CONFIG: Record<OpcoStatus, { label: string; color: string; icon: typeof CheckCircle }> = {
  a_deposer: { label: "À déposer", color: "bg-gray-100 text-gray-700", icon: Clock },
  deposee: { label: "Déposée", color: "bg-blue-100 text-blue-700", icon: Clock },
  en_cours: { label: "En cours", color: "bg-amber-100 text-amber-700", icon: Loader2 },
  acceptee: { label: "Acceptée", color: "bg-green-100 text-green-700", icon: CheckCircle },
  refusee: { label: "Refusée", color: "bg-red-100 text-red-700", icon: XCircle },
  partielle: { label: "Partielle", color: "bg-orange-100 text-orange-700", icon: AlertTriangle },
};

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

export function ResumeFinanciers({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [accordDialog, setAccordDialog] = useState<FormationFinancier | null>(null);
  const [refusDialog, setRefusDialog] = useState<FormationFinancier | null>(null);

  // Add form state
  const [selectedFinanceurId, setSelectedFinanceurId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Accord dialog state
  const [accordAmount, setAccordAmount] = useState("");
  const [accordNumber, setAccordNumber] = useState("");
  const [accordPartial, setAccordPartial] = useState(false);

  // Refus dialog state
  const [refusReason, setRefusReason] = useState("");

  // Master financeurs list
  const [allFinanceurs, setAllFinanceurs] = useState<Financeur[]>([]);

  const financiers = formation.formation_financiers || [];

  useEffect(() => {
    const fetchFinanceurs = async () => {
      const { data } = await supabase
        .from("financeurs")
        .select("*")
        .eq("entity_id", formation.entity_id)
        .order("name");
      if (data) setAllFinanceurs(data as Financeur[]);
    };
    fetchFinanceurs();
  }, [formation.entity_id, supabase]);

  // When selecting an existing financeur, pre-fill fields
  const handleFinanceurSelect = (financeurId: string) => {
    setSelectedFinanceurId(financeurId);
    if (financeurId === "_new") {
      setName("");
      setType("");
      return;
    }
    const f = allFinanceurs.find((x) => x.id === financeurId);
    if (f) {
      setName(f.name);
      setType(f.type || "opco");
    }
  };

  const handleAdd = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const amountVal = amount ? parseFloat(amount) : null;
    const { error } = await supabase.from("formation_financiers").insert({
      session_id: formation.id,
      financeur_id: selectedFinanceurId && selectedFinanceurId !== "_new" ? selectedFinanceurId : null,
      name: name.trim(),
      type: type || null,
      amount: amountVal,
      amount_requested: amountVal,
      reference: reference || null,
      status: "a_deposer",
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Financeur ajouté" });
      setDialogOpen(false);
      setName(""); setType(""); setAmount(""); setReference(""); setSelectedFinanceurId("");
      onRefresh();
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("formation_financiers").delete().eq("id", deleteId).eq("session_id", formation.id);
      if (error) throw error;
      toast({ title: "Financeur retiré" });
      setDeleteId(null);
      await onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible de retirer";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  // ── Status actions ──

  const updateStatus = async (id: string, status: OpcoStatus, extra: Record<string, unknown> = {}) => {
    setSaving(true);
    const { error } = await supabase
      .from("formation_financiers")
      .update({ status, updated_at: new Date().toISOString(), ...extra })
      .eq("id", id);
    setSaving(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Statut mis à jour : ${STATUS_CONFIG[status].label}` });
      await onRefresh();
    }
  };

  const handleMarkDeposee = (f: FormationFinancier) =>
    updateStatus(f.id, "deposee", { deposit_date: new Date().toISOString().split("T")[0] });

  const handleMarkEnCours = (f: FormationFinancier) =>
    updateStatus(f.id, "en_cours");

  const handleAccordSubmit = async () => {
    if (!accordDialog) return;
    const granted = parseFloat(accordAmount) || 0;
    const status: OpcoStatus = accordPartial ? "partielle" : "acceptee";
    await updateStatus(accordDialog.id, status, {
      amount_granted: granted,
      amount: granted, // Update the main amount for facturation
      accord_number: accordNumber || null,
      response_date: new Date().toISOString().split("T")[0],
    });
    setAccordDialog(null);
    setAccordAmount(""); setAccordNumber(""); setAccordPartial(false);
  };

  const handleRefusSubmit = async () => {
    if (!refusDialog) return;
    await updateStatus(refusDialog.id, "refusee", {
      rejection_reason: refusReason || null,
      response_date: new Date().toISOString().split("T")[0],
      amount_granted: 0,
    });
    setRefusDialog(null);
    setRefusReason("");
  };

  return (
    <>
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Financeurs ({financiers.length})</h3>
        <div className="space-y-3">
          {financiers.map((f) => {
            const statusConf = STATUS_CONFIG[f.status || "a_deposer"];
            const StatusIcon = statusConf.icon;
            const showPartialWarning = f.status === "partielle" && f.amount_requested && f.amount_granted && f.amount_granted < f.amount_requested;

            return (
              <div key={f.id} className="p-3 bg-muted/50 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{f.name}</span>
                    {f.type && (
                      <Badge variant="outline" className="text-xs">
                        {FINANCIER_TYPES[f.type] || f.type}
                      </Badge>
                    )}
                    <Badge className={`text-xs ${statusConf.color}`}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {statusConf.label}
                    </Badge>
                  </div>
                  <Button size="sm" variant="ghost" className="text-red-600 h-7" onClick={() => setDeleteId(f.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Financial details */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  {f.amount_requested != null && <span>Demandé : <strong>{formatCurrency(f.amount_requested)}</strong></span>}
                  {f.amount_granted != null && <span>Accordé : <strong className={f.status === "partielle" ? "text-orange-600" : "text-green-600"}>{formatCurrency(f.amount_granted)}</strong></span>}
                  {f.amount != null && !f.amount_requested && <span>Montant : <strong>{formatCurrency(f.amount)}</strong></span>}
                  {f.accord_number && <span>N° accord : <strong>{f.accord_number}</strong></span>}
                  {f.reference && <span>Réf : {f.reference}</span>}
                  {f.deposit_date && <span>Dépôt : {new Date(f.deposit_date).toLocaleDateString("fr-FR")}</span>}
                  {f.response_date && <span>Réponse : {new Date(f.response_date).toLocaleDateString("fr-FR")}</span>}
                </div>

                {/* Partial warning */}
                {showPartialWarning && (
                  <div className="flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 rounded px-2 py-1">
                    <AlertTriangle className="h-3 w-3" />
                    Prise en charge partielle — solde de {formatCurrency(f.amount_requested! - f.amount_granted!)} à facturer à l&apos;entreprise
                  </div>
                )}

                {/* Rejection reason */}
                {f.status === "refusee" && f.rejection_reason && (
                  <p className="text-xs text-red-600">Motif : {f.rejection_reason}</p>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {f.status === "a_deposer" && (
                    <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={() => handleMarkDeposee(f)} disabled={saving}>
                      Marquer déposée
                    </Button>
                  )}
                  {f.status === "deposee" && (
                    <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={() => handleMarkEnCours(f)} disabled={saving}>
                      En cours de traitement
                    </Button>
                  )}
                  {(f.status === "deposee" || f.status === "en_cours") && (
                    <>
                      <Button size="sm" variant="outline" className="h-6 text-xs gap-1 text-green-600" onClick={() => {
                        setAccordAmount(String(f.amount_requested || f.amount || ""));
                        setAccordNumber("");
                        setAccordPartial(false);
                        setAccordDialog(f);
                      }}>
                        <CheckCircle className="h-3 w-3" /> Accord reçu
                      </Button>
                      <Button size="sm" variant="outline" className="h-6 text-xs gap-1 text-red-600" onClick={() => {
                        setRefusReason("");
                        setRefusDialog(f);
                      }}>
                        <XCircle className="h-3 w-3" /> Refusée
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {financiers.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucun financeur</p>
          )}
        </div>
        <div>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Ajouter un Financeur
          </Button>
        </div>
      </div>

      {/* ═══ ADD DIALOG ═══ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un Financeur</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Sélectionner un financeur existant</Label>
              <Select value={selectedFinanceurId} onValueChange={handleFinanceurSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir ou créer..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_new">+ Nouveau financeur</SelectItem>
                  {allFinanceurs.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name} ({f.type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nom *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du financeur" />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FINANCIER_TYPES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Montant demandé (EUR)</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Référence dossier</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Référence" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleAdd} disabled={saving || !name.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ ACCORD DIALOG ═══ */}
      <Dialog open={!!accordDialog} onOpenChange={(o) => !o && setAccordDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Accord reçu — {accordDialog?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Montant accordé (EUR) *</Label>
              <Input type="number" step="0.01" value={accordAmount} onChange={(e) => {
                setAccordAmount(e.target.value);
                const granted = parseFloat(e.target.value) || 0;
                const requested = accordDialog?.amount_requested || accordDialog?.amount || 0;
                setAccordPartial(granted > 0 && granted < requested);
              }} />
              {accordPartial && (
                <p className="text-xs text-orange-600 mt-1">Prise en charge partielle détectée</p>
              )}
            </div>
            <div>
              <Label>N° d&apos;accord</Label>
              <Input value={accordNumber} onChange={(e) => setAccordNumber(e.target.value)} placeholder="Numéro d'accord OPCO" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccordDialog(null)}>Annuler</Button>
            <Button onClick={handleAccordSubmit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {accordPartial ? "Accord partiel" : "Accord total"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ REFUS DIALOG ═══ */}
      <Dialog open={!!refusDialog} onOpenChange={(o) => !o && setRefusDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Refus — {refusDialog?.name}</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Motif du refus</Label>
            <Input value={refusReason} onChange={(e) => setRefusReason(e.target.value)} placeholder="Raison du refus (optionnel)" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefusDialog(null)}>Annuler</Button>
            <Button variant="destructive" onClick={handleRefusSubmit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmer le refus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ DELETE DIALOG ═══ */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Retirer ce financeur ?</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Retirer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
