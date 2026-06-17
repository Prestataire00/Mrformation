/** Sous-ensemble de QualiteRow manipulé par la fusion (indicateurs numériques + clés). */
export interface QualiteRowLite {
  id: string;
  formation: string;
  annee: number;
  eval_preformation: number | null;
  eval_pendant: number | null;
  eval_postformation: number | null;
  satisfaction_chaud: number | null;
  satisfaction_froid: number | null;
  [key: string]: unknown;
}

const INDICATORS = [
  "eval_preformation", "eval_pendant", "eval_postformation",
  "auto_eval_pre", "auto_eval_post",
  "satisfaction_chaud", "satisfaction_froid",
  "quest_financeurs", "quest_formateurs", "quest_managers", "quest_entreprises", "autres_quest",
] as const;

const key = (r: { formation: string; annee: number }) =>
  `${(r.formation || "").trim().toLowerCase()}|${r.annee}`;

/**
 * Fusionne le calcul live (base, 1 ligne/session) avec le précalculé (par formation+année).
 * - Base = `live`. Pour chaque indicateur NUL d'une ligne live, on prend la 1re valeur
 *   non-nulle du précalculé de même (formation, année).
 * - Les lignes précalculées dont la clé (formation, année) n'apparaît dans AUCUNE ligne live
 *   sont ajoutées telles quelles (préserve l'historique migré).
 */
export function mergeQualityRows<T extends QualiteRowLite>(live: T[], precomputed: T[]): T[] {
  const preByKey = new Map<string, T[]>();
  for (const p of precomputed) {
    const k = key(p);
    const arr = preByKey.get(k);
    if (arr) arr.push(p);
    else preByKey.set(k, [p]);
  }
  const liveKeys = new Set(live.map(key));

  const merged = live.map((row) => {
    const pres = preByKey.get(key(row));
    if (!pres) return row;
    const out: Record<string, unknown> = { ...row };
    for (const ind of INDICATORS) {
      if (out[ind] === null || out[ind] === undefined) {
        const fill = pres.find((p) => p[ind] !== null && p[ind] !== undefined);
        if (fill) out[ind] = fill[ind];
      }
    }
    return out as T;
  });

  const historicalOnly = precomputed.filter((p) => !liveKeys.has(key(p)));
  return [...merged, ...historicalOnly];
}
