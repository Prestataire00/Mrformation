import { describe, it, expect } from "vitest";
import { parseAvoirAmount } from "../avoir";

describe("parseAvoirAmount", () => {
  it("accepte un avoir partiel valide (parent 1000, saisie 300 → 300)", () => {
    const res = parseAvoirAmount("300", 1000);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.amount).toBe(300);
  });

  it("accepte le montant plein par défaut (montant === parent)", () => {
    const res = parseAvoirAmount("1000", 1000);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.amount).toBe(1000);
  });

  it("refuse un montant supérieur au parent (1200 > 1000)", () => {
    const res = parseAvoirAmount("1200", 1000);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("≤");
  });

  it("refuse un montant nul", () => {
    const res = parseAvoirAmount("0", 1000);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("> 0");
  });

  it("refuse un montant négatif", () => {
    const res = parseAvoirAmount("-5", 1000);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("> 0");
  });

  it("refuse une saisie vide", () => {
    const res = parseAvoirAmount("", 1000);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Montant invalide");
  });

  it("refuse une saisie composée uniquement d'espaces", () => {
    const res = parseAvoirAmount("   ", 1000);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Montant invalide");
  });

  it("refuse une saisie non numérique (« abc »)", () => {
    const res = parseAvoirAmount("abc", 1000);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Montant invalide");
  });

  it("interprète la virgule décimale (« 299,50 » → 299.5)", () => {
    const res = parseAvoirAmount("299,50", 1000);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.amount).toBe(299.5);
  });

  it("accepte le point décimal (« 299.50 » → 299.5)", () => {
    const res = parseAvoirAmount("299.50", 1000);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.amount).toBe(299.5);
  });

  it("arrondit à 2 décimales (« 100.999 » → 101)", () => {
    const res = parseAvoirAmount("100.999", 1000);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.amount).toBe(101);
  });

  it("compare sur la valeur absolue d'un parent négatif (parent -1000, saisie 300 → 300)", () => {
    const res = parseAvoirAmount("300", -1000);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.amount).toBe(300);
  });

  it("refuse un montant qui dépasse la valeur absolue d'un parent négatif", () => {
    const res = parseAvoirAmount("1200", -1000);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("≤");
  });

  it("accepte tout juste la borne haute après arrondi (parent 299.5, saisie « 299,50 »)", () => {
    const res = parseAvoirAmount("299,50", 299.5);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.amount).toBe(299.5);
  });

  it("gère le séparateur de milliers FR (« 1 000 » → 1000, pas 1)", () => {
    const res = parseAvoirAmount("1 000", 1000);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.amount).toBe(1000);
  });

  it("gère l'espace insécable du formatage fr-FR (« 1 000 » → 1000)", () => {
    const res = parseAvoirAmount("1 000", 2000);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.amount).toBe(1000);
  });

  it("refuse une saisie à reste non numérique (« 300xyz ») au lieu de la tronquer", () => {
    const res = parseAvoirAmount("300xyz", 1000);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Montant invalide");
  });

  it("refuse un nombre malformé (« 1.2.3 »)", () => {
    const res = parseAvoirAmount("1.2.3", 1000);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Montant invalide");
  });
});
