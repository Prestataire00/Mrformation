import { describe, it, expect } from "vitest";
import {
  toCreateOrganizationDto,
  toCreateContactDto,
  toAbbyInvoiceLines,
  toAbbyTimeline,
  toAbbyGeneralInformations,
} from "../mappers";
import type { AbbyRecipientData } from "@/lib/types/abby";

describe("toCreateOrganizationDto — mapping pur LMS → Abby (AD-17)", () => {
  it("payload complet : siret + vatNumber dérivé + emails + billingAddress à 4 clés country FR", () => {
    const r: AbbyRecipientData = {
      kind: "organization",
      name: "MR FORMATION",
      siret: "91311329600036",
      email: "contact@mrformation.fr",
      address: "24 Boulevard Gay Lussac",
      postalCode: "13014",
      city: "Marseille",
    };
    const dto = toCreateOrganizationDto(r);
    expect(dto).toEqual({
      name: "MR FORMATION",
      siret: "91311329600036",
      vatNumber: "FR51913113296", // vecteur réel du PDF de recette 1.5
      emails: ["contact@mrformation.fr"],
      billingAddress: {
        address: "24 Boulevard Gay Lussac",
        zipCode: "13014",
        city: "Marseille",
        country: "FR",
      },
    });
  });

  it("payload minimal (financier sans rien) : name seul — champs optionnels OMIS, jamais undefined", () => {
    const dto = toCreateOrganizationDto({
      kind: "organization",
      name: "OPCO Atlas",
      siret: null,
      email: null,
    });
    expect(dto).toEqual({ name: "OPCO Atlas" });
    expect("billingAddress" in dto).toBe(false);
    expect("emails" in dto).toBe(false);
    expect("vatNumber" in dto).toBe(false);
  });

  it("SIRET non plausible : ni siret ni vatNumber dans le payload", () => {
    const dto = toCreateOrganizationDto({
      kind: "organization",
      name: "Importée",
      siret: "1234567",
      email: null,
    });
    expect("siret" in dto).toBe(false);
    expect("vatNumber" in dto).toBe(false);
  });

  it("adresse partielle : billingAddress présent avec les 4 clés (nullables remplies à null)", () => {
    const dto = toCreateOrganizationDto({
      kind: "organization",
      name: "Partielle",
      siret: null,
      email: null,
      city: "Paris",
    });
    expect(dto.billingAddress).toEqual({
      address: null,
      zipCode: null,
      city: "Paris",
      country: "FR",
    });
  });
});

describe("toAbbyInvoiceLines — euros → centimes, HT, service_delivery (AD-17)", () => {
  const VAT_20 = { vatExempt: false, tvaRate: 20 };

  it("arrondi centimes par ligne : 1234,56 € → 123456 ; forme complète validée en recette", () => {
    const out = toAbbyInvoiceLines(
      [{ description: "Formation — cas arrondi", quantity: 1, unitPriceHT: 1234.56 }],
      VAT_20,
      { isAvoir: false }
    );
    expect(out).toEqual([
      {
        designation: "Formation — cas arrondi",
        unitPrice: 123456,
        quantity: 1,
        quantityUnit: "unit",
        type: "service_delivery",
        vatCode: "FR_2000",
        isTaxIncluded: false,
      },
    ]);
  });

  it("arrondi flottant : 0,105 € → 11 centimes (Math.round, jamais de troncature)", () => {
    const out = toAbbyInvoiceLines(
      [{ description: "x", quantity: 1, unitPriceHT: 0.105 }],
      VAT_20,
      { isAvoir: false }
    );
    expect(out[0].unitPrice).toBe(11);
  });

  it("AVOIR à montant négatif → valeur ABSOLUE (la nature créditrice = type asset côté Abby)", () => {
    const out = toAbbyInvoiceLines(
      [{ description: "Avoir", quantity: 1, unitPriceHT: -450 }],
      VAT_20,
      { isAvoir: true }
    );
    expect(out[0].unitPrice).toBe(45000);
    expect(out[0].quantity).toBe(1);
  });

  it("FACTURE à ligne négative (remise) → REFUSÉE (parité préview — l'abs gonflerait le total légal)", () => {
    expect(() =>
      toAbbyInvoiceLines(
        [
          { description: "Formation", quantity: 1, unitPriceHT: 1000 },
          { description: "Remise", quantity: 1, unitPriceHT: -100 },
        ],
        VAT_20,
        { isAvoir: false }
      )
    ).toThrow(/Remise.*négatif|négatif.*Remise/);
    expect(() =>
      toAbbyInvoiceLines(
        [{ description: "Qté négative", quantity: -1, unitPriceHT: 100 }],
        VAT_20,
        { isAvoir: false }
      )
    ).toThrow(/avoir/);
  });

  it("entité exonérée → vatCode FR_00HT", () => {
    const out = toAbbyInvoiceLines(
      [{ description: "x", quantity: 2, unitPriceHT: 500 }],
      { vatExempt: true, tvaRate: 20 },
      { isAvoir: false }
    );
    expect(out[0].vatCode).toBe("FR_00HT");
  });

  it("taux hors enum → jette (jamais d'arrondi silencieux)", () => {
    expect(() =>
      toAbbyInvoiceLines([{ description: "x", quantity: 1, unitPriceHT: 100 }], {
        vatExempt: false,
        tvaRate: 19.6,
      }, { isAvoir: false })
    ).toThrow(/19.6/);
  });
});

describe("toAbbyTimeline — SECONDES (piège an 58509) + thirty_days V1", () => {
  it("emittedAt = epoch SECONDES de invoice_date", () => {
    const t = toAbbyTimeline("2026-07-18");
    expect(t).toEqual({
      emittedAt: Math.floor(Date.parse("2026-07-18") / 1000),
      paymentDelay: "thirty_days",
    });
    // garde anti-régression : l'epoch secondes de 2026 tient sur 10 chiffres
    expect(String(t.emittedAt)).toHaveLength(10);
  });
});

describe("toAbbyGeneralInformations — footerNote QO-1 SANS vatMention", () => {
  it("exonérée : footerNote seule, aucune clé vatMention", () => {
    const g = toAbbyGeneralInformations(true);
    expect(g).toEqual({ footerNote: "TVA non applicable, article 261-4-4° du CGI." });
    expect("vatMention" in g).toBe(false);
  });

  it("assujettie : body vide (recette a-tva20)", () => {
    expect(toAbbyGeneralInformations(false)).toEqual({});
  });
});

describe("toCreateContactDto — mapping contact (learner)", () => {
  it("prénom/nom/email", () => {
    const dto = toCreateContactDto({
      kind: "contact",
      name: "Marie Dupont",
      siret: null,
      email: "marie@exemple.fr",
      firstName: "Marie",
      lastName: "Dupont",
    });
    expect(dto).toEqual({
      firstname: "Marie",
      lastname: "Dupont",
      emails: ["marie@exemple.fr"],
    });
  });

  it("sans email : emails omis", () => {
    const dto = toCreateContactDto({
      kind: "contact",
      name: "A B",
      siret: null,
      email: null,
      firstName: "A",
      lastName: "B",
    });
    expect(dto).toEqual({ firstname: "A", lastname: "B" });
  });
});
