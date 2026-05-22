import { Badge } from "@/components/ui/badge";
import { InvoiceActionsMenu, type InvoiceActionHandlers } from "./InvoiceActionsMenu";
import { formatCurrency } from "@/lib/utils";
import type { Invoice } from "@/lib/utils/finances-display";

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
}

/** Zone 4 du spec : une ligne de facture lisible. */
export function InvoiceRow({ invoice, ...handlers }: Props) {
  const badge = STATUS_BADGES[invoice.status] ?? STATUS_BADGES.pending;

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
      <span className="font-mono text-xs text-muted-foreground w-24 shrink-0">
        {invoice.reference}
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
      <span className="w-52 shrink-0">
        <InvoiceActionsMenu invoice={invoice} {...handlers} />
      </span>
    </div>
  );
}
