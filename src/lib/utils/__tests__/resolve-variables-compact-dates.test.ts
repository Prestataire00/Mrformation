import { describe, it, expect, afterEach } from "vitest";
import { resolveVariables, type ResolveContext } from "@/lib/utils/resolve-variables";
import type { Session } from "@/lib/types";

/**
 * Émargement compact — DATE et regroupement par SEMAINE en calendrier Paris.
 *
 * Les heures étaient déjà rendues en Paris ; restaient les dates et la semaine
 * ISO, calculées via date-fns en heure locale du process. Un créneau en bordure
 * de jour (22:30Z = 00:30 le lendemain à Paris) tombait alors sur la date — et
 * potentiellement la semaine ISO — de la veille en prod UTC.
 */

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});
const HOSTILE_TZS = ["UTC", "America/New_York"];

// Créneau 2026-06-07T22:30:00Z → 2026-06-08T02:00:00Z
// = lundi 08/06 00:30 → 04:00 à Paris (alors que la date UTC est dimanche 07/06).
function boundarySession(): Session {
  return {
    id: "session-1",
    entity_id: "entity-1",
    start_date: "2026-06-07T22:30:00.000Z",
    end_date: "2026-06-08T02:00:00.000Z",
    enrollments: [{ learner: { id: "learner-1", first_name: "Pierre", last_name: "MARTIN" } }],
    formation_trainers: [{ trainer: { id: "trainer-1", first_name: "Karim", last_name: "AZIZI" } }],
    formation_time_slots: [
      { id: "slot-1", start_time: "2026-06-07T22:30:00.000Z", end_time: "2026-06-08T02:00:00.000Z" },
    ],
  } as unknown as Session;
}

function resolveCompact(): string {
  const ctx: ResolveContext = { session: boundarySession() };
  return resolveVariables("{{tableau_signature_compact}}", ctx);
}

describe("Émargement compact — date & semaine en calendrier Paris", () => {
  it("créneau 22:30Z (= 08/06 Paris) → date 08/06/2026, pas 07/06/2026 (UTC)", () => {
    const html = resolveCompact();
    expect(html).toContain("08/06/2026");
    expect(html).not.toContain("07/06/2026");
  });

  it.each(HOSTILE_TZS)("reste en calendrier Paris même si TZ=%s", (tz) => {
    process.env.TZ = tz;
    const html = resolveCompact();
    expect(html).toContain("08/06/2026");
    expect(html).not.toContain("07/06/2026");
  });
});
