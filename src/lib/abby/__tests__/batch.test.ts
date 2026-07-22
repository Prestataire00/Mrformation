import { describe, it, expect } from "vitest";
import { summarizeBatchPreviews, type BatchPreviewEntry } from "../batch";

let seq = 0;
function ready(
  outcome: "linked" | "auto_linkable" | "to_create",
  totalHT: number,
  tvaAmount: number,
  totalTTC: number,
  vatExempt: boolean,
  tvaRate: number,
): BatchPreviewEntry {
  seq += 1;
  return {
    invoiceId: `inv-${seq}`,
    displayRef: `FAC-26-${seq}`,
    recipientName: `Client ${seq}`,
    result: { kind: "ready", outcome, totalHT, tvaAmount, totalTTC, vatExempt, tvaRate },
  };
}
function blocked(): BatchPreviewEntry {
  seq += 1;
  return { invoiceId: `inv-${seq}`, displayRef: `FAC-26-${seq}`, recipientName: `Client ${seq}`, result: { kind: "blocked", message: "Fiche client incomplète" } };
}
function errored(): BatchPreviewEntry {
  seq += 1;
  return { invoiceId: `inv-${seq}`, displayRef: `FAC-26-${seq}`, recipientName: `Client ${seq}`, result: { kind: "error", message: "Erreur réseau" } };
}

describe("summarizeBatchPreviews — consolidation du récapitulatif de lot (story 5.1)", () => {
  it("lot 3 factures prêtes (2 à créer + 1 existante, assujetti 20 %) → totaux sommés + décompte clients", () => {
    const s = summarizeBatchPreviews([
      ready("to_create", 1000, 200, 1200, false, 20),
      ready("to_create", 500, 100, 600, false, 20),
      ready("linked", 2000, 400, 2400, false, 20),
    ]);
    expect(s.readyCount).toBe(3);
    expect(s.toCreateCount).toBe(2);
    expect(s.existingCount).toBe(1);
    expect(s.totalHT).toBe(3500);
    expect(s.tvaAmount).toBe(700);
    expect(s.totalTTC).toBe(4200);
    expect(s.vatExempt).toBe(false);
    expect(s.tvaRate).toBe(20);
    expect(s.hasBlocking).toBe(false);
  });

  it("auto_linkable compte comme « existant » (déjà dans Abby)", () => {
    const s = summarizeBatchPreviews([ready("auto_linkable", 100, 20, 120, false, 20)]);
    expect(s.existingCount).toBe(1);
    expect(s.toCreateCount).toBe(0);
  });

  it("lot mixte (1 prête + 1 bloquée + 1 en erreur) → échecs exclus des totaux et du décompte, hasBlocking=true", () => {
    const s = summarizeBatchPreviews([
      ready("to_create", 1000, 200, 1200, false, 20),
      blocked(),
      errored(),
    ]);
    expect(s.readyCount).toBe(1);
    expect(s.blockedCount).toBe(1);
    expect(s.errorCount).toBe(1);
    expect(s.hasBlocking).toBe(true);
    // Totaux et décompte ne tiennent QUE la facture prête.
    expect(s.totalHT).toBe(1000);
    expect(s.tvaAmount).toBe(200);
    expect(s.totalTTC).toBe(1200);
    expect(s.toCreateCount).toBe(1);
    expect(s.existingCount).toBe(0);
  });

  it("lot 100 % exonéré → vatExempt=true, TVA nulle", () => {
    const s = summarizeBatchPreviews([
      ready("to_create", 800, 0, 800, true, 0),
      ready("linked", 200, 0, 200, true, 0),
    ]);
    expect(s.vatExempt).toBe(true);
    expect(s.tvaRate).toBe(0);
    expect(s.tvaAmount).toBe(0);
    expect(s.totalHT).toBe(1000);
    expect(s.totalTTC).toBe(1000);
  });

  it("lot sans aucune facture prête (que des échecs) → fonction totale : totaux 0, régime par défaut, hasBlocking=true", () => {
    const s = summarizeBatchPreviews([blocked(), errored()]);
    expect(s.readyCount).toBe(0);
    expect(s.totalHT).toBe(0);
    expect(s.tvaAmount).toBe(0);
    expect(s.totalTTC).toBe(0);
    expect(s.vatExempt).toBe(false);
    expect(s.tvaRate).toBe(0);
    expect(s.toCreateCount).toBe(0);
    expect(s.existingCount).toBe(0);
    expect(s.hasBlocking).toBe(true);
  });

  it("liste vide → tout à zéro, hasBlocking=false", () => {
    const s = summarizeBatchPreviews([]);
    expect(s.readyCount).toBe(0);
    expect(s.totalHT).toBe(0);
    expect(s.hasBlocking).toBe(false);
  });
});
