import { describe, it, expect } from "vitest";

// Test the scoring logic without Supabase dependency
// The actual function is async and depends on Supabase, so we test the scoring algorithm logic

interface ScoreInput {
  source: string | null;
  amount: number | null;
  company_name: string;
  siret: string | null;
  email: string | null;
  phone: string | null;
}

// Extracted scoring logic for testability (mirrors calculateLeadScore from lead-scoring.ts)
function computeBaseScore(prospect: ScoreInput, interactions: number, hasSentQuote: boolean): number {
  let score = 0;

  // Source scoring (max 20)
  const sourceScores: Record<string, number> = {
    partner: 20, referral: 20, website: 15, social: 10, event: 10,
    email: 5, phone: 5, other: 5,
  };
  if (prospect.source) score += sourceScores[prospect.source] || 5;

  // Contact completeness
  if (prospect.siret) score += 5;
  if (prospect.email) score += 5;
  if (prospect.phone) score += 5;

  // Amount scoring (max 20)
  if (prospect.amount && prospect.amount > 5000) score += 20;
  else if (prospect.amount && prospect.amount > 2000) score += 10;
  else if (prospect.amount && prospect.amount > 0) score += 5;

  // Interactions (3 pts each, max 15)
  score += Math.min(interactions * 3, 15);

  // Quote sent
  if (hasSentQuote) score += 10;

  return Math.min(Math.max(score, 0), 100);
}

describe("prospect scoring", () => {
  it("prospect vide a un score faible", () => {
    const score = computeBaseScore(
      { source: null, amount: null, company_name: "Corp", siret: null, email: null, phone: null },
      0, false
    );
    expect(score).toBeLessThan(20);
  });

  it("ajoute des points pour le SIRET", () => {
    const without = computeBaseScore(
      { source: null, amount: null, company_name: "Corp", siret: null, email: null, phone: null },
      0, false
    );
    const with_ = computeBaseScore(
      { source: null, amount: null, company_name: "Corp", siret: "12345678901234", email: null, phone: null },
      0, false
    );
    expect(with_).toBeGreaterThan(without);
  });

  it("ajoute des points pour email + phone", () => {
    const without = computeBaseScore(
      { source: null, amount: null, company_name: "Corp", siret: null, email: null, phone: null },
      0, false
    );
    const with_ = computeBaseScore(
      { source: null, amount: null, company_name: "Corp", siret: null, email: "a@b.com", phone: "0600000000" },
      0, false
    );
    expect(with_ - without).toBeGreaterThanOrEqual(10);
  });

  it("ajoute des points pour les interactions", () => {
    const without = computeBaseScore(
      { source: null, amount: null, company_name: "Corp", siret: null, email: null, phone: null },
      0, false
    );
    const with_ = computeBaseScore(
      { source: null, amount: null, company_name: "Corp", siret: null, email: null, phone: null },
      3, false
    );
    expect(with_ - without).toBeGreaterThanOrEqual(9);
  });

  it("ajoute des points pour un devis envoye", () => {
    const without = computeBaseScore(
      { source: null, amount: null, company_name: "Corp", siret: null, email: null, phone: null },
      0, false
    );
    const with_ = computeBaseScore(
      { source: null, amount: null, company_name: "Corp", siret: null, email: null, phone: null },
      0, true
    );
    expect(with_ - without).toBeGreaterThanOrEqual(10);
  });

  it("ne depasse jamais 100", () => {
    const score = computeBaseScore(
      { source: "partner", amount: 10000, company_name: "Corp", siret: "12345678901234", email: "a@b.com", phone: "06" },
      10, true
    );
    expect(score).toBeLessThanOrEqual(100);
  });

  it("est toujours >= 0", () => {
    const score = computeBaseScore(
      { source: null, amount: null, company_name: "", siret: null, email: null, phone: null },
      0, false
    );
    expect(score).toBeGreaterThanOrEqual(0);
  });
});
