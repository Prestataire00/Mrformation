import { Badge, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  isPushResumable,
  isPushFinalized,
  getPushDisabledReason,
  isBatchSelectable,
  getBatchIneligibilityReason,
  canResumeAvoir,
  getAvoirActionReason,
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
  onAbbyDetail: (inv: Invoice) => void;
  /** Sélection de lot (story 5.1) — piloté par TabFinances. */
  selected: boolean;
  onToggleSelect: (inv: Invoice) => void;
  /** État de push de la parente si cette ligne est un avoir (story 5.3), sinon null. */
  avoirParentPushState: string | null;
}

/**
 * Cellule de tête de la sélection de lot (story 5.1) : une Checkbox sur les
 * lignes éligibles au lot (`isBatchSelectable` = bouton unitaire visible ET
 * actif, AD-13), sinon un placeholder focusable avec le motif « pourquoi pas »
 * (UX-DR7 : accessible clavier, pas hover-only). Rendue uniquement quand la
 * Zone Abby est visible (connexion déjà activée).
 */
function BatchSelectCell({
  invoice,
  status,
  selected,
  onToggleSelect,
}: {
  invoice: Invoice;
  status: AbbyConnectionStatus;
  selected: boolean;
  onToggleSelect: (inv: Invoice) => void;
}) {
  if (isBatchSelectable(invoice, status)) {
    return (
      <Checkbox
        checked={selected}
        onCheckedChange={() => onToggleSelect(invoice)}
        aria-label={`Sélectionner la facture ${invoiceDisplayRef(invoice)} pour le lot Abby`}
      />
    );
  }
  const reason = getBatchIneligibilityReason(invoice, status);
  // Non sélectionnable ⇒ motif garanti non null ; garde tsc (reason: string|null).
  if (!reason) return null;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* span focusable : le placeholder doit rester atteignable au clavier */}
          <span
            tabIndex={0}
            aria-label={reason}
            className="inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            —
          </span>
        </TooltipTrigger>
        <TooltipContent>{reason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
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
  avoirParentPushState,
  onAbbyPush,
  onAbbyDetail,
}: {
  invoice: Invoice;
  status: AbbyConnectionStatus;
  /** État de push de la facture parente (avoir uniquement) — story 5.3. */
  avoirParentPushState: string | null;
  onAbbyPush: (inv: Invoice) => void;
  onAbbyDetail: (inv: Invoice) => void;
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
  // Action Abby de la ligne — FACTURE (push/reprise) OU AVOIR (story 5.3, via
  // ses propres prédicats). `label` = texte du bouton ; `active` = cliquable ;
  // `tooltip` = motif si désactivé. Une ligne est soit facture soit avoir.
  let label: string | null = null;
  let active = false;
  let tooltip: string | null = null;
  if (!invoice.is_avoir) {
    label = isPushButtonVisible(invoice)
      ? "Pousser vers Abby"
      : isPushResumable(
            {
              abby_push_state: invoice.abby_push_state,
              abby_push_locked_at: invoice.abby_push_locked_at,
              is_avoir: invoice.is_avoir,
              status: invoice.status,
            },
            new Date()
          )
        ? "Reprendre le push"
        : null;
    if (label !== null) {
      active = status === "active";
      tooltip = active ? null : disabledReason;
    }
  } else {
    const canPush =
      avoirParentPushState === "finalized" &&
      invoice.abby_push_state === null &&
      invoice.status !== "cancelled";
    const canResume = canResumeAvoir(
      {
        is_avoir: invoice.is_avoir,
        abby_push_state: invoice.abby_push_state,
        abby_push_locked_at: invoice.abby_push_locked_at,
        status: invoice.status,
      },
      avoirParentPushState,
      new Date()
    );
    if (canPush || canResume) {
      label = canPush ? "Pousser l'avoir" : "Reprendre l'avoir";
      active = status === "active";
      tooltip = active ? null : disabledReason;
    } else {
      const reason = getAvoirActionReason(
        { abby_push_state: invoice.abby_push_state, status: invoice.status },
        avoirParentPushState
      );
      if (reason !== null) {
        label = "Pousser l'avoir";
        tooltip = reason;
      }
    }
  }

  // Badge cliquable UNIQUEMENT sur une facture finalisée (story 4.1) : le
  // dialog détail n'a rien d'utile à montrer sur un push en cours, et le DOM
  // des autres lignes reste strictement identique.
  const badgeClasses = `${badge.className ?? ""} text-[11px] whitespace-nowrap`;

  return (
    <span className="w-40 shrink-0 flex flex-col items-start gap-1">
      {isPushFinalized(invoice) ? (
        // Les classes du badge sont portées PAR le <button> : un <div>
        // (ce que rend Badge) n'est pas du phrasing content, donc invalide
        // à l'intérieur d'un bouton (review #357)
        <button
          type="button"
          onClick={() => onAbbyDetail(invoice)}
          aria-label={`Détail Abby de la facture ${invoiceDisplayRef(invoice)}`}
          className={`${badgeVariants({ variant: badge.variant ?? "default" })} ${badgeClasses} hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
        >
          {badge.label}
        </button>
      ) : (
        <Badge variant={badge.variant ?? "default"} className={badgeClasses}>
          {badge.label}
        </Badge>
      )}
      {label !== null &&
        (active ? (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px]"
            onClick={() => onAbbyPush(invoice)}
          >
            {label}
          </Button>
        ) : tooltip ? (
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
                    {label}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{tooltip}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null)}
    </span>
  );
}

/** Zone 4 du spec : une ligne de facture lisible. */
export function InvoiceRow({ invoice, abbyConnectionStatus, onAbbyPush, onAbbyDetail, selected, onToggleSelect, avoirParentPushState, ...handlers }: Props) {
  const badge = STATUS_BADGES[invoice.status] ?? STATUS_BADGES.pending;

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
      {/* Cellule de sélection de lot (story 5.1) : présente uniquement quand la
          Zone Abby l'est. Connexion jamais activée → aucune cellule (DOM identique
          à l'existant, FR-8). Non résolue → Skeleton fin, cohérent avec la Zone. */}
      {abbyConnectionStatus === null ? (
        <span className="w-8 shrink-0 flex items-center justify-center">
          <Skeleton className="h-4 w-4" />
        </span>
      ) : isAbbyZoneVisible(abbyConnectionStatus) ? (
        <span className="w-8 shrink-0 flex items-center justify-center">
          <BatchSelectCell
            invoice={invoice}
            status={abbyConnectionStatus}
            selected={selected}
            onToggleSelect={onToggleSelect}
          />
        </span>
      ) : null}
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
        <AbbyZone invoice={invoice} status={abbyConnectionStatus} avoirParentPushState={avoirParentPushState} onAbbyPush={onAbbyPush} onAbbyDetail={onAbbyDetail} />
      ) : null}
      <span className="w-52 shrink-0">
        <InvoiceActionsMenu invoice={invoice} {...handlers} />
      </span>
    </div>
  );
}
