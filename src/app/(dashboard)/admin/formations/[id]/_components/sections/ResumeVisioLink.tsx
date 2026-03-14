"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Video, Save, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    const { error } = await supabase
      .from("sessions")
      .update({ visio_link: visioLink || null })
      .eq("id", formation.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erreur", variant: "destructive" });
    } else {
      toast({ title: "Lien de visio mis à jour" });
      onRefresh();
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Video className="h-4 w-4" /> Lien de la Visio
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
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
      </CardContent>
    </Card>
  );
}
