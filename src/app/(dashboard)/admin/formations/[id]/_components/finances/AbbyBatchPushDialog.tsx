"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/utils";
import { invoiceDisplayRef } from "@/lib/utils/invoice-display-ref";
import type { Invoice } from "@/lib/utils/finances-display";
import type { AbbyInvoicePreview, AbbyPreviewError } from "@/lib/types/abby";
import {
  summarizeBatchPreviews,
  type BatchPreviewEntry,
} from "@/lib/abby/batch";

// Récapitulatif consolidé du push en lot (story 5.1, FR-13/14, AD-14/21/22).
// À l'ouverture (geste explicite = clic sur la barre d'action, AD-22), le
// dialog résout N previews STRICTEMENT SÉQUENTIELLES côté client (jamais
// Promise.all — AD-14). AUCUNE écriture : les previews sont read-only (AD-21).
// L'exécution du lot est la story 5.2 → le CTA reste DÉSACTIVÉ ici.

const CTA_HELP =
  "L'exécution séquentielle du lot arrive dans la prochaine mise à jour.";

/** Ligne du récap : une entrée consolidable OU encore en cours de résolution. */
type BatchRow = {
  invoiceId: string;
  displayRef: string;
  recipientName: string;
  result: BatchPreviewEntry["result"] | { kind: "loading" };
};

interface Props {
  /** Factures sélectionnées à récapituler — null = dialog fermé. */
  invoices: Invoice[] | null;
  onClose: () => void;
  /** Réservé story 5.2 (exécution du lot) — non câblé ici. */
  onConfirmed: () => void;
}

/** Résout la préview d'une facture en résultat consolidable (read-only). */
async function resolvePreview(
  invoiceId: string,
): Promise<BatchPreviewEntry["result"]> {
  try {
    const res = await fetch(`/api/abby/invoices/${invoiceId}/preview`);
    const json = (await res.json()) as
      | { preview: AbbyInvoicePreview }
      | { error: AbbyPreviewError };
    if (res.ok && "preview" in json) {
      const p = json.preview;
      return {
        kind: "ready",
        outcome: p.recipient.outcome,
        totalHT: p.totals.totalHT,
        tvaAmount: p.totals.tvaAmount,
        totalTTC: p.totals.totalTTC,
        vatExempt: p.totals.vatExempt,
        tvaRate: p.totals.tvaRate,
      };
    }
    if ("error" in json && json.error.code === "abby_validation") {
      return { kind: "blocked", message: json.error.message };
    }
    return {
      kind: "error",
      message:
        ("error" in json && json.error.message) ||
        "Prévisualisation impossible.",
    };
  } catch {
    return { kind: "error", message: "Prévisualisation impossible (réseau)." };
  }
}

