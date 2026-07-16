import { describe, it, expect } from "vitest";
import { resolveVatCode, VAT_RATE_TO_CODE, VAT_EXONERATION_FORMATION } from "../vat";

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
