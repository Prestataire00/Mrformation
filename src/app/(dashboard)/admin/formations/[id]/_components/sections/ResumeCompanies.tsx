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
import { SearchSelect } from "@/components/ui/search-select";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/utils";
import type { Session, Client, FormationCompany } from "@/lib/types";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

interface ClientWithContacts extends Omit<Client, "contacts"> {
  automation_contact?: { id: string; email: string; first_name: string; last_name: string } | null;
  contacts?: Array<{ id: string; email: string | null; first_name: string; last_name: string; is_primary: boolean }>;
}

export function ResumeCompanies({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [allClients, setAllClients] = useState<ClientWithContacts[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [amount, setAmount] = useState("");
  const [email, setEmail] = useState("");
  const [linkedLearners, setLinkedLearners] = useState<Array<{ id: string; first_name: string; last_name: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const companies = formation.formation_companies || [];

  useEffect(() => {
    const fetchClients = async () => {
      const { data } = await supabase
        .from("clients")
        .select(`
          *,
          contacts(id, email, first_name, last_name, is_primary)
        `)
        .eq("entity_id", formation.entity_id)
        .order("company_name");
      if (data) setAllClients(data as ClientWithContacts[]);
    };
    fetchClients();
  }, [formation.entity_id, supabase]);

  // ── Auto-fill amount + email on client selection ──
  const handleClientSelect = async (clientId: string) => {
    setSelectedClientId(clientId);

    const client = allClients.find((c) => c.id === clientId);
    if (!client) return;

    // 1. Compute suggested amount
    const enrollments = formation.enrollments || [];
    const clientLearners = enrollments.filter((e) => e.client_id === clientId);
    const totalLearners = enrollments.length || 1;
    const totalPrice = formation.total_price || 0;

    let suggestedAmount = 0;

    if (clientLearners.length > 0) {
      // Sum individual prices if defined
      const individualSum = clientLearners.reduce((sum, e) => {
        const ip = (e as unknown as { individual_price?: number }).individual_price;
        return sum + (ip || 0);
      }, 0);

      if (individualSum > 0) {
        suggestedAmount = individualSum;
      } else {
        const pricePerLearner = totalPrice / totalLearners;
        suggestedAmount = pricePerLearner * clientLearners.length;
      }
    } else {
      const expectedCompanies = Math.max(1, companies.length + 1);
      suggestedAmount = totalPrice / expectedCompanies;
    }

    setAmount(suggestedAmount > 0 ? suggestedAmount.toFixed(2) : "");

    // 2. Pre-fill email
    let suggestedEmail = "";

    // Priority 1: automation contact
    if (client.automation_contact?.email) {
      suggestedEmail = client.automation_contact.email;
    }
    // Priority 2: primary contact
    else if (client.contacts?.length) {
      const primary = client.contacts.find((c) => c.is_primary);
      if (primary?.email) {
        suggestedEmail = primary.email;
      } else {
        const withEmail = client.contacts.find((c) => c.email);
        if (withEmail?.email) suggestedEmail = withEmail.email;
      }
    }
    // Priority 3: client email field
    if (!suggestedEmail && (client as unknown as { email?: string }).email) {
      suggestedEmail = (client as unknown as { email: string }).email;
    }

    setEmail(suggestedEmail);

    // Fetch learners linked to this company
    const existingLearnerIds = new Set(
      (formation.enrollments || []).map((e) => e.learner_id)
    );
    const { data: learners } = await supabase
      .from("learners")
      .select("id, first_name, last_name")
      .eq("client_id", clientId)
      .eq("entity_id", formation.entity_id);
    setLinkedLearners(
      (learners || []).filter((l) => !existingLearnerIds.has(l.id))
    );
  };

  const handleAdd = async () => {
    if (!selectedClientId) return;
    setSaving(true);
    const { error } = await supabase.from("formation_companies").insert({
      session_id: formation.id,
      client_id: selectedClientId,
      amount: amount ? parseFloat(amount) : null,
      email: email || null,
    });

    if (error) {
      setSaving(false);
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    // Auto-inscrire les apprenants rattachés à cette entreprise
    const existingLearnerIds = new Set(
      (formation.enrollments || []).map((e) => e.learner_id)
    );

    const { data: companyLearners } = await supabase
      .from("learners")
      .select("id, first_name, last_name")
      .eq("client_id", selectedClientId)
      .eq("entity_id", formation.entity_id);

    const toEnroll = (companyLearners || []).filter(
      (l) => !existingLearnerIds.has(l.id)
    );

    if (toEnroll.length > 0) {
      const { error: enrollError } = await supabase.from("enrollments").insert(
        toEnroll.map((l) => ({
          session_id: formation.id,
          learner_id: l.id,
          client_id: selectedClientId,
          status: "registered",
        }))
      );

      if (enrollError) {
        // Non-bloquant : l'entreprise est ajoutée même si l'inscription échoue
        toast({ title: "Entreprise ajoutée", description: `Attention : ${enrollError.message}`, variant: "destructive" });
      } else {
        const names = toEnroll.map((l) => `${l.first_name} ${l.last_name}`).join(", ");
        toast({
          title: "Entreprise ajoutée",
          description: `${toEnroll.length} apprenant(s) inscrit(s) automatiquement : ${names}`,
        });
      }
    } else {
      toast({ title: "Entreprise ajoutée" });
    }

    setSaving(false);
    setDialogOpen(false);
    setSelectedClientId("");
    setAmount("");
    setEmail("");
    setLinkedLearners([]);
    onRefresh();
  };

  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("formation_companies").delete().eq("id", deleteId).eq("session_id", formation.id);
      if (error) throw error;
      toast({ title: "Entreprise retirée" });
      setDeleteId(null);
      await onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible de retirer l'entreprise";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setDeleting(false);
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
              <SearchSelect
                options={availableClients.map((c) => ({
                  value: c.id,
                  label: c.company_name,
                  sublabel: c.siret || "",
                }))}
                onSelect={handleClientSelect}
                placeholder="Rechercher une entreprise..."
              />
              {selectedClientId && (
                <p className="text-xs text-green-700 bg-green-50 rounded px-2 py-1 mt-1">
                  {allClients.find((c) => c.id === selectedClientId)?.company_name}
                </p>
              )}
            </div>
            <div>
              <Label>Montant (EUR)</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              {selectedClientId && amount && (
                <p className="text-[11px] text-muted-foreground mt-1">Montant suggéré automatiquement — modifiable</p>
              )}
            </div>
            <div>
              <Label>Email de contact</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@entreprise.fr" />
              {selectedClientId && email && (
                <p className="text-[11px] text-muted-foreground mt-1">Email récupéré depuis la fiche entreprise</p>
              )}
            </div>
            {selectedClientId && linkedLearners.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-blue-800 mb-1">
                  {linkedLearners.length} apprenant(s) seront inscrits automatiquement :
                </p>
                <ul className="text-xs text-blue-700 space-y-0.5">
                  {linkedLearners.map((l) => (
                    <li key={l.id}>• {l.last_name?.toUpperCase()} {l.first_name}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleAdd} disabled={saving || !selectedClientId}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Ajouter{linkedLearners.length > 0 ? ` + ${linkedLearners.length} apprenant(s)` : ""}
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
