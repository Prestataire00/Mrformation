import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logEvent } from "@/lib/logger";

describe("logEvent", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("émet un seul appel console.log avec du JSON sur une ligne", () => {
    logEvent("test_event", { foo: "bar" });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const arg = logSpy.mock.calls[0][0];
    expect(typeof arg).toBe("string");
    expect(() => JSON.parse(arg as string)).not.toThrow();
  });

  it("inclut le nom de l'événement et un timestamp ISO", () => {
    logEvent("test_event", { foo: "bar" });
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed.event).toBe("test_event");
    expect(typeof parsed.ts).toBe("string");
    // ISO-parseable et non NaN
    expect(Number.isNaN(Date.parse(parsed.ts))).toBe(false);
    expect(new Date(parsed.ts).toISOString()).toBe(parsed.ts);
  });

  it("étale les champs de contexte dans l'objet émis", () => {
    logEvent("test_event", { foo: "bar", count: 3, nullable: null });
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed.foo).toBe("bar");
    expect(parsed.count).toBe(3);
    expect(parsed.nullable).toBeNull();
  });

  it("fonctionne avec un contexte vide", () => {
    logEvent("empty_event", {});
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed.event).toBe("empty_event");
    expect(parsed.ts).toBeDefined();
  });
});
