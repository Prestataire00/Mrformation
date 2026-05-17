import { describe, it, expect } from "vitest";
import {
  validateDocumentVariables,
  FALLBACK_TO_ENTITY_FIELD,
} from "../document-vars-validator";
import type { ResolveContext } from "@/lib/utils/resolve-variables";

const baseContext: ResolveContext = {
  session: {
    id: "session-1",
    title: "Formation manager",
    start_date: "2026-06-01T09:00:00Z",
    end_date: "2026-06-02T17:00:00Z",
    location: "Paris",
    mode: "presentiel",
    planned_hours: 14,
    max_participants: 12,
    total_price: 1900,
  } as ResolveContext["session"],
  entity: {
    name: "C3V Formation",
    siret: "12345678901234",
    nda: "11750000000",
    address: "10 rue X",
    postal_code: "75009",
    city: "Paris",
    email: "contact@c3v.fr",
    phone: "0102030405",
    website: "c3v.fr",
    president_name: "Loris",
    president_title: "Gérant",
    signature_text: "Signé",
    stamp_url: null,
    signature_url: null,
    logo_url: null,
  } as ResolveContext["entity"],
};

describe("validateDocumentVariables", () => {
  it("retourne valid=true si template ne référence aucune variable", () => {
    const html = "<p>Texte statique sans variables</p>";
    const result = validateDocumentVariables(html, baseContext);
    expect(result.valid).toBe(true);
    expect(result.missingByEntity).toEqual({});
  });

  it("retourne valid=true si toutes les variables sont résolues", () => {
    const html = "<p>[%Nom du formateur%] - [%Adresse du formateur%]</p>";
    const context: ResolveContext = {
      ...baseContext,
      trainer: {
        id: "trainer-1",
        first_name: "Wissam",
        last_name: "Bouakline",
        address: "10 rue X",
        postal_code: "75009",
        city: "Paris",
      } as ResolveContext["trainer"],
    };
    const result = validateDocumentVariables(html, context);
    expect(result.valid).toBe(true);
  });

  it("détecte [Adresse formateur] manquant et le groupe sous trainer + expose entityId", () => {
    const html = "<p>[%Nom du formateur%] - [%Adresse du formateur%]</p>";
    const context: ResolveContext = {
      ...baseContext,
      trainer: {
        id: "trainer-1",
        first_name: "Wissam",
        last_name: "Bouakline",
        address: null,
      } as ResolveContext["trainer"],
    };
    const result = validateDocumentVariables(html, context);
    expect(result.valid).toBe(false);
    expect(result.missingByEntity.trainer).toContain("address");
    expect(result.entityIds.trainer).toBe("trainer-1");
  });

  it("détecte plusieurs fields manquants sur la même entité (dédupliqués)", () => {
    const html = "<p>[%Adresse du formateur%] [%SIRET du formateur%] [%NDA du formateur%]</p>";
    const context: ResolveContext = {
      ...baseContext,
      trainer: {
        id: "trainer-1",
        first_name: "Wissam",
        last_name: "Bouakline",
        address: null,
        siret: null,
        nda: null,
      } as ResolveContext["trainer"],
    };
    const result = validateDocumentVariables(html, context);
    expect(result.valid).toBe(false);
    expect(result.missingByEntity.trainer?.sort()).toEqual(["address", "nda", "siret"]);
  });

  it("détecte fields manquants sur plusieurs entités (trainer + client)", () => {
    const html = "<p>[%Adresse du formateur%] [%SIRET du client%]</p>";
    const context: ResolveContext = {
      ...baseContext,
      trainer: { id: "trainer-1", first_name: "W", last_name: "B", address: null } as ResolveContext["trainer"],
      client: { id: "client-1", company_name: "ACME", siret: null } as ResolveContext["client"],
    };
    const result = validateDocumentVariables(html, context);
    expect(result.valid).toBe(false);
    expect(result.missingByEntity.trainer).toContain("address");
    expect(result.missingByEntity.client).toContain("siret");
    expect(result.entityIds.trainer).toBe("trainer-1");
    expect(result.entityIds.client).toBe("client-1");
  });

  it("ignore les [...] qui ne sont pas des fallback connus du resolver", () => {
    const html = "<p>Titre : [ENGAGEMENT DE STAGIAIRE] - texte normal</p>";
    const result = validateDocumentVariables(html, baseContext);
    expect(result.valid).toBe(true);
  });

  it("expose la table FALLBACK_TO_ENTITY_FIELD avec au moins 30 entrées", () => {
    // Sanity check : si quelqu'un casse la table par accident, ce test fail.
    expect(Object.keys(FALLBACK_TO_ENTITY_FIELD).length).toBeGreaterThanOrEqual(30);
    // Et que chaque entrée a bien la structure attendue.
    for (const [fallback, mapping] of Object.entries(FALLBACK_TO_ENTITY_FIELD)) {
      expect(fallback.startsWith("[")).toBe(true);
      expect(fallback.endsWith("]")).toBe(true);
      expect(["trainer", "client", "entity", "learner", "session"]).toContain(mapping.entityKey);
      expect(typeof mapping.field).toBe("string");
    }
  });
});
