"use client";

/**
 * Story aut-b-2 — Hook custom pour le batch-loader next-runs.
 *
 * Consomme GET /api/automation/next-runs?entity_id=X (aut-a-6) avec cache
 * server-side 5min. Côté client, retourne un Map<rule_id, NextRunInfo> pour
 * lookup O(1) depuis <NextRunBadge>.
 *
 * Pas de React Query dans le projet → useEffect simple. Re-fetch sur
 * changement d'entityId. Pas de polling automatique (V2).
 */

import { useEffect, useState } from "react";
import type { NextRunInfo } from "@/lib/automation/next-run-natural-language";

type State = {
  data: Map<string, NextRunInfo>;
  loading: boolean;
  error: string | null;
};

export function useNextRuns(entityId: string | undefined): State {
  const [state, setState] = useState<State>({
    data: new Map(),
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!entityId) {
      setState({ data: new Map(), loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    fetch(`/api/automation/next-runs?entity_id=${entityId}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || json.error) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        return json.data as Record<string, NextRunInfo>;
      })
      .then((record) => {
        if (cancelled) return;
        setState({
          data: new Map(Object.entries(record)),
          loading: false,
          error: null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          data: new Map(),
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [entityId]);

  return state;
}
