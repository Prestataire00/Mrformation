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
import { summarizeBatchPreviews, type BatchPreviewEntry } from "@/lib/abby/batch";
import {
  runInvoicePushLoop,
  summarizeBatchExecution,
  type PushLoopOutcome,
} from "@/lib/abby/push-loop";

// Récap consolidé + EXÉCUTION du push en lot (stories 5.1 + 5.2, FR-13/14,
// AD-8/14/21/22). À l'ouverture (geste explicite — AD-22), N previews
// STRICTEMENT SÉQUENTIELLES (read-only, AD-21). À la confirmation, exécution
// facture par facture via la boucle avance-saga PARTAGÉE (push-loop.ts) —
// jamais Promise.all, aucune route batch (AD-14) ; les erreurs n'arrêtent pas
// le lot ; récap final actionnable (« Reprendre le push » par échec).

/** Ligne de récap (preview) : consolidable OU encore en cours de résolution. */
type BatchRow = {
  invoiceId: string;
  displayRef: string;
  recipientName: string;
  result: BatchPreviewEntry["result"] | { kind: "loading" };
};

/** État d'exécution d'une facture du lot (`pushing` + résultat terminal). */
type BatchExecState = { kind: "pushing"; step: number } | PushLoopOutcome;

type Phase = "recap" | "executing" | "done";

interface Props {
  /** Factures sélectionnées — null = dialog fermé. */
  invoices: Invoice[] | null;
  onClose: () => void;
  /** Fin de lot / reprise : refetch TabFinances + purge de la sélection. */
  onPushed: () => void;
}

/** Résout la préview d'une facture en résultat consolidable (read-only). */
async function resolvePreview(invoiceId: string): Promise<BatchPreviewEntry["result"]> {
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
      message: ("error" in json && json.error.message) || "Prévisualisation impossible.",
    };
  } catch {
    return { kind: "error", message: "Prévisualisation impossible (réseau)." };
  }
}

