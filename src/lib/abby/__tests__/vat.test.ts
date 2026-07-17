import { describe, it, expect } from "vitest";
import {
  resolveVatCode,
  VAT_RATE_TO_CODE,
  VAT_EXONERATION_FORMATION,
  deriveFrVatNumber,
} from "../vat";

describe("TVA Abby — mapping taux → vatCode (AD-17, valeurs vérifiées en recette 16/07)", () => {
  it("mappe les 5 taux français vers leur code Abby", () => {
    expect(resolveVatCode(20)).toBe("FR_2000");
    expect(resolveVatCode(10)).toBe("FR_1000");
    expect(resolveVatCode(8.5)).toBe("FR_850");
    expect(resolveVatCode(5.5)).toBe("FR_550");
    expect(resolveVatCode(2.1)).toBe("FR_210");
  });

  it("jette une erreur explicite pour un taux hors enum (jamais d'arrondi silencieux)", () => {
    expect(() => resolveVatCode(7)).toThrowError(/taux de TVA 7/i);
    expect(() => resolveVatCode(19.6)).toThrowError(/19\.6/);
    expect(() => resolveVatCode(0)).toThrowError(/0/); // 0 % = exonération, pas un taux
  });

  it("expose le mapping complet en lecture", () => {
    expect(Object.keys(VAT_RATE_TO_CODE)).toHaveLength(5);
  });
});

describe("TVA Abby — exonération formation professionnelle (art. 261-4-4° CGI)", () => {
  it("fige la configuration vérifiée empiriquement : FR_00HT + footerNote, SANS vatMention", () => {
    expect(VAT_EXONERATION_FORMATION.vatCode).toBe("FR_00HT");
    expect(VAT_EXONERATION_FORMATION.footerNote).toBe(
      "TVA non applicable, article 261-4-4° du CGI."
    );
    // Aucune vatMention : toutes les valeurs de l'enum Abby rendent une
    // mention légale FAUSSE pour la formation (vérifié PDF par PDF le 16/07)
    expect("vatMention" in VAT_EXONERATION_FORMATION).toBe(false);
  });
});

describe("TVA Abby — dérivation du numéro de TVA intracommunautaire FR", () => {
  it("vecteur RÉEL : SIRET MR → FR51913113296 (vérifié sur le PDF de recette du 16/07)", () => {
    expect(deriveFrVatNumber("91311329600036")).toBe("FR51913113296");
  });

  it("clé < 10 : paddée à 2 chiffres (SIREN mod 97 = 63 → clé 07)", () => {
    // 63 → (12 + 189) mod 97 = 201 mod 97 = 7
    expect(deriveFrVatNumber("00000006300012")).toBe("FR07000000063");
  });

  it("SIRET non plausible : null (jamais de TVA dérivée sur du junk)", () => {
    expect(deriveFrVatNumber("1234567")).toBeNull();
    expect(deriveFrVatNumber("00000000000000")).toBeNull();
  });
});
