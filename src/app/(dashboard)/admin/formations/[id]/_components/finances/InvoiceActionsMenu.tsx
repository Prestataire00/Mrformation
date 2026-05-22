import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileDown, Send, CheckCircle, Pencil, Undo2, MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import {
  getInvoiceRowActions,
  type InvoiceActionId,
  type Invoice,
} from "@/lib/utils/finances-display";

export interface InvoiceActionHandlers {
  onDownloadPdf: (inv: Invoice) => void;
  onSendEmail: (inv: Invoice) => void;
  onMarkPaid: (inv: Invoice) => void;
  onEdit: (inv: Invoice) => void;
  onCreateAvoir: (inv: Invoice) => void;
}

interface Props extends InvoiceActionHandlers {
  invoice: Invoice;
}

const ACTION_META: Record<
  InvoiceActionId,
  { label: string; short: string; icon: LucideIcon }
> = {
  pdf: { label: "Télécharger le PDF", short: "PDF", icon: FileDown },
  email: { label: "Envoyer par email", short: "Envoyer", icon: Send },
  markPaid: { label: "Marquer payée", short: "Marquer payée", icon: CheckCircle },
  edit: { label: "Modifier", short: "Modifier", icon: Pencil },
  avoir: { label: "Créer un avoir", short: "Créer un avoir", icon: Undo2 },
};

/** Zone 4 du spec : bouton d'action contextuel + menu « ⋯ », adaptés au statut. */
export function InvoiceActionsMenu({ invoice, ...handlers }: Props) {
  const { primary, menu } = getInvoiceRowActions(invoice);

  // Dispatch typé exhaustivement : le Record<InvoiceActionId, …> provoque
  // une erreur de compilation si un id est ajouté à l'union sans handler.
  const run = (id: InvoiceActionId) => {
    const dispatch: Record<InvoiceActionId, () => void> = {
      pdf: () => handlers.onDownloadPdf(invoice),
      email: () => handlers.onSendEmail(invoice),
      markPaid: () => handlers.onMarkPaid(invoice),
      edit: () => handlers.onEdit(invoice),
      avoir: () => handlers.onCreateAvoir(invoice),
    };
    dispatch[id]();
  };

  const PrimaryIcon = ACTION_META[primary].icon;

  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => run(primary)}>
        <PrimaryIcon className="h-3.5 w-3.5 mr-1" />
        {ACTION_META[primary].short}
      </Button>
      {menu.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Plus d'actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {menu.map((id) => {
              const Icon = ACTION_META[id].icon;
              return (
                <DropdownMenuItem key={id} onClick={() => run(id)}>
                  <Icon className="h-4 w-4 mr-2" />
                  {ACTION_META[id].label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
