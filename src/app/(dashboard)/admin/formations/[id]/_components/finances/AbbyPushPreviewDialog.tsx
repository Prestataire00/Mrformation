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
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/utils";
import type { Invoice } from "@/lib/utils/finances-display";
import type {
  AbbyInvoicePreview,
  AbbyPreviewError,
  AbbyPushStepOutcome,
} from "@/lib/types/abby";

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

/** Libellés des 5 étapes (2 = exemple verbatim EXPERIENCE.md). */
const STEP_LABELS: Record<number, string> = {
  1: "résolution du client…",
  2: "création de la facture…",
  3: "envoi des lignes…",
  4: "dates et mentions…",
  5: "finalisation…",
};

/** État curseur retourné → numéro de la PROCHAINE étape à exécuter. */
const STATE_TO_NEXT_STEP: Record<string, number> = {
  pushing: 2,
  draft_created: 3,
  lines_set: 4,
  details_set: 5,
};

type PushUiState =
  | { kind: "idle" }
  | { kind: "pushing"; step: number }
  | { kind: "success"; number: string | null }
  | { kind: "pushError"; message: string };

interface Props {
  /** Facture à prévisualiser — null = dialog fermé. */
  invoice: Invoice | null;
  onClose: () => void;
  /** Refetch TabFinances (badge de ligne) après toute issue de push. */
  onPushed: () => void;
}

export function AbbyPushPreviewDialog({ invoice, onClose, onPushed }: Props) {
  const { entity } = useEntity();
  const { toast } = useToast();
  const [state, setState] = useState<PreviewState>({ kind: "loading" });
  const [push, setPush] = useState<PushUiState>({ kind: "idle" });
  const cancelRef = useRef<HTMLButtonElement>(null);

  const invoiceId = invoice?.id ?? null;
  useEffect(() => {
    if (!invoiceId) return;
    let stale = false;
    setState({ kind: "loading" });
    setPush({ kind: "idle" });
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
  const isPushing = push.kind === "pushing";

  // Boucle avance-saga (AD-8) : un POST = une étape, jusqu'à done ou erreur.
  // Toute issue (succès OU erreur) refetch TabFinances — le badge de ligne
  // reflète l'état persisté réel.
  const handleConfirm = async () => {
    if (!invoiceId) return;
    setPush({ kind: "pushing", step: 1 });
    try {
      for (;;) {
        const res = await fetch(`/api/abby/invoices/${invoiceId}/push`, { method: "POST" });
        const json = (await res.json()) as
          | { step: AbbyPushStepOutcome }
          | { error: AbbyPreviewError };
        if (!res.ok || !("step" in json)) {
          setPush({
            kind: "pushError",
            message:
              ("error" in json && json.error.message) || "Le push a échoué.",
          });
          onPushed();
          return;
        }
        if (json.step.done) {
          setPush({ kind: "success", number: json.step.abbyInvoiceNumber ?? null });
          toast({
            title: "Facture finalisée dans Abby",
            description: json.step.abbyInvoiceNumber
              ? `Numéro Abby : ${json.step.abbyInvoiceNumber}`
              : undefined,
          });
          onPushed();
          return;
        }
        setPush({ kind: "pushing", step: STATE_TO_NEXT_STEP[json.step.state] ?? 5 });
      }
    } catch {
      setPush({
        kind: "pushError",
        message: "Le push a été interrompu (réseau). Vous pourrez le reprendre.",
      });
      onPushed();
    }
  };

  return (
    <Dialog
      open={invoice !== null}
      onOpenChange={(open) => {
        // Verrouillé pendant le push : aucune fermeture jusqu'à l'issue (UX-DR4)
        if (!open && !isPushing) onClose();
      }}
    >
      <DialogContent
        className={`max-w-2xl max-h-[90vh] overflow-y-auto max-sm:h-full max-sm:max-h-none max-sm:max-w-full max-sm:rounded-none ${
          isPushing ? "[&>button]:hidden" : ""
        }`}
        onOpenAutoFocus={(e) => {
          // Focus initial sur « Annuler » (l'action sûre) — UX-DR4
          e.preventDefault();
          cancelRef.current?.focus();
        }}
        onEscapeKeyDown={(e) => {
          if (isPushing) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (isPushing) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (isPushing) e.preventDefault();
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

            {push.kind === "success" ? (
              <Alert>
                <AlertTitle>
                  Finalisée{push.number ? ` — Abby : ${push.number}` : ""}
                </AlertTitle>
                <AlertDescription>
                  La facture est désormais légale et numérotée par Abby.
                </AlertDescription>
              </Alert>
            ) : (
              <p className="text-sm font-medium">{LEGAL_WORDING}</p>
            )}

            {push.kind === "pushError" && (
              <Alert variant="destructive">
                <AlertTitle>Le push n'a pas abouti</AlertTitle>
                <AlertDescription>{push.message}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Progression réelle annoncée aux lecteurs d'écran (UX-DR5) */}
        <span aria-live="polite" className="sr-only">
          {isPushing && push.kind === "pushing"
            ? `Étape ${push.step}/5 — ${STEP_LABELS[push.step]}`
            : push.kind === "success"
              ? `Finalisée${push.number ? ` — Abby : ${push.number}` : ""}`
              : ""}
        </span>

        <DialogFooter className="gap-2 sm:gap-0">
          {/* Ordre DOM : Annuler d'abord, CTA en dernier — Tab atteint le CTA en dernier */}
          {push.kind === "success" ? (
            <Button onClick={onClose}>Fermer</Button>
          ) : (
            <>
              <Button
                ref={cancelRef}
                variant="outline"
                onClick={onClose}
                disabled={isPushing}
              >
                {push.kind === "pushError" ? "Fermer" : "Annuler"}
              </Button>
              {preview && push.kind !== "pushError" && (
                <Button onClick={handleConfirm} disabled={isPushing}>
                  {push.kind === "pushing"
                    ? `Étape ${push.step}/5 — ${STEP_LABELS[push.step]}`
                    : "Confirmer et finaliser"}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
