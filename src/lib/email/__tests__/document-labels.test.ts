import { describe, it, expect } from "vitest";
import { describeAttachment, DOCUMENT_LABELS } from "@/lib/email/document-labels";

describe("describeAttachment", () => {
  it("type connu → « <Libellé> (PDF) »", () => {
    expect(describeAttachment({ type: "convention_entreprise" })).toEqual({
      label: "Convention de formation (PDF)",
    });
  });

  it("demande de signature → note « Lien de signature inclus »", () => {
    expect(
      describeAttachment({ type: "convention_entreprise", filename: "x.pdf", signature_link: true }),
    ).toEqual({ label: "Convention de formation (PDF)", note: "Lien de signature inclus" });
  });

  it("type inconnu avec filename → le nom de fichier", () => {
    expect(describeAttachment({ type: "file", filename: "CGV.pdf" })).toEqual({ label: "CGV.pdf" });
  });

  it("type inconnu sans filename → type prettifié", () => {
    expect(describeAttachment({ type: "truc_bidule" })).toEqual({ label: "Truc bidule" });
  });

  it("descripteur queue {type, payload} sans filename → libellé mappé", () => {
    expect(describeAttachment({ type: "facture", payload: { invoice_id: "i1" } })).toEqual({
      label: "Facture (PDF)",
    });
  });

  it("descripteur vide → « Pièce jointe »", () => {
    expect(describeAttachment({})).toEqual({ label: "Pièce jointe" });
  });

  it("DOCUMENT_LABELS couvre les types de documents courants", () => {
    expect(DOCUMENT_LABELS.convention_entreprise).toBe("Convention de formation");
    expect(DOCUMENT_LABELS.certificat_realisation).toBe("Certificat de réalisation");
  });
});
