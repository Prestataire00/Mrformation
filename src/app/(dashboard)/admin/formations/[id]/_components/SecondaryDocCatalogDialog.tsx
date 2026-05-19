"use client";

import { useMemo, useState } from "react";
import { Check, Search, Loader2 } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import type { ConventionDocType } from "@/lib/types";
import {
  SECONDARY_DOC_TYPES,
  SECONDARY_TEMPLATE_CATEGORIES,
  SECONDARY_CATEGORY_LABELS,
  type SecondaryCategory,
  type SecondaryDocType,
} from "@/lib/templates/secondary-categories";

/**
 * Dialog catalogue h-22 : permet à Loris d'attribuer 1..N documents secondaires
 * à une session. Multi-sélection avec checkboxes, search filtrable, 4 sections
 * de catégories visuelles.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formationId: string;
  onAttributed: () => void;
}

export function SecondaryDocCatalogDialog({
  open,
  onOpenChange,
  formationId,
  onAttributed,
}: Props) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<SecondaryDocType>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  // Filtrage searchable (P9 code review h-22) : haystack = label + description
  // + libellé catégorie + doc_type slug + version "full words" (remplace les
  // abrégés "Hab." par "Habilitation", "élec." par "électrique") pour
  // matcher les recherches naturelles. Case-insensitive.
  const filteredByCategory = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byCat: Record<SecondaryCategory, SecondaryDocType[]> = {
      habilitation: [],
      attestation_metier: [],
      administratif: [],
      evaluation: [],
    };
    for (const docType of SECONDARY_DOC_TYPES) {
      const meta = SECONDARY_TEMPLATE_CATEGORIES[docType];
      if (q) {
        const catLabel = SECONDARY_CATEGORY_LABELS[meta.category].label;
        const expanded = `${meta.label} ${meta.description ?? ""} ${catLabel} ${docType}`
          .toLowerCase()
          .replaceAll("hab.", "habilitation")
          .replaceAll("élec.", "électrique")
          .replaceAll("éval.", "évaluation")
          .replaceAll("_", " ");
        if (!expanded.includes(q)) continue;
      }
      byCat[meta.category].push(docType);
    }
    return byCat;
  }, [search]);

  const totalFiltered = Object.values(filteredByCategory).reduce(
    (a, b) => a + b.length,
    0,
  );

  // P11 (code review h-22) : compter les items sélectionnés invisibles à
  // cause du filtre, pour alerter l'utilisateur qu'ils seront tout de même
  // attribués au submit.
  const selectedHiddenCount = useMemo(() => {
    if (!search.trim()) return 0;
    const visible = new Set<SecondaryDocType>();
    for (const docs of Object.values(filteredByCategory)) {
      for (const d of docs) visible.add(d);
    }
    let hidden = 0;
    for (const d of selected) {
      if (!visible.has(d)) hidden++;
    }
    return hidden;
  }, [search, filteredByCategory, selected]);

  const toggle = (docType: SecondaryDocType) => {
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
          docTypes: Array.from(selected) as ConventionDocType[],
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "Erreur serveur");
      }
      // P7 (code review h-22) : si created === 0, surface le message serveur
      // (skippedByMissingOwner, "déjà attribué", etc.) au lieu d'un toast vide.
      if (result.created === 0) {
        const skippedLabels = Array.isArray(result.skippedByMissingOwner)
          ? (result.skippedByMissingOwner as string[])
              .map((dt) => SECONDARY_TEMPLATE_CATEGORIES[dt as SecondaryDocType]?.label ?? dt)
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

  // Ordre des catégories selon SECONDARY_CATEGORY_LABELS.order
  const orderedCategories = (Object.entries(SECONDARY_CATEGORY_LABELS) as Array<
    [SecondaryCategory, (typeof SECONDARY_CATEGORY_LABELS)[SecondaryCategory]]
  >).sort((a, b) => a[1].order - b[1].order);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // P8 (code review h-22) : bloquer la fermeture (Esc / click-outside)
        // pendant un submit en cours pour éviter les closures stales.
        if (submitting) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Ajouter des documents secondaires</DialogTitle>
          <DialogDescription>
            Sélectionnez les documents à attribuer à cette session. Ils seront créés en statut brouillon et pourront ensuite être générés, envoyés et signés depuis l&apos;onglet Documents.
          </DialogDescription>
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

        <ScrollArea className="flex-1 -mx-6 px-6">
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
                      {docs.map((docType) => {
                        const tplMeta = SECONDARY_TEMPLATE_CATEGORIES[docType];
                        const isSelected = selected.has(docType);
                        return (
                          <button
                            key={docType}
                            type="button"
                            onClick={() => toggle(docType)}
                            className={cn(
                              "flex items-center gap-3 rounded-md border px-3 py-2 text-left transition hover:bg-gray-50",
                              isSelected
                                ? "border-blue-300 bg-blue-50/40 ring-1 ring-blue-200"
                                : "border-gray-200",
                            )}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggle(docType)}
                              onClick={(e) => e.stopPropagation()}
                              className="flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className="text-sm font-medium text-gray-900 truncate"
                                  title={tplMeta.label}
                                >
                                  {tplMeta.label}
                                </span>
                                {tplMeta.signable && (
                                  <Badge
                                    variant="outline"
                                    className="h-4 text-[9px] bg-amber-50 text-amber-700 border-amber-200 px-1"
                                  >
                                    Signable
                                  </Badge>
                                )}
                              </div>
                              {tplMeta.description && (
                                <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                                  {tplMeta.description}
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
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-2 border-t pt-3 sm:justify-between">
          {/* P11 (code review h-22) : signaler les items sélectionnés filtrés. */}
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
              {submitting
                ? "Attribution…"
                : `Attribuer (${selected.size})`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
