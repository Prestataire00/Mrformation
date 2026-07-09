import { describe, it, expect } from "vitest";
import { substituteTemplateVars, applyEmailTemplate } from "@/lib/email/template-vars";

const vars = { titre_formation: "SST", nom_apprenant: "Jean Dupont", entite: "MR FORMATION" };

describe("substituteTemplateVars", () => {
  it("remplace les balises connues", () => {
    expect(substituteTemplateVars("Formation {{titre_formation}} — {{entite}}", vars)).toBe(
      "Formation SST — MR FORMATION",
    );
  });
  it("laisse littérale une balise inconnue", () => {
    expect(substituteTemplateVars("{{inconnu}}", vars)).toBe("{{inconnu}}");
  });
  it("gère texte vide / null", () => {
    expect(substituteTemplateVars("", vars)).toBe("");
    // @ts-expect-error robustesse null
    expect(substituteTemplateVars(null, vars)).toBe("");
  });
});

describe("applyEmailTemplate", () => {
  it("substitue sujet + corps", () => {
    expect(
      applyEmailTemplate({ subject: "Doc {{titre_formation}}", body: "Bonjour {{nom_apprenant}}" }, vars),
    ).toEqual({ subject: "Doc SST", body: "Bonjour Jean Dupont" });
  });
  it("tolère sujet/corps absents", () => {
    expect(applyEmailTemplate({}, vars)).toEqual({ subject: "", body: "" });
  });
});
