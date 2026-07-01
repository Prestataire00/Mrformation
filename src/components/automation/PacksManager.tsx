"use client";

/**
 * PacksManager – section liste des packs d'automatisation.
 *
 * Choix concernant le compteur d'étapes :
 *   La route GET /api/automation-packs renvoie select("*") sans embedding des
 *   étapes (l'embedding a été retiré volontairement). Plutôt que d'effectuer
 *   N+1 fetchs supplémentaires, le compteur d'étapes n'est PAS affiché sur la
 *   card. Le libellé du bouton « Éditer les étapes » sert de point d'entrée
 *   pour l'éditeur dédié.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import {
  Loader2,
  Plus,
  Package,
  Pencil,
  Copy,
  Star,
  Trash2,
} from "lucide-react";

/** Shape returned by GET /api/automation-packs */
interface AutomationPackRow {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  is_default: boolean;
  entity_id: string;
  created_at: string;
  updated_at?: string | null;
}

/** Map color string → tailwind card style (mirrors QuickStartPacks). */
const COLOR_MAP: Record<string, string> = {
  blue: "border-blue-200 bg-blue-50/50 hover:border-blue-300",
  green: "border-green-200 bg-green-50/50 hover:border-green-300",
  purple: "border-purple-200 bg-purple-50/50 hover:border-purple-300",
  amber: "border-amber-200 bg-amber-50/50 hover:border-amber-300",
  red: "border-red-200 bg-red-50/50 hover:border-red-300",
  gray: "border-gray-200 bg-gray-50/50 hover:border-gray-300",
};

function cardStyle(color: string | null): string {
  if (color && COLOR_MAP[color]) return COLOR_MAP[color];
  return COLOR_MAP.gray;
}

