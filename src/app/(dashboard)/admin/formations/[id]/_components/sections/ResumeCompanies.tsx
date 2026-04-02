"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/utils";
import type { Session, Client, FormationCompany } from "@/lib/types";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

export function ResumeCompanies({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [amount, setAmount] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const companies = formation.formation_companies || [];

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("clients")
        .select("*")
        .eq("entity_id", formation.entity_id)
        .order("company_name");
      if (data) setAllClients(data);
    };
    fetch();
  }, [formation.entity_id, supabase]);

  const handleAdd = async () => {
    if (!selectedClientId) return;
    setSaving(true);
    const { error } = await supabase.from("formation_companies").insert({
      session_id: formation.id,
      client_id: selectedClientId,
      amount: amount ? parseFloat(amount) : null,
      email: email || null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Entreprise ajoutée" });
      setDialogOpen(false);
      setSelectedClientId("");
      setAmount("");
      setEmail("");
      onRefresh();
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("formation_companies").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Erreur", variant: "destructive" });
    } else {
      toast({ title: "Entreprise retirée" });
      setDeleteId(null);
      onRefresh();
    }
  };

  const assignedClientIds = companies.map((c) => c.client_id);
  const availableClients = allClients.filter((c) => !assignedClientIds.includes(c.id));

  return (
    <>
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Entreprises ({companies.length})</h3>
        <div className="space-y-3">
          {companies.map((fc) => {
            // Trouver les apprenants liés à cette entreprise
            const companyLearners = (formation.enrollments || []).filter(
              (e) => e.client_id === fc.client_id
            );
            return (
              <div key={fc.id} className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{fc.client?.company_name}</span>
                    {fc.amount != null && (
                      <span className="text-sm text-muted-foreground">
                        {formatCurrency(fc.amount)}
                      </span>
                    )}
                    {fc.email && (
                      <span className="text-sm text-muted-foreground">{fc.email}</span>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDeleteId(fc.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {companyLearners.length > 0 && (
                  <div className="ml-4 space-y-1">
                    {companyLearners.map((e) => (
                      <p key={e.id} className="text-sm text-muted-foreground">
                        {e.learner?.last_name?.toUpperCase()} {e.learner?.first_name}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {companies.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucune entreprise liée</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Ajouter une Entreprise
          </Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter une Entreprise</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Entreprise</Label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une entreprise" />
                </SelectTrigger>
                <SelectContent>
                  {availableClients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Montant (EUR)</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Email de contact</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@entreprise.fr" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleAdd} disabled={saving || !selectedClientId}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Retirer cette entreprise ?</DialogTitle>
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
