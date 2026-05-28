import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PAGE_PATH = resolve(
  process.cwd(),
  "src/app/(dashboard)/admin/emails/page.tsx",
);

const pageSource = readFileSync(PAGE_PATH, "utf-8");

describe("em-d-1 — Cross-entity duplication (UI wiring)", () => {
  it("importe duplicateTemplateToEntity Server Action", () => {
    expect(pageSource).toMatch(
      /import \{ duplicateTemplateToEntity \} from "\.\/_actions\/duplicate-to-entity"/,
    );
  });

  it("importe Copy icon depuis lucide-react", () => {
    expect(pageSource).toMatch(/^\s*Copy,$/m);
  });

  it("récupère entities + currentEntity + setEntity depuis useEntity", () => {
    expect(pageSource).toMatch(
      /const \{ entityId, entity: currentEntity, entities: availableEntities, setEntity \} = useEntity\(\)/,
    );
  });

  it("handleDuplicateToEntity appelle Server Action avec templateId + targetEntityId", () => {
    expect(pageSource).toMatch(/const handleDuplicateToEntity = async/);
    expect(pageSource).toMatch(
      /duplicateTemplateToEntity\(\{[\s\S]{0,200}?templateId: template\.id[\s\S]{0,80}?targetEntityId/,
    );
  });

  it("toast succès inclut action [Voir →] qui setEntity vers la cible", () => {
    expect(pageSource).toMatch(/Voir →/);
    expect(pageSource).toMatch(/setEntity\(target\)/);
  });

  it("gère les 5 erreurs : forbidden, same_entity, unauthorized, not_found, fallback", () => {
    expect(pageSource).toMatch(/result\.error === "forbidden"/);
    expect(pageSource).toMatch(/result\.error === "same_entity"/);
    expect(pageSource).toMatch(/result\.error === "unauthorized"/);
    expect(pageSource).toMatch(/result\.error === "not_found"/);
  });

  it("DropdownMenu affiche conditionnellement 'Dupliquer vers X' si availableEntities > 1", () => {
    expect(pageSource).toMatch(
      /availableEntities\.length > 1[\s\S]{0,800}?Dupliquer vers \{targetEntity\.name\}/,
    );
  });

  it("filtre l'entité courante de la liste de cibles (évite self-dup)", () => {
    expect(pageSource).toMatch(/availableEntities[\s\S]{0,100}?\.filter\(\(e\) => e\.id !== currentEntity\?\.id\)/);
  });

  it("documente heuristique UI vs check serveur (NFR-EML-SEC-5)", () => {
    expect(pageSource).toMatch(/em-d-1/);
    expect(pageSource).toMatch(/Heuristique UI/);
    expect(pageSource).toMatch(/check côté serveur/);
  });

  it("toast 'Action réservée aux super_admin' si server retourne forbidden", () => {
    expect(pageSource).toMatch(/Action réservée aux super_admin/);
  });
});
