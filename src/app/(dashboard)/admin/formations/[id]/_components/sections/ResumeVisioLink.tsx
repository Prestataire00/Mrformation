"use client";

import { useState, useEffect } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { updateSessionField } from "@/lib/services/sessions";
import type { Session } from "@/lib/types";

const VisioUrlSchema = z.union([
  z.literal(""),
  z.string().url({ message: "URL invalide (https://meet.google.com/... ou https://zoom.us/...)" }),
]);

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

export function ResumeVisioLink({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [visioLink, setVisioLink] = useState(formation.visio_link || "");
  const [saving, setSaving] = useState(false);

  // Re-sync depuis la prop si elle change (au mount + après save réussi).
  useEffect(() => {
    setVisioLink(formation.visio_link || "");
  }, [formation.visio_link]);

  const handleSave = async () => {
    const parsed = VisioUrlSchema.safeParse(visioLink);
    if (!parsed.success) {
      toast({
        title: "URL invalide",
        description: parsed.error.issues[0]?.message,
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const result = await updateSessionField(
      supabase, formation.id, formation.entity_id,
      { visio_link: parsed.data || null },
    );
    setSaving(false);
    if (!result.ok) {
      toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Lien de visio mis à jour" });
    await onRefresh();
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
          <Button size="sm" variant="outline" disabled title="Implémentation en Tâche 14">
            <Send className="h-4 w-4 mr-1" /> Envoyer
          </Button>
        )}
      </div>
    </div>
  );
}
