import { describe, it, expect } from "vitest";
import {
  MIN_COMPANY_QUERY_LENGTH,
  isCompanyQueryValid,
} from "../company-search-query";

describe("company-search-query — contrat data.gouv (≥ 3 caractères)", () => {
  it("le minimum est 3 (contrat recherche-entreprises.api.gouv.fr)", () => {
    // Garde-fou : data.gouv renvoie 400 en deçà. Ne pas redescendre à 2 (régression
    // du bug post-migration Pappers → data.gouv).
    expect(MIN_COMPANY_QUERY_LENGTH).toBe(3);
  });

  it("rejette 2 caractères (cas 'ia' → 400 data.gouv)", () => {
    expect(isCompanyQueryValid("ia")).toBe(false);
  });

  it("rejette une requête vide / espaces / null / undefined", () => {
    expect(isCompanyQueryValid("")).toBe(false);
    expect(isCompanyQueryValid("  ")).toBe(false);
    expect(isCompanyQueryValid(null)).toBe(false);
    expect(isCompanyQueryValid(undefined)).toBe(false);
  });

  it("rejette 2 caractères entourés d'espaces (le trim ne doit pas gonfler la longueur)", () => {
    expect(isCompanyQueryValid("  ia  ")).toBe(false);
  });

  it("accepte 3 caractères et plus", () => {
    expect(isCompanyQueryValid("iai")).toBe(true);
    expect(isCompanyQueryValid("manpower")).toBe(true);
    expect(isCompanyQueryValid("adecco arles")).toBe(true);
  });

  it("accepte un SIRET (14 chiffres)", () => {
    expect(isCompanyQueryValid("99882350431782")).toBe(true);
  });
});
