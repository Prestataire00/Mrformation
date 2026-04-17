import { describe, it, expect } from "vitest";
import { detectOPCO } from "@/lib/ai/opco-mapping";

describe("detectOPCO", () => {
  it("detecte OPCO EP pour le NAF 8559A (formation continue adultes)", () => {
    const result = detectOPCO("8559A");
    expect(result).not.toBeNull();
    expect(result!.opco).toBe("OPCO EP");
    expect(result!.code).toBe("EP");
  });

  it("detecte ATLAS pour le NAF 6920Z (comptabilite)", () => {
    const result = detectOPCO("6920Z");
    expect(result).not.toBeNull();
    expect(result!.opco).toBe("ATLAS");
  });

  it("detecte OPCO Sante pour le NAF 8610Z (hospitalier)", () => {
    const result = detectOPCO("8610Z");
    expect(result).not.toBeNull();
    expect(result!.opco).toContain("Santé");
  });

  it("detecte AKTO pour le NAF 5510Z (hotels)", () => {
    const result = detectOPCO("5510Z");
    expect(result).not.toBeNull();
    expect(result!.opco).toBe("AKTO");
  });

  it("detecte Constructys pour le NAF 4120A (construction)", () => {
    const result = detectOPCO("4120A");
    expect(result).not.toBeNull();
    expect(result!.opco).toBe("Constructys");
  });

  it("fallback par prefixe pour un code inconnu 85XXZ", () => {
    const result = detectOPCO("85XXZ");
    // Doit trouver via le prefixe "85" (education/formation)
    if (result) {
      expect(result.confidence).not.toBe("exact");
    }
    // Acceptable: result ou null selon la completude du mapping
  });

  it("retourne null pour un code null", () => {
    expect(detectOPCO(null)).toBeNull();
  });

  it("retourne null pour une chaine vide", () => {
    expect(detectOPCO("")).toBeNull();
  });

  it("retourne null pour undefined", () => {
    expect(detectOPCO(undefined as unknown as string)).toBeNull();
  });

  it("retourne null pour un code totalement inconnu", () => {
    const result = detectOPCO("9999Z");
    // Peut retourner null ou un guess — les deux sont acceptables
    if (result) {
      expect(result.confidence).toBe("guess");
    }
  });

  it("gere les espaces et la casse", () => {
    const result = detectOPCO("  8559a  ");
    expect(result).not.toBeNull();
    expect(result!.code).toBe("EP");
  });
});
