"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Euro, Clock, Save, X, Pencil, CalendarDays, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Session, SessionMode, FormationType, SessionStatus } from "@/lib/types";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

export function ResumePriceHours({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    total_price: formation.total_price?.toString() || "",
    planned_hours: formation.planned_hours?.toString() || "",
    start_date: formation.start_date ? formation.start_date.split("T")[0] : "",
    end_date: formation.end_date ? formation.end_date.split("T")[0] : "",
    location: formation.location || "",
    mode: formation.mode || "presentiel",
    type: formation.type || "inter",
    max_participants: formation.max_participants?.toString() || "",
    status: formation.status || "upcoming",
  });

  const openEdit = () => {
    setForm({
      total_price: formation.total_price?.toString() || "",
      planned_hours: formation.planned_hours?.toString() || "",
      start_date: formation.start_date ? formation.start_date.split("T")[0] : "",
      end_date: formation.end_date ? formation.end_date.split("T")[0] : "",
      location: formation.location || "",
      mode: formation.mode || "presentiel",
      type: formation.type || "inter",
      max_participants: formation.max_participants?.toString() || "",
      status: formation.status || "upcoming",
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("sessions")
        .update({
          total_price: form.total_price ? parseFloat(form.total_price) : null,
          planned_hours: form.planned_hours ? parseFloat(form.planned_hours) : null,
          start_date: form.start_date || formation.start_date,
          end_date: form.end_date || formation.end_date,
          location: form.location || null,
          mode: form.mode,
          type: form.type,
          max_participants: form.max_participants ? parseInt(form.max_participants) : null,
          status: form.status,
        })
        .eq("id", formation.id);
      if (error) throw error;
      toast({ title: "Formation mise à jour" });
      setEditing(false);
      onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const u = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  if (!editing) {
    // ── Read-only view ──
    const enrollCount = formation.enrollments?.length || 0;
    const pricePerLearner = formation.total_price && enrollCount > 0
      ? formation.total_price / enrollCount
      : null;

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Dates</p>
            <p className="font-medium">{formatDate(formation.start_date)} → {formatDate(formation.end_date)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Durée</p>
            <p className="font-medium">{formation.planned_hours ? `${formation.planned_hours}h` : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Euro className="h-3 w-3" /> Prix total</p>
            <p className="font-medium">{formatCurrency(formation.total_price)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> Prix / apprenant</p>
            <p className="font-medium">{pricePerLearner ? `${pricePerLearner.toFixed(2)} €` : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> Lieu</p>
            <p className="font-medium">{formation.location || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Places max</p>
            <p className="font-medium">{formation.max_participants ?? "—"}</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={openEdit} className="gap-1">
          <Pencil className="h-3.5 w-3.5" /> Modifier les infos
        </Button>
      </div>
    );
  }

  // ── Edit form ──
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Prix total (€)</Label>
          <Input type="number" step="0.01" value={form.total_price} onChange={u("total_price")} placeholder="0.00" className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Heures planifiées</Label>
          <Input type="number" step="0.5" value={form.planned_hours} onChange={u("planned_hours")} placeholder="0" className="h-8 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Date début</Label>
          <Input type="date" value={form.start_date} onChange={u("start_date")} className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Date fin</Label>
          <Input type="date" value={form.end_date} onChange={u("end_date")} className="h-8 text-sm" />
        </div>
      </div>
      <div>
        <Label className="text-xs">Lieu</Label>
        <Input value={form.location} onChange={u("location")} placeholder="Adresse ou salle" className="h-8 text-sm" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Modalité</Label>
          <Select value={form.mode} onValueChange={(v) => setForm((f) => ({ ...f, mode: v as SessionMode }))}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="presentiel">Présentiel</SelectItem>
              <SelectItem value="distanciel">Distanciel</SelectItem>
              <SelectItem value="hybride">Hybride</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Type</Label>
          <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as FormationType }))}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="inter">Inter</SelectItem>
              <SelectItem value="intra">Intra</SelectItem>
              <SelectItem value="individual">Individuel</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Places max</Label>
          <Input type="number" min="1" value={form.max_participants} onChange={u("max_participants")} placeholder="—" className="h-8 text-sm" />
        </div>
      </div>
      <div>
        <Label className="text-xs">Statut</Label>
        <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as SessionStatus }))}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="upcoming">À venir</SelectItem>
            <SelectItem value="in_progress">En cours</SelectItem>
            <SelectItem value="completed">Terminée</SelectItem>
            <SelectItem value="cancelled">Annulée</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
          <Save className="h-3.5 w-3.5" /> Enregistrer
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(false)} className="gap-1">
          <X className="h-3.5 w-3.5" /> Annuler
        </Button>
      </div>
    </div>
  );
}
