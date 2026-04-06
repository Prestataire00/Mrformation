import { describe, it, expect } from "vitest";
import {
  computeSessionStatus,
  computeAttendanceRate,
  getSignaturesForSlot,
  getQuestionStats,
  filterSessions,
  type MinimalSignature,
  type MinimalTimeSlot,
  type FilterableSession,
} from "@/lib/utils/formation";

describe("computeSessionStatus", () => {
  const now = new Date("2026-04-02T12:00:00Z");

  it("upcoming pour session future", () => {
    expect(computeSessionStatus("upcoming", "2026-04-15T09:00:00Z", "2026-04-17T17:00:00Z", now)).toBe("upcoming");
  });

  it("in_progress quand now entre start et end", () => {
    expect(computeSessionStatus("upcoming", "2026-04-01T09:00:00Z", "2026-04-05T17:00:00Z", now)).toBe("in_progress");
  });

  it("completed quand now après end", () => {
    expect(computeSessionStatus("upcoming", "2026-03-01T09:00:00Z", "2026-03-05T17:00:00Z", now)).toBe("completed");
  });

  it("préserve cancelled", () => {
    expect(computeSessionStatus("cancelled", "2026-04-01T09:00:00Z", "2026-04-05T17:00:00Z", now)).toBe("cancelled");
  });

  it("completed quand now === end", () => {
    expect(computeSessionStatus("upcoming", "2026-04-01T09:00:00Z", "2026-04-02T12:00:00Z", now)).toBe("completed");
  });

  it("in_progress quand now === start", () => {
    expect(computeSessionStatus("upcoming", "2026-04-02T12:00:00Z", "2026-04-05T17:00:00Z", now)).toBe("in_progress");
  });
});

describe("computeAttendanceRate", () => {
  it("0% sans créneau", () => {
    const r = computeAttendanceRate(0, 5, 1, 0);
    expect(r).toEqual({ totalExpected: 0, completionPct: 0 });
  });

  it("100% quand tout signé", () => {
    const r = computeAttendanceRate(3, 4, 1, 15);
    expect(r).toEqual({ totalExpected: 15, completionPct: 100 });
  });

  it("50%", () => {
    const r = computeAttendanceRate(2, 4, 1, 5);
    expect(r).toEqual({ totalExpected: 10, completionPct: 50 });
  });

  it("arrondit à 78%", () => {
    expect(computeAttendanceRate(3, 3, 0, 7).completionPct).toBe(78);
  });

  it("0 apprenant 0 formateur", () => {
    expect(computeAttendanceRate(5, 0, 0, 0)).toEqual({ totalExpected: 0, completionPct: 0 });
  });
});

describe("getSignaturesForSlot", () => {
  const slot: MinimalTimeSlot = { id: "slot-1", start_time: "2026-04-15T09:00:00Z", end_time: "2026-04-15T12:00:00Z" };

  it("retourne les signatures directement liées", () => {
    const sigs: MinimalSignature[] = [
      { id: "s1", signer_id: "l1", signer_type: "learner", time_slot_id: "slot-1", signed_at: "2026-04-15T10:00:00Z" },
      { id: "s2", signer_id: "l2", signer_type: "learner", time_slot_id: "slot-2", signed_at: "2026-04-15T14:00:00Z" },
    ];
    const result = getSignaturesForSlot(slot, sigs);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("s1");
  });

  it("fallback sur même jour si pas de time_slot_id", () => {
    const sigs: MinimalSignature[] = [
      { id: "s1", signer_id: "l1", signer_type: "learner", time_slot_id: null, signed_at: "2026-04-15T10:30:00Z" },
      { id: "s2", signer_id: "l2", signer_type: "learner", time_slot_id: null, signed_at: "2026-04-16T10:00:00Z" },
    ];
    expect(getSignaturesForSlot(slot, sigs)).toHaveLength(1);
  });

  it("retourne vide quand rien ne correspond", () => {
    const sigs: MinimalSignature[] = [
      { id: "s1", signer_id: "l1", signer_type: "learner", time_slot_id: "slot-99", signed_at: "2026-04-20T10:00:00Z" },
    ];
    expect(getSignaturesForSlot(slot, sigs)).toHaveLength(0);
  });

  it("priorité directes sur fallback", () => {
    const sigs: MinimalSignature[] = [
      { id: "direct", signer_id: "l1", signer_type: "learner", time_slot_id: "slot-1", signed_at: "2026-04-15T10:00:00Z" },
      { id: "floating", signer_id: "l2", signer_type: "learner", time_slot_id: null, signed_at: "2026-04-15T10:00:00Z" },
    ];
    const result = getSignaturesForSlot(slot, sigs);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("direct");
  });
});

