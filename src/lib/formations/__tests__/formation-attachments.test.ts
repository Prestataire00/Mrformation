import { describe, it, expect } from "vitest";
import { formationDocLabel } from "@/lib/formations/formation-attachments";

describe("formationDocLabel", () => {
  it("type connu + nom → « Libellé — Nom »", () => {
    expect(formationDocLabel("certificat_realisation", "Jean Dupont")).toBe(
      "Certificat de réalisation — Jean Dupont",
    );
  });
  it("type connu sans nom → libellé seul", () => {
    expect(formationDocLabel("attestation_assiduite")).toBe("Attestation d'assiduité");
    expect(formationDocLabel("attestation_assiduite", "  ")).toBe("Attestation d'assiduité");
  });
  it("type inconnu → prettifié", () => {
    expect(formationDocLabel("mon_doc_bizarre", "ACME")).toBe("Mon doc bizarre — ACME");
  });
});
