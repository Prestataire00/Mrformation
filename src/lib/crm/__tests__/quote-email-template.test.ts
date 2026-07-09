import { describe, it, expect } from "vitest";
import { substituteQuoteVars, applyQuoteTemplate } from "@/lib/crm/quote-email-template";

const vars = {
  reference: "DEV-2026-001",
  montant: "1 800€ HT",
  destinataire: "ACME SAS",
  date_validite: "31/07/2026",
  entite: "MR FORMATION",
};

describe("substituteQuoteVars", () => {
  it("remplace les balises {{var}} connues", () => {
    expect(substituteQuoteVars("Devis {{reference}} — {{montant}}", vars)).toBe(
      "Devis DEV-2026-001 — 1 800€ HT",
    );
  });

  it("laisse littérale une balise inconnue (ex. {{lien_signature}} côté client)", () => {
    expect(substituteQuoteVars("Signez : {{lien_signature}}", vars)).toBe(
      "Signez : {{lien_signature}}",
    );
  });

  it("gère un texte vide / null", () => {
    expect(substituteQuoteVars("", vars)).toBe("");
    // @ts-expect-error test robustesse null
    expect(substituteQuoteVars(null, vars)).toBe("");
  });

  it("remplace toutes les occurrences", () => {
    expect(substituteQuoteVars("{{entite}} / {{entite}}", vars)).toBe("MR FORMATION / MR FORMATION");
  });
});

describe("applyQuoteTemplate", () => {
  it("substitue sujet et corps", () => {
    const out = applyQuoteTemplate(
      { subject: "Devis {{reference}}", body: "Bonjour {{destinataire}},\nMontant : {{montant}}" },
      vars,
    );
    expect(out.subject).toBe("Devis DEV-2026-001");
    expect(out.body).toBe("Bonjour ACME SAS,\nMontant : 1 800€ HT");
  });

  it("tolère sujet/corps absents", () => {
    expect(applyQuoteTemplate({}, vars)).toEqual({ subject: "", body: "" });
    expect(applyQuoteTemplate({ subject: null, body: null }, vars)).toEqual({ subject: "", body: "" });
  });
});
