"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Trash2, Loader2, Sparkles, Clock, CalendarDays } from "lucide-react";
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
import { SearchSelect } from "@/components/ui/search-select";
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
  const [selectedDailyRate, setSelectedDailyRate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ trainer_id: string; trainer_name: string; score: number; reasons_match: string[]; gaps: string[] }>>([]);

  const formationTrainers = formation.formation_trainers || [];
  const signatures = formation.signatures || [];
  const timeSlots = formation.formation_time_slots || [];

  /** Calcule heures effectuées + dates signées pour un formateur */
  function getTrainerStats(trainerId: string) {
    const signedSlotIds = signatures
      .filter((s) => s.signer_id === trainerId && s.signer_type === "trainer")
      .map((s) => s.time_slot_id);

    const signedSlots = timeSlots.filter((ts) => signedSlotIds.includes(ts.id));

    let totalHours = 0;
    const dates = new Set<string>();

    for (const slot of signedSlots) {
      const start = new Date(slot.start_time);
      const end = new Date(slot.end_time);
      totalHours += (end.getTime() - start.getTime()) / 3600000;
      dates.add(start.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" }));
    }

    return {
      hours: Math.round(totalHours * 10) / 10,
      dates: [...dates].sort(),
      slotCount: signedSlots.length,
    };
  }

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
      daily_rate: parseFloat(selectedDailyRate) || null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Formateur ajouté" });
      setDialogOpen(false);
      setSelectedTrainerId("");
      setSelectedHourlyRate("");
      setSelectedDailyRate("");
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

  const trainerOptions = availableTrainers.map((t) => ({
    value: t.id,
    label: `${t.last_name?.toUpperCase()} ${t.first_name}`,
    sublabel: t.email || "",
  }));

  const handleSelectTrainer = (id: string) => {
    setSelectedTrainerId(id);
    const trainer = allTrainers.find((t) => t.id === id);
    if (trainer?.hourly_rate != null) {
      setSelectedHourlyRate(String(trainer.hourly_rate));
    } else {
      setSelectedHourlyRate("");
    }
  };

  const selectedTrainer = allTrainers.find((t) => t.id === selectedTrainerId);

  return (
    <>
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Formateurs ({formationTrainers.length})</h3>
        <div className="space-y-3">
          {formationTrainers.map((ft) => {
            const stats = ft.trainer ? getTrainerStats(ft.trainer.id) : null;
            return (
            <div key={ft.id} className="p-3 bg-muted/50 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
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
                  {ft.daily_rate != null && (
                    <span className="text-xs text-muted-foreground">{ft.daily_rate} €/j</span>
                  )}
                </div>
                <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => setDeleteId(ft.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Heures effectuées + dates signées */}
              {stats && stats.slotCount > 0 && (
                <div className="ml-11 flex flex-wrap items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                    <Clock className="h-3 w-3" />
                    {stats.hours}h effectuées
                  </span>
                  <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full font-medium">
                    <CalendarDays className="h-3 w-3" />
                    {stats.slotCount} créneau{stats.slotCount > 1 ? "x" : ""} signé{stats.slotCount > 1 ? "s" : ""}
                  </span>
                  <span className="text-muted-foreground">
                    ({stats.dates.join(", ")})
                  </span>
                </div>
              )}
              {stats && stats.slotCount === 0 && (
                <p className="ml-11 text-xs text-muted-foreground italic">Aucun créneau signé</p>
              )}
            </div>
            );
          })}
          {formationTrainers.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucun formateur assigné</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Ajouter un Formateur
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            disabled={suggesting}
            onClick={async () => {
              setSuggesting(true);
              try {
                const res = await fetch("/api/ai/match-trainer", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ session_id: formation.id }),
                });
                if (!res.ok) throw new Error("Suggestion échouée");
                const data = await res.json();
                setSuggestions(data.matches || []);
              } catch {
                toast({ title: "Erreur suggestions IA", variant: "destructive" });
              } finally {
                setSuggesting(false);
              }
            }}
          >
            {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Suggérer
          </Button>
        </div>

        {/* Suggestions IA */}
        {suggestions.length > 0 && (
          <div className="rounded-lg border bg-purple-50/50 border-purple-100 p-3 space-y-2">
            <p className="text-xs font-semibold text-purple-900 flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Suggestions IA
            </p>
            {suggestions.slice(0, 3).map(m => (
              <div key={m.trainer_id} className="rounded-md bg-white border p-3 flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{m.trainer_name}</span>
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 text-[10px]">Match {m.score}%</Badge>
                  </div>
                  {m.reasons_match?.length > 0 && (
                    <ul className="text-xs text-gray-700 space-y-0.5 ml-4 list-disc">
                      {m.reasons_match.slice(0, 2).map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  )}
                </div>
                <Button size="sm" onClick={() => { handleSelectTrainer(m.trainer_id); setSuggestions([]); }}>Choisir</Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setSelectedTrainerId("");
            setSelectedHourlyRate("");
            setSelectedDailyRate("");
          }
        }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un Formateur</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Formateur</label>
              <SearchSelect
                options={trainerOptions}
                onSelect={handleSelectTrainer}
                placeholder="Rechercher un formateur..."
              />
              {selectedTrainer && (
                <p className="text-xs text-green-700 bg-green-50 rounded px-2 py-1 mt-1">
                  {selectedTrainer.last_name?.toUpperCase()} {selectedTrainer.first_name}
                </p>
              )}
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
            <div className="grid grid-cols-2 gap-3">
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
              <div>
                <label className="text-sm font-medium mb-1.5 block">Taux journalier (€/j)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ex : 400"
                  value={selectedDailyRate}
                  onChange={(e) => setSelectedDailyRate(e.target.value)}
                />
              </div>
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
