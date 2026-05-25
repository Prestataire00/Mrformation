import { describe, it, expect } from "vitest";
import { getTrainerStats } from "@/lib/services/trainer-hours";
import type { Session } from "@/lib/types";

function makeFormation(overrides: Partial<Session> = {}): Session {
  return {
    formation_trainers: [],
    formation_time_slots: [],
    signatures: [],
    ...overrides,
  } as Session;
}

describe("getTrainerStats", () => {
  it("aucune signature → hours=0, dates=[], slotCount=0", () => {
    const formation = makeFormation({
      formation_time_slots: [
        { id: "ts1", start_time: "2026-01-01T09:00:00Z", end_time: "2026-01-01T12:00:00Z" } as never,
      ],
    });
    const stats = getTrainerStats(formation, "TRAINER-1");
    expect(stats.hours).toBe(0);
    expect(stats.dates).toEqual([]);
    expect(stats.slotCount).toBe(0);
  });

  it("1 signature trainer sur slot 3h → hours=3, slotCount=1, 1 date", () => {
    const formation = makeFormation({
      formation_time_slots: [
        { id: "ts1", start_time: "2026-01-01T09:00:00Z", end_time: "2026-01-01T12:00:00Z" } as never,
      ],
      signatures: [
        { signer_id: "TRAINER-1", signer_type: "trainer", time_slot_id: "ts1" } as never,
      ],
    });
    const stats = getTrainerStats(formation, "TRAINER-1");
    expect(stats.hours).toBe(3);
    expect(stats.slotCount).toBe(1);
    expect(stats.dates).toHaveLength(1);
  });

  it("signatures d'un autre trainer ignorées", () => {
    const formation = makeFormation({
      formation_time_slots: [
        { id: "ts1", start_time: "2026-01-01T09:00:00Z", end_time: "2026-01-01T12:00:00Z" } as never,
      ],
      signatures: [
        { signer_id: "TRAINER-OTHER", signer_type: "trainer", time_slot_id: "ts1" } as never,
      ],
    });
    const stats = getTrainerStats(formation, "TRAINER-1");
    expect(stats.hours).toBe(0);
    expect(stats.slotCount).toBe(0);
  });

  it("signatures non-trainer (learner) ignorées", () => {
    const formation = makeFormation({
      formation_time_slots: [
        { id: "ts1", start_time: "2026-01-01T09:00:00Z", end_time: "2026-01-01T12:00:00Z" } as never,
      ],
      signatures: [
        { signer_id: "TRAINER-1", signer_type: "learner", time_slot_id: "ts1" } as never,
      ],
    });
    const stats = getTrainerStats(formation, "TRAINER-1");
    expect(stats.hours).toBe(0);
  });

  it("plusieurs slots et signatures → hours additionnées, dates dédupliquées", () => {
    const formation = makeFormation({
      formation_time_slots: [
        { id: "ts1", start_time: "2026-01-01T09:00:00Z", end_time: "2026-01-01T12:00:00Z" } as never,
        { id: "ts2", start_time: "2026-01-01T14:00:00Z", end_time: "2026-01-01T17:00:00Z" } as never,
        { id: "ts3", start_time: "2026-01-02T09:00:00Z", end_time: "2026-01-02T11:30:00Z" } as never,
      ],
      signatures: [
        { signer_id: "TRAINER-1", signer_type: "trainer", time_slot_id: "ts1" } as never,
        { signer_id: "TRAINER-1", signer_type: "trainer", time_slot_id: "ts2" } as never,
        { signer_id: "TRAINER-1", signer_type: "trainer", time_slot_id: "ts3" } as never,
      ],
    });
    const stats = getTrainerStats(formation, "TRAINER-1");
    expect(stats.hours).toBe(8.5);
    expect(stats.slotCount).toBe(3);
    expect(stats.dates).toHaveLength(2);
  });
});
