const RETRYABLE = new Set([429, 500, 502, 503, 504, 529]);

export interface RetryOptions { retries?: number; baseDelayMs?: number; }

function statusOf(err: unknown): number | undefined {
  if (err && typeof err === "object" && "status" in err) {
    const s = (err as { status?: unknown }).status;
    return typeof s === "number" ? s : undefined;
  }
  return undefined;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 500;
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      const status = statusOf(err);
      const retryable = status === undefined ? false : RETRYABLE.has(status);
      if (!retryable || attempt >= retries) throw err;
      const delay = base * 2 ** attempt + Math.floor(Math.random() * base);
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
    }
  }
}
