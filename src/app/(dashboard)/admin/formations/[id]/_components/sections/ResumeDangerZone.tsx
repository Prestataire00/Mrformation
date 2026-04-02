"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Trash2, Loader2 } from "lucide-react";
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

export function ResumeDangerZone({ formation, onRefresh }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // D'abord supprimer les données liées
      const tables = [
        "formation_time_slots", "formation_trainers", "formation_companies",
        "formation_financiers", "formation_comments", "enrollments",
      ];
      for (const table of tables) {
        const { error } = await supabase.from(table).delete().eq("session_id", formation.id);
        if (error) throw new Error(`Erreur suppression ${table}: ${error.message}`);
      }

      const { error } = await supabase.from("sessions").delete().eq("id", formation.id).eq("entity_id", formation.entity_id);
      if (error) throw error;
      toast({ title: "Formation supprimée" });
      router.push("/admin/sessions");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible de supprimer la formation";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" className="text-xs text-red-500" onClick={() => setConfirmDelete(true)}>
        <Trash2 className="h-3 w-3 mr-1" /> Supprimer cette formation
      </Button>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer cette formation ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Cette action est irréversible. Toutes les données liées (créneaux, inscriptions, commentaires...) seront également supprimées.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
