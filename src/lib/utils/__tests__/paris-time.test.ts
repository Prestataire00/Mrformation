import { describe, it, expect } from "vitest";
import { formatTimeParis, getHourParis, formatYmdParis } from "../paris-time";

describe("formatTimeParis", () => {
  // En été (CEST, UTC+2) : 07:00Z = 09:00 Paris
  it("convertit 07:00Z en 09:00 Paris en été", () => {
    expect(formatTimeParis("2026-06-08T07:00:00.000Z")).toBe("09:00");
  });

  // En hiver (CET, UTC+1) : 08:00Z = 09:00 Paris
  it("convertit 08:00Z en 09:00 Paris en hiver", () => {
    expect(formatTimeParis("2026-01-15T08:00:00.000Z")).toBe("09:00");
  });

  it("convertit 10:00Z en 12:00 Paris en été", () => {
    expect(formatTimeParis("2026-06-08T10:00:00.000Z")).toBe("12:00");
  });

  it("renvoie --:-- pour une ISO invalide", () => {
    expect(formatTimeParis("not-a-date")).toBe("--:--");
  });
});

describe("getHourParis", () => {
  it("renvoie 9 pour 07:00Z en été", () => {
    expect(getHourParis("2026-06-08T07:00:00.000Z")).toBe(9);
  });

  it("renvoie 14 pour 12:00Z en été (après-midi)", () => {
    expect(getHourParis("2026-06-08T12:00:00.000Z")).toBe(14);
  });

  it("renvoie 9 pour 08:00Z en hiver (UTC+1)", () => {
    expect(getHourParis("2026-01-15T08:00:00.000Z")).toBe(9);
  });
});

describe("formatYmdParis", () => {
  it("23:00Z reste le même jour en hiver (= 00:00 Paris)", () => {
    expect(formatYmdParis("2026-01-14T23:00:00.000Z")).toBe("2026-01-15");
  });

  it("22:00Z bascule au jour suivant en été (= 00:00 Paris)", () => {
    expect(formatYmdParis("2026-06-14T22:00:00.000Z")).toBe("2026-06-15");
  });

  it("conserve le jour pour 12:00Z", () => {
    expect(formatYmdParis("2026-06-08T12:00:00.000Z")).toBe("2026-06-08");
  });
});
