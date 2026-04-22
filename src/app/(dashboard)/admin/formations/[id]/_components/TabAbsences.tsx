"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Trash2, Loader2, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import type { Session, FormationAbsence } from "@/lib/types";

const STATUS_LABELS: Record<string, string> = {
  justified: "Justifiée",
  unjustified: "Non justifiée",
  excused: "Excusée",
};

const STATUS_COLORS: Record<string, string> = {
  justified: "bg-green-100 text-green-700",
  unjustified: "bg-red-100 text-red-700",
  excused: "bg-yellow-100 text-yellow-700",
};

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

export function TabAbsences({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showAutoDetect, setShowAutoDetect] = useState(false);
  const [autoDetecting, setAutoDetecting] = useState(false);

  // Form state
  const [learnerId, setLearnerId] = useState("");
  const [date, setDate] = useState("");
  const [timeSlotId, setTimeSlotId] = useState("");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("unjustified");
  const [notes, setNotes] = useState("");

  const absences = formation.formation_absences || [];
  const enrollments = formation.enrollments || [];
  const timeSlots = formation.formation_time_slots || [];

  const resetForm = () => {
    setLearnerId("");
    setDate("");
    setTimeSlotId("");
    setReason("");
    setStatus("unjustified");
    setNotes("");
  };

  const handleAdd = async () => {
    if (!learnerId || !date) {
      toast({ title: "Sélectionnez un apprenant et une date", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("formation_absences").insert({
      session_id: formation.id,
      learner_id: learnerId,
      date,
      time_slot_id: timeSlotId || null,
      reason: reason || null,
      status,
      notes: notes || null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Absence ajoutée" });
      resetForm();
      setShowAdd(false);
      onRefresh();
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const { error } = await supabase.from("formation_absences").delete().eq("id", id).eq("session_id", formation.id);
      if (error) throw error;
      toast({ title: "Absence supprimée" });
      await onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible de supprimer";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const handleAutoDetect = async () => {
    setAutoDetecting(true);
    try {
      const res = await fetch(`/api/sessions/${formation.id}/auto-absences`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        toast({
          title: "Erreur",
          description: data.error || "Une erreur est survenue",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Détection terminée",
        description: `${data.created} nouvelle${data.created !== 1 ? "s" : ""} absence${data.created !== 1 ? "s" : ""} créée${data.created !== 1 ? "s" : ""}, ${data.skipped} déjà existante${data.skipped !== 1 ? "s" : ""} ignorée${data.skipped !== 1 ? "s" : ""}`,
      });
      onRefresh();
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de contacter le serveur",
        variant: "destructive",
      });
    } finally {
      setAutoDetecting(false);
      setShowAutoDetect(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase
      .from("formation_absences")
      .update({ status: newStatus })
      .eq("id", id);
    if (error) {
      toast({ title: "Erreur", variant: "destructive" });
    } else {
      onRefresh();
    }
  };

  const formatSlotTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

  return (
    <div className="space-y-4">
      {/* Header compact */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Absences ({absences.length})
        </h3>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 gap-1"
            onClick={() => setShowAutoDetect(true)}
            disabled={autoDetecting}
          >
            {autoDetecting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ScanSearch className="h-3 w-3" />
            )}
            Détection auto
          </Button>
          <Button size="sm" className="text-xs h-7 gap-1" onClick={() => setShowAdd(true)}>
            <Plus className="h-3 w-3" /> Ajouter
          </Button>
        </div>
      </div>

      {/* Liste des absences */}
      {absences.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Aucune absence enregistrée.
        </p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          {absences.map((absence, index) => {
            const learner = (absence as FormationAbsence & { learner?: { id: string; first_name: string; last_name: string } }).learner;
            const slot = timeSlots.find((s) => s.id === absence.time_slot_id);
            return (
              <div key={absence.id} className={index > 0 ? "border-t" : ""}>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-medium text-sm whitespace-nowrap">
                      {learner ? `${learner.first_name} ${learner.last_name}` : "Apprenant inconnu"}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(absence.date).toLocaleDateString("fr-FR")}
                      {slot && ` ${formatSlotTime(slot.start_time)} - ${formatSlotTime(slot.end_time)}`}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full whitespace-nowrap ${STATUS_COLORS[absence.status] || "bg-gray-100 text-gray-600"}`}>
                      {STATUS_LABELS[absence.status] || absence.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Select
                      value={absence.status}
                      onValueChange={(val) => handleUpdateStatus(absence.id, val)}
                    >
                      <SelectTrigger className="w-[120px] h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="justified">Justifiée</SelectItem>
                        <SelectItem value="unjustified">Non justifiée</SelectItem>
                        <SelectItem value="excused">Excusée</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-muted-foreground hover:text-red-600"
                      onClick={() => handleDelete(absence.id)}
                      disabled={deleting === absence.id}
                    >
                      {deleting === absence.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
                {/* Reason/notes en 2e ligne si présentes */}
                {(absence.reason || absence.notes) && (
                  <div className="px-4 pb-2 -mt-1 flex gap-4">
                    {absence.reason && (
                      <span className="text-xs text-muted-foreground">Raison : {absence.reason}</span>
                    )}
                    {absence.notes && (
                      <span className="text-xs text-muted-foreground italic">{absence.notes}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog Détection automatique */}
      <Dialog open={showAutoDetect} onOpenChange={setShowAutoDetect}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Détecter les absences automatiquement</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Cette action va scanner <strong>{timeSlots.length} créneau{timeSlots.length !== 1 ? "x" : ""}</strong> pour{" "}
            <strong>{enrollments.length} apprenant{enrollments.length !== 1 ? "s" : ""}</strong> inscrit{enrollments.length !== 1 ? "s" : ""}.
          </p>
          <p className="text-sm text-muted-foreground">
            Tout créneau non signé sera enregistré comme absence non justifiée.
            Les absences déjà existantes ne seront pas dupliquées.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAutoDetect(false)}>
              Annuler
            </Button>
            <Button onClick={handleAutoDetect} disabled={autoDetecting}>
              {autoDetecting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmer la détection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Ajout */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter une absence</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Apprenant *</Label>
              <Select value={learnerId} onValueChange={setLearnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un apprenant" />
                </SelectTrigger>
                <SelectContent>
                  {enrollments.map((e) => {
                    const l = e.learner;
                    if (!l) return null;
                    return (
                      <SelectItem key={l.id} value={l.id}>
                        {l.first_name} {l.last_name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Créneau (optionnel)</Label>
              <Select value={timeSlotId} onValueChange={setTimeSlotId}>
                <SelectTrigger>
                  <SelectValue placeholder="Tous les créneaux" />
                </SelectTrigger>
                <SelectContent>
                  {timeSlots.map((slot, i) => {
                    const start = new Date(slot.start_time);
                    const end = new Date(slot.end_time);
                    return (
                      <SelectItem key={slot.id} value={slot.id}>
                        Créneau {i + 1} — {start.toLocaleDateString("fr-FR")}{" "}
                        {start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}
                        {" - "}
                        {end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Statut</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="justified">Justifiée</SelectItem>
                  <SelectItem value="unjustified">Non justifiée</SelectItem>
                  <SelectItem value="excused">Excusée</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Raison</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Motif de l'absence..."
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Notes complémentaires..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Annuler</Button>
            <Button onClick={handleAdd} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
