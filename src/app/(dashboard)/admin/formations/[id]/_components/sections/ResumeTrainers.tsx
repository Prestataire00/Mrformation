"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { getInitials } from "@/lib/utils";
import type { Session, Trainer, FormationTrainer } from "@/lib/types";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

export function ResumeTrainers({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [allTrainers, setAllTrainers] = useState<Trainer[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTrainerId, setSelectedTrainerId] = useState("");
  const [selectedRole, setSelectedRole] = useState("formateur");
  const [selectedHourlyRate, setSelectedHourlyRate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const formationTrainers = formation.formation_trainers || [];

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("trainers")
        .select("*")
        .eq("entity_id", formation.entity_id)
        .order("last_name");
      if (data) setAllTrainers(data);
    };
    fetch();
  }, [formation.entity_id, supabase]);

  const handleAdd = async () => {
    if (!selectedTrainerId) return;
    setSaving(true);
    const { error } = await supabase.from("formation_trainers").insert({
      session_id: formation.id,
      trainer_id: selectedTrainerId,
      role: selectedRole,
      hourly_rate: parseFloat(selectedHourlyRate) || null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Formateur ajouté" });
      setDialogOpen(false);
      setSelectedTrainerId("");
      setSelectedHourlyRate("");
      onRefresh();
    }
  };

  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("formation_trainers").delete().eq("id", deleteId).eq("session_id", formation.id);
      if (error) throw error;
      toast({ title: "Formateur retiré" });
      setDeleteId(null);
      await onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible de retirer le formateur";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  // Filtrer les formateurs déjà assignés
  const assignedIds = formationTrainers.map((ft) => ft.trainer_id);
  const availableTrainers = allTrainers.filter((t) => !assignedIds.includes(t.id));

  return (
    <>
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Formateurs ({formationTrainers.length})</h3>
        <div className="space-y-3">
          {formationTrainers.map((ft) => (
            <div key={ft.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">
                    {getInitials(ft.trainer?.first_name, ft.trainer?.last_name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-sm">
                    {ft.trainer?.last_name?.toUpperCase()} {ft.trainer?.first_name}
                  </p>
                  {ft.trainer?.email && (
                    <p className="text-xs text-muted-foreground">{ft.trainer.email}</p>
                  )}
                </div>
                <Badge variant="outline" className="text-xs">{ft.role}</Badge>
                {ft.hourly_rate != null && (
                  <span className="text-xs text-muted-foreground">{ft.hourly_rate} €/h</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => setDeleteId(ft.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {formationTrainers.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucun formateur assigné</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Ajouter un Formateur
          </Button>
        </div>
      </div>

      {/* Add Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setSelectedTrainerId("");
            setSelectedHourlyRate("");
          }
        }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un Formateur</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Select value={selectedTrainerId} onValueChange={(id) => {
                  setSelectedTrainerId(id);
                  const trainer = allTrainers.find((t) => t.id === id);
                  if (trainer?.hourly_rate != null) {
                    setSelectedHourlyRate(String(trainer.hourly_rate));
                  } else {
                    setSelectedHourlyRate("");
                  }
                }}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un formateur" />
                </SelectTrigger>
                <SelectContent>
                  {availableTrainers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.last_name?.toUpperCase()} {t.first_name} — {t.email || ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="formateur">Formateur</SelectItem>
                  <SelectItem value="co-formateur">Co-formateur</SelectItem>
                  <SelectItem value="intervenant">Intervenant</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Taux horaire (€/h)</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Ex : 50"
                value={selectedHourlyRate}
                onChange={(e) => setSelectedHourlyRate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleAdd} disabled={saving || !selectedTrainerId}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Retirer ce formateur ?</DialogTitle>
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
