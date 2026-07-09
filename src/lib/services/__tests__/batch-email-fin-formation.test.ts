import { describe, it, expect } from "vitest";
import { resolveDocumentVariables } from "@/lib/utils/resolve-variables";
import type { Session, Learner } from "@/lib/types";

/**
 * Régression du bug « Modèles d'email : certaines balises ne fonctionnent pas
 * (ex : balises de fin de formation) ».
 *
 * Cause : les emails d'accompagnement de documents (batch-email-handler)
 * n'appliquaient qu'un remplacement codé en dur de 5 clés `{{…}}` et
 * ignoraient totalement le format `[%Libellé%]` inséré depuis le catalogue UI.
 * Le fix branche le résolveur unifié `resolveDocumentVariables` sur le texte
 * de l'email — ces tests valident le MÉCANISME que le handler utilise
 * désormais (même ctx que le PDF), puis la couche de compat legacy.
 */

function makeSession(o: Partial<Session> = {}): Session {
  return {
    id: "s1",
    entity_id: "e1",
    title: "Habilitation électrique B0-H0",
    start_date: "2026-06-15T09:00:00.000Z",
    end_date: "2026-06-17T17:00:00.000Z",
    location: "Paris",
    planned_hours: 21,
    enrollments: [],
    ...o,
  } as unknown as Session;
}

const learner = { id: "l1", first_name: "Jean", last_name: "Dupont" } as unknown as Learner;
const entity = { name: "MR FORMATION", siret: "12345678900012" } as never;

describe("Batch email — balises de fin de formation résolues via le résolveur unifié", () => {
  it("résout [%Date de fin de la formation%] (le symptôme rapporté)", () => {
    const out = resolveDocumentVariables("Formation terminée le [%Date de fin de la formation%].", {
      session: makeSession(),
    });
    expect(out).toBe("Formation terminée le 17/06/2026.");
  });

  it("résout un corps d'email complet ([%…%] fin de formation + organisme + apprenant)", () => {
    const body = [
      "Bonjour [%Nom de l'apprenant%],",
      "Votre formation [%Nom de la formation%] s'est terminée le [%Date de fin de la formation%].",
      "Cordialement, [%Nom de l'organisme%]",
    ].join("\n");

    const out = resolveDocumentVariables(body, {
      session: makeSession(),
      learner,
      entity,
    });

    expect(out).toContain("Bonjour Jean Dupont,");
    expect(out).toContain("formation Habilitation électrique B0-H0 s'est terminée le 17/06/2026.");
    expect(out).toContain("Cordialement, MR FORMATION");
    // Plus aucune balise Sellsy ne subsiste
    expect(out).not.toMatch(/\[%[^%]+%\]/);
  });

  it("supporte aussi le format technique {{date_fin}}", () => {
    expect(resolveDocumentVariables("{{date_fin}}", { session: makeSession() })).toBe("17/06/2026");
  });

  it("laisse les clés legacy hors-catalogue littérales (→ traitées par le shim du handler)", () => {
    // {{formation}} et {{entite}} ne sont PAS des clés du catalogue : le
    // résolveur les laisse telles quelles, d'où le shim replaceAll dans
    // batch-email-handler qui les remplace après coup.
    const out = resolveDocumentVariables("{{formation}} / {{entite}}", { session: makeSession() });
    expect(out).toBe("{{formation}} / {{entite}}");
  });

  it("mécanisme complet du handler : résolveur + shim legacy (parité applyBatchVars)", () => {
    const sessionTitle = "Habilitation électrique B0-H0";
    const entityName = "MR FORMATION";
    // Réplique la composition de batch-email-handler.applyBatchVars
    const applyBatchVars = (s: string) =>
      resolveDocumentVariables(s, { session: makeSession(), learner, entity })
        .replaceAll("{{formation}}", sessionTitle)
        .replaceAll("{{entite}}", entityName)
        .replaceAll("{{prenom_formateur}}", "Jean Dupont");

    const out = applyBatchVars(
      "[%Nom de l'apprenant%] — {{formation}} — fin le [%Date de fin de la formation%] — {{entite}}",
    );
    expect(out).toBe("Jean Dupont — Habilitation électrique B0-H0 — fin le 17/06/2026 — MR FORMATION");
  });
});
