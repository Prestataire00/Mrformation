import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchSessionSlots,
  buildSlotDayIndex,
  slotDayLookup,
  dayKeyFromDate,
  dayKeyFromIso,
  type PlanningSlot,
} from "@/lib/services/planning-slots";

describe("planning-slots (matching session ↔ jour par créneaux)", () => {
  it("dayKeyFromIso cohérent avec dayKeyFromDate ; format YYYY-MM-DD", () => {
    const iso = "2026-04-15T09:30:00Z";
    expect(dayKeyFromIso(iso)).toBe(dayKeyFromDate(new Date(iso)));
    // Midi UTC : pas de bascule de jour selon le fuseau du runner (clé Europe/Paris).
    expect(dayKeyFromIso("2026-04-05T12:00:00Z")).toBe("2026-04-05");
  });

  it("buildSlotDayIndex regroupe les jours par session et déduplique", () => {
    const slots: PlanningSlot[] = [
      { session_id: "s1", start_time: "2026-04-15T09:00:00Z" },
      { session_id: "s1", start_time: "2026-04-15T14:00:00Z" }, // même jour
      { session_id: "s1", start_time: "2026-04-20T09:00:00Z" },
      { session_id: "s2", start_time: "2026-04-18T09:00:00Z" },
    ];
    const idx = buildSlotDayIndex(slots);
    expect(idx.sessionsWithSlots).toEqual(new Set(["s1", "s2"]));
    expect(idx.slotDaysBySession.get("s1")).toEqual(
      new Set([dayKeyFromIso("2026-04-15T09:00:00Z"), dayKeyFromIso("2026-04-20T09:00:00Z")]),
    );
    expect(idx.slotDaysBySession.get("s1")?.size).toBe(2);
  });

  it("slotDayLookup : jour avec créneau → true, sans → false, session sans créneau → null", () => {
    const idx = buildSlotDayIndex([{ session_id: "s1", start_time: "2026-04-15T09:00:00Z" }]);
    const dk = dayKeyFromIso("2026-04-15T09:00:00Z");
    expect(slotDayLookup(idx, "s1", dk)).toBe(true);
    expect(slotDayLookup(idx, "s1", "2026-04-16")).toBe(false);
    expect(slotDayLookup(idx, "s2", dk)).toBeNull(); // aucun créneau → fallback span
  });

  it("ignore les lignes sans session_id/start_time", () => {
    const idx = buildSlotDayIndex([
      { session_id: "", start_time: "2026-04-15T09:00:00Z" },
      { session_id: "s1", start_time: "" },
    ]);
    expect(idx.sessionsWithSlots.size).toBe(0);
  });

  it("fetchSessionSlots : ids vides → slots [] sans requête", async () => {
    const from = vi.fn();
    const supabase = { from } as unknown as SupabaseClient;
    const res = await fetchSessionSlots(supabase, []);
    expect(res).toEqual({ ok: true, slots: [] });
    expect(from).not.toHaveBeenCalled();
  });

  it("fetchSessionSlots : mappe data et remonte l'erreur", async () => {
    const okBuilder: Record<string, unknown> = {};
    okBuilder.select = () => okBuilder;
    okBuilder.in = () => okBuilder;
    okBuilder.limit = () =>
      Promise.resolve({ data: [{ session_id: "s1", start_time: "2026-04-15T09:00:00Z" }], error: null });
    const r1 = await fetchSessionSlots({ from: () => okBuilder } as unknown as SupabaseClient, ["s1"]);
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.slots).toHaveLength(1);

    const errBuilder: Record<string, unknown> = {};
    errBuilder.select = () => errBuilder;
    errBuilder.in = () => errBuilder;
    errBuilder.limit = () => Promise.resolve({ data: null, error: { message: "boom", code: "x" } });
    const r2 = await fetchSessionSlots({ from: () => errBuilder } as unknown as SupabaseClient, ["s1"]);
    expect(r2.ok).toBe(false);
  });
});
