import { describe, it, expect, afterEach } from "vitest";
import { formatTimeParis, getHourParis, formatYmdParis } from "@/lib/utils/paris-time";
import { resolveVariables, type ResolveContext } from "@/lib/utils/resolve-variables";
import type { Session } from "@/lib/types";

/**
 * Classe de bug « dates / fuseau horaire » (récurrente — cf docs/TIMEZONE.md).
 *
 * Bug d'origine : le resolver utilisait `new Date(iso).getHours()`, qui suit le
 * fuseau du PROCESS. En prod Netlify (UTC), un créneau saisi 09:00 Paris
 * (= 07:00Z l'été) sortait « 07:00 » dans le PDF de convocation alors que le
 * planning admin l'affiche correctement « 09:00 ».
 *
 * Ces tests verrouillent l'invariant : l'heure rendue dans les documents est
 * TOUJOURS Europe/Paris, quel que soit le fuseau du serveur d'exécution.
 *
 * NB régression subtile : si l'on testait uniquement la valeur attendue sans
 * forcer `process.env.TZ`, un retour à `getHours()` PASSERAIT quand la CI tourne
 * elle-même en Europe/Paris. On force donc des fuseaux hostiles.
 */

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});

const HOSTILE_TZS = ["UTC", "America/New_York", "Asia/Tokyo"];

describe("Helpers Paris — indépendants du fuseau du process (garde anti-getHours)", () => {
  it.each(HOSTILE_TZS)("formatTimeParis reste en heure Paris même si TZ=%s", (tz) => {
    process.env.TZ = tz;
    expect(formatTimeParis("2026-06-08T07:00:00.000Z")).toBe("09:00"); // été (UTC+2)
    expect(formatTimeParis("2026-01-15T08:00:00.000Z")).toBe("09:00"); // hiver (UTC+1)
  });

  it.each(HOSTILE_TZS)("getHourParis reste 9 même si TZ=%s", (tz) => {
    process.env.TZ = tz;
    expect(getHourParis("2026-06-08T07:00:00.000Z")).toBe(9);
  });

  it.each(HOSTILE_TZS)("formatYmdParis : 22:00Z (été) bascule au jour suivant même si TZ=%s", (tz) => {
    process.env.TZ = tz;
    expect(formatYmdParis("2026-06-14T22:00:00.000Z")).toBe("2026-06-15");
  });
});

describe("Resolver — créneaux rendus en heure Paris (bug convocation 07:00 vs 09:00)", () => {
  function sessionWithSlots(): Session {
    return {
      id: "session-1",
      entity_id: "entity-1",
      start_date: "2026-06-08T07:00:00.000Z",
      end_date: "2026-06-08T10:00:00.000Z",
      formation_time_slots: [
        { start_time: "2026-06-08T07:00:00.000Z", end_time: "2026-06-08T10:00:00.000Z" },
      ],
    } as unknown as Session;
  }

  const ctx = (): ResolveContext => ({ session: sessionWithSlots() });

  it("{{dates_detail}} affiche 09:00 / 12:00 (Paris), pas 07:00 / 10:00 (UTC)", () => {
    const html = resolveVariables("{{dates_detail}}", ctx());
    expect(html).toContain("09:00");
    expect(html).toContain("12:00");
    expect(html).not.toContain("07:00");
    expect(html).not.toContain("10:00");
  });

  it.each(HOSTILE_TZS)("…et reste en heure Paris même si le process tourne en TZ=%s", (tz) => {
    process.env.TZ = tz;
    const html = resolveVariables("{{dates_detail}}", ctx());
    expect(html).toContain("09:00");
    expect(html).toContain("12:00");
  });
});

describe("Resolver — dates de documents en date Paris (anti off-by-one minuit)", () => {
  // start_date 22:00Z (été) = 15/06 00:00 Paris → la date du document doit être
  // le 15/06, pas le 14/06 (ce que rendait le formatDate naïf en prod UTC).
  function midnightBoundarySession(): Session {
    return {
      id: "session-1",
      entity_id: "entity-1",
      start_date: "2026-06-14T22:00:00.000Z",
      end_date: "2026-06-15T15:00:00.000Z",
    } as unknown as Session;
  }

  it("{{date_debut}} : 22:00Z (= 15/06 00:00 Paris) rend 15/06/2026, pas 14/06", () => {
    const out = resolveVariables("{{date_debut}}", { session: midnightBoundarySession() });
    expect(out).toBe("15/06/2026");
  });

  it.each(HOSTILE_TZS)("{{date_debut}} reste 15/06/2026 même si TZ=%s", (tz) => {
    process.env.TZ = tz;
    const out = resolveVariables("{{date_debut}}", { session: midnightBoundarySession() });
    expect(out).toBe("15/06/2026");
  });

  it("dates diurnes inchangées (non-régression) : 09:00Z → 15/06/2026", () => {
    const session = {
      id: "s",
      entity_id: "e",
      start_date: "2026-06-15T09:00:00.000Z",
      end_date: "2026-06-16T17:00:00.000Z",
    } as unknown as Session;
    expect(resolveVariables("{{date_debut}}", { session })).toBe("15/06/2026");
    expect(resolveVariables("{{date_fin}}", { session })).toBe("16/06/2026");
  });
});

describe("Resolver — {{dates_detail}} fallback (sans créneaux) en calendrier Paris", () => {
  // start 22:30Z = 08/06 00:30 Paris ; sans formation_time_slots → branche fallback.
  function boundarySession(): Session {
    return {
      id: "session-1",
      entity_id: "entity-1",
      start_date: "2026-06-07T22:30:00.000Z",
      end_date: "2026-06-08T15:00:00.000Z",
    } as unknown as Session;
  }

  it.each(HOSTILE_TZS)("affiche le jour Paris (08/06), pas le jour UTC (07/06), même si TZ=%s", (tz) => {
    process.env.TZ = tz;
    const html = resolveVariables("{{dates_detail}}", { session: boundarySession() });
    expect(html).toContain("08/06/2026");
    expect(html).not.toContain("07/06/2026");
  });
});
