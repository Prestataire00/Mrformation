import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkRateLimit } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    // Use a unique identifier per test to avoid cross-test pollution
    vi.useFakeTimers();
  });

  it("allows the first request", () => {
    const id = "test-first-" + Math.random();
    const result = checkRateLimit(id, { limit: 5, windowSeconds: 60 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("allows requests within the limit", () => {
    const id = "test-within-" + Math.random();
    const config = { limit: 3, windowSeconds: 60 };

    const r1 = checkRateLimit(id, config);
    const r2 = checkRateLimit(id, config);
    const r3 = checkRateLimit(id, config);

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("blocks requests exceeding the limit", () => {
    const id = "test-exceed-" + Math.random();
    const config = { limit: 2, windowSeconds: 60 };

    checkRateLimit(id, config); // 1
    checkRateLimit(id, config); // 2
    const r3 = checkRateLimit(id, config); // 3 -> blocked

    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it("allows requests again after window expires", () => {
    const id = "test-expire-" + Math.random();
    const config = { limit: 1, windowSeconds: 10 };

    const r1 = checkRateLimit(id, config);
    expect(r1.allowed).toBe(true);

    const r2 = checkRateLimit(id, config);
    expect(r2.allowed).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(11_000);

    const r3 = checkRateLimit(id, config);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });
});
