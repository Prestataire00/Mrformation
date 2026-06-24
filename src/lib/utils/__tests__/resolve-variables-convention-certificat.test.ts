import { describe, it, expect } from "vitest";
import { resolveVariables } from "@/lib/utils/resolve-variables";
import type { Session, Client } from "@/lib/types";

/**
 * Correctness des variables convention (montants, effectifs) et certificat de
 * réalisation (type d'action, dates) — valeurs client-critiques (une TVA fausse
 * sur une convention = problème légal ; un effectif inter-entreprises mal filtré
 * = fuite d'isolement NFR-SEC-2).
 */

function makeSession(o: Partial<Session> = {}): Session {
  return {
    id: "s1",
    entity_id: "e1",
    title: "Formation X",
    start_date: "2026-06-15T09:00:00.000Z",
    end_date: "2026-06-16T17:00:00.000Z",
    planned_hours: 14,
    total_price: 1000,
    enrollments: [],
    ...o,
  } as unknown as Session;
}
function makeClient(id: string): Client {
  return { id, entity_id: "e1", company_name: `Client ${id}` } as unknown as Client;
}
function enr(clientId: string, lid: string, first: string, last: string) {
  return { id: `e-${lid}`, learner_id: lid, client_id: clientId, session_id: "s1",
    learner: { id: lid, first_name: first, last_name: last } } as never;
}

describe("Convention — montants HT / TVA / TTC", () => {
  it("1000 € → HT 1000.00, TVA 200.00 (20 %), TTC 1200.00", () => {
    const s = makeSession({ total_price: 1000 });
    expect(resolveVariables("{{montant_ht}}", { session: s })).toBe("1000.00");
    expect(resolveVariables("{{montant_tva}}", { session: s })).toBe("200.00");
    expect(resolveVariables("{{montant_ttc}}", { session: s })).toBe("1200.00");
  });

  it("arrondi au centime (1234.56 → TVA 246.91, TTC 1481.47)", () => {
    const s = makeSession({ total_price: 1234.56 });
    expect(resolveVariables("{{montant_tva}}", { session: s })).toBe("246.91");
    expect(resolveVariables("{{montant_ttc}}", { session: s })).toBe("1481.47");
  });

  it("montant 0 → placeholder d'audit (jamais « 0.00 » sur un PDF)", () => {
    expect(resolveVariables("{{montant_ht}}", { session: makeSession({ total_price: 0 }) })).toBe("[Montant HT]");
  });
});

describe("Convention — effectifs (isolement par entreprise)", () => {
  const session = makeSession({
    enrollments: [
      enr("client-A", "l1", "Alice", "DUPONT"),
      enr("client-B", "l2", "Bob", "SMITH"),
      enr("client-A", "l3", "Claire", "DURAND"),
    ] as never,
  });

  it("INTER : effectifs filtrés à l'entreprise courante (2 sur 3)", () => {
    expect(resolveVariables("{{formation_effectifs}}", { session, client: makeClient("client-A") })).toBe("2");
  });

  it("INTRA (pas de client) : tous les effectifs (3)", () => {
    expect(resolveVariables("{{formation_effectifs}}", { session })).toBe("3");
  });
});

describe("Certificat de réalisation — type d'action & dates", () => {
  it("type_action_formation selon la classification du training", () => {
    const cases: Array<[string, string]> = [
      ["reglementaire", "Action de formation réglementaire"],
      ["certifiant", "Action de formation certifiante"],
      ["qualifiant", "Action de formation qualifiante"],
      ["autre", "Action de formation"],
    ];
    for (const [cls, expected] of cases) {
      const s = makeSession({ training: { classification: cls } } as unknown as Partial<Session>);
      expect(resolveVariables("{{type_action_formation}}", { session: s })).toBe(expected);
    }
  });

  it("dates_formation : « Du X au Y » sur plusieurs jours", () => {
    const s = makeSession({ start_date: "2026-06-15T09:00:00.000Z", end_date: "2026-06-16T17:00:00.000Z" });
    expect(resolveVariables("{{dates_formation}}", { session: s })).toBe("Du 15/06/2026 au 16/06/2026");
  });

  it("dates_formation : « Le X » si même jour", () => {
    const s = makeSession({ start_date: "2026-06-15T09:00:00.000Z", end_date: "2026-06-15T17:00:00.000Z" });
    expect(resolveVariables("{{dates_formation}}", { session: s })).toBe("Le 15/06/2026");
  });

  it("duree_heures = planned_hours de la session", () => {
    expect(resolveVariables("{{duree_heures}}", { session: makeSession({ planned_hours: 21 }) })).toBe("21");
  });
});