describe("getQuestionStats", () => {
  it("null si aucune réponse", () => {
    expect(getQuestionStats("q1", "rating", [])).toBeNull();
  });

  it("null si réponses vides", () => {
    expect(getQuestionStats("q1", "rating", [{ responses: { q1: "" } }, { responses: {} }] as any)).toBeNull();
  });

  it("moyenne rating", () => {
    const r = getQuestionStats("q1", "rating", [
      { responses: { q1: 4 } }, { responses: { q1: 5 } }, { responses: { q1: 3 } }, { responses: { q1: 5 } },
    ]);
    expect(r).not.toBeNull();
    if (r!.type === "rating") {
      expect(r!.avg).toBe(4.25);
      expect(r!.count).toBe(4);
      expect(r!.distribution).toEqual([0, 0, 1, 1, 2]);
    }
  });

  it("comptages choix multiple", () => {
    const r = getQuestionStats("q1", "multiple_choice", [
      { responses: { q1: "A" } }, { responses: { q1: "B" } }, { responses: { q1: "A" } },
    ]);
    if (r!.type === "choice") {
      expect(r!.counts).toEqual({ A: 2, B: 1 });
      expect(r!.total).toBe(3);
    }
  });

  it("textes libres", () => {
    const r = getQuestionStats("q1", "text", [{ responses: { q1: "Super" } }, { responses: { q1: "Bien" } }]);
    if (r!.type === "text") {
      expect(r!.texts).toEqual(["Super", "Bien"]);
    }
  });

  it("ignore non-numériques dans rating", () => {
    const r = getQuestionStats("q1", "rating", [
      { responses: { q1: 4 } }, { responses: { q1: "nope" } }, { responses: { q1: 5 } },
    ]);
    if (r!.type === "rating") {
      expect(r!.avg).toBe(4.5);
      expect(r!.count).toBe(2);
    }
  });

  it("oui/non", () => {
    const r = getQuestionStats("q1", "yes_no", [
      { responses: { q1: "Oui" } }, { responses: { q1: "Non" } }, { responses: { q1: "Oui" } },
    ]);
    if (r!.type === "choice") {
      expect(r!.counts["Oui"]).toBe(2);
      expect(r!.counts["Non"]).toBe(1);
    }
  });
});

describe("filterSessions", () => {
  const sessions: FilterableSession[] = [
    {
      title: "Management Groupe A", status: "upcoming", mode: "presentiel", training_id: "t1",
      location: "Paris", training: { title: "Management", classification: "certifiant" },
      trainer: { first_name: "Marie", last_name: "Dupont" },
    },
    {
      title: "Sécurité incendie", status: "completed", mode: "distanciel", training_id: "t2",
      location: null, training: { title: "SST", classification: "reglementaire" },
      trainer: { first_name: "Pierre", last_name: "Martin" },
    },
    {
      title: "Excel avancé", status: "in_progress", mode: "hybride", training_id: "t3",
      location: "Lyon", training: { title: "Bureautique", classification: "qualifiant" },
      trainer: null,
    },
  ];

  it("retourne tout sans filtre", () => {
    expect(filterSessions(sessions, "", "all", "all")).toHaveLength(3);
  });

  it("filtre par titre", () => {
    expect(filterSessions(sessions, "management", "all", "all")).toHaveLength(1);
  });

  it("filtre par formateur", () => {
    expect(filterSessions(sessions, "dupont", "all", "all")).toHaveLength(1);
  });

  it("filtre par lieu", () => {
    expect(filterSessions(sessions, "lyon", "all", "all")).toHaveLength(1);
  });

  it("filtre par statut", () => {
    expect(filterSessions(sessions, "", "completed", "all")).toHaveLength(1);
  });

  it("filtre par mode", () => {
    expect(filterSessions(sessions, "", "all", "presentiel")).toHaveLength(1);
  });

  it("filtre par training_id", () => {
    expect(filterSessions(sessions, "", "all", "all", "t2")).toHaveLength(1);
  });

  it("filtre par classification", () => {
    expect(filterSessions(sessions, "", "all", "all", "all", "reglementaire")).toHaveLength(1);
  });

  it("combine filtres", () => {
    expect(filterSessions(sessions, "management", "upcoming", "presentiel")).toHaveLength(1);
  });

  it("retourne vide si rien ne correspond", () => {
    expect(filterSessions(sessions, "inexistant", "all", "all")).toHaveLength(0);
  });

  it("ne crashe pas avec trainer null", () => {
    expect(filterSessions(sessions, "test", "all", "all")).toHaveLength(0);
  });
});
