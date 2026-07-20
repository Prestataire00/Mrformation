// Dérivation colonnes abby_* → badge de ligne : LA fonction pure unique
// (convention UI du spine). Le type d'entrée n'a AUCUN champ optionnel —
// tout appelant doit fournir chaque colonne, et toute query à select
// explicite doit utiliser ABBY_INVOICE_SELECT (les select strings sont
// invisibles pour tsc ; le test du fragment est le garde-fou runtime).

/** Colonnes nécessaires au badge — source unique du fragment ET du type. */
const ABBY_BADGE_COLUMNS = [
  "abby_push_state",
  "abby_push_locked_at",
  "abby_invoice_number",
  "abby_state",
  "abby_last_error",
] as const;

export type AbbyInvoiceBadgeInput = Record<
  (typeof ABBY_BADGE_COLUMNS)[number],
  string | null
>;

/** Fragment de select partagé (convention UI) — superset garanti par test. */
export const ABBY_INVOICE_SELECT: string = ABBY_BADGE_COLUMNS.join(", ");

/** Seuil de fraîcheur du verrou de push (AD-7) : 2 minutes. */
export const ABBY_PUSH_LOCK_TTL_MS = 2 * 60 * 1000;

/**
 * Message persisté dans `abby_last_error` quand la facture a disparu chez
 * Abby (story 4.1). Partagé service ↔ UI : le bandeau « Introuvable chez
 * Abby » compare par ÉGALITÉ à cette constante — jamais par `includes` sur
 * un texte dupliqué (une reformulation casserait le bandeau en silence).
 */
export const ABBY_INVOICE_NOT_FOUND_MESSAGE = "Facture introuvable chez Abby.";

/**
 * Descripteur d'affichage : `variant` shadcn standard, OU `className`
 * reprenant les classes exactes des badges LMS existants (relevé QO-4,
 * InvoiceRow.STATUS_BADGES) — jamais les deux, jamais de couleur nouvelle.
 */
export interface AbbyBadgeDescriptor {
  label: string;
  variant: "outline" | "secondary" | "destructive" | null;
  className: string | null;
}

/**
 * Table de dérivation (fixée en story 3.1, priorités dans l'ordre) :
 * payée > finalisée > jamais poussée > verrou frais > erreur > interrompue.
 * `now` est un paramètre : la fonction reste pure et testable.
 */
export function deriveAbbyBadge(
  input: AbbyInvoiceBadgeInput,
  now: Date
): AbbyBadgeDescriptor {
  if (input.abby_state === "paid") {
    return {
      label: "Payée (Abby)",
      variant: null,
      className: "bg-green-100 text-green-700 hover:bg-green-100",
    };
  }

  if (input.abby_push_state === "finalized") {
    return {
      label: input.abby_invoice_number
        ? `Finalisée · ${input.abby_invoice_number}`
        : "Finalisée",
      variant: null,
      className: "bg-blue-100 text-blue-700 hover:bg-blue-100",
    };
  }

  if (input.abby_push_state === null) {
    return { label: "Non poussée", variant: "outline", className: null };
  }

  // État intermédiaire (pushing | draft_created | lines_set | details_set).
  // Verrou frais = un push est activement en cours (autre onglet compris) —
  // prioritaire sur une erreur résiduelle : le curseur est séparé de
  // l'erreur (AD-6), abby_last_error n'écrase jamais la position.
  const lockedAt = input.abby_push_locked_at
    ? Date.parse(input.abby_push_locked_at)
    : null;
  const lockIsFresh =
    lockedAt !== null &&
    !Number.isNaN(lockedAt) &&
    now.getTime() - lockedAt < ABBY_PUSH_LOCK_TTL_MS;

  if (lockIsFresh) {
    return { label: "Push en cours", variant: "secondary", className: null };
  }

  if (input.abby_last_error !== null) {
    return { label: "Erreur", variant: "destructive", className: null };
  }

  return {
    label: "Interrompue — à reprendre",
    variant: "secondary",
    className: null,
  };
}
