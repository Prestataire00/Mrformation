import { describe, it, expect } from "vitest";
import {
  getLearnerIdsForClient,
  filterEnrollmentsByLearnerIds,
  countClientLearnersOnSession,
} from "@/lib/utils/client-portal-isolation";

describe("getLearnerIdsForClient", () => {
  it("retourne les learner.id rattachés au client courant", () => {
    const learners = [
      { id: "l1", client_id: "acme" },
      { id: "l2", client_id: "acme" },
      { id: "l3", client_id: "beta" },
    ];
    expect(getLearnerIdsForClient(learners, "acme")).toEqual(["l1", "l2"]);
  });

  it("retourne [] si aucun learner ne correspond", () => {
    const learners = [{ id: "l1", client_id: "beta" }];
    expect(getLearnerIdsForClient(learners, "acme")).toEqual([]);
  });

  it("retourne [] si learners est null ou undefined", () => {
    expect(getLearnerIdsForClient(null, "acme")).toEqual([]);
    expect(getLearnerIdsForClient(undefined, "acme")).toEqual([]);
  });

  it("retourne [] si clientId est vide", () => {
    const learners = [{ id: "l1", client_id: "acme" }];
    expect(getLearnerIdsForClient(learners, "")).toEqual([]);
  });
});

describe("filterEnrollmentsByLearnerIds", () => {
  it("filtre les enrollments en gardant ceux dont learner_id est autorisé", () => {
    const enrollments = [
      { learner_id: "l1" },
      { learner_id: "l2" },
      { learner_id: "l3" }, // pas autorisé
      { learner_id: "l1" }, // autre session
    ];
    const result = filterEnrollmentsByLearnerIds(enrollments, ["l1", "l2"]);
    expect(result).toHaveLength(3);
    expect(result.every((e) => ["l1", "l2"].includes(e.learner_id!))).toBe(true);
  });

  it("retourne [] si allowedLearnerIds est vide (defense in depth)", () => {
    const enrollments = [{ learner_id: "l1" }, { learner_id: "l2" }];
    expect(filterEnrollmentsByLearnerIds(enrollments, [])).toEqual([]);
  });

  it("retourne [] si enrollments est null/undefined", () => {
    expect(filterEnrollmentsByLearnerIds(null, ["l1"])).toEqual([]);
    expect(filterEnrollmentsByLearnerIds(undefined, ["l1"])).toEqual([]);
  });

  it("ignore les enrollments sans learner_id (orphelins legacy)", () => {
    const enrollments = [
      { learner_id: "l1" },
      { learner_id: null as unknown as string }, // orphelin legacy
      { learner_id: "l2" },
    ];
    const result = filterEnrollmentsByLearnerIds(enrollments, ["l1", "l2"]);
    expect(result).toHaveLength(2);
  });
});

describe("countClientLearnersOnSession", () => {
  it("compte UNIQUEMENT les apprenants du client sur la session ciblée (cas INTER critique)", () => {
    // Scenario : session "s1" partagée par Acme (2 apprenants) et Béta (3 apprenants).
    // Acme regarde le count → doit voir 2, pas 5.
    const enrollments = [
      { learner_id: "l1", session_id: "s1" }, // Acme
      { learner_id: "l2", session_id: "s1" }, // Acme
      { learner_id: "l3", session_id: "s1" }, // Béta
      { learner_id: "l4", session_id: "s1" }, // Béta
      { learner_id: "l5", session_id: "s1" }, // Béta
    ];
    const acmeLearnerIds = ["l1", "l2"];
    expect(countClientLearnersOnSession(enrollments, acmeLearnerIds, "s1")).toBe(2);
  });

  it("retourne 0 si aucun apprenant du client n'est sur la session", () => {
    const enrollments = [{ learner_id: "l1", session_id: "s1" }];
    expect(countClientLearnersOnSession(enrollments, ["l99"], "s1")).toBe(0);
  });

  it("retourne 0 si enrollments null ou sessionId vide", () => {
    expect(countClientLearnersOnSession(null, ["l1"], "s1")).toBe(0);
    expect(countClientLearnersOnSession([{ learner_id: "l1", session_id: "s1" }], ["l1"], "")).toBe(0);
  });
});

/**
 * Story 5.4 — confirmation que la composition des helpers (getLearnerIdsForClient
 * + filterEnrollmentsByLearnerIds) protège bien le cas critique multi-entreprises
 * sur session INTER partagée.
 *
 * Les tests SQL-level (RLS Supabase) sont couverts par la procédure manuelle
 * `docs/rls-test-procedure.md` (Loris/Wissam pré-release).
 */
describe("isolation multi-entreprises INTER — Story 5.4 / NFR-SEC-2", () => {
  it("client Acme ne voit aucun enrollment de Beta même sur une session INTER partagée", () => {
    // Setup : 4 apprenants (2 Acme, 2 Beta) tous inscrits sur la même session INTER.
    const learners = [
      { id: "alice", client_id: "acme" },
      { id: "andre", client_id: "acme" },
      { id: "bob", client_id: "beta" },
      { id: "bea", client_id: "beta" },
    ];
    const enrollments = [
      { learner_id: "alice", session_id: "inter-s1" },
      { learner_id: "andre", session_id: "inter-s1" },
      { learner_id: "bob", session_id: "inter-s1" },
      { learner_id: "bea", session_id: "inter-s1" },
    ];

    // Acme regarde la session INTER → ne voit QUE ses 2 apprenants.
    const acmeAllowed = getLearnerIdsForClient(learners, "acme");
    expect(acmeAllowed).toEqual(["alice", "andre"]);

    const acmeVisible = filterEnrollmentsByLearnerIds(enrollments, acmeAllowed);
    expect(acmeVisible).toHaveLength(2);
    expect(acmeVisible.every((e) => ["alice", "andre"].includes(e.learner_id!))).toBe(true);

    // Béta regarde la même session INTER → ne voit QUE ses 2 apprenants.
    const betaAllowed = getLearnerIdsForClient(learners, "beta");
    const betaVisible = filterEnrollmentsByLearnerIds(enrollments, betaAllowed);
    expect(betaVisible).toHaveLength(2);
    expect(betaVisible.every((e) => ["bob", "bea"].includes(e.learner_id!))).toBe(true);
  });
});
