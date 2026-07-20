"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";
import { invoiceDisplayRef } from "@/lib/utils/invoice-display-ref";
import { ABBY_INVOICE_NOT_FOUND_MESSAGE } from "@/lib/abby/invoice-badge";
import { canRecordPaymentInLms } from "@/lib/abby/eligibility";
import type { Invoice } from "@/lib/utils/finances-display";

// Dialog détail Abby (story 4.1, UX-DR6). N'affiche QUE des données
// persistées : aucun appel réseau à l'ouverture — le geste de fraîcheur est
// le bouton « Actualiser le statut Abby » (tout-manuel, AD-22).

interface Props {
  /** Facture finalisée à détailler — null = dialog fermé. */
  invoice: Invoice | null;
  onClose: () => void;
  /** Refetch TabFinances après actualisation (le badge peut changer). */
  onRefreshed: () => void;
}

function formatDateTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Une ligne « libellé : valeur », masquée si la valeur est absente. */
function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

/** Réponse de la dernière actualisation — prime sur le snapshot de props. */
interface FreshStatus {
  state: string | null;
  syncedAt: string;
  paidAt: string | null;
  finalizedAt: string | null;
  notFound: boolean;
}

export function AbbyInvoiceDetailDialog({ invoice, onClose, onRefreshed }: Props) {
  const { toast } = useToast();
  const [refreshing, setRefreshing] = useState(false);
  // ⚠️ `invoice` est un SNAPSHOT pris à l'ouverture : le refetch de
  // TabFinances ne le re-synchronise pas. La réponse de la route est donc
  // conservée ici et PRIME sur les props (sinon le bandeau « Introuvable »
  // et la nouvelle date d'actualisation n'apparaîtraient qu'après
  // fermeture/réouverture — review #357).
  const [fresh, setFresh] = useState<FreshStatus | null>(null);
  // Story 4.2 : le dialog ne voit PAS le refetch parent (snapshot) et
  // FreshStatus ne porte aucun statut LMS → mémoriser l'enregistrement ici,
  // sinon le bouton resterait et le 2ᵉ clic partirait en 409.
  const [recordedPaidAt, setRecordedPaidAt] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "confirmPayment">("view");
  const [recording, setRecording] = useState(false);
  const invoiceId = invoice?.id ?? null;
  useEffect(() => {
    setFresh(null);
    setRecordedPaidAt(null);
    setMode("view");
  }, [invoiceId]);

  const handleRefresh = async () => {
    if (!invoice) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/abby/invoices/${invoice.id}/status`, {
        method: "POST",
      });
      const json = (await res.json()) as
        | { status: FreshStatus }
        | { error: { message: string } };
      if (res.ok && "status" in json) {
        setFresh(json.status);
        toast({
          title: json.status.notFound
            ? "Facture introuvable chez Abby"
            : "Statut Abby actualisé",
          description: json.status.notFound
            ? "La dernière donnée connue reste affichée."
            : undefined,
        });
      } else {
        toast({
          title: "Actualisation impossible",
          description: "error" in json ? json.error.message : undefined,
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Actualisation impossible", variant: "destructive" });
    } finally {
      setRefreshing(false);
      // Toute issue rafraîchit la ligne : les colonnes abby_* ont pu changer
      onRefreshed();
    }
  };

  const handleRecordPayment = async () => {
    if (!invoice) return;
    setRecording(true);
    try {
      const res = await fetch(`/api/abby/invoices/${invoice.id}/record-payment`, {
        method: "POST",
      });
      const json = (await res.json()) as
        | { payment: { paidAt: string; state: string | null } }
        | { error: { message: string } };
      if (res.ok && "payment" in json) {
        setRecordedPaidAt(json.payment.paidAt);
        setMode("view");
        toast({
          title: "Paiement enregistré dans le LMS",
          description: `Date de paiement : ${formatDateTime(json.payment.paidAt) ?? json.payment.paidAt}`,
        });
      } else {
        setMode("view");
        toast({
          title: "Enregistrement impossible",
          description: "error" in json ? json.error.message : undefined,
          variant: "destructive",
        });
      }
    } catch {
      setMode("view");
      toast({ title: "Enregistrement impossible", variant: "destructive" });
    } finally {
      setRecording(false);
      onRefreshed();
    }
  };

  const syncedAt = formatDateTime(fresh?.syncedAt ?? invoice?.abby_synced_at ?? null);
  // Égalité stricte sur la constante partagée (jamais un `includes` sur un
  // texte dupliqué) ; la réponse fraîche prime sur la colonne persistée
  const isNotFound =
    fresh?.notFound ??
    invoice?.abby_last_error === ABBY_INVOICE_NOT_FOUND_MESSAGE;
  const paidAtDisplay = fresh && !fresh.notFound ? fresh.paidAt : invoice?.abby_paid_at ?? null;
  const finalizedAtDisplay =
    fresh && !fresh.notFound ? fresh.finalizedAt : invoice?.abby_finalized_at ?? null;
  const lastErrorDisplay = fresh ? (fresh.notFound ? ABBY_INVOICE_NOT_FOUND_MESSAGE : null) : invoice?.abby_last_error ?? null;
  // Le chemin notFound PRÉSERVE `state` : sans ce garde, une facture
  // disparue d'Abby garderait abby_state='paid' → action fantôme (404 au clic)
  const effectiveAbbyState =
    fresh && !fresh.notFound ? fresh.state : invoice?.abby_state ?? null;
  const canRecordPayment =
    invoice !== null &&
    !isNotFound &&
    recordedPaidAt === null &&
    canRecordPaymentInLms({
      abby_push_state: invoice.abby_push_state,
      abby_state: effectiveAbbyState,
      status: invoice.status,
      is_avoir: invoice.is_avoir,
    });

  return (
    <Dialog open={invoice !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto max-sm:h-full max-sm:max-h-none max-sm:max-w-full max-sm:rounded-none">
        <DialogHeader>
          <DialogTitle>
            Détail Abby{invoice ? ` — ${invoiceDisplayRef(invoice)}` : ""}
          </DialogTitle>
          <DialogDescription>
            Données enregistrées lors du dernier échange avec Abby.
          </DialogDescription>
        </DialogHeader>

        {invoice && (
          <div className="space-y-3">
            {isNotFound && (
              <Alert variant="destructive">
                <AlertTitle>Introuvable chez Abby</AlertTitle>
                <AlertDescription>
                  Cette facture n&apos;existe plus dans Abby. Les informations
                  ci-dessous sont les dernières connues.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5 rounded-md border p-3">
              <DetailRow label="Numéro Abby" value={invoice.abby_invoice_number} />
              <DetailRow label="Finalisée le" value={formatDateTime(finalizedAtDisplay)} />
              <DetailRow label="Payée le (Abby)" value={formatDateTime(paidAtDisplay)} />
              <DetailRow label="Poussée le" value={formatDateTime(invoice.abby_pushed_at)} />
              <DetailRow
                label="Payée dans le LMS le"
                value={formatDateTime(recordedPaidAt)}
              />
              <div className="flex justify-between gap-4 text-sm">
                <span className="text-muted-foreground">Dernière actualisation</span>
                <span className="font-medium text-right">
                  {syncedAt ?? "jamais actualisée"}
                </span>
              </div>
            </div>

            {lastErrorDisplay && !isNotFound && (
              <Alert variant="destructive">
                <AlertTitle>Dernière erreur</AlertTitle>
                <AlertDescription>
                  {lastErrorDisplay}
                  {syncedAt ? ` (le ${syncedAt})` : ""}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Confirmation simple : bascule de CONTENU, jamais un second modal
            (UX-DR12) */}
        {mode === "confirmPayment" && (
          <Alert>
            <AlertTitle>Enregistrer le paiement dans le LMS ?</AlertTitle>
            <AlertDescription>
              Cette facture sera marquée payée dans le LMS à la date de paiement
              enregistrée par Abby.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {mode === "confirmPayment" ? (
            <>
              <Button variant="outline" onClick={() => setMode("view")} disabled={recording}>
                Annuler
              </Button>
              <Button onClick={handleRecordPayment} disabled={recording}>
                {recording && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirmer le paiement
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={refreshing}>
                Fermer
              </Button>
              {canRecordPayment && (
                <Button variant="outline" onClick={() => setMode("confirmPayment")} disabled={refreshing}>
                  Enregistrer le paiement dans le LMS
                </Button>
              )}
              <Button onClick={handleRefresh} disabled={refreshing}>
                {refreshing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Actualiser le statut Abby
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
