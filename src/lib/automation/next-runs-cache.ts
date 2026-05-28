/**
 * Story aut-a-6 — Cache module-level du batch-loader next-runs.
 *
 * Extrait du fichier route.ts pour respecter la contrainte Next.js 14
 * App Router (seuls les exports HTTP sont autorisés dans route.ts).
 *
 * TTL 5 minutes (ID-AUT-1 architecture).
 * Utilisé par GET /api/automation/next-runs.
 * Invalidation manuelle exposée via invalidateNextRunsCache() pour les
 * Server Actions qui modifient une rule (futures stories B.2 / E.2).
 */

import type { NextRunInfo } from "@/lib/automation/next-run-natural-language";

type CacheEntry = {
  computedAt: number;
  data: Record<string, NextRunInfo>;
};

const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000; // 5 minutes

export function getNextRunsCache(entityId: string): CacheEntry | undefined {
  const entry = CACHE.get(entityId);
  if (!entry) return undefined;
  if (Date.now() - entry.computedAt >= TTL_MS) {
    CACHE.delete(entityId);
    return undefined;
  }
  return entry;
}

export function setNextRunsCache(
  entityId: string,
  data: Record<string, NextRunInfo>,
): void {
  CACHE.set(entityId, { computedAt: Date.now(), data });
}

/**
 * Invalide manuellement le cache pour une entité.
 * À appeler après modification d'une rule (Server Action save/toggle/delete).
 */
export function invalidateNextRunsCache(entityId: string): void {
  CACHE.delete(entityId);
}
