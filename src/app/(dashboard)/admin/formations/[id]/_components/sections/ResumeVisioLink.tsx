"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import type { Session } from "@/lib/types";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

export function ResumeVisioLink({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [visioLink, setVisioLink] = useState(formation.visio_link || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("sessions")
        .update({ visio_link: visioLink || null })
        .eq("id", formation.id)
        .eq("entity_id", formation.entity_id);
      if (error) throw error;
      toast({ title: "Lien de visio mis à jour" });
      await onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible de sauvegarder";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Lien de la Visio</h3>
      <p className="text-xs text-muted-foreground">
        Notez ici l&apos;URL de la salle virtuelle (Zoom, Google Meet...). Le lien sera visible dans le compte de l&apos;apprenant.
      </p>
      <div className="flex items-center gap-2">
        <Input
          value={visioLink}
          onChange={(e) => setVisioLink(e.target.value)}
          placeholder="https://meet.google.com/..."
          className="flex-1"
        />
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-1" /> Ajouter / Modifier
        </Button>
        {formation.visio_link && (
          <Button size="sm" variant="outline" onClick={() => {
            toast({ title: "Envoi par email", description: "Fonctionnalité à venir" });
          }}>
            <Send className="h-4 w-4 mr-1" /> Envoyer
          </Button>
        )}
      </div>
    </div>
  );
}
