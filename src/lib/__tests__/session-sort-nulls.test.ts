/**
 * Tests unitaires — Story 2-2 : Tri sessions start_date DESC + null-safety
 *
 * Vérifie que :
 * 1. partitionSessions préserve l'ordre d'entrée (le tri Supabase est conservé)
 * 2. Les sessions sans start_date sont reléguées en fin de liste
 * 3. La logique de status computation est null-safe
 */
import { describe, it, expect } from "vitest";
import { partitionSessions } from "@/lib/utils/session-grouping";

// ── Helpers ──────────────────────────────────────────────────────────────────

type MinSession = { id: string; start_date: string | null; status: string };

/** Simule la logique de status computation null-safe (identique à fetchSessions). */
function computeStatusNullSafe(
  s: MinSession,
  now: Date
): string {
  const rawStart = s.start_date;
  // Pour le test, on ignore end_date (testé via start_date null path)
  let computedStatus = s.status;
  if (computedStatus !== "cancelled" && rawStart) {
    const startDate = new Date(rawStart);
    if (now >= startDate) computedStatus = "in_progress";
    else computedStatus = "upcoming";
  } else if (computedStatus !== "cancelled" && !rawStart) {
    computedStatus = s.status || "upcoming";
  }
  return computedStatus;
}

/** Trie comme Supabase le ferait : start_date DESC, nulls last. */
function sortStartDateDescNullsLast<T extends { start_date: string | null }>(
  sessions: T[]
): T[] {
  return [...sessions].sort((a, b) => {
    if (!a.start_date && !b.start_date) return 0;
    if (!a.start_date) return 1;
    if (!b.start_date) return -1;
    return new Date(b.start_date).getTime() - new Date(a.start_date).getTime();
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Story 2-2 — Tri sessions start_date DESC", () => {
  const sessions: MinSession[] = [
    { id: "recent", start_date: "2026-06-20", status: "upcoming" },
    { id: "old", start_date: "2025-01-10", status: "completed" },
    { id: "mid", start_date: "2026-03-15", status: "in_progress" },
    { id: "no-date", start_date: null, status: "upcoming" },
    { id: "no-date-2", start_date: null, status: "in_progress" },
  ];

  it("trie par start_date décroissante, nulls en fin", () => {
    const sorted = sortStartDateDescNullsLast(sessions);
    expect(sorted.map((s) => s.id)).toEqual([
      "recent",
      "mid",
      "old",
      "no-date",
      "no-date-2",
    ]);
  });

  it("partitionSessions préserve l'ordre d'entrée dans chaque groupe", () => {
    // Entrée déjà triée start_date DESC, nulls last
    const sorted = sortStartDateDescNullsLast(sessions);
    const { active, completed } = partitionSessions(sorted);

    // Active = upcoming + in_progress (order preserved)
    const activeIds = active.map((s) => s.id);
    expect(activeIds).toEqual(["recent", "mid", "no-date", "no-date-2"]);

    // Completed preserves order too
    const completedIds = completed.map((s) => s.id);
    expect(completedIds).toEqual(["old"]);
  });

  it("kanban : filtrer par statut préserve l'ordre start_date DESC", () => {
    const sorted = sortStartDateDescNullsLast([
      { id: "a", start_date: "2026-06-01", status: "upcoming" },
      { id: "b", start_date: "2026-04-01", status: "upcoming" },
      { id: "c", start_date: "2026-02-01", status: "upcoming" },
      { id: "d", start_date: null, status: "upcoming" },
    ]);
    const upcoming = sorted.filter((s) => s.status === "upcoming");
    expect(upcoming.map((s) => s.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("sessions sans start_date : status computation ne crashe pas", () => {
    const now = new Date("2026-06-27");
    const nullDateSession: MinSession = {
      id: "x",
      start_date: null,
      status: "upcoming",
    };
    const result = computeStatusNullSafe(nullDateSession, now);
    expect(result).toBe("upcoming");
  });

  it("sessions sans start_date et sans statut DB : défaut upcoming", () => {
    const now = new Date("2026-06-27");
    const noStatus: MinSession = { id: "y", start_date: null, status: "" };
    const result = computeStatusNullSafe(noStatus, now);
    expect(result).toBe("upcoming");
  });

  it("sessions cancelled ne sont pas re-computées même sans date", () => {
    const now = new Date("2026-06-27");
    const cancelled: MinSession = {
      id: "z",
      start_date: null,
      status: "cancelled",
    };
    const result = computeStatusNullSafe(cancelled, now);
    expect(result).toBe("cancelled");
  });
});
