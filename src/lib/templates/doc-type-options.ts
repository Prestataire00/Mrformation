/**
 * Options du select d'import (admin/documents/import/page.tsx).
 *
 * Combine :
 *   - Les doc_types système (depuis OFFICIAL_TEMPLATES dérivé du registry)
 *   - Les extras non-générables : facture, devis, autre (free-text autorisé)
 *
 * Note : la liste actuelle inline dans import/page.tsx contient aussi
 * "convention_apprenant" qui n'existe pas dans le registry. On l'exclut
 * volontairement de cette liste dérivée — l'option "autre" permet le
 * free-text si besoin d'un type custom.
 */

import { OFFICIAL_TEMPLATES } from "./official-templates";

const EXTRA_DOC_TYPES: { value: string; label: string }[] = [
  { value: "facture", label: "Facture" },
  { value: "devis", label: "Devis" },
  { value: "autre", label: "Autre" },
];

export const DOC_TYPE_OPTIONS: { value: string; label: string }[] = [
  ...OFFICIAL_TEMPLATES.map((t) => ({ value: t.id, label: t.name })),
  ...EXTRA_DOC_TYPES,
];
