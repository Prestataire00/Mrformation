"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Landmark, Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/utils";
import type { Session, FormationFinancier } from "@/lib/types";

const FINANCIER_TYPES: Record<string, string> = {
  opco: "OPCO",
  pole_emploi: "Pôle Emploi",
  cpf: "CPF",
  entreprise: "Entreprise",
  region: "Région",
  autre: "Autre",
};

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

export function ResumeFinanciers({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const financiers = formation.formation_financiers || [];

  const handleAdd = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("formation_financiers").insert({
      session_id: formation.id,
      name: name.trim(),
      type: type || null,
      amount: amount ? parseFloat(amount) : null,
      reference: reference || null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Financeur ajouté" });
      setDialogOpen(false);
      setName("");
      setType("");
      setAmount("");
      setReference("");
      onRefresh();
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("formation_financiers").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Erreur", variant: "destructive" });
    } else {
      toast({ title: "Financeur retiré" });
      setDeleteId(null);
      onRefresh();
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Landmark className="h-4 w-4" /> Financeurs ({financiers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {financiers.map((f) => (
              <div key={f.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-sm">{f.name}</span>
                  {f.type && (
                    <Badge variant="outline" className="text-xs">
                      {FINANCIER_TYPES[f.type] || f.type}
                    </Badge>
                  )}
                  {f.amount != null && (
                    <span className="text-sm text-muted-foreground">
                      {formatCurrency(f.amount)}
                    </span>
                  )}
                  {f.reference && (
                    <span className="text-xs text-muted-foreground">Réf: {f.reference}</span>
                  )}
                </div>
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDeleteId(f.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {financiers.length === 0 && (
              <p className="text-sm text-muted-foreground">Aucun financeur</p>
            )}
          </div>
          <div className="mt-4">
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Ajouter un Financeur
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un Financeur</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nom *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du financeur" />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue placeholder="Type de financeur" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FINANCIER_TYPES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Montant (EUR)</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Référence</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Référence dossier" />
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

      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Retirer ce financeur ?</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete}>Retirer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
