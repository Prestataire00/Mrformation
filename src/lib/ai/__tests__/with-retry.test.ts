import { describe, it, expect, vi } from "vitest";
import { withRetry } from "../with-retry";

describe("withRetry", () => {
  it("réessaie sur erreur retryable puis réussit", async () => {
    let n = 0;
    const fn = vi.fn(async () => { n++; if (n < 3) { const e = new Error("429") as Error & {status:number}; e.status = 429; throw e; } return "ok"; });
    const r = await withRetry(fn, { retries: 3, baseDelayMs: 1 });
    expect(r).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });
  it("ne réessaie PAS sur erreur non-retryable (400)", async () => {
    const fn = vi.fn(async () => { const e = new Error("400") as Error & {status:number}; e.status = 400; throw e; });
    await expect(withRetry(fn, { retries: 3, baseDelayMs: 1 })).rejects.toThrow("400");
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("abandonne après N tentatives", async () => {
    const fn = vi.fn(async () => { const e = new Error("503") as Error & {status:number}; e.status = 503; throw e; });
    await expect(withRetry(fn, { retries: 2, baseDelayMs: 1 })).rejects.toThrow("503");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
