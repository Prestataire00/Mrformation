import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { InvoiceActionsMenu, type InvoiceActionHandlers } from "./InvoiceActionsMenu";
import { formatCurrency } from "@/lib/utils";
import { invoiceDisplayRef } from "@/lib/utils/invoice-display-ref";
import type { Invoice } from "@/lib/utils/finances-display";
import type { AbbyConnectionStatus } from "@/lib/types/abby";
import {
  isAbbyZoneVisible,
  isPushButtonVisible,
  canPushInvoice,
  getPushDisabledReason,
} from "@/lib/abby/eligibility";
import { deriveAbbyBadge } from "@/lib/abby/invoice-badge";

// hover:bg-* identique au rest state : neutralise le hover:bg-primary/80 du
// variant "default" du Badge shadcn, qui sinon teinte le badge au survol.
const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  pending: { label: "En attente", className: "bg-gray-100 text-gray-700 hover:bg-gray-100" },
  sent: { label: "Envoyée", className: "bg-blue-100 text-blue-700 hover:bg-blue-100" },
  paid: { label: "Payée", className: "bg-green-100 text-green-700 hover:bg-green-100" },
  late: { label: "En retard", className: "bg-red-100 text-red-700 hover:bg-red-100" },
  cancelled: { label: "Annulée", className: "bg-gray-100 text-gray-500 line-through hover:bg-gray-100" },
};

interface Props extends InvoiceActionHandlers {
  invoice: Invoice;
  /** null = état de connexion pas encore résolu (Skeleton sur la zone Abby). */
  abbyConnectionStatus: AbbyConnectionStatus | null;
  onAbbyPush: (inv: Invoice) => void;
}

/**
 * Zone Abby d'une ligne (story abby-3-1) : badge juxtaposé au badge LMS
 * (jamais fusionnés) + bouton « Pousser vers Abby » selon les prédicats
 * d'éligibilité (AD-13). Rendue UNIQUEMENT si l'entité a déjà activé sa
 * connexion — sinon l'UI reste strictement identique (FR-8).
 */
function AbbyZone({
  invoice,
  status,
  onAbbyPush,
}: {
  invoice: Invoice;
  status: AbbyConnectionStatus;
  onAbbyPush: (inv: Invoice) => void;
}) {
  const badge = deriveAbbyBadge(
    {
      abby_push_state: invoice.abby_push_state,
      abby_push_locked_at: invoice.abby_push_locked_at,
      abby_invoice_number: invoice.abby_invoice_number,
      abby_state: invoice.abby_state,
      abby_last_error: invoice.abby_last_error,
    },
    new Date()
  );
  const disabledReason = getPushDisabledReason(status);

  return (
    <span className="w-40 shrink-0 flex flex-col items-start gap-1">
      <Badge
        variant={badge.variant ?? "default"}
        className={`${badge.className ?? ""} text-[11px] whitespace-nowrap`}
      >
        {badge.label}
      </Badge>
      {isPushButtonVisible(invoice) &&
        (canPushInvoice(invoice, status) ? (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px]"
            onClick={() => onAbbyPush(invoice)}
          >
            Pousser vers Abby
          </Button>
        ) : disabledReason ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* span focusable : un <button disabled> ne reçoit pas le
                    focus — le tooltip doit rester accessible au clavier */}
                <span tabIndex={0} className="inline-block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px] pointer-events-none"
                    disabled
                  >
                    Pousser vers Abby
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{disabledReason}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null)}
    </span>
  );
}

/** Zone 4 du spec : une ligne de facture lisible. */
export function InvoiceRow({ invoice, abbyConnectionStatus, onAbbyPush, ...handlers }: Props) {
  const badge = STATUS_BADGES[invoice.status] ?? STATUS_BADGES.pending;

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
      <span className="font-mono text-xs text-muted-foreground w-24 shrink-0">
        {invoiceDisplayRef(invoice)}
      </span>
      <span className="flex-1 min-w-0 flex items-center gap-1.5">
        <span className="font-medium text-sm text-gray-900 truncate">
          {invoice.recipient_name}
        </span>
        {invoice.is_avoir && (
          <Badge variant="outline" className="shrink-0 text-[10px] border-purple-300 text-purple-600">
            AV
          </Badge>
        )}
      </span>
      <span
        className={`text-sm font-semibold w-24 text-right shrink-0 ${
          invoice.is_avoir ? "text-purple-600" : "text-gray-900"
        }`}
      >
        {formatCurrency(invoice.amount)}
      </span>
      <span className="w-36 shrink-0">
        <Badge className={`${badge.className} text-[11px]`}>{badge.label}</Badge>
        {invoice.due_date && (
          <span className="block text-[11px] text-muted-foreground mt-0.5">
            échéance {new Date(invoice.due_date).toLocaleDateString("fr-FR")}
          </span>
        )}
      </span>
      {abbyConnectionStatus === null ? (
        <span className="w-40 shrink-0">
          <Skeleton className="h-5 w-24" />
        </span>
      ) : isAbbyZoneVisible(abbyConnectionStatus) ? (
        <AbbyZone invoice={invoice} status={abbyConnectionStatus} onAbbyPush={onAbbyPush} />
      ) : null}
      <span className="w-52 shrink-0">
        <InvoiceActionsMenu invoice={invoice} {...handlers} />
      </span>
    </div>
  );
}
