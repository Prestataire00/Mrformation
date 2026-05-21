import type { Session, Enrollment } from "@/lib/types";
import {
  getLearnersForCompany,
  getFormationKind,
} from "@/lib/utils/formation-companies";

/**
 * Helpers facturation multi-entreprises (PR 14).
 *
 * Distinction INTRA / INTER :
 *  - INTRA : 1 ligne globale.
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
  amountHT: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface InvoiceRecipient {
  type: "company" | "financier" | "learner";
  id: string;
  amount: number;
}

/**
 * Génère les lignes d'une facture selon le type de formation et le
 * destinataire. Fonction PURE — source de vérité unique. Cf. spec
 * docs/superpowers/specs/2026-05-21-facturation-lignes-unifiees-design.md
 *
 * - learner                    → 1 ligne nominative.
 * - company/financier, Inter   → 1 ligne par participant (split équitable,
 *                                 reste d'arrondi absorbé sur la dernière).
 * - company/financier, Intra / unset / 0 participant → 1 ligne globale.
 *
 * Ne lève jamais d'exception : tout cas dégénéré produit 1 ligne cohérente.
 */
export function buildInvoiceLines(
  formation: Session,
  recipient: InvoiceRecipient,
): InvoiceBuildResult {
  const titre = formation.title || "Formation";
  const desc = `Formation : ${titre}`;
  const nom = (e: Enrollment): string => {
    if (!e.learner) return "";
    return `${e.learner.last_name?.toUpperCase() ?? ""} ${e.learner.first_name ?? ""}`.trim();
  };

  // ── Apprenant : 1 ligne nominative ──
  if (recipient.type === "learner") {
    const enr = (formation.enrollments ?? []).find((e) => e.learner?.id === recipient.id);
    const description = enr?.learner ? `${desc} — ${nom(enr)}` : desc;
    return {
      lines: [{ description, quantity: 1, unit_price: recipient.amount }],
      amountHT: round2(recipient.amount),
    };
  }

  // ── Entreprise / Financeur ──
  const participants =
    recipient.type === "company"
      ? getLearnersForCompany(formation, recipient.id)
      : (formation.enrollments ?? []);
  const realParticipants = participants.filter((e) => e.learner);

  // INTER avec ≥ 1 apprenant réel → 1 ligne par participant.
  if (getFormationKind(formation) === "inter" && realParticipants.length >= 1) {
    const n = realParticipants.length;
    const base = round2(recipient.amount / n);
    const reste = round2(recipient.amount - round2(base * n));
    const lines: InvoiceLineDraft[] = realParticipants.map((e, idx) => ({
      description: `${desc} — ${nom(e)}`,
      quantity: 1,
      unit_price: idx === n - 1 ? round2(base + reste) : base,
    }));
    return {
      lines,
      amountHT: round2(lines.reduce((s, l) => s + l.quantity * l.unit_price, 0)),
    };
  }

  // INTRA / unset / 0 participant → 1 ligne globale.
  return {
    lines: [{ description: desc, quantity: 1, unit_price: recipient.amount }],
    amountHT: round2(recipient.amount),
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