export function AbbyBatchPushDialog({ invoices, onClose, onPushed }: Props) {
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [doneCount, setDoneCount] = useState(0);
  const [phase, setPhase] = useState<Phase>("recap");
  const [execStates, setExecStates] = useState<Record<string, BatchExecState>>({});
  const [execProgress, setExecProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [resumingIds, setResumingIds] = useState<Set<string>>(new Set());
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Jeton d'annulation par lot : neutralise les setState d'ops async (previews,
  // exécution, reprises) si le dialog change de sélection / se ferme.
  const runTokenRef = useRef<{ aborted: boolean }>({ aborted: false });

  const total = invoices?.length ?? 0;

  useEffect(() => {
    if (!invoices) return;
    const token = { aborted: false };
    runTokenRef.current = token;
    // Nouveau lot : réinitialiser toutes les phases (previews ET exécution).
    setPhase("recap");
    setExecStates({});
    setExecProgress({ done: 0, total: 0 });
    setResumingIds(new Set());
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
      // ligne dès résolution.
      for (const inv of invoices) {
        if (token.aborted) return;
        const result = await resolvePreview(inv.id);
        if (token.aborted) return;
        setRows((prev) => prev.map((r) => (r.invoiceId === inv.id ? { ...r, result } : r)));
        setDoneCount((c) => c + 1);
      }
    })();
    return () => {
      token.aborted = true;
    };
  }, [invoices]);

  const resolvedEntries = rows.filter(
    (r): r is BatchPreviewEntry => r.result.kind !== "loading",
  );
  const summary = summarizeBatchPreviews(resolvedEntries);
  const isResolving = doneCount < total;
  const readyRows = rows.filter((r) => r.result.kind === "ready");
  const isExecuting = phase === "executing";

  // Exécution séquentielle du lot (AD-14) : une saga complète avant la suivante.
  const handleExecute = async () => {
    // Garde de ré-entrance (symétrique à handleResume) : jamais deux boucles
    // concurrentes sur les mêmes factures légales (double finalisation).
    if (phase !== "recap") return;
    const token = runTokenRef.current;
    const ready = readyRows.map((r) => r.invoiceId);
    if (ready.length === 0) return;
    setPhase("executing");
    setExecProgress({ done: 0, total: ready.length });
    const outcomes: PushLoopOutcome[] = [];
    for (let i = 0; i < ready.length; i++) {
      if (token.aborted) return;
      const id = ready[i];
      // Facture de lot = toujours jamais poussée → départ étape 1 (l'orchestrateur
      // n'émet pas l'étape initiale).
      setExecStates((prev) => ({ ...prev, [id]: { kind: "pushing", step: 1 } }));
      const outcome = await runInvoicePushLoop(id, {
        onStep: (step) => {
          if (!token.aborted) setExecStates((prev) => ({ ...prev, [id]: { kind: "pushing", step } }));
        },
      });
      if (token.aborted) return;
      // Un échec n'arrête JAMAIS le lot : on fige la ligne et on continue.
      setExecStates((prev) => ({ ...prev, [id]: outcome }));
      outcomes.push(outcome);
      setExecProgress({ done: i + 1, total: ready.length });
    }
    if (token.aborted) return;
    setPhase("done");
    onPushed(); // refetch badges + purge sélection
  };

  // Reprise unitaire (3.4) d'une seule facture en échec, depuis le récap final.
  const handleResume = async (id: string) => {
    const token = runTokenRef.current;
    if (resumingIds.has(id)) return; // anti double-submit sur la même facture
    setResumingIds((prev) => new Set(prev).add(id));
    setExecStates((prev) => ({ ...prev, [id]: { kind: "pushing", step: 1 } }));
    const outcome = await runInvoicePushLoop(id, {
      onStep: (step) => {
        if (!token.aborted) setExecStates((prev) => ({ ...prev, [id]: { kind: "pushing", step } }));
      },
    });
    if (token.aborted) return;
    setExecStates((prev) => ({ ...prev, [id]: outcome }));
    setResumingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    onPushed();
  };

  const execSummary = summarizeBatchExecution(
    readyRows.map((r) => execStates[r.invoiceId]).filter((s): s is PushLoopOutcome => !!s && s.kind !== "pushing"),
  );

  const canConfirm = phase === "recap" && !isResolving && summary.readyCount > 0;

  return (
    <Dialog
      open={invoices !== null}
      onOpenChange={(open) => {
        // Verrouillé pendant l'exécution : aucune fermeture jusqu'à la fin.
        if (!open && !isExecuting) onClose();
      }}
    >
      <DialogContent
        className={`max-w-3xl max-h-[90vh] overflow-y-auto max-sm:h-full max-sm:max-h-none max-sm:max-w-full max-sm:rounded-none ${
          isExecuting ? "[&>button]:hidden" : ""
        }`}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          cancelRef.current?.focus();
        }}
        onEscapeKeyDown={(e) => {
          if (isExecuting) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (isExecuting) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (isExecuting) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            Pousser la sélection vers Abby{total > 0 ? ` — ${total} facture${total > 1 ? "s" : ""}` : ""}
          </DialogTitle>
          <DialogDescription>
            {phase === "recap"
              ? "Vérifiez le récapitulatif consolidé avant de confirmer. Rien n'est envoyé à Abby tant que vous n'avez pas confirmé."
              : phase === "executing"
                ? "Push en cours — chaque facture est finalisée l'une après l'autre."
                : "Lot terminé. Reprenez individuellement les factures en échec si besoin."}
          </DialogDescription>
        </DialogHeader>

        {/* Progression annoncée aux lecteurs d'écran (AD-22). */}
        <span aria-live="polite" className="sr-only">
          {isResolving
            ? `Prévisualisation ${doneCount}/${total}…`
            : phase === "executing"
              ? `Push facture ${execProgress.done}/${execProgress.total}…`
              : phase === "done"
                ? `Lot terminé : ${execSummary.finalizedCount} finalisée${execSummary.finalizedCount > 1 ? "s" : ""}, ${execSummary.failedCount} à reprendre`
                : `Récapitulatif prêt : ${total} facture${total > 1 ? "s" : ""}`}
        </span>

        {isResolving && (
          <p className="text-xs text-muted-foreground">Prévisualisation {doneCount}/{total}…</p>
        )}
        {phase === "executing" && (
          <p className="text-xs text-muted-foreground">Push facture {execProgress.done}/{execProgress.total}…</p>
        )}
        {phase === "done" && (
          <p className="text-sm font-medium">
            {execSummary.finalizedCount} finalisée{execSummary.finalizedCount > 1 ? "s" : ""} ·{" "}
            {execSummary.failedCount} à reprendre
          </p>
        )}

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Destinataire</th>
                <th className="px-3 py-2 font-medium text-right">Total TTC</th>
                <th className="px-3 py-2 font-medium text-right">TVA</th>
                <th className="px-3 py-2 font-medium">{phase === "recap" ? "Sort du client" : "Statut push"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const exec = execStates[row.invoiceId];
                return (
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
                          {phase === "recap" ? (
                            row.result.outcome === "to_create" ? (
                              <Badge variant="secondary">Sera créé</Badge>
                            ) : (
                              <Badge variant="outline">Existe déjà</Badge>
                            )
                          ) : (
                            <ExecCell
                              state={exec}
                              resuming={resumingIds.has(row.invoiceId)}
                              onResume={() => handleResume(row.invoiceId)}
                            />
                          )}
                        </td>
                      </>
                    ) : (
                      <td colSpan={3} className="px-3 py-2">
                        <Badge variant="destructive" className="mr-2">
                          {row.result.kind === "blocked" ? "Fiche incomplète" : "Erreur"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {phase === "recap" ? row.result.message : "Non poussée"}
                        </span>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totaux + sort consolidé : uniquement en phase récap. */}
        {phase === "recap" && (
          <>
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
          </>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {phase === "done" ? (
            <Button onClick={onClose}>Fermer</Button>
          ) : (
            <>
              {/* Ordre DOM : Annuler d'abord (focus), CTA en dernier. */}
              <Button ref={cancelRef} variant="outline" onClick={onClose} disabled={isExecuting}>
                Annuler
              </Button>
              <Button onClick={handleExecute} disabled={!canConfirm}>
                {isExecuting
                  ? `Push ${execProgress.done}/${execProgress.total}…`
                  : `Confirmer et pousser (${summary.readyCount})`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Statut d'exécution d'une ligne (phases executing/done). */
function ExecCell({
  state,
  resuming,
  onResume,
}: {
  state: BatchExecState | undefined;
  resuming: boolean;
  onResume: () => void;
}) {
  if (!state) return <span className="text-xs text-muted-foreground">En attente…</span>;
  if (state.kind === "pushing") {
    return <span className="text-xs text-muted-foreground">Étape {state.step}/5…</span>;
  }
  if (state.kind === "finalized") {
    return (
      <Badge variant="outline" className="border-green-300 text-green-700">
        Finalisée{state.number ? ` — ${state.number}` : ""}
      </Badge>
    );
  }
  if (state.kind === "draft_missing") {
    // Renvoi vers le flux unitaire (3.4) : « Repartir de zéro » ne se déclenche
    // jamais silencieusement en lot (effacement de contenu = geste consenti).
    return (
      <div className="space-y-0.5">
        <Badge variant="destructive">Brouillon manquant</Badge>
        <p className="text-[11px] text-muted-foreground">
          Reprenez depuis la ligne de la facture (« Repartir de zéro »).
        </p>
      </div>
    );
  }
  // error → reprise simple possible (le serveur infère l'état intermédiaire).
  return (
    <div className="flex items-center gap-2">
      <Badge variant="destructive">Échec</Badge>
      <Button
        size="sm"
        variant="outline"
        className="h-6 px-2 text-[11px]"
        disabled={resuming}
        onClick={onResume}
      >
        {resuming ? "Reprise…" : "Reprendre le push"}
      </Button>
    </div>
  );
}
