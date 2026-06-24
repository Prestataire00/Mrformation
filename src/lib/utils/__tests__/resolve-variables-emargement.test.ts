import { describe, it, expect, afterEach } from "vitest";
import { resolveVariables, type ResolveContext } from "@/lib/utils/resolve-variables";
import type { Session, Learner } from "@/lib/types";

/**
 * Émargement — feuille de signature individuelle (`{{tableau_signature_individuel}}`).
 *
 * Classe de bug fuseau (même que la convocation) : les heures de créneaux et le
 * libellé MATIN / APRÈS-MIDI doivent être calculés en Europe/Paris, pas en UTC.
 * Un créneau 11:00Z (= 13:00 Paris) doit afficher « 13:00 » et « APRES MIDI »,
 * pas « 11:00 » et « MATIN ».
 */

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});
const HOSTILE_TZS = ["UTC", "America/New_York"];

function makeLearner(): Learner {
  return {
    id: "learner-1",
    entity_id: "entity-1",
    client_id: "client-1",
    first_name: "Pierre",
    last_name: "MARTIN",
    email: "pierre.martin@example.com",
  } as Learner;
}

// Session été : slot matin 07:00→11:00Z (= 09:00→13:00 Paris),
//               slot aprem 11:00→15:00Z (= 13:00→17:00 Paris).
function sessionWithRealSlots(): Session {
  return {
    id: "session-1",
    entity_id: "entity-1",
    start_date: "2026-06-08T07:00:00.000Z",
    end_date: "2026-06-08T15:00:00.000Z",
    formation_time_slots: [
      { id: "slot-1", start_time: "2026-06-08T07:00:00.000Z", end_time: "2026-06-08T11:00:00.000Z" },
      { id: "slot-2", start_time: "2026-06-08T11:00:00.000Z", end_time: "2026-06-08T15:00:00.000Z" },
    ],
  } as unknown as Session;
}

const ctx = (): ResolveContext => ({ session: sessionWithRealSlots(), learner: makeLearner() });

describe("Émargement individuel — heures de créneaux en heure Paris", () => {
  it("affiche 09:00 / 13:00 / 17:00 (Paris), pas 07:00 / 11:00 / 15:00 (UTC)", () => {
    const html = resolveVariables("{{tableau_signature_individuel}}", ctx());
    expect(html).toContain("09:00");
    expect(html).toContain("13:00");
    expect(html).toContain("17:00");
    expect(html).not.toContain("07:00");
    expect(html).not.toContain("11:00");
  });

  it("libelle MATIN / APRÈS-MIDI selon l'heure Paris (créneau 11:00Z = 13:00 → APRES MIDI)", () => {
    const html = resolveVariables("{{tableau_signature_individuel}}", ctx());
    expect(html).toContain("MATIN");
    expect(html).toContain("APRES MIDI");
  });

  it.each(HOSTILE_TZS)("reste en heure Paris même si le process tourne en TZ=%s", (tz) => {
    process.env.TZ = tz;
    const html = resolveVariables("{{tableau_signature_individuel}}", ctx());
    expect(html).toContain("09:00");
    expect(html).toContain("13:00");
    expect(html).toContain("APRES MIDI");
  });
});

describe("Émargement individuel — fallback legacy (sans formation_time_slots)", () => {
  it("conserve l'affichage des créneaux génériques 09:00 / 12:00 / 13:00 / 17:00", () => {
    const session = {
      id: "session-1",
      entity_id: "entity-1",
      start_date: "2026-06-08T07:00:00.000Z",
      end_date: "2026-06-08T15:00:00.000Z",
      // pas de formation_time_slots → branche fallback
    } as unknown as Session;
    const html = resolveVariables("{{tableau_signature_individuel}}", { session, learner: makeLearner() });
    expect(html).toContain("09:00");
    expect(html).toContain("12:00");
    expect(html).toContain("13:00");
    expect(html).toContain("17:00");
  });

  it.each(HOSTILE_TZS)("date en calendrier Paris : start 22:30Z (= 08/06 Paris) → 08/06, pas 07/06, même si TZ=%s", (tz) => {
    process.env.TZ = tz;
    const session = {
      id: "session-1",
      entity_id: "entity-1",
      start_date: "2026-06-07T22:30:00.000Z", // = 08/06 00:30 Paris
      end_date: "2026-06-08T15:00:00.000Z", // = 08/06 17:00 Paris (même jour Paris)
      // pas de formation_time_slots → branche fallback
    } as unknown as Session;
    const html = resolveVariables("{{tableau_signature_individuel}}", { session, learner: makeLearner() });
    expect(html).toContain("08/06/2026");
    expect(html).not.toContain("07/06/2026");
  });
});