export function PacksManager() {
  const router = useRouter();
  const { toast } = useToast();

  const [packs, setPacks] = useState<AutomationPackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null); // pack id being actioned
  const [deleteTarget, setDeleteTarget] = useState<AutomationPackRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ------------------------------------------------------------------ */
  /* Data fetching                                                        */
  /* ------------------------------------------------------------------ */

  const fetchPacks = useCallback(async () => {
    try {
      const res = await fetch("/api/automation-packs");
      if (!res.ok) {
        const body: { error?: string } = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Erreur ${res.status}`);
      }
      const data: { packs: AutomationPackRow[] } = await res.json();
      setPacks(data.packs ?? []);
    } catch (err) {
      toast({
        title: "Erreur de chargement",
        description: err instanceof Error ? err.message : "Impossible de charger les packs",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPacks();
  }, [fetchPacks]);

  /* ------------------------------------------------------------------ */
  /* Actions                                                              */
  /* ------------------------------------------------------------------ */

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/automation-packs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Nouveau parcours" }),
      });
      const data: { id?: string; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok || !data.id) {
        throw new Error(data.error ?? `Erreur ${res.status}`);
      }
      router.push(`/admin/automation/packs/${data.id}`);
    } catch (err) {
      toast({
        title: "Impossible de créer le pack",
        description: err instanceof Error ? err.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDuplicate = async (pack: AutomationPackRow) => {
    setLoadingAction(pack.id);
    try {
      const res = await fetch(`/api/automation-packs/${pack.id}/duplicate`, {
        method: "POST",
      });
      const data: { id?: string; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? `Erreur ${res.status}`);
      }
      toast({ title: "Pack dupliqué", description: `"${pack.name} (copie)" créé.` });
      await fetchPacks();
    } catch (err) {
      toast({
        title: "Erreur de duplication",
        description: err instanceof Error ? err.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSetDefault = async (pack: AutomationPackRow) => {
    if (pack.is_default) return; // already default
    setLoadingAction(pack.id);
    try {
      const res = await fetch(`/api/automation-packs/${pack.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: true }),
      });
      const data: { ok?: boolean; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? `Erreur ${res.status}`);
      }
      toast({ title: "Pack défaut mis à jour", description: `"${pack.name}" est maintenant le pack par défaut.` });
      await fetchPacks();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/automation-packs/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data: { ok?: boolean; error?: string } = await res.json().catch(() => ({}));
      if (res.status === 409) {
        // Pack used by formations — show the server error, don't remove from list
        toast({
          title: "Suppression refusée",
          description: data.error ?? "Ce pack est utilisé par des formations.",
          variant: "destructive",
        });
        setDeleteTarget(null);
        return;
      }
      if (!res.ok) {
        throw new Error(data.error ?? `Erreur ${res.status}`);
      }
      toast({ title: "Pack supprimé" });
      setDeleteTarget(null);
      await fetchPacks();
    } catch (err) {
      toast({
        title: "Erreur de suppression",
        description: err instanceof Error ? err.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Render                                                               */
  /* ------------------------------------------------------------------ */

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {/* Header row */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Mes parcours d&apos;automatisation</h3>
            {packs.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {packs.length}
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            className="gap-1.5 text-xs"
            onClick={handleCreate}
            disabled={creating}
          >
            {creating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Nouveau pack
          </Button>
        </div>

        {/* Empty state */}
        {packs.length === 0 ? (
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center">
            <Package className="h-8 w-8 mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-muted-foreground">Aucun parcours configuré</p>
            <p className="text-xs text-muted-foreground mt-1">
              Créez votre premier pack pour automatiser vos envois de documents.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-4 gap-1.5 text-xs"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Créer un pack
            </Button>
          </div>
        ) : (
          /* Cards grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {packs.map((pack) => {
              const isActioning = loadingAction === pack.id;
              return (
                <Card
                  key={pack.id}
                  className={`border-2 transition-all ${cardStyle(pack.color)}`}
                >
                  <CardContent className="p-4 flex flex-col gap-3">
                    {/* Top: icon + name + default badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xl shrink-0" aria-hidden>
                          {pack.icon || "📦"}
                        </span>
                        <h4 className="text-sm font-semibold text-gray-900 truncate">
                          {pack.name}
                        </h4>
                      </div>
                      {pack.is_default && (
                        <Badge className="text-[10px] shrink-0 bg-amber-100 text-amber-700 border-amber-200">
                          Défaut
                        </Badge>
                      )}
                    </div>

                    {/* Description (clamped) */}
                    {pack.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {pack.description}
                      </p>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-1.5 mt-auto pt-1 border-t border-gray-100">
                      {/* Edit */}
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1 h-7 flex-1"
                        onClick={() => router.push(`/admin/automation/packs/${pack.id}`)}
                        disabled={isActioning}
                        aria-label={`Éditer le pack ${pack.name}`}
                      >
                        <Pencil className="h-3 w-3" />
                        Éditer
                      </Button>

                      {/* Duplicate */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs gap-1 h-7"
                        onClick={() => handleDuplicate(pack)}
                        disabled={isActioning}
                        aria-label={`Dupliquer le pack ${pack.name}`}
                        title="Dupliquer"
                      >
                        {isActioning ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>

                      {/* Set default */}
                      {!pack.is_default && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs gap-1 h-7 text-amber-600 hover:text-amber-700"
                          onClick={() => handleSetDefault(pack)}
                          disabled={isActioning}
                          aria-label={`Définir ${pack.name} comme pack par défaut`}
                          title="Définir par défaut"
                        >
                          <Star className="h-3 w-3" />
                        </Button>
                      )}

                      {/* Delete */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs gap-1 h-7 text-red-500 hover:text-red-700"
                        onClick={() => setDeleteTarget(pack)}
                        disabled={isActioning}
                        aria-label={`Supprimer le pack ${pack.name}`}
                        title="Supprimer"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer ce pack ?</DialogTitle>
            <DialogDescription>
              Supprimer{" "}
              <strong>&quot;{deleteTarget?.name}&quot;</strong> est irréversible. Si ce pack est
              utilisé par des formations existantes, la suppression sera refusée.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="gap-1.5"
            >
              {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
