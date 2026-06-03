import { describe, it, expect } from "vitest";
import { slotsToIcs } from "../ics-export";
import type { FormationTimeSlot } from "@/lib/types";

function slot(id: string, start: string, end: string, overrides: Partial<FormationTimeSlot> = {}): FormationTimeSlot {
  return {
    id,
    session_id: "sess-1",
    title: null,
    start_time: start,
    end_time: end,
    slot_order: 0,
    module_title: null,
    module_objectives: null,
    module_themes: null,
    module_exercises: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  } as FormationTimeSlot;
}

describe("slotsToIcs", () => {
  it("produit un VCALENDAR vide si pas de slots", () => {
    const ics = slotsToIcs({ sessionId: "s", sessionTitle: "Test", slots: [] });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  it("inclut un VEVENT par slot avec DTSTART/DTEND au format UTC", () => {
    const ics = slotsToIcs({
      sessionId: "s",
      sessionTitle: "Formation Excel",
      slots: [slot("slot-1", "2026-01-15T09:00:00.000Z", "2026-01-15T12:00:00.000Z")],
    });
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("UID:slot-1@mr-formation.fr");
    expect(ics).toContain("DTSTART:20260115T090000Z");
    expect(ics).toContain("DTEND:20260115T120000Z");
    expect(ics).toContain("SUMMARY:Formation Excel");
  });

  it("priorise module_title > title > sessionTitle pour SUMMARY", () => {
    const ics1 = slotsToIcs({
      sessionId: "s",
      sessionTitle: "Session",
      slots: [slot("a", "2026-01-15T09:00:00Z", "2026-01-15T12:00:00Z", { module_title: "Module 1" })],
    });
    expect(ics1).toContain("SUMMARY:Module 1");

    const ics2 = slotsToIcs({
      sessionId: "s",
      sessionTitle: "Session",
      slots: [slot("a", "2026-01-15T09:00:00Z", "2026-01-15T12:00:00Z", { title: "Matin" })],
    });
    expect(ics2).toContain("SUMMARY:Matin");
  });

  it("concatène objectifs / thèmes / exercices dans DESCRIPTION", () => {
    const ics = slotsToIcs({
      sessionId: "s",
      sessionTitle: "Session",
      slots: [
        slot("a", "2026-01-15T09:00:00Z", "2026-01-15T12:00:00Z", {
          module_objectives: "Comprendre X",
          module_themes: "Thème A\nThème B",
          module_exercises: "Mise en pratique",
        }),
      ],
    });
    expect(ics).toContain("DESCRIPTION:");
    // Le contenu peut être plié par fold() au-delà de 75 chars — on
    // déplie pour la comparaison (CRLF + espace → "").
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("Objectifs : Comprendre X");
    expect(unfolded).toContain("Thèmes : Thème A\\nThème B");
    expect(unfolded).toContain("Exercices : Mise en pratique");
  });

  it("échappe les caractères ICS spéciaux (virgule, point-virgule, backslash, newline)", () => {
    const ics = slotsToIcs({
      sessionId: "s",
      sessionTitle: "Session",
      slots: [
        slot("a", "2026-01-15T09:00:00Z", "2026-01-15T12:00:00Z", {
          module_title: "Module ; avec, virgule\nbackslash\\here",
        }),
      ],
    });
    expect(ics).toContain("Module \\; avec\\, virgule\\nbackslash\\\\here");
  });

  it("utilise X-WR-CALNAME = sessionTitle pour le nom dans le calendrier", () => {
    const ics = slotsToIcs({
      sessionId: "s",
      sessionTitle: "Mon Planning",
      slots: [],
    });
    expect(ics).toContain("X-WR-CALNAME:Mon Planning");
  });

  it("plie les lignes > 75 caractères (RFC 5545)", () => {
    const longTitle = "X".repeat(100);
    const ics = slotsToIcs({
      sessionId: "s",
      sessionTitle: longTitle,
      slots: [],
    });
    // Au moins une ligne pliée (CRLF + espace)
    expect(ics).toMatch(/\r\n /);
  });
});
