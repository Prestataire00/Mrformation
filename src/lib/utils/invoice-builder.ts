import type { Session } from "@/lib/types";
import {
  getLearnersForCompany,
  getAmountForCompany,
  isIntraFormation,
  getCompaniesForFormation,
} from "@/lib/utils/formation-companies";

/**
 * Helpers facturation multi-entreprises (PR 14).
 *
 * Distinction INTRA / INTER :
 *  - INTRA : 1 ligne globale + participantsNote listant tous les apprenants.
 *  - INTER : N lignes (1 par apprenant de cette entreprise), unit_price = amount / N.
 *
 * Réutilise les helpers de PR 13 (formation-companies.ts).
 */

export interface InvoiceLineDraft {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface InvoiceBuildResult {
  lines: InvoiceLineDraft[];
  participantsNote: string | null;
  amountHT: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildInvoiceLinesForCompany(formation: Session, companyId: string): InvoiceBuildResult {
  const companies = getCompaniesForFormation(formation);
  const company = companies.find((c) => c.client_id === companyId);
  if (!company) {
    throw new Error(`Entreprise ${companyId} introuvable pour cette formation`);
  }

  const amount = getAmountForCompany(formation, companyId);
  if (amount === null) {
    throw new Error(`Le montant pour cette entreprise n'est pas défini`);
  }

  const learners = getLearnersForCompany(formation, companyId);
  const title = formation.title || "Formation";
  const description = `Formation : ${title}`;

  // INTRA : 1 ligne globale + participantsNote
  if (isIntraFormation(formation)) {
    const participantsNote = learners.length > 0
      ? `Participants : ${learners
          .filter((e) => e.learner)
          .map((e) => `${e.learner!.last_name?.toUpperCase()} ${e.learner!.first_name}`)
          .join(", ")}`
      : null;

    return {
      lines: [{ description, quantity: 1, unit_price: amount }],
      participantsNote,
      amountHT: amount,
    };
  }

  // INTER : N lignes par apprenant, split équitable
  if (learners.length === 0) {
    throw new Error(`Aucun apprenant rattaché à cette entreprise pour cette formation`);
  }

  // Split équitable : on arrondit chaque ligne à 2 décimales et on absorbe le reste
  // sur la dernière ligne pour que la somme = amount exactement.
  const baseUnit = round2(amount / learners.length);
  const totalBeforeAdjust = round2(baseUnit * learners.length);
  const adjustment = round2(amount - totalBeforeAdjust);

  const lines: InvoiceLineDraft[] = learners
    .filter((e) => e.learner)
    .map((e, idx, arr) => {
      const isLast = idx === arr.length - 1;
      const unit = isLast ? round2(baseUnit + adjustment) : baseUnit;
      return {
        description: `${description} — ${e.learner!.last_name?.toUpperCase()} ${e.learner!.first_name}`,
        quantity: 1,
        unit_price: unit,
      };
    });

  const amountHT = round2(lines.reduce((s, l) => s + l.quantity * l.unit_price, 0));

  return {
    lines,
    participantsNote: null,
    amountHT,
  };
}

export function calculateInvoiceTotals(
  lines: InvoiceLineDraft[],
  vatRate: number,
  isExempt: boolean
): { amountHT: number; vatAmount: number; amountTTC: number } {
  const amountHT = round2(lines.reduce((s, l) => s + l.quantity * l.unit_price, 0));
  const vatAmount = isExempt ? 0 : round2(amountHT * (vatRate / 100));
  const amountTTC = round2(amountHT + vatAmount);
  return { amountHT, vatAmount, amountTTC };
}
