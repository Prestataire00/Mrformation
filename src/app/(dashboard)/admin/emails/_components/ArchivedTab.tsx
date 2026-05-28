"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Archive, RotateCcw, Trash2 } from "lucide-react";
import { restoreTemplate } from "../_actions/restore-template";
import { deleteTemplatePermanent } from "../_actions/delete-template-permanent";
import type { EmailTemplate } from "@/lib/types";

/**
 * Story em-c-4 — Tab Archivés.
 *
 * Liste les templates `is_active = false` de l'entité courante avec
 * 2 actions :
 *   1. Restaurer → Server Action restoreTemplate (is_active = TRUE)
 *   2. Supprimer définitivement → Modal de confirmation forte avec
 *      input texte "supprimer" requis + Server Action
 *      deleteTemplatePermanent qui vérifie les références
 *      automation_rules avant DELETE.
 */
export function ArchivedTab() {
  const { entity } = useEntity();
  const supabase = createClient();
  const { toast } = useToast();

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const [deleteTarget, setDeleteTarget] = useState<EmailTemplate | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const fetchArchived = useCallback(async () => {
    if (!entity?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("email_templates")
      .select("*")
      .eq("entity_id", entity.id)
      .eq("is_active", false)
      .order("updated_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast({ title: "Erreur chargement archivés", description: error.message, variant: "destructive" });
      return;
    }
    setTemplates((data ?? []) as EmailTemplate[]);
  }, [entity?.id, supabase, toast]);

  useEffect(() => {
    fetchArchived();
  }, [fetchArchived]);

  const handleRestore = async (t: EmailTemplate) => {
    const result = await restoreTemplate({ id: t.id });
    if (result.ok) {
      toast({ title: "Modèle restauré", description: `"${t.name}" est de nouveau actif.` });
      await fetchArchived();
    } else if (result.error === "key_already_active") {
      toast({
        title: "Restauration bloquée",
        description: `Un autre template actif utilise déjà la clef "${(result as { conflictingKey?: string }).conflictingKey}". Archive-le d'abord.`,
        variant: "destructive",
      });
    } else if (result.error === "unauthorized") {
      toast({ title: "Non autorisé", description: "Reconnecte-toi", variant: "destructive" });
    } else if (result.error === "not_found") {
      toast({ title: "Template introuvable", variant: "destructive" });
    } else {
      toast({ title: "Erreur restauration", description: result.error, variant: "destructive" });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deleteTemplatePermanent({
      id: deleteTarget.id,
      confirmText: confirmText as "supprimer",
    });
    setDeleting(false);
    if (result.ok) {
      toast({ title: "Modèle supprimé définitivement", description: `"${deleteTarget.name}" a été supprimé.` });
      setDeleteTarget(null);
      setConfirmText("");
      await fetchArchived();
    } else if (result.error === "referenced_by_rules") {
      const refs = (result as { references?: string[] }).references ?? [];
      toast({
        title: "Suppression bloquée",
        description: `Ce template est encore référencé par ${refs.length} règle(s) d'automation. Désactive-les d'abord.`,
        variant: "destructive",
      });
    } else if (result.error === "validation_failed") {
      toast({ title: "Confirmation invalide", description: "Tape 'supprimer' exactement", variant: "destructive" });
    } else if (result.error === "unauthorized") {
      toast({ title: "Non autorisé", variant: "destructive" });
    } else if (result.error === "not_found") {
      toast({ title: "Template introuvable", variant: "destructive" });
    } else {
      toast({ title: "Erreur suppression", description: result.error, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Archive className="h-12 w-12 text-gray-300 mb-3" />
        <p className="font-medium text-gray-600">Aucun modèle archivé</p>
        <p className="text-sm text-gray-400 mt-1">
          Les modèles que tu archiveras apparaîtront ici, et tu pourras toujours les restaurer.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="text-sm text-gray-600 mb-3">
        {templates.length} modèle{templates.length > 1 ? "s" : ""} archivé{templates.length > 1 ? "s" : ""}. Ils ne sont
        plus envoyés mais l&apos;historique reste consultable.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {templates.map((t) => (
          <div
            key={t.id}
            className="border rounded-xl bg-white p-4 opacity-70 hover:opacity-100 transition-opacity"
          >
            <div className="flex items-start gap-2 mb-2">
              <Archive className="h-4 w-4 text-gray-400 shrink-0 mt-1" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 truncate">{t.name}</p>
                <p className="text-xs text-gray-500 truncate">{t.subject}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleRestore(t)}
                className="gap-1.5"
                aria-label={`Restaurer le modèle ${t.name}`}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Restaurer
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDeleteTarget(t);
                  setConfirmText("");
                }}
                className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
                aria-label={`Supprimer définitivement le modèle ${t.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" /> Supprimer
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal de confirmation forte — input texte "supprimer" requis */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setDeleteTarget(null);
            setConfirmText("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer définitivement ce modèle ?</DialogTitle>
            <DialogDescription asChild>
              <div>
                <p className="mb-2">
                  Tu vas supprimer <strong>&quot;{deleteTarget?.name}&quot;</strong> de façon irréversible.
                  L&apos;historique des emails envoyés via ce template restera consultable, mais le
                  template lui-même sera perdu.
                </p>
                <p className="mt-3 text-sm">
                  Tape <strong>supprimer</strong> ci-dessous pour confirmer :
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="supprimer"
            autoFocus
            aria-label="Tape 'supprimer' pour confirmer"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteTarget(null);
                setConfirmText("");
              }}
              disabled={deleting}
            >
              Annuler
            </Button>
            <Button
              onClick={() => handleDeleteConfirm()}
              disabled={confirmText !== "supprimer" || deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? "Suppression..." : "Supprimer définitivement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
