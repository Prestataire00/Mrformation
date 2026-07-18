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
import { useEntity } from "@/contexts/EntityContext";
import { formatCurrency } from "@/lib/utils";
import type { Invoice } from "@/lib/utils/finances-display";
import type { AbbyInvoicePreview, AbbyPreviewError } from "@/lib/types/abby";

// Dialog de prévisualisation du push (FR-9, AD-21). La préview est LA
// confirmation : pas de second dialog par-dessus (un seul niveau de modal).
// Le fetch part À L'OUVERTURE (geste utilisateur — AD-22 conforme).

const RECIPIENT_TYPE_LABELS: Record<string, string> = {
  learner: "Apprenant",
  company: "Entreprise",
  financier: "Financeur",
};

/** Wording légal verbatim — EXPERIENCE.md § Voice and Tone. */
const LEGAL_WORDING =
  "Cette action émet une facture légale, numérotée par Abby. Elle ne pourra plus être modifiée ni supprimée.";

type PreviewState =
  | { kind: "loading" }
  | { kind: "ready"; preview: AbbyInvoicePreview }
  | { kind: "blocked"; message: string; missingFields: string[] }
  | { kind: "error"; message: string };

interface Props {
  /** Facture à prévisualiser — null = dialog fermé. */
  invoice: Invoice | null;
  onClose: () => void;
}

export function AbbyPushPreviewDialog({ invoice, onClose }: Props) {
  const { entity } = useEntity();
  const [state, setState] = useState<PreviewState>({ kind: "loading" });
  const cancelRef = useRef<HTMLButtonElement>(null);

  const invoiceId = invoice?.id ?? null;
  useEffect(() => {
    if (!invoiceId) return;
    let stale = false;
    setState({ kind: "loading" });
    (async () => {
      try {
        const res = await fetch(`/api/abby/invoices/${invoiceId}/preview`);
        const json = (await res.json()) as
          | { preview: AbbyInvoicePreview }
          | { error: AbbyPreviewError };
        if (stale) return;
        if (res.ok && "preview" in json) {
          setState({ kind: "ready", preview: json.preview });
        } else if ("error" in json && json.error.code === "abby_validation") {
          setState({
            kind: "blocked",
            message: json.error.message,
            missingFields: json.error.missingFields ?? [],
          });
        } else {
          setState({
            kind: "error",
            message:
              ("error" in json && json.error.message) ||
              "Impossible de charger la prévisualisation.",
          });
        }
      } catch {
        if (!stale) {
          setState({
            kind: "error",
            message: "Impossible de charger la prévisualisation.",
          });
        }
      }
    })();
    return () => {
      stale = true;
    };
  }, [invoiceId]);

  const themeColor = entity?.theme_color ?? "#374151";
  const preview = state.kind === "ready" ? state.preview : null;

  return (
    <Dialog open={invoice !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto max-sm:h-full max-sm:max-h-none max-sm:max-w-full max-sm:rounded-none"
        onOpenAutoFocus={(e) => {
          // Focus initial sur « Annuler » (l'action sûre) — UX-DR4
          e.preventDefault();
          cancelRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            Pousser vers Abby{preview ? ` — ${preview.invoice.displayRef}` : ""}
          </DialogTitle>
          <DialogDescription>
            Vérifiez ce qui sera finalisé dans Abby avant de confirmer.
          </DialogDescription>
        </DialogHeader>

        {state.kind === "loading" && (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-16 w-2/3" />
          </div>
        )}

        {state.kind === "error" && (
          <Alert variant="destructive">
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}

        {state.kind === "blocked" && (
          <Alert variant="destructive">
            <AlertTitle>Fiche client incomplète</AlertTitle>
            <AlertDescription>
              <p>{state.message}</p>
              {state.missingFields.length > 0 && (
                <ul className="list-disc pl-5 mt-2">
                  {state.missingFields.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
              <p className="mt-2">
                Complétez la fiche du destinataire puis rouvrez la prévisualisation.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {preview && (
          <div className="space-y-4">
            {/* Entité émettrice — garde-fou anti-inversion : NOM résolu serveur,
                couleur d'entité côté client */}
            <div
              className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium border-l-4"
              style={{ borderLeftColor: themeColor }}
            >
              Émise par {preview.entity.name}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                {RECIPIENT_TYPE_LABELS[preview.recipient.type] ?? "Destinataire"} :
              </span>
              <span className="font-medium">{preview.recipient.name}</span>
              {preview.recipient.outcome === "to_create" ? (
                <Badge variant="secondary">Sera créé dans Abby</Badge>
              ) : (
                <Badge variant="outline">Existe déjà dans Abby</Badge>
              )}
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Désignation</th>
                    <th className="px-3 py-2 font-medium text-right">Qté</th>
                    <th className="px-3 py-2 font-medium text-right">PU HT</th>
                    <th className="px-3 py-2 font-medium text-right">TVA</th>
                    <th className="px-3 py-2 font-medium text-right">Total HT</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.lines.map((line, idx) => (
                    <tr key={idx} className="border-b last:border-0">
                      <td className="px-3 py-2">{line.description}</td>
                      <td className="px-3 py-2 text-right">{line.quantity}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(line.unitPriceHT)}</td>
                      <td className="px-3 py-2 text-right">
                        {preview.totals.vatExempt ? "Exonérée" : `${preview.totals.tvaRate} %`}
                      </td>
                      <td className="px-3 py-2 text-right">{formatCurrency(line.totalHT)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totaux alignés à droite, parité PDF (pas de ligne TVA si exonérée) */}
            <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total HT</span>
                <span className="font-medium">{formatCurrency(preview.totals.totalHT)}</span>
              </div>
              {!preview.totals.vatExempt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    TVA ({preview.totals.tvaRate} %)
                  </span>
                  <span className="font-medium">{formatCurrency(preview.totals.tvaAmount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1 text-base font-semibold">
                <span>Total TTC</span>
                <span>{formatCurrency(preview.totals.totalTTC)}</span>
              </div>
            </div>

            {preview.totals.exonerationMention && (
              <p className="text-xs italic text-muted-foreground">
                {preview.totals.exonerationMention}
              </p>
            )}

            <p className="text-sm font-medium">{LEGAL_WORDING}</p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {/* Ordre DOM : Annuler d'abord, CTA en dernier — Tab atteint le CTA en dernier */}
          <Button ref={cancelRef} variant="outline" onClick={onClose}>
            Annuler
          </Button>
          {preview && (
            <div className="flex flex-col items-end gap-1">
              {/* CTA désactivé en 3.2 : le câblage saga arrive en 3.3 — un CTA
                  actif répondant « bientôt » sur un acte légal serait trompeur */}
              <Button disabled>Confirmer et finaliser</Button>
              <span className="text-xs text-muted-foreground">
                Le push arrive dans la prochaine mise à jour.
              </span>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
