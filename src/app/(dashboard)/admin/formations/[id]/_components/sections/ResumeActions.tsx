"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Copy, Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { duplicateSession, updateSessionField } from "@/lib/services/sessions";
import type { Session } from "@/lib/types";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

export function ResumeActions({ formation, onRefresh }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();
  const [duplicating, setDuplicating] = useState(false);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [starting, setStarting] = useState(false);

  const handleDuplicate = async () => {
    setDuplicating(true);
    const result = await duplicateSession(supabase, formation.id, formation.entity_id);
    setDuplicating(false);
    if (!result.ok) {
      toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Formation dupliquée" });
    setConfirmDuplicate(false);
    router.push(`/admin/formations/${result.newId}`);
  };

  const handleStart = async () => {
    setStarting(true);
    const result = await updateSessionField(
      supabase, formation.id, formation.entity_id,
      { status: "in_progress" },
    );
    setStarting(false);
    if (!result.ok) {
      toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Formation démarrée" });
    await onRefresh();
  };

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {formation.status === "upcoming" && (
            <Button size="sm" onClick={handleStart} disabled={starting} className="bg-orange-400 hover:bg-orange-500 text-white">
              {starting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />} Commencer
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setConfirmDuplicate(true)}>
            <Copy className="h-4 w-4 mr-2" /> Dupliquer
          </Button>
        </div>
        {/* Bouton « Historique » retiré (deep-dive M3 : stub « Fonctionnalité à venir »). */}
      </div>

      <Dialog open={confirmDuplicate} onOpenChange={setConfirmDuplicate}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Dupliquer cette formation ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Une copie de la formation sera créée avec le statut &quot;À venir&quot;.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDuplicate(false)}>Annuler</Button>
            <Button onClick={handleDuplicate} disabled={duplicating}>
              {duplicating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Dupliquer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
