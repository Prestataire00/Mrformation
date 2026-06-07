/**
 * Helper for measuring elapsed time in E2E tests (E2-S13).
 */
export async function measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const t0 = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - t0 };
}
