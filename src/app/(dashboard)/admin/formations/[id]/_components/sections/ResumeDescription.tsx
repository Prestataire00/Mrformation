"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { updateSessionField } from "@/lib/services/sessions";
import type { Session } from "@/lib/types";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

export function ResumeDescription({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(formation.description || "");
  const [saving, setSaving] = useState(false);

  // Re-sync draft depuis la prop quand on n'édite pas (au mount, au cancel, après save).
  useEffect(() => {
    if (!editing) setDescription(formation.description || "");
  }, [formation.description, editing]);

  const handleSave = async () => {
    setSaving(true);
    const result = await updateSessionField(supabase, formation.id, formation.entity_id, { description });
    setSaving(false);
    if (!result.ok) {
      toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Description mise à jour" });
    setEditing(false);
    await onRefresh();
  };

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Description</h3>
      {editing ? (
        <div className="space-y-3">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Description de la formation..."
          />
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
        <div>
          {formation.description ? (
            <p className="text-sm whitespace-pre-wrap">{formation.description}</p>
          ) : (
            <p className="text-sm text-gray-400 italic">Aucune description</p>
          )}
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setEditing(true)}>
            {formation.description ? "Modifier" : "Ajouter une description"}
          </Button>
        </div>
      )}
    </div>
  );
}
