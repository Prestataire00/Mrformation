/**
 * Consolidation PURE du récapitulatif de lot (story 5.1, AC-3).
 *
 * Le lot est une composition CLIENT-SIDE (AD-14) : les N previews sont résolues
 * séquentiellement côté client, puis cette fonction agrège leurs résultats pour
 * l'affichage. AUCUNE I/O, aucun fetch, aucun `Date` — 100 % pure et testable.
 *
 * Les entrées en échec (fiche incomplète `blocked` / erreur) sont EXCLUES des
 * totaux et du décompte clients, mais comptées séparément (`hasBlocking`) pour
 * un avertissement non bloquant — le gérant voit avant de confirmer qu'elles ne
 * partiront pas telles quelles.
 */

/** Une facture du lot, après tentative de préview (issue de `AbbyInvoicePreview`). */
export interface BatchPreviewEntry {
  invoiceId: string;
  displayRef: string;
  recipientName: string;
  result:
    | {
        kind: "ready";
        /** Sort du client facturé (AD-21). */
        outcome: "linked" | "auto_linkable" | "to_create";
        totalHT: number;
        tvaAmount: number;
        totalTTC: number;
        vatExempt: boolean;
        tvaRate: number;
      }
    | { kind: "blocked"; message: string }
    | { kind: "error"; message: string };
}

export interface BatchRecapSummary {
  readyCount: number;
  blockedCount: number;
  errorCount: number;
  /** Clients qui seront créés dans Abby (outcome `to_create`). */
  toCreateCount: number;
  /** Clients déjà présents (outcome `linked`/`auto_linkable`). */
  existingCount: number;
  totalHT: number;
  tvaAmount: number;
  totalTTC: number;
  /** Régime TVA de l'entité (commun à tout le lot — jamais par facture). */
  vatExempt: boolean;
  tvaRate: number;
  /** Au moins une facture ne pourra pas être poussée telle quelle. */
  hasBlocking: boolean;
}

/**
 * Agrège les entrées d'un lot en un récapitulatif consolidé. Reste TOTALE même
 * sans aucune entrée `ready` (que des échecs ou liste vide) : régime par défaut
 * `vatExempt=false`/`tvaRate=0` et totaux à `0` — jamais de non-null assertion.
 */
export function summarizeBatchPreviews(entries: BatchPreviewEntry[]): BatchRecapSummary {
  let readyCount = 0;
  let blockedCount = 0;
  let errorCount = 0;
  let toCreateCount = 0;
  let existingCount = 0;
  let totalHT = 0;
  let tvaAmount = 0;
  let totalTTC = 0;
  // Régime TVA pris de la 1ʳᵉ entrée `ready` (l'entité a un régime unique).
  let vatExempt = false;
  let tvaRate = 0;
  let regimeSet = false;

  for (const entry of entries) {
    const r = entry.result;
    if (r.kind === "ready") {
      readyCount += 1;
      totalHT += r.totalHT;
      tvaAmount += r.tvaAmount;
      totalTTC += r.totalTTC;
      if (r.outcome === "to_create") toCreateCount += 1;
      else existingCount += 1;
      if (!regimeSet) {
        vatExempt = r.vatExempt;
        tvaRate = r.tvaRate;
        regimeSet = true;
      }
    } else if (r.kind === "blocked") {
      blockedCount += 1;
    } else {
      errorCount += 1;
    }
  }

  return {
    readyCount,
    blockedCount,
    errorCount,
    toCreateCount,
    existingCount,
    totalHT,
    tvaAmount,
    totalTTC,
    vatExempt,
    tvaRate,
    hasBlocking: blockedCount + errorCount > 0,
  };
}
