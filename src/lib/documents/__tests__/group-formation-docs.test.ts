import { describe, it, expect } from "vitest";
import { groupFormationDocsBySession, type RawFormationDoc, type SessionLite, type LearnerLite } from "../group-formation-docs";

const sessions: SessionLite[] = [
  { id: "s1", title: "Sécurité", start_date: "2026-03-01" },
  { id: "s2", title: "Management", start_date: "2026-05-01" },
];
const learners = new Map<string, LearnerLite>([
  ["l1", { id: "l1", first_name: "Marie", last_name: "Durand" }],
]);
const label = (t: string) => ({ convention_formation: "Convention", attestation_assiduite: "Attestation d'assiduité" }[t] ?? t);

describe("groupFormationDocsBySession", () => {
  it("groupe par session, libelle le type, résout le destinataire (entreprise/apprenant)", () => {
    const docs: RawFormationDoc[] = [
      { id: "d1", doc_type: "convention_formation", source_id: "s1", owner_type: "company", owner_id: "c1", file_url: "u1", status: "signed", created_at: "2026-03-02" },
      { id: "d2", doc_type: "attestation_assiduite", source_id: "s1", owner_type: "learner", owner_id: "l1", file_url: "u2", status: "generated", created_at: "2026-03-03" },
    ];
    const g = groupFormationDocsBySession(docs, sessions, learners, label);
    expect(g).toHaveLength(1);
    expect(g[0].session.id).toBe("s1");
    expect(g[0].docs[0]).toMatchObject({ typeLabel: "Convention", recipientLabel: "Entreprise" });
    expect(g[0].docs[1]).toMatchObject({ typeLabel: "Attestation d'assiduité", recipientLabel: "Marie Durand" });
  });

  it("apprenant inconnu → repli « Apprenant » ; type inconnu → doc_type brut", () => {
    const docs: RawFormationDoc[] = [
      { id: "d3", doc_type: "truc_inconnu", source_id: "s2", owner_type: "learner", owner_id: "lX", file_url: null, status: "generated", created_at: "2026-05-02" },
    ];
    const g = groupFormationDocsBySession(docs, sessions, learners, label);
    expect(g[0].docs[0]).toMatchObject({ typeLabel: "truc_inconnu", recipientLabel: "Apprenant", fileUrl: null });
  });

  it("doc dont la source n'est pas une session de l'entreprise est ignoré ; sessions triées par date desc", () => {
    const docs: RawFormationDoc[] = [
      { id: "d4", doc_type: "convention_formation", source_id: "s1", owner_type: "company", owner_id: "c1", file_url: "u", status: "sent", created_at: "2026-03-02" },
      { id: "d5", doc_type: "convention_formation", source_id: "s2", owner_type: "company", owner_id: "c1", file_url: "u", status: "sent", created_at: "2026-05-02" },
      { id: "d6", doc_type: "x", source_id: "AUTRE", owner_type: "company", owner_id: "c1", file_url: "u", status: "sent", created_at: "2026-01-01" },
    ];
    const g = groupFormationDocsBySession(docs, sessions, learners, label);
    expect(g.map((x) => x.session.id)).toEqual(["s2", "s1"]);
    expect(g.flatMap((x) => x.docs.map((d) => d.id))).not.toContain("d6");
  });

  it("dans une session : conventions (entreprise) avant docs apprenants", () => {
    const docs: RawFormationDoc[] = [
      { id: "dL", doc_type: "attestation_assiduite", source_id: "s1", owner_type: "learner", owner_id: "l1", file_url: "u", status: "generated", created_at: "2026-03-05" },
      { id: "dC", doc_type: "convention_formation", source_id: "s1", owner_type: "company", owner_id: "c1", file_url: "u", status: "signed", created_at: "2026-03-01" },
    ];
    const g = groupFormationDocsBySession(docs, sessions, learners, label);
    expect(g[0].docs.map((d) => d.id)).toEqual(["dC", "dL"]);
  });
});
