import { describe, it, expect } from "vitest";
import { computeLearnerAttendance } from "../learner-attendance";

const slot = (id: string, h: number) => ({
  id,
  start_time: "2026-06-22T08:00:00Z",
  end_time: `2026-06-22T${String(8 + h).padStart(2, "0")}:00:00Z`,
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
