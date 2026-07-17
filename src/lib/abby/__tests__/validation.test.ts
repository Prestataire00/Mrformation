import { describe, it, expect } from "vitest";
import { isPlausibleSiret, validateRecipientForAbby } from "../validation";
import type { AbbyRecipientData } from "@/lib/types/abby";

const COMPANY_COMPLETE: AbbyRecipientData = {
  kind: "organization",
  name: "ACME SAS",
  siret: "12345678900011",
  email: null,
  address: "1 rue du Test",
  postalCode: "13001",
  city: "Marseille",
};

describe("isPlausibleSiret — garde de plausibilité (factorisée depuis 2.1)", () => {
  it("accepte 14 chiffres non tout-zéros, refuse le reste", () => {
    expect(isPlausibleSiret("12345678900011")).toBe(true);
    expect(isPlausibleSiret("1234567")).toBe(false); // tronqué (import)
    expect(isPlausibleSiret("00000000000000")).toBe(false); // placeholder
    expect(isPlausibleSiret(null)).toBe(false);
  });
});

describe("validateRecipientForAbby — politique qualité LMS (to_create uniquement, AD-21)", () => {
  it("company complète : valide", () => {
    const v = validateRecipientForAbby("company", COMPANY_COMPLETE);
    expect(v.valid).toBe(true);
  });

  it("company sans SIRET plausible ni adresse : liste les champs manquants, message actionnable", () => {
    const v = validateRecipientForAbby("company", {
      ...COMPANY_COMPLETE,
      siret: "123", // junk d'import
      address: null,
      postalCode: null,
    });
    expect(v.valid).toBe(false);
    if (!v.valid) {
      expect(v.missingFields).toContain("SIRET (14 chiffres)");
      expect(v.missingFields).toContain("adresse");
      expect(v.missingFields).toContain("code postal");
      expect(v.missingFields).not.toContain("ville");
      expect(v.message).toMatch(/^Compléter la fiche client :/);
    }
  });

  it("financier : nom seul suffit (dette SIRET assumée) ; nom vide → invalide", () => {
    const base: AbbyRecipientData = {
      kind: "organization",
      name: "OPCO Atlas",
      siret: null,
      email: null,
    };
    expect(validateRecipientForAbby("financier", base).valid).toBe(true);
    const v = validateRecipientForAbby("financier", { ...base, name: "" });
    expect(v.valid).toBe(false);
  });

  it("learner : prénom + nom requis, email optionnel", () => {
    const ok: AbbyRecipientData = {
      kind: "contact",
      name: "Marie Dupont",
      siret: null,
      email: null,
      firstName: "Marie",
      lastName: "Dupont",
    };
    expect(validateRecipientForAbby("learner", ok).valid).toBe(true);
    const v = validateRecipientForAbby("learner", { ...ok, lastName: "" });
    expect(v.valid).toBe(false);
    if (!v.valid) expect(v.missingFields).toContain("nom");
  });
});
