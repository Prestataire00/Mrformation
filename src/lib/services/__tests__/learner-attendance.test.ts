import { describe, it, expect } from "vitest";
import {
  computeLearnerAttendance,
  computeAttestationAttendance,
  type SlotSignatureRow,
} from "../learner-attendance";

const slot = (id: string, h: number) => ({
  id,
  start_time: "2026-06-22T08:00:00Z",
  end_time: `2026-06-22T${String(8 + h).padStart(2, "0")}:00:00Z`,
});

const sig = (signer_id: string | null, time_slot_id: string | null): SlotSignatureRow => ({
  signer_id,
  time_slot_id,
});

describe("computeLearnerAttendance", () => {
  it("calcule présence et heures par session", () => {
    const res = computeLearnerAttendance([
      {
        session_id: "s1",
        title: "Maçon",
        slots: [slot("a", 3), slot("b", 3), slot("c", 2), slot("d", 4)],
        signedSlotIds: ["a", "c"],
      },
    ]);
    expect(res.sessions[0]).toMatchObject({
      signed_slots: 2,
      total_slots: 4,
      rate_pct: 50,
      signed_hours: 5, // 3 + 2
      total_hours: 12, // 3+3+2+4
    });
    expect(res.overall_rate_pct).toBe(50);
    expect(res.total_signed_hours).toBe(5);
  });

  it("agrège plusieurs sessions pour le taux global", () => {
    const res = computeLearnerAttendance([
      { session_id: "s1", title: "A", slots: [slot("a", 2), slot("b", 2)], signedSlotIds: ["a", "b"] },
      { session_id: "s2", title: "B", slots: [slot("c", 2), slot("d", 2)], signedSlotIds: [] },
    ]);
    // 2 signés / 4 total = 50%
    expect(res.overall_rate_pct).toBe(50);
    expect(res.sessions.find((s) => s.session_id === "s1")!.rate_pct).toBe(100);
    expect(res.sessions.find((s) => s.session_id === "s2")!.rate_pct).toBe(0);
  });

  it("déduplique les créneaux signés", () => {
    const res = computeLearnerAttendance([
      { session_id: "s1", title: "A", slots: [slot("a", 1)], signedSlotIds: ["a", "a"] },
    ]);
    expect(res.sessions[0].signed_slots).toBe(1);
    expect(res.sessions[0].rate_pct).toBe(100);
  });

  it("session sans créneau → 0% sans division par zéro", () => {
    const res = computeLearnerAttendance([
      { session_id: "s1", title: "A", slots: [], signedSlotIds: [] },
    ]);
    expect(res.sessions[0].rate_pct).toBe(0);
    expect(res.overall_rate_pct).toBe(0);
  });

  it("aucune session → global 0", () => {
    const res = computeLearnerAttendance([]);
    expect(res).toEqual({ sessions: [], overall_rate_pct: 0, total_signed_hours: 0 });
  });
});

describe("computeAttestationAttendance", () => {
  const slots = [slot("a", 3), slot("b", 4)]; // 3h + 4h = 7h

  it("émargement partiel → heures signées et taux basé sur les heures", () => {
    const rows = [sig("learner-1", "a")];
    const res = computeAttestationAttendance(slots, rows, "learner-1");
    expect(res).toEqual({ signedHours: 3, totalHours: 7, ratePct: 42.86 });
  });

  it("émargement intégral → heures = total, taux = 100", () => {
    const rows = [sig("learner-1", "a"), sig("learner-1", "b")];
    expect(computeAttestationAttendance(slots, rows, "learner-1")).toEqual({
      signedHours: 7,
      totalHours: 7,
      ratePct: 100,
    });
  });

  it("session sans créneaux → null (fallback legacy)", () => {
    expect(computeAttestationAttendance([], [sig("learner-1", null)], "learner-1")).toBeNull();
  });

  it("apprenant sans signature slot-level (legacy time_slot_id NULL) → null", () => {
    const rows = [sig("learner-1", null)];
    expect(computeAttestationAttendance(slots, rows, "learner-1")).toBeNull();
  });

  it("session AVEC créneaux mais apprenant sans aucune signature → null (fallback legacy)", () => {
    expect(computeAttestationAttendance(slots, [], "learner-1")).toBeNull();
  });

  it("ignore les signatures des autres apprenants", () => {
    const rows = [sig("autre", "a"), sig("autre", "b")];
    expect(computeAttestationAttendance(slots, rows, "learner-1")).toBeNull();
  });

  it("créneaux dégénérés (durée nulle/négative) signés → null plutôt qu'un faux 0h", () => {
    const badSlots = [
      { id: "x", start_time: "2026-06-22T10:00:00Z", end_time: "2026-06-22T10:00:00Z" },
      { id: "y", start_time: "2026-06-22T12:00:00Z", end_time: "2026-06-22T11:00:00Z" },
    ];
    const rows = [sig("learner-1", "x"), sig("learner-1", "y")];
    expect(computeAttestationAttendance(badSlots, rows, "learner-1")).toBeNull();
  });

  it("signature orpheline (time_slot_id absent des créneaux) → null", () => {
    const rows = [sig("learner-1", "slot-supprimé")];
    expect(computeAttestationAttendance(slots, rows, "learner-1")).toBeNull();
  });
});
