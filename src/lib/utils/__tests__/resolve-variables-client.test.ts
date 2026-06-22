import { describe, it, expect } from "vitest";
import { resolveDocumentVariables, type ResolveContext } from "@/lib/utils/resolve-variables";

/**
 * Garde-fou : variables « client » (entreprise) sur les documents.
 * Retour Loris (AIPR) : « la variable adresse du client ne fonctionne pas, de
 * plus c'est la variable nom du client qu'il faudrait ».
 *
 * Cause racine côté route : pour un doc per-apprenant (AIPR), `data.client`
 * n'était pas chargé (pas de client_id passé) → toutes les variables client
 * vides. Fix route = dériver le client via l'enrollment de l'apprenant.
 *
 * Ces tests verrouillent le contrat résolveur : GIVEN un `data.client`, les
 * alias `[%Nom du client%]` et `[%Adresse du client%]` rendent le nom et
 * l'adresse ; sans client, ils retombent sur vide / placeholder (l'état buggé).
 */

const ctxWithClient = {
  client: {
    id: "client-1",
    company_name: "ACME SARL",
    address: "12 rue des Lilas",
    postal_code: "75001",
    city: "Paris",
  },
} as unknown as ResolveContext;

const ctxNoClient = {} as unknown as ResolveContext;

describe("variables client (entreprise) — alias [%…%]", () => {
  it("[%Nom du client%] rend le company_name quand le client est chargé", () => {
    expect(resolveDocumentVariables("[%Nom du client%]", ctxWithClient)).toBe("ACME SARL");
    // alias équivalent utilisé par le template AIPR
    expect(resolveDocumentVariables("[%Nom de l'entreprise%]", ctxWithClient)).toBe("ACME SARL");
  });

  it("[%Adresse du client%] rend l'adresse complète quand le client est chargé", () => {
    expect(resolveDocumentVariables("[%Adresse du client%]", ctxWithClient))
      .toBe("12 rue des Lilas, 75001 Paris");
  });

  it("retombe sur vide / placeholder quand data.client est absent (état buggé AIPR)", () => {
    expect(resolveDocumentVariables("[%Nom du client%]", ctxNoClient)).toBe("");
    expect(resolveDocumentVariables("[%Adresse du client%]", ctxNoClient)).toBe("[Adresse client]");
  });
});
