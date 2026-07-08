import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { applyVariablesToDocx } from "@/lib/services/docx-converter";

/**
 * Test « conditions réelles » : reproduit un modèle Word de convention tel que
 * Loris l'importerait, avec les pièges typiques de Word :
 *   - balises Sellsy [%Libellé%] (organisme, formation, montants, formateur)
 *   - apostrophe typographique ’ (U+2019) insérée par l'auto-correction Word
 *   - espace insécable (U+00A0) avant les %
 *   - une balise éclatée en plusieurs runs XML (styles / correcteur)
 *   - une balise au format technique {{...}} (power user)
 *   - une balise volontairement inconnue (doit rester visible)
 */
function buildRealisticConvention(): Buffer {
  const p = (runs: string) => `<w:p>${runs}</w:p>`;
  const r = (t: string) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;

  const body = [
    p(r("CONVENTION DE FORMATION PROFESSIONNELLE")),
    p(r("Entre l’organisme [%Nom de l’organisme%], SIRET [%SIRET de l’organisme%],")),
    p(r("sis [%Adresse de l’organisme%], représenté par [%Nom du représentant de l’organisme%],")),
    p(r("Et l’entreprise [%Nom du client%], SIRET [%SIRET du client%].")),
    // Balise éclatée par Word en 3 runs :
    p(
      `<w:r><w:t xml:space="preserve">Intitulé : [%Nom de </w:t></w:r>` +
        `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">la </w:t></w:r>` +
        `<w:r><w:t xml:space="preserve">formation%]</w:t></w:r>`,
    ),
    p(r("Dates : du [%Date de début de la formation%] au [%Date de fin de la formation%]")),
    p(r("Lieu : [%Lieu de la formation%] — Durée : [%Durée de la formation%]")),
    // Espace insécable U+00A0 juste avant le % de fermeture :
    p(r("Coût total : [%Montant HT%] HT, soit [%Montant TTC%] TTC")),
    p(r("Formateur : [%Nom du formateur%] — Coût HT : [%Coût total du formateur (HT)%]")),
    // Format technique {{...}} encore supporté :
    p(r("Fait le {{date_today}}.")),
    // Balise inconnue → doit rester visible pour audit :
    p(r("Réf. interne : [%Champ non géré%]")),
  ].join("");

  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  );
  return zip.generate({ type: "nodebuffer" });
}

function extractText(docxBuffer: Buffer): string {
  const xml = new PizZip(docxBuffer).files["word/document.xml"].asText();
  const paras = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [];
  return paras
    .map((para) =>
      (para.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? [])
        .map((m) => m.replace(/<[^>]+>/g, ""))
        .join(""),
    )
    .join("\n");
}

describe("Conditions réelles — modèle Word de convention importé", () => {
  it("résout toutes les balises d'un modèle Word réaliste (avec pièges Word)", () => {
    // Variables telles que la route les fournirait (getResolvedVariablesMap + finalVars)
    const vars = {
      nom_organisme: "MR FORMATION",
      siret_organisme: "123 456 789 00012",
      adresse_organisme: "12 rue des Lilas, 75011 Paris",
      representant_organisme: "Loris Martin",
      nom_client: "ACME SAS",
      client_siret: "987 654 321 00021",
      titre_formation: "Habilitation électrique B0-H0",
      date_debut: "15/09/2026",
      date_fin: "17/09/2026",
      lieu: "Paris",
      duree_heures: "21 h",
      montant_ht: "1 800,00 €",
      montant_ttc: "2 160,00 €",
      nom_formateur_complet: "Jean Dupont",
      cout_formateur_ht: "900,00 €",
      date_today: "09/07/2026",
    };

    const out = applyVariablesToDocx(buildRealisticConvention(), vars);
    const text = extractText(out);

    // Affichage lisible dans la sortie de test
    console.log("\n========== RENDU DU MODÈLE WORD APRÈS SUBSTITUTION ==========\n" + text + "\n=============================================================\n");

    // Toutes les valeurs attendues sont présentes
    for (const v of Object.values(vars)) {
      expect(text).toContain(v);
    }
    // La balise éclatée en runs a bien été résolue
    expect(text).toContain("Intitulé : Habilitation électrique B0-H0");
    // Plus aucune balise Sellsy connue ne subsiste
    expect(text).not.toContain("[%Nom de l");
    expect(text).not.toContain("[%Montant HT%]");
    expect(text).not.toContain("[%Coût total du formateur");
    // Le format technique fonctionne toujours
    expect(text).toContain("Fait le 09/07/2026.");
    // La balise inconnue reste visible pour audit
    expect(text).toContain("[%Champ non géré%]");
  });
});
