// Helpers d'affichage de l'onglet Finances (fiche formation).
// Fonctions pures — cf. spec docs/superpowers/specs/2026-05-21-page-finances-refonte-design.md

/** Une facture telle que renvoyée par l'API /invoices. */
export interface Invoice {
  id: string;
  recipient_type: string;
  recipient_id: string;
  recipient_name: string;
  amount: number;
  prefix: string;
  number: number;
  global_number: number;
  fiscal_year: number;
  reference: string;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;
  is_avoir: boolean;
  parent_invoice_id: string | null;
  created_at: string;
  reminder_count?: number;
  auto_generated?: boolean;
  external_reference?: string | null;
}

/** Une charge de formation. */
export interface Charge {
  id: string;
  label: string;
  amount: number;
  created_at: string;
}

/** Agrégats financiers renvoyés par l'API /invoices. */
export interface Stats {
  total_invoiced: number;
  total_paid: number;
  total_pending: number;
  total_late: number;
  total_charges: number;
}

/** Identifiant d'une action de ligne de facture. */
export type InvoiceActionId = "pdf" | "email" | "markPaid" | "edit" | "avoir";

export interface InvoiceRowActions {
  /** Action mise en avant (bouton visible). */
  primary: InvoiceActionId;
  /** Actions reléguées au menu « ⋯ ». */
  menu: InvoiceActionId[];
}

/**
 * Action primaire + contenu du menu « ⋯ » d'une facture, selon son statut.
 * Respecte la règle serveur H7 : « edit » n'est proposé que sur les factures
 * `pending`. Cf. spec §4.3.
 */
export function getInvoiceRowActions(
  invoice: Pick<Invoice, "status" | "is_avoir">,
): InvoiceRowActions {
  if (invoice.is_avoir) {
    return { primary: "pdf", menu: ["email"] };
  }
  switch (invoice.status) {
    case "pending":
      return { primary: "email", menu: ["pdf", "markPaid", "edit", "avoir"] };
    case "sent":
    case "late":
      return { primary: "markPaid", menu: ["pdf", "email", "avoir"] };
    case "paid":
      return { primary: "pdf", menu: ["email", "avoir"] };
    case "cancelled":
      return { primary: "pdf", menu: ["email"] };
    default:
      return { primary: "pdf", menu: ["email"] };
  }
}

/**
 * Type de destinataire par défaut à l'ouverture du dialogue de création :
 * entreprise si la formation en a, sinon financeur, sinon apprenant.
 * Cf. spec §4.2.
 */
export function getDefaultRecipientType(formation: {
  formation_companies?: unknown[] | null;
  formation_financiers?: unknown[] | null;
}): "company" | "financier" | "learner" {
  if ((formation.formation_companies ?? []).length > 0) return "company";
  if ((formation.formation_financiers ?? []).length > 0) return "financier";
  return "learner";
}

/** Marge = Facturé − Charges, arrondie à 2 décimales. Cf. spec §4.7. */
export function computeMargin(
  stats: Pick<Stats, "total_invoiced" | "total_charges">,
): number {
  return Math.round((stats.total_invoiced - stats.total_charges) * 100) / 100;
}
