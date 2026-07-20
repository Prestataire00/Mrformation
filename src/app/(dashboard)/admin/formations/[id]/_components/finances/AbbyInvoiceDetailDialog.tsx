"use client";

import { useState } from "react";
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

export function AbbyInvoiceDetailDialog({ invoice, onClose, onRefreshed }: Props) {
  const { toast } = useToast();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!invoice) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/abby/invoices/${invoice.id}/status`, {
        method: "POST",
      });
      const json = (await res.json()) as
        | { status: { notFound: boolean; state: string | null } }
        | { error: { message: string } };
      if (res.ok && "status" in json) {
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

  const syncedAt = formatDateTime(invoice?.abby_synced_at ?? null);
  const isNotFound = Boolean(invoice?.abby_last_error?.includes("introuvable chez Abby"));

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
              <DetailRow label="Finalisée le" value={formatDateTime(invoice.abby_finalized_at)} />
              <DetailRow label="Payée le (Abby)" value={formatDateTime(invoice.abby_paid_at)} />
              <DetailRow label="Poussée le" value={formatDateTime(invoice.abby_pushed_at)} />
              <div className="flex justify-between gap-4 text-sm">
                <span className="text-muted-foreground">Dernière actualisation</span>
                <span className="font-medium text-right">
                  {syncedAt ?? "jamais actualisée"}
                </span>
              </div>
            </div>

            {invoice.abby_last_error && !isNotFound && (
              <Alert variant="destructive">
                <AlertTitle>Dernière erreur</AlertTitle>
                <AlertDescription>
                  {invoice.abby_last_error}
                  {syncedAt ? ` (le ${syncedAt})` : ""}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={refreshing}>
            Fermer
          </Button>
          <Button onClick={handleRefresh} disabled={refreshing}>
            {refreshing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Actualiser le statut Abby
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
