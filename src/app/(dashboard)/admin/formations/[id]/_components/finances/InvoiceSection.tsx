import { InvoiceRow } from "./InvoiceRow";
import type { InvoiceActionHandlers } from "./InvoiceActionsMenu";
import { formatCurrency } from "@/lib/utils";
import type { Invoice } from "@/lib/utils/finances-display";
import type { AbbyConnectionStatus } from "@/lib/types/abby";

interface Props extends InvoiceActionHandlers {
  title: string;
  icon: string;
  /** Factures déjà filtrées sur ce type de destinataire. */
  invoices: Invoice[];
  /** null = état de connexion Abby pas encore résolu (Skeleton). */
  abbyConnectionStatus: AbbyConnectionStatus | null;
  onAbbyPush: (inv: Invoice) => void;
  onAbbyDetail: (inv: Invoice) => void;
  /** Sélection de lot (story 5.1) — globale à TabFinances, passée à chaque ligne. */
  selectedIds: Set<string>;
  onToggleSelect: (inv: Invoice) => void;
}

/** Zone 3 du spec : section par type. Masquée (`null`) si aucune facture. */
export function InvoiceSection({ title, icon, invoices, abbyConnectionStatus, onAbbyPush, onAbbyDetail, selectedIds, onToggleSelect, ...handlers }: Props) {
  if (invoices.length === 0) return null;

  // Total = factures hors avoirs (cohérent avec les KPIs).
  const total = invoices
    .filter((i) => !i.is_avoir)
    .reduce((sum, i) => sum + i.amount, 0);

  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-2 border-b-2 border-gray-200 pb-1.5">
        <h3 className="text-sm font-bold text-gray-800">
          <span aria-hidden="true">{icon} </span>{title}
        </h3>
        <span className="text-xs font-medium text-muted-foreground">
          {invoices.length} facture{invoices.length > 1 ? "s" : ""}
        </span>
        <span className="ml-auto text-sm font-semibold text-gray-600">
          {formatCurrency(total)}
        </span>
      </div>
      {invoices.map((inv) => (
        <InvoiceRow
          key={inv.id}
          invoice={inv}
          abbyConnectionStatus={abbyConnectionStatus}
          onAbbyPush={onAbbyPush}
          onAbbyDetail={onAbbyDetail}
          selected={selectedIds.has(inv.id)}
          onToggleSelect={onToggleSelect}
          {...handlers}
        />
      ))}
    </div>
  );
}
