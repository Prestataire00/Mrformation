import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { applyVariablesToDocx } from "@/lib/services/docx-converter";

/**
 * Construit un .docx minimal mais valide (Content_Types + rels + document.xml)
 * à partir d'un fragment `<w:body>`. Permet de tester la substitution sans
 * dépendre d'un vrai fichier Word binaire.
 */
function buildDocx(bodyInnerXml: string): Buffer {
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${bodyInnerXml}</w:body>
</w:document>`
  );
  return zip.generate({ type: "nodebuffer" });
}

/** Extrait le texte brut du document.xml résultant (concatène les <w:t>). */
function extractText(docxBuffer: Buffer): string {
  const xml = new PizZip(docxBuffer).files["word/document.xml"].asText();
  const matches = xml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? [];
  return matches.map((m) => m.replace(/<[^>]+>/g, "")).join("");
}

/** Paragraphe avec un unique run. */
const run = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

describe("applyVariablesToDocx — double format {{…}} et [%…%]", () => {
  it("remplace une balise Sellsy [%Libellé%] par sa valeur", () => {
    const docx = buildDocx(run("Formation : [%Nom de la formation%]"));
    const out = applyVariablesToDocx(docx, { titre_formation: "Habilitation électrique" });
    expect(extractText(out)).toBe("Formation : Habilitation électrique");
  });

  it("remplace une balise [%…%] éclatée en plusieurs runs Word", () => {
    // Word découpe fréquemment une balise en runs (styles, correcteur).
    const body = `<w:p>
      <w:r><w:t xml:space="preserve">[%Nom de </w:t></w:r>
      <w:r><w:t xml:space="preserve">la formation%]</w:t></w:r>
    </w:p>`;
    const out = applyVariablesToDocx(buildDocx(body), { titre_formation: "SST" });
    expect(extractText(out)).toContain("SST");
    expect(extractText(out)).not.toContain("Nom de la formation");
  });

  it("normalise l'apostrophe typographique de Word (U+2019)", () => {
    // Word transforme ' en ’ : le libellé du doc ne matcherait plus la clé du map.
    const docx = buildDocx(run("Apprenant : [%Nom de l’apprenant%]"));
    const out = applyVariablesToDocx(docx, { nom_apprenant: "Jean Dupont" });
    expect(extractText(out)).toBe("Apprenant : Jean Dupont");
  });

  it("normalise les espaces insécables (U+00A0) dans le libellé", () => {
    const docx = buildDocx(run("[%Nom de la formation%]"));
    const out = applyVariablesToDocx(docx, { titre_formation: "CACES" });
    expect(extractText(out)).toBe("CACES");
  });

  it("supporte toujours le format technique {{cle}}", () => {
    const docx = buildDocx(run("Lieu : {{lieu}}"));
    const out = applyVariablesToDocx(docx, { lieu: "Paris" });
    expect(extractText(out)).toBe("Lieu : Paris");
  });

  it("gère les deux formats dans le même document", () => {
    const body = run("{{lieu}} — [%Nom de la formation%]");
    const out = applyVariablesToDocx(buildDocx(body), {
      lieu: "Lyon",
      titre_formation: "Gestes et postures",
    });
    expect(extractText(out)).toBe("Lyon — Gestes et postures");
  });

  it("conserve une balise [%…%] inconnue (visible pour audit)", () => {
    const docx = buildDocx(run("[%Balise inexistante%]"));
    const out = applyVariablesToDocx(docx, { titre_formation: "X" });
    expect(extractText(out)).toBe("[%Balise inexistante%]");
  });

  it("affiche une chaîne vide (pas 'undefined') pour une valeur nulle", () => {
    const docx = buildDocx(run("[%Nom de la formation%]"));
    const out = applyVariablesToDocx(docx, { titre_formation: null });
    expect(extractText(out)).toBe("");
  });
});
