"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import type { Session, SessionMode } from "@/lib/types";

const MODE_LABELS: Record<string, string> = {
  presentiel: "Présentiel",
  distanciel: "Distanciel",
  hybride: "Hybride",
};

const MODE_COLORS: Record<string, string> = {
  presentiel: "bg-green-100 text-green-800",
  distanciel: "bg-blue-100 text-blue-800",
  hybride: "bg-purple-100 text-purple-800",
};

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

export function ResumeLocation({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<SessionMode>(formation.mode);
  const [location, setLocation] = useState(formation.location || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("sessions")
      .update({ mode, location })
      .eq("id", formation.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erreur", variant: "destructive" });
    } else {
      toast({ title: "Emplacement mis à jour" });
      setEditing(false);
      onRefresh();
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Emplacement</h3>
      {editing ? (
        <div className="space-y-3">
          <div>
            <Label>Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as SessionMode)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="presentiel">Présentiel</SelectItem>
                <SelectItem value="distanciel">Distanciel</SelectItem>
                <SelectItem value="hybride">Hybride</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Adresse</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Adresse complète" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-1" /> Enregistrer
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
              <X className="h-4 w-4 mr-1" /> Annuler
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge className={MODE_COLORS[formation.mode] || "bg-gray-100"}>
              {MODE_LABELS[formation.mode] || formation.mode}
            </Badge>
            <span className="text-sm">
              {formation.location || "Aucun emplacement défini"}
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Modifier
          </Button>
        </div>
      )}
    </div>
  );
}
