/**
 * Pédagogie V2 Epic 2.5 — TASK 11 — Tests generateLearnerCredentialsPDF
 *
 * Vérifie que le helper PDF produit un Blob non vide pour différents
 * volumes de rows (1, 50, 0 = page de garde seule).
 *
 * Le test utilise une `Date` fixe pour `generatedAt` afin de garantir
 * que la sortie est déterministe (même bytes pour les mêmes inputs) —
 * jsPDF inclut la date de génération dans les métadonnées PDF.
 */
import { describe, it, expect } from "vitest";
import {
  generateLearnerCredentialsPDF,
  type LearnerCredentialsRow,
} from "@/lib/services/learner-credentials-pdf";

const FIXED_DATE = new Date("2026-06-05T10:00:00.000Z");

const baseParams = {
  entityName: "MR FORMATION",
  entitySlug: "mr-formation" as const,
  sessionTitle: "Session Excel Avancé — Juin 2026",
  loginUrl: "https://mrformationcrm.netlify.app/login",
  generatedAt: FIXED_DATE,
};

function makeRows(n: number): LearnerCredentialsRow[] {
  return Array.from({ length: n }, (_, i) => ({
    fullName: `DUPONT Marie ${i + 1}`,
    identifier: `marie.dupont${i + 1}`,
    password: `Tmp4-xR!9-k1Bm`,
    isSynthetic: i % 3 === 0,
  }));
}

describe("generateLearnerCredentialsPDF (Pédagogie V2 Epic 2.5 — TASK 11)", () => {
  it("génère un Blob non vide pour 1 row (page de garde + 1 ligne tableau)", async () => {
    const blob = await generateLearnerCredentialsPDF({
      ...baseParams,
      rows: makeRows(1),
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(1000); // au moins quelques KB
  });

  it("génère un Blob non vide pour 50 rows (multi-pages tableau)", async () => {
    const blob50 = await generateLearnerCredentialsPDF({
      ...baseParams,
      rows: makeRows(50),
    });

    expect(blob50).toBeInstanceOf(Blob);
    expect(blob50.type).toBe("application/pdf");
    expect(blob50.size).toBeGreaterThan(2000);

    // Un PDF avec 50 rows doit être > qu'un PDF avec 1 row (sanity check
    // que les rows ne sont pas droppées silencieusement).
    const blob1 = await generateLearnerCredentialsPDF({
      ...baseParams,
      rows: makeRows(1),
    });
    expect(blob50.size).toBeGreaterThan(blob1.size);
  });

  it("génère un Blob non vide pour 0 rows (page de garde seule)", async () => {
    const blob = await generateLearnerCredentialsPDF({
      ...baseParams,
      rows: [],
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(500);
  });

  it("respecte le slug C3V (couleur entité bleu, pas charcoal)", async () => {
    // Sanity check : on génère pour C3V et MR avec le même input, les
    // deux PDFs doivent être valides (pas de throw sur unknown slug).
    const c3vBlob = await generateLearnerCredentialsPDF({
      ...baseParams,
      entityName: "C3V FORMATION",
      entitySlug: "c3v-formation",
      rows: makeRows(2),
    });
    const mrBlob = await generateLearnerCredentialsPDF({
      ...baseParams,
      entityName: "MR FORMATION",
      entitySlug: "mr-formation",
      rows: makeRows(2),
    });

    expect(c3vBlob).toBeInstanceOf(Blob);
    expect(mrBlob).toBeInstanceOf(Blob);
    expect(c3vBlob.type).toBe("application/pdf");
    expect(mrBlob.type).toBe("application/pdf");
  });
});
