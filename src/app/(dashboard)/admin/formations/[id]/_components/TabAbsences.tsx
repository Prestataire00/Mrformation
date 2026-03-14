"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
    const { error } = await supabase.from("formation_absences").delete().eq("id", id);
    setDeleting(null);
    if (error) {
      toast({ title: "Erreur", variant: "destructive" });
    } else {
      toast({ title: "Absence supprimée" });
      onRefresh();
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{formation.title}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {absences.length} Absence{absences.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-2" /> Ajouter une absence
        </Button>
      </div>

      {/* Liste des absences */}
      {absences.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            Aucune absence enregistrée.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {absences.map((absence) => {
            const learner = (absence as FormationAbsence & { learner?: { id: string; first_name: string; last_name: string } }).learner;
            const slot = timeSlots.find((s) => s.id === absence.time_slot_id);
            return (
              <Card key={absence.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">
                        {learner ? `${learner.first_name} ${learner.last_name}` : "Apprenant inconnu"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(absence.date).toLocaleDateString("fr-FR")}
                        {slot && (
                          <span>
                            {" — "}
                            {new Date(slot.start_time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            {" - "}
                            {new Date(slot.end_time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </p>
                      {absence.reason && (
                        <p className="text-sm text-muted-foreground">Raison : {absence.reason}</p>
                      )}
                      {absence.notes && (
                        <p className="text-xs text-muted-foreground italic">{absence.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={absence.status}
                        onValueChange={(val) => handleUpdateStatus(absence.id, val)}
                      >
                        <SelectTrigger className="w-[140px]">
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
                        className="text-red-500 hover:text-red-700"
                        onClick={() => handleDelete(absence.id)}
                        disabled={deleting === absence.id}
                      >
                        {deleting === absence.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

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
                        {start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        {" - "}
                        {end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
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
