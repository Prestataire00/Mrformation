"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Search, Loader2, Settings2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import type { CustomSecondaryDocType } from "@/lib/types";
import {
  SECONDARY_DOC_TYPES,
  SECONDARY_TEMPLATE_CATEGORIES,
  SECONDARY_CATEGORY_LABELS,
  type SecondaryCategory,
} from "@/lib/templates/secondary-categories";
import { CustomSecondaryTypeDialog } from "./CustomSecondaryTypeDialog";

/**
 * Dialog catalogue : attribue 1..N documents secondaires à une session.
 * Cohabitation : affiche les 23 types legacy ET les types custom actifs de
 * l'entité (chargés en base), groupés par catégorie. Multi-sélection + search.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formationId: string;
  onAttributed: () => void;
}

interface CatalogItem {
  docType: string;
  label: string;
  description?: string;
  signable: boolean;
  category: SecondaryCategory;
  isCustom: boolean;
}

const EMPTY_BY_CATEGORY = (): Record<SecondaryCategory, CatalogItem[]> => ({
  habilitation: [],
  attestation_metier: [],
  administratif: [],
  evaluation: [],
});

export function SecondaryDocCatalogDialog({
  open,
  onOpenChange,
  formationId,
  onAttributed,
}: Props) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [customTypes, setCustomTypes] = useState<CustomSecondaryDocType[]>([]);
  const [manageOpen, setManageOpen] = useState(false);

  const fetchCustomTypes = useCallback(async () => {
    try {
      const res = await fetch("/api/documents/custom-secondary-types");
      const data = await res.json();
      if (res.ok) setCustomTypes((data.types ?? []) as CustomSecondaryDocType[]);
    } catch {
      // Silencieux : le catalogue legacy reste utilisable même si le fetch échoue.
    }
  }, []);

  useEffect(() => {
    if (open) fetchCustomTypes();
  }, [open, fetchCustomTypes]);

  // Catalogue unifié : legacy + custom actifs, indexé par doc_type (label toast).
  const allItems = useMemo<CatalogItem[]>(() => {
    const legacy: CatalogItem[] = SECONDARY_DOC_TYPES.map((docType) => {
      const meta = SECONDARY_TEMPLATE_CATEGORIES[docType];
      return {
        docType,
        label: meta.label,
        description: meta.description,
        signable: !!meta.signable,
        category: meta.category,
        isCustom: false,
      };
    });
    const custom: CatalogItem[] = customTypes.map((t) => ({
      docType: t.doc_type,
      label: t.label,
      signable: false,
      category: t.category,
      isCustom: true,
    }));
    return [...legacy, ...custom];
  }, [customTypes]);

  const labelByDocType = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of allItems) map.set(it.docType, it.label);
    return map;
  }, [allItems]);

  const filteredByCategory = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byCat = EMPTY_BY_CATEGORY();
    for (const item of allItems) {
      if (q) {
        const catLabel = SECONDARY_CATEGORY_LABELS[item.category].label;
        const expanded = `${item.label} ${item.description ?? ""} ${catLabel} ${item.docType}`
          .toLowerCase()
          .replaceAll("hab.", "habilitation")
          .replaceAll("élec.", "électrique")
          .replaceAll("éval.", "évaluation")
          .replaceAll("_", " ");
        if (!expanded.includes(q)) continue;
      }
      byCat[item.category].push(item);
    }
    return byCat;
  }, [search, allItems]);

  const totalFiltered = Object.values(filteredByCategory).reduce(
    (a, b) => a + b.length,
    0,
  );

  const selectedHiddenCount = useMemo(() => {
    if (!search.trim()) return 0;
    const visible = new Set<string>();
    for (const docs of Object.values(filteredByCategory)) {
      for (const d of docs) visible.add(d.docType);
    }
    let hidden = 0;
    for (const d of selected) {
      if (!visible.has(d)) hidden++;
    }
    return hidden;
  }, [search, filteredByCategory, selected]);

  const toggle = (docType: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(docType)) next.delete(docType);
      else next.add(docType);
      return next;
    });
  };

  const reset = () => {
    setSelected(new Set());
    setSearch("");
  };

  const handleSubmit = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/documents/attribute-secondary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formationId,
          docTypes: Array.from(selected),
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "Erreur serveur");
      }
      if (result.created === 0) {
        const skippedLabels = Array.isArray(result.skippedByMissingOwner)
          ? (result.skippedByMissingOwner as string[])
              .map((dt) => labelByDocType.get(dt) ?? dt)
              .join(", ")
          : "";
        toast({
          title: "Aucun document ajouté",
          description:
            (result.message as string | undefined) ??
            (skippedLabels
              ? `Skippés faute d'owner : ${skippedLabels}`
              : "Tous les documents demandés étaient déjà attribués."),
        });
      } else {
        toast({
          title: "Documents attribués",
          description: `${result.created} document${result.created > 1 ? "s" : ""} ajouté${result.created > 1 ? "s" : ""} à la session.`,
        });
      }
      reset();
      onOpenChange(false);
      onAttributed();
    } catch (err) {
      console.error("attribute-secondary error:", err);
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Impossible d'attribuer les documents.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const orderedCategories = (Object.entries(SECONDARY_CATEGORY_LABELS) as Array<
    [SecondaryCategory, (typeof SECONDARY_CATEGORY_LABELS)[SecondaryCategory]]
  >).sort((a, b) => a[1].order - b[1].order);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (submitting) return;
          if (!o) reset();
          onOpenChange(o);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle>Ajouter des documents secondaires</DialogTitle>
                <DialogDescription>
                  Sélectionnez les documents à attribuer à cette session. Ils seront créés en statut brouillon et pourront ensuite être générés, envoyés et signés depuis l&apos;onglet Documents.
                </DialogDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 flex-shrink-0"
                onClick={() => setManageOpen(true)}
              >
                <Settings2 className="h-3.5 w-3.5" />
                Types personnalisés
              </Button>
            </div>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Rechercher un document…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="max-h-[60vh] overflow-y-auto -mx-6 px-6">
            <div className="space-y-5 py-2">
              {totalFiltered === 0 ? (
                <p className="text-sm text-gray-400 text-center py-12">
                  Aucun document ne correspond à « {search} ».
                </p>
              ) : (
                orderedCategories.map(([category, meta]) => {
                  const docs = filteredByCategory[category];
                  if (docs.length === 0) return null;
                  return (
                    <section key={category}>
                      <div className="flex items-center gap-2 mb-2 sticky top-0 bg-white py-1 z-10">
                        <span>{meta.icon}</span>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                          {meta.label}
                        </h3>
                        <span className="text-[10px] text-gray-400">
                          ({docs.length})
                        </span>
                      </div>
                      <div className="grid gap-1.5">
                        {docs.map((item) => {
                          const isSelected = selected.has(item.docType);
                          return (
                            <button
                              key={item.docType}
                              type="button"
                              onClick={() => toggle(item.docType)}
                              className={cn(
                                "flex items-center gap-3 rounded-md border px-3 py-2 text-left transition hover:bg-gray-50",
                                isSelected
                                  ? "border-blue-300 bg-blue-50/40 ring-1 ring-blue-200"
                                  : "border-gray-200",
                              )}
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggle(item.docType)}
                                onClick={(e) => e.stopPropagation()}
                                className="flex-shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="text-sm font-medium text-gray-900 truncate"
                                    title={item.label}
                                  >
                                    {item.label}
                                  </span>
                                  {item.isCustom && (
                                    <Badge
                                      variant="outline"
                                      className="h-4 text-[9px] bg-indigo-50 text-indigo-700 border-indigo-200 px-1"
                                    >
                                      Personnalisé
                                    </Badge>
                                  )}
                                  {item.signable && (
                                    <Badge
                                      variant="outline"
                                      className="h-4 text-[9px] bg-amber-50 text-amber-700 border-amber-200 px-1"
                                    >
                                      Signable
                                    </Badge>
                                  )}
                                </div>
                                {item.description && (
                                  <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                                    {item.description}
                                  </p>
                                )}
                              </div>
                              {isSelected && (
                                <Check className="h-4 w-4 text-blue-600 flex-shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                })
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2 border-t pt-3 sm:justify-between">
            {selectedHiddenCount > 0 ? (
              <p className="text-[11px] text-amber-700 self-center">
                {selected.size} sélectionné{selected.size > 1 ? "s" : ""} (dont {selectedHiddenCount} hors filtre)
              </p>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Annuler
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={selected.size === 0 || submitting}
                className="gap-2"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {submitting ? "Attribution…" : `Attribuer (${selected.size})`}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CustomSecondaryTypeDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        onChanged={fetchCustomTypes}
      />
    </>
  );
}
