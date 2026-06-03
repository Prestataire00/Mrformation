import { describe, it, expect } from "vitest";
import { rangesOverlap } from "../slot-overlap";

describe("rangesOverlap", () => {
  it("détecte un overlap classique", () => {
    expect(
      rangesOverlap(
        { start_time: "2026-01-15T09:00:00Z", end_time: "2026-01-15T12:00:00Z" },
        { start_time: "2026-01-15T10:00:00Z", end_time: "2026-01-15T13:00:00Z" },
      ),
    ).toBe(true);
  });

  it("ne détecte PAS d'overlap si touch-end (12:00 = 12:00)", () => {
    expect(
      rangesOverlap(
        { start_time: "2026-01-15T09:00:00Z", end_time: "2026-01-15T12:00:00Z" },
        { start_time: "2026-01-15T12:00:00Z", end_time: "2026-01-15T15:00:00Z" },
      ),
    ).toBe(false);
  });

  it("détecte inclusion (b contenu dans a)", () => {
    expect(
      rangesOverlap(
        { start_time: "2026-01-15T09:00:00Z", end_time: "2026-01-15T17:00:00Z" },
        { start_time: "2026-01-15T10:00:00Z", end_time: "2026-01-15T11:00:00Z" },
      ),
    ).toBe(true);
  });

  it("ne détecte PAS d'overlap si séparés", () => {
    expect(
      rangesOverlap(
        { start_time: "2026-01-15T09:00:00Z", end_time: "2026-01-15T10:00:00Z" },
        { start_time: "2026-01-15T14:00:00Z", end_time: "2026-01-15T17:00:00Z" },
      ),
    ).toBe(false);
  });

  it("symétrique (a vs b == b vs a)", () => {
    const a = { start_time: "2026-01-15T09:00:00Z", end_time: "2026-01-15T12:00:00Z" };
    const b = { start_time: "2026-01-15T10:00:00Z", end_time: "2026-01-15T13:00:00Z" };
    expect(rangesOverlap(a, b)).toBe(rangesOverlap(b, a));
  });

  it("gère les dates de jours différents (pas d'overlap)", () => {
    expect(
      rangesOverlap(
        { start_time: "2026-01-15T09:00:00Z", end_time: "2026-01-15T17:00:00Z" },
        { start_time: "2026-01-16T09:00:00Z", end_time: "2026-01-16T17:00:00Z" },
      ),
    ).toBe(false);
  });
});
