"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Trash2, Download, Loader2, UserPlus, Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { SearchSelect } from "@/components/ui/search-select";
import { useToast } from "@/components/ui/use-toast";
import { getInitials } from "@/lib/utils";
import type { Session, Learner } from "@/lib/types";

const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  registered: "Inscrit",
  confirmed: "Confirmé",
  cancelled: "Annulé",
  completed: "Terminé",
};

const ENROLLMENT_STATUS_COLORS: Record<string, string> = {
  registered: "bg-blue-100 text-blue-800",
  confirmed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  completed: "bg-emerald-100 text-emerald-800",
};

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

export function ResumeLearners({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [allLearners, setAllLearners] = useState<Learner[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedLearnerId, setSelectedLearnerId] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Company selection for INTER
  const [selectedClientId, setSelectedClientId] = useState("");
  const [newLearnerClientId, setNewLearnerClientId] = useState("");
  const companies = formation.formation_companies || [];
  const showCompanySelect = companies.length >= 1;

  // Create learner form
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [creatingLearner, setCreatingLearner] = useState(false);
  const [sendingAccessAll, setSendingAccessAll] = useState(false);

  const enrollments = formation.enrollments || [];

  const fetchLearners = async () => {
    const { data } = await supabase
      .from("learners")
      .select("*")
      .eq("entity_id", formation.entity_id)
      .order("last_name");
    if (data) setAllLearners(data);
  };

  useEffect(() => {
    fetchLearners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formation.entity_id]);

  const handleAdd = async () => {
    if (!selectedLearnerId) return;
    setSaving(true);
    // Link to company: manual selection (INTER multi) or auto (INTRA single)
    const fcs = formation.formation_companies || [];
    const clientId = selectedClientId
      || (fcs.length === 1 ? fcs[0].client_id : null);

    const { error } = await supabase.from("enrollments").insert({
      session_id: formation.id,
      learner_id: selectedLearnerId,
      client_id: clientId,
      status: "registered",
    });
    setSaving(false);
    if (error) {
      if (error.code === "23505") {
        toast({ title: "Cet apprenant est déjà inscrit", variant: "destructive" });
      } else {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
      }
    } else {
      toast({ title: "Apprenant ajouté" });
      setDialogOpen(false);
      setSelectedLearnerId("");
      setSelectedClientId("");
      onRefresh();
    }
  };

  const handleCreateLearner = async () => {
    if (!newFirstName.trim() || !newLastName.trim()) return;
    setCreatingLearner(true);
    try {
      const { data, error } = await supabase
        .from("learners")
        .insert({
          first_name: newFirstName.trim(),
          last_name: newLastName.trim(),
          email: newEmail.trim() || null,
          entity_id: formation.entity_id,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Auto-enroll the new learner — link to selected company or auto for single company
      const fcs = formation.formation_companies || [];
      const clientId = newLearnerClientId || (fcs.length === 1 ? fcs[0].client_id : null);
      await supabase.from("enrollments").insert({
        session_id: formation.id,
        learner_id: data.id,
        client_id: clientId,
        status: "registered",
      });

      toast({ title: "Apprenant créé et inscrit" });
      setCreateDialogOpen(false);
      setNewFirstName("");
      setNewLastName("");
      setNewEmail("");
      setNewLearnerClientId("");
      fetchLearners();
      onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setCreatingLearner(false);
    }
  };

  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("enrollments").delete().eq("id", deleteId).eq("session_id", formation.id);
      if (error) throw error;
      toast({ title: "Apprenant retiré" });
      setDeleteId(null);
      await onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible de retirer l'apprenant";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleExportExcel = () => {
    const headers = ["Nom", "Prénom", "Email", "Téléphone", "Statut"];
    const rows = enrollments.map((e) => [
      e.learner?.last_name || "",
      e.learner?.first_name || "",
      e.learner?.email || "",
      e.learner?.phone || "",
      ENROLLMENT_STATUS_LABELS[e.status] || e.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `apprenants-${formation.title}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtrer les apprenants déjà inscrits
  const enrolledIds = enrollments.map((e) => e.learner_id).filter(Boolean);
  const availableLearners = allLearners.filter((l) => !enrolledIds.includes(l.id));

  const learnerOptions = availableLearners.map((l) => ({
    value: l.id,
    label: `${l.last_name?.toUpperCase()} ${l.first_name}`,
    sublabel: l.email || "",
  }));

  const selectedLearner = allLearners.find((l) => l.id === selectedLearnerId);

  return (
    <>
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Apprenants & Particuliers ({enrollments.length})</h3>
        <div className="space-y-3">
          {enrollments.map((e) => (
            <div key={e.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">
                    {getInitials(e.learner?.first_name, e.learner?.last_name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-sm">
                    {e.learner?.last_name?.toUpperCase()} {e.learner?.first_name}
                  </p>
                  {e.learner?.email && (
                    <p className="text-xs text-muted-foreground">{e.learner.email}</p>
                  )}
                </div>
                {e.client && (
                  <Badge variant="outline" className="text-xs">{e.client.company_name}</Badge>
                )}
                <Badge className={ENROLLMENT_STATUS_COLORS[e.status] || "bg-gray-100"}>
                  {ENROLLMENT_STATUS_LABELS[e.status] || e.status}
                </Badge>
                {(e as unknown as { individual_price?: number }).individual_price != null && (
                  <Badge variant="secondary" className="text-[10px]">
                    {((e as unknown as { individual_price: number }).individual_price).toLocaleString("fr-FR")} €
                  </Badge>
                )}
                {(e as unknown as { individual_hours?: number }).individual_hours != null && (
                  <Badge variant="outline" className="text-[10px]">
                    {(e as unknown as { individual_hours: number }).individual_hours}h
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => setDeleteId(e.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {enrollments.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucun apprenant inscrit</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Ajouter un Apprenant
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCreateDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-1" /> Créer un apprenant
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportExcel}>
            <Download className="h-4 w-4 mr-1" /> Exporter (CSV)
          </Button>
          {enrollments.some(e => e.learner?.email) && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              disabled={sendingAccessAll}
              onClick={async () => {
                const withEmail = enrollments.filter(e => e.learner?.email);
                if (withEmail.length === 0) return;
                if (!confirm(`Envoyer l'email d'accès à ${withEmail.length} apprenant(s) ?`)) return;
                setSendingAccessAll(true);
                let sent = 0;
                for (const e of withEmail) {
                  try {
                    const res = await fetch(`/api/learners/${e.learner!.id}/send-welcome`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: formation.id }) });
                    if (res.ok) sent++;
                  } catch { /* skip */ }
                }
                setSendingAccessAll(false);
                toast({ title: `${sent} email(s) envoyé(s)` });
                onRefresh();
              }}
            >
              {sendingAccessAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
              Envoyer l&apos;accès à tous
            </Button>
          )}
        </div>
      </div>

      {/* Add Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un Apprenant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Apprenant</label>
              <SearchSelect
                options={learnerOptions}
                onSelect={setSelectedLearnerId}
                placeholder="Rechercher un apprenant..."
              />
              {selectedLearner && (
                <p className="text-xs text-green-700 bg-green-50 rounded px-2 py-1 mt-1">
                  {selectedLearner.last_name?.toUpperCase()} {selectedLearner.first_name} — {selectedLearner.email || ""}
                </p>
              )}
            </div>
            {showCompanySelect && (
              <div>
                <label className="text-sm font-medium mb-1.5 block">Entreprise de rattachement</label>
                <SearchSelect
                  options={companies.filter(c => c.client).map(c => ({
                    value: c.client_id,
                    label: c.client!.company_name,
                  }))}
                  onSelect={setSelectedClientId}
                  placeholder="Choisir l'entreprise..."
                />
                {selectedClientId ? (
                  <p className="text-xs text-green-700 bg-green-50 rounded px-2 py-0.5 mt-1">
                    {companies.find(c => c.client_id === selectedClientId)?.client?.company_name}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    {companies.length === 1
                      ? `Par défaut : ${companies[0]?.client?.company_name || "entreprise liée"}`
                      : "Sélectionnez l'entreprise de rattachement (INTER)"}
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleAdd} disabled={saving || !selectedLearnerId}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Learner Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) { setNewFirstName(""); setNewLastName(""); setNewEmail(""); setNewLearnerClientId(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Créer un apprenant</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Prénom *</label>
              <Input value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} placeholder="Prénom" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Nom *</label>
              <Input value={newLastName} onChange={(e) => setNewLastName(e.target.value)} placeholder="Nom" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Email</label>
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@exemple.com" />
            </div>
            {showCompanySelect && (
              <div>
                <label className="text-sm font-medium mb-1 block">Entreprise de rattachement</label>
                <SearchSelect
                  options={companies.filter(c => c.client).map(c => ({
                    value: c.client_id,
                    label: c.client!.company_name,
                  }))}
                  onSelect={setNewLearnerClientId}
                  placeholder="Choisir l'entreprise..."
                />
                {newLearnerClientId && (
                  <p className="text-xs text-green-700 bg-green-50 rounded px-2 py-0.5 mt-1">
                    {companies.find(c => c.client_id === newLearnerClientId)?.client?.company_name}
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleCreateLearner} disabled={creatingLearner || !newFirstName.trim() || !newLastName.trim()}>
              {creatingLearner && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Créer et inscrire
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Retirer cet apprenant ?</DialogTitle>
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
