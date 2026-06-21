import { describe, it, expect } from "vitest";
import { resolveDocumentVariables, type ResolveContext } from "@/lib/utils/resolve-variables";

/**
 * Garde-fou : le document « Programme de formation » tire ses variables de
 * `session.program` (table `programs`). Retour Loris : « PROGRAMME DE LA
 * FORMATION — aucune variable fonctionne ». Cause racine : la route
 * `generate-from-template` (bouton Voir/PDF de l'onglet Documents) chargeait
 * la session SANS le join `program:programs(*)` → `session.program` undefined
 * → toutes les variables programme retombaient sur leur fallback `[…]`.
 *
 * Ces tests verrouillent le contrat résolveur ↔ programme : si `program` est
 * présent, les variables rendent le vrai contenu ; s'il est absent, elles
 * rendent le fallback (l'état buggé). La correction est d'ajouter le join.
 */

const ctxWithProgram = {
  session: {
    start_date: "2026-09-01",
    end_date: "2026-09-02",
    program: {
      objectives: "Maîtriser les fondamentaux de la sécurité électrique",
      version: 3,
      description: "Formation habilitation électrique B1V",
      created_at: "2026-01-15T00:00:00.000Z",
      content: {
        progression: "Jour 1 : théorie. Jour 2 : pratique sur platine.",
        target_audience: "Électriciens et techniciens de maintenance",
      },
    },
  },
} as unknown as ResolveContext;

const ctxNoProgram = {
  session: { start_date: "2026-09-01", end_date: "2026-09-02" },
} as unknown as ResolveContext;

describe("résolution des variables Programme (session.program)", () => {
  it("résout les variables {{…}} depuis session.program quand il est chargé", () => {
    expect(resolveDocumentVariables("{{programme_objectifs}}", ctxWithProgram))
      .toContain("Maîtriser les fondamentaux");
    expect(resolveDocumentVariables("{{version_programme}}", ctxWithProgram)).toBe("3");
    expect(resolveDocumentVariables("{{programme_contenu}}", ctxWithProgram))
      .toContain("Jour 1");
    expect(resolveDocumentVariables("{{programme_public}}", ctxWithProgram))
      .toContain("Électriciens");
    expect(resolveDocumentVariables("{{description_formation}}", ctxWithProgram))
      .toContain("habilitation électrique B1V");
  });

  it("résout aussi le format alias [%…%] utilisé par le template programme", () => {
    // [%Version du programme%] → {{version_programme}} (cf ALIAS_TO_VARIABLE_KEY)
    expect(resolveDocumentVariables("Version : [%Version du programme%]", ctxWithProgram))
      .toBe("Version : 3");
  });

  it("retombe sur les fallbacks [...] quand session.program est absent (état buggé)", () => {
    // C'est précisément ce que voyait Loris : aucune donnée programme.
    expect(resolveDocumentVariables("{{programme_objectifs}}", ctxNoProgram)).toBe("[Objectifs]");
    expect(resolveDocumentVariables("{{version_programme}}", ctxNoProgram)).toBe("1");
    expect(resolveDocumentVariables("{{programme_contenu}}", ctxNoProgram))
      .toBe("[Contenu du programme]");
  });
});
