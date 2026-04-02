"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Copy, Play, History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
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

  const handleDuplicate = async () => {
    setDuplicating(true);
    try {
      const { data, error } = await supabase
        .from("sessions")
        .insert({
          training_id: formation.training_id,
          entity_id: formation.entity_id,
          title: `${formation.title} (copie)`,
          start_date: formation.start_date,
          end_date: formation.end_date,
          location: formation.location,
          mode: formation.mode,
          status: "upcoming",
          max_participants: formation.max_participants,
          notes: formation.notes,
          type: formation.type,
          domain: formation.domain,
          description: formation.description,
          total_price: formation.total_price,
          planned_hours: formation.planned_hours,
          program_id: formation.program_id,
        })
        .select("id")
        .single();

      if (error) throw error;
      toast({ title: "Formation dupliquée" });
      setConfirmDuplicate(false);
      router.push(`/admin/formations/${data.id}`);
    } catch {
      toast({ title: "Erreur", description: "Impossible de dupliquer", variant: "destructive" });
    } finally {
      setDuplicating(false);
    }
  };

  const [starting, setStarting] = useState(false);

  const handleStart = async () => {
    setStarting(true);
    try {
      const { error } = await supabase
        .from("sessions")
        .update({ status: "in_progress" })
        .eq("id", formation.id)
        .eq("entity_id", formation.entity_id);
      if (error) throw error;
      toast({ title: "Formation démarrée" });
      await onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible de démarrer";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setStarting(false);
    }
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
        <Button size="sm" variant="outline" onClick={() => toast({ title: "Historique", description: "Fonctionnalité à venir" })}>
          <History className="h-4 w-4 mr-2" /> Historique
        </Button>
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
