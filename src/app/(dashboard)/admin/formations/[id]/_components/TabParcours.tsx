"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Download, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import type { Session } from "@/lib/types";
import { TimeSlotCard } from "./TimeSlotCard";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

export function TabParcours({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [saving, setSaving] = useState(false);

  const timeSlots = formation.formation_time_slots || [];

  const handleMarkCompleted = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("sessions")
      .update({ is_completed: true, status: "completed" })
      .eq("id", formation.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erreur", variant: "destructive" });
    } else {
      toast({ title: "Formation marquée comme terminée" });
      setConfirmComplete(false);
      onRefresh();
    }
  };

  const handleDownloadBilan = () => {
    // Générer un bilan quotidien simple en CSV
    const headers = ["Créneau", "Date", "Heure début", "Heure fin", "Durée (h)", "Module", "Objectifs"];
    const rows = timeSlots.map((slot, i) => {
      const start = new Date(slot.start_time);
      const end = new Date(slot.end_time);
      const duration = ((end.getTime() - start.getTime()) / (1000 * 60 * 60)).toFixed(1);
      return [
        `Créneau ${i + 1}`,
        start.toLocaleDateString("fr-FR"),
        start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        duration,
        slot.module_title || "",
        slot.module_objectives || "",
      ];
    });
    const csv = [headers, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bilan-${formation.title}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{formation.title}</h2>
        <Button variant="outline" onClick={handleDownloadBilan}>
          <Download className="h-4 w-4 mr-2" /> Télécharger / Voir le bilan quotidien
        </Button>
      </div>

      {/* Liste des créneaux */}
      {timeSlots.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            Aucun créneau planifié. Utilisez l&apos;onglet Planning pour créer des créneaux.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {timeSlots.map((slot, index) => (
            <TimeSlotCard
              key={slot.id}
              slot={slot}
              index={index}
              formationTitle={formation.title}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}

      {/* Fin de la formation */}
      {!formation.is_completed && timeSlots.length > 0 && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="pt-6">
            <p className="font-medium mb-1">Fin de la formation</p>
            <p className="text-sm text-muted-foreground mb-3">
              Cliquez sur ce bouton pour confirmer la fin de la formation
            </p>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => setConfirmComplete(true)}
            >
              <CheckCircle className="h-4 w-4 mr-2" /> Formation Terminée
            </Button>
          </CardContent>
        </Card>
      )}

      {formation.is_completed && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <p className="font-medium text-green-700">Formation terminée</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmComplete} onOpenChange={setConfirmComplete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmer la fin de la formation ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Le statut de la formation passera à &quot;Terminée&quot;.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmComplete(false)}>Annuler</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={handleMarkCompleted} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