export function AbbyBatchPushDialog({ invoices, onClose, onConfirmed }: Props) {
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [doneCount, setDoneCount] = useState(0);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const total = invoices?.length ?? 0;

  useEffect(() => {
    if (!invoices) return;
    let stale = false;
    setDoneCount(0);
    setRows(
      invoices.map((inv) => ({
        invoiceId: inv.id,
        displayRef: invoiceDisplayRef(inv),
        recipientName: inv.recipient_name,
        result: { kind: "loading" as const },
      })),
    );
    (async () => {
      // SÉQUENTIEL (AD-14) : jamais Promise.all. Chaque préview met à jour sa
      // ligne dès qu'elle est résolue (progression incrémentale visible).
      for (const inv of invoices) {
        if (stale) return;
        const result = await resolvePreview(inv.id);
        if (stale) return;
        setRows((prev) =>
          prev.map((r) => (r.invoiceId === inv.id ? { ...r, result } : r)),
        );
        setDoneCount((c) => c + 1);
      }
    })();
    return () => {
      // Fermeture pendant la résolution : abandon propre, zéro effet de bord.
      stale = true;
    };
  }, [invoices]);

  const resolvedEntries = rows.filter(
    (r): r is BatchPreviewEntry => r.result.kind !== "loading",
  );
  const summary = summarizeBatchPreviews(resolvedEntries);
  const isResolving = doneCount < total;

  return (
    <Dialog open={invoices !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto max-sm:h-full max-sm:max-h-none max-sm:max-w-full max-sm:rounded-none"
        onOpenAutoFocus={(e) => {
          // Focus initial sur « Annuler » (l'action sûre).
          e.preventDefault();
          cancelRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            Pousser la sélection vers Abby{total > 0 ? ` — ${total} facture${total > 1 ? "s" : ""}` : ""}
          </DialogTitle>
          <DialogDescription>
            Vérifiez le récapitulatif consolidé avant de confirmer. Rien n&apos;est
            envoyé à Abby tant que vous n&apos;avez pas confirmé.
          </DialogDescription>
        </DialogHeader>

        {/* Progression de résolution annoncée aux lecteurs d'écran (AD-22). */}
        <span aria-live="polite" className="sr-only">
          {isResolving ? `Prévisualisation ${doneCount}/${total}…` : `Récapitulatif prêt : ${total} facture${total > 1 ? "s" : ""}`}
        </span>

        {isResolving && (
          <p className="text-xs text-muted-foreground">Prévisualisation {doneCount}/{total}…</p>
        )}

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Destinataire</th>
                <th className="px-3 py-2 font-medium text-right">Total TTC</th>
                <th className="px-3 py-2 font-medium text-right">TVA</th>
                <th className="px-3 py-2 font-medium">Sort du client</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.invoiceId} className="border-b last:border-0 align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{row.recipientName}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{row.displayRef}</div>
                  </td>
                  {row.result.kind === "loading" ? (
                    <td colSpan={3} className="px-3 py-2">
                      <Skeleton className="h-4 w-40" />
                    </td>
                  ) : row.result.kind === "ready" ? (
                    <>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(row.result.totalTTC)}</td>
                      <td className="px-3 py-2 text-right">
                        {row.result.vatExempt ? "Exonérée" : `${row.result.tvaRate} %`}
                      </td>
                      <td className="px-3 py-2">
                        {row.result.outcome === "to_create" ? (
                          <Badge variant="secondary">Sera créé</Badge>
                        ) : (
                          <Badge variant="outline">Existe déjà</Badge>
                        )}
                      </td>
                    </>
                  ) : (
                    <td colSpan={3} className="px-3 py-2">
                      <Badge variant="destructive" className="mr-2">
                        {row.result.kind === "blocked" ? "Fiche incomplète" : "Erreur"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{row.result.message}</span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totaux du lot (résolus uniquement) + sort consolidé des clients. */}
        <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total HT</span>
            <span className="font-medium">{formatCurrency(summary.totalHT)}</span>
          </div>
          {!summary.vatExempt && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">TVA ({summary.tvaRate} %)</span>
              <span className="font-medium">{formatCurrency(summary.tvaAmount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-1 text-base font-semibold">
            <span>Total TTC</span>
            <span>{formatCurrency(summary.totalTTC)}</span>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          {summary.toCreateCount} client{summary.toCreateCount > 1 ? "s" : ""} ser
          {summary.toCreateCount > 1 ? "ont" : "a"} créé{summary.toCreateCount > 1 ? "s" : ""} dans Abby,{" "}
          {summary.existingCount} existe{summary.existingCount > 1 ? "nt" : ""} déjà.
        </p>

        {summary.hasBlocking && (
          <Alert variant="destructive">
            <AlertTitle>
              {summary.blockedCount + summary.errorCount} facture
              {summary.blockedCount + summary.errorCount > 1 ? "s" : ""} ne pourr
              {summary.blockedCount + summary.errorCount > 1 ? "ont" : "a"} pas être poussée
              {summary.blockedCount + summary.errorCount > 1 ? "s" : ""} telle
              {summary.blockedCount + summary.errorCount > 1 ? "s" : ""} quelle
              {summary.blockedCount + summary.errorCount > 1 ? "s" : ""}
            </AlertTitle>
            <AlertDescription>
              Complétez la fiche des destinataires concernés puis rouvrez le récapitulatif.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {/* Ordre DOM : Annuler d'abord (focus), CTA en dernier. */}
          <Button ref={cancelRef} variant="outline" onClick={onClose}>
            Annuler
          </Button>
          {/* CTA désactivé en 5.1 — l'exécution séquentielle est câblée en 5.2. */}
          <span className="inline-flex flex-col items-stretch gap-1 sm:items-end">
            <Button onClick={onConfirmed} disabled title={CTA_HELP}>
              Confirmer et pousser ({summary.readyCount})
            </Button>
            <span className="text-[11px] text-muted-foreground">{CTA_HELP}</span>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
