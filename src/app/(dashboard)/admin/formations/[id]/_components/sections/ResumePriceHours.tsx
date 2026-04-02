"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Euro, Clock, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/utils";
import type { Session } from "@/lib/types";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

export function ResumePriceHours({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [totalPrice, setTotalPrice] = useState(formation.total_price?.toString() || "");
  const [plannedHours, setPlannedHours] = useState(formation.planned_hours?.toString() || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("sessions")
      .update({
        total_price: totalPrice ? parseFloat(totalPrice) : null,
        planned_hours: plannedHours ? parseFloat(plannedHours) : null,
      })
      .eq("id", formation.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erreur", variant: "destructive" });
    } else {
      toast({ title: "Mis à jour" });
      setEditing(false);
      onRefresh();
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Prix & Heures</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Euro className="h-3 w-3" /> Prix Total
          </p>
          {editing ? (
            <Input
              type="number"
              step="0.01"
              value={totalPrice}
              onChange={(e) => setTotalPrice(e.target.value)}
              className="mt-1 w-[150px]"
              placeholder="0.00"
            />
          ) : (
            <p className="text-sm font-semibold mt-1">
              {formatCurrency(formation.total_price)}
            </p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" /> Heures Planifiées
          </p>
          {editing ? (
            <Input
              type="number"
              step="0.5"
              value={plannedHours}
              onChange={(e) => setPlannedHours(e.target.value)}
              className="mt-1 w-[150px]"
              placeholder="0"
            />
          ) : (
            <p className="text-sm font-semibold mt-1">
              {formation.planned_hours != null ? `${formation.planned_hours} heure(s)` : "—"}
            </p>
          )}
        </div>
      </div>
      <div>
        {editing ? (
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-1" /> Enregistrer
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
              <X className="h-4 w-4 mr-1" /> Annuler
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Modifier prix et heures
          </Button>
        )}
      </div>
    </div>
  );
}
