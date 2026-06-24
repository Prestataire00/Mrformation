import { describe, it, expect } from "vitest";
import { isUsableImageResponse } from "@/lib/devis/logo-loader";

/**
 * Bug C3V : le logo `/logo-c3v-formation.png` est absent → `fetch` renvoie un
 * 404 (sans throw) → l'ancien code passait le corps du 404 (HTML) à
 * `jsPDF.addImage(..., "PNG")`, qui plantait → « impossible de générer le devis ».
 *
 * `isUsableImageResponse` ne valide le logo QUE si la réponse est ok ET de type
 * image → sinon on génère le devis sans logo (au lieu de planter).
 */
describe("isUsableImageResponse", () => {
  it("true pour une vraie image (ok + content-type image/*)", () => {
    expect(isUsableImageResponse(true, "image/png")).toBe(true);
    expect(isUsableImageResponse(true, "image/jpeg")).toBe(true);
    expect(isUsableImageResponse(true, "IMAGE/PNG")).toBe(true); // insensible à la casse
  });

  it("false sur 404 (logo absent) — le cas C3V", () => {
    expect(isUsableImageResponse(false, "text/html")).toBe(false);
  });

  it("false si 200 mais pas une image (fallback SPA / page HTML)", () => {
    expect(isUsableImageResponse(true, "text/html")).toBe(false);
    expect(isUsableImageResponse(true, "application/json")).toBe(false);
  });

  it("false si content-type absent", () => {
    expect(isUsableImageResponse(true, null)).toBe(false);
  });
});
