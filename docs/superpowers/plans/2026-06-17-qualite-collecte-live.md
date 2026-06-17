# Suivi Qualité — fusion live + précalculé — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans. Étapes checkbox `- [ ]`. Branche : `feat/qualite-collecte-live`. Commits ciblés (`git add <fichiers>`, jamais `-A`).

**Goal:** La page Suivi Qualité se remplit à l'usage : calcule toujours le live depuis `questionnaire_responses` et le fusionne avec les `quality_scores` migrés (le live l'emporte), sans perdre l'historique.

**Architecture:** Fonction pure `mergeQualityRows` (base = lignes live par session ; remplissage des indicateurs nuls depuis le précalculé indexé par `formation+année` ; ajout des lignes précalculées sans équivalent live). Refactor de `fetchData` dans `qualite/page.tsx` (retirer l'early-return, calculer les deux, merger).

**Tech Stack:** Next.js 14, TS strict, Vitest, Supabase.

**Référence spec :** `docs/superpowers/specs/2026-06-17-qualite-collecte-live-design.md`

**Contexte vérifié :** `QualiteRow` = `{ id, formation, annee, month, eval_preformation, eval_pendant, eval_postformation, auto_eval_pre, auto_eval_post, satisfaction_chaud, satisfaction_froid, quest_financeurs, quest_formateurs, quest_managers, quest_entreprises, autres_quest }`. Précalculé : 1 ligne par (formation, year, month), pas de session_id. Live : 1 ligne par session (id=session.id).

---

## Task 1 : Fonction pure `mergeQualityRows` (TDD)

**Files:** Create `src/lib/reports/merge-quality-rows.ts`, Test `src/lib/reports/__tests__/merge-quality-rows.test.ts`

- [ ] **Step 1 : Test**
```ts
import { describe, it, expect } from "vitest";
import { mergeQualityRows, type QualiteRowLite } from "../merge-quality-rows";

const base = (over: Partial<QualiteRowLite>): QualiteRowLite => ({
  id: "x", formation: "F", annee: 2026,
  eval_preformation: null, eval_pendant: null, eval_postformation: null,
  satisfaction_chaud: null, satisfaction_froid: null,
  ...over,
});

describe("mergeQualityRows", () => {
  it("le live (par session) est la base ; un indicateur nul est rempli depuis le précalculé (même formation+année)", () => {
    const live = [base({ id: "s1", formation: "Circuit", annee: 2026, eval_pendant: 80, satisfaction_chaud: null })];
    const pre = [base({ id: "q1", formation: "circuit", annee: 2026, satisfaction_chaud: 90 })];
    const r = mergeQualityRows(live, pre);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: "s1", eval_pendant: 80, satisfaction_chaud: 90 });
  });
  it("une valeur live non-nulle n'est PAS écrasée par le précalculé", () => {
    const live = [base({ id: "s1", formation: "F", annee: 2026, satisfaction_chaud: 70 })];
    const pre = [base({ id: "q1", formation: "F", annee: 2026, satisfaction_chaud: 99 })];
    expect(mergeQualityRows(live, pre)[0].satisfaction_chaud).toBe(70);
  });
  it("une formation+année présente seulement dans le précalculé (historique) est conservée", () => {
    const live = [base({ id: "s1", formation: "F", annee: 2026 })];
    const pre = [base({ id: "q1", formation: "Vieux", annee: 2025, satisfaction_chaud: 88 })];
    const r = mergeQualityRows(live, pre);
    expect(r).toHaveLength(2);
    expect(r.find((x) => x.formation === "Vieux")?.satisfaction_chaud).toBe(88);
  });
  it("live vide → précalculé ; précalculé vide → live", () => {
    const pre = [base({ id: "q1", satisfaction_chaud: 50 })];
    expect(mergeQualityRows([], pre)).toHaveLength(1);
    const live = [base({ id: "s1", eval_pendant: 60 })];
    expect(mergeQualityRows(live, [])[0].eval_pendant).toBe(60);
  });
});
```

- [ ] **Step 2 : Échec** : `npx vitest run src/lib/reports/__tests__/merge-quality-rows.test.ts` → FAIL.

- [ ] **Step 3 : Implémentation `src/lib/reports/merge-quality-rows.ts`**
```ts
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
  [key: string]: unknown; // tolère les autres champs de QualiteRow (month, auto_eval_*, quest_*)
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
    (preByKey.get(k) ?? preByKey.set(k, []).get(k)!).push(p);
  }
  const liveKeys = new Set(live.map(key));

  const merged = live.map((row) => {
    const pres = preByKey.get(key(row));
    if (!pres) return row;
    const out = { ...row };
    for (const ind of INDICATORS) {
      if (out[ind] === null || out[ind] === undefined) {
        const fill = pres.find((p) => p[ind] !== null && p[ind] !== undefined);
        if (fill) out[ind] = fill[ind];
      }
    }
    return out;
  });

  const historicalOnly = precomputed.filter((p) => !liveKeys.has(key(p)));
  return [...merged, ...historicalOnly];
}
```

- [ ] **Step 4 : Vert** : 4/4 PASS ; `npx tsc --noEmit` → 0 erreur.
- [ ] **Step 5 : Commit** : `git add src/lib/reports/merge-quality-rows.ts src/lib/reports/__tests__/merge-quality-rows.test.ts && git commit -m "feat(qualite): pure fn mergeQualityRows (live + précalculé, TDD)"`

---

## Task 2 : Refactor de la page (calculer les deux + merger)

**Files:** Modify `src/app/(dashboard)/admin/reports/qualite/page.tsx`

- [ ] **Step 1 : Lire** `fetchData` (≈ l.146-310) : repérer le mapping précalculé (`const mapped = qualityScores.map(...)` + `setRows(mapped); return;` ≈ l.188-209) et le bloc de calcul live (sessions + `scoreMap` + `const mapped = sessions.map(...)` ≈ l.211-300). Noter les **deux** variables `mapped` (renommer pour éviter la collision).

- [ ] **Step 2 : Import** : `import { mergeQualityRows } from "@/lib/reports/merge-quality-rows";`

- [ ] **Step 3 : Retirer l'early-return + calculer les deux.**
  - Dans la branche précalculé : remplacer `const mapped = qualityScores.map(...)` par `const precomputedRows: QualiteRow[] = (qualityScores ?? []).map(...)` ; **supprimer** `setRows(mapped); setLoading(false); return;`. (Si `qualityScores` est nul/vide, `precomputedRows = []`.)
  - Faire en sorte que `precomputedRows` soit déclaré dans une portée visible jusqu'à la fin de `fetchData` (le déclarer avant les branches, ou hisser la requête `quality_scores` hors du `if`).
  - Le bloc live s'exécute **toujours** (retirer la condition qui le rendait « fallback ») et produit `const liveRows: QualiteRow[] = sessions.map(...)`. Si pas de sessions → `liveRows = []` (ne pas `return` tôt).
  - À la fin : `setRows(mergeQualityRows(liveRows, precomputedRows)); setLoading(false);`

- [ ] **Step 4 : Garde-fous** : si `liveRows` ET `precomputedRows` sont vides → `setRows([])`. Conserver le filtrage `entity_id` + le scope année des deux requêtes (inchangé). Ne pas toucher au mapping questionnaire→indicateur ni aux libellés.

- [ ] **Step 5 : Vérifier** : `npx tsc --noEmit` → 0 erreur. `npx vitest run` → vert. Vérifier qu'aucune variable `mapped` orpheline / double déclaration ne subsiste.

- [ ] **Step 6 : Commit** : `git add "src/app/(dashboard)/admin/reports/qualite/page.tsx" && git commit -m "feat(qualite): fusion live + précalculé (la page se remplit à l'usage)"`

---

## Notes d'exécution
- **TDD** strict Task 1. Task 2 : tsc + suite verte (refactor de contrôle, pas de test unitaire UI).
- **Isolation `entity_id`** : conservée sur les 2 requêtes.
- **Ne pas toucher** : routes de soumission (`public-submit`/`fill-for-learner` — alimentent déjà `questionnaire_responses`), le mapping indicateur, les exports/boutons, l'année par défaut (déjà fait #296).
- Effet : une réponse saisie remplit la page au prochain chargement ; l'historique migré (satisfaction 2025) reste affiché.

## Self-Review (fait)
- Couverture spec : fusion live+précalculé (Task1) ✓ · live l'emporte / remplissage nul (Task1 tests) ✓ · historique conservé (Task1 historicalOnly) ✓ · page calcule les deux + merge (Task2) ✓ · entity_id ✓ · pas de pipeline d'écriture ✓.
- Placeholders : aucun (code réel ; ancrages + lecture pour les noms `mapped`/`sessions`).
- Cohérence types : `QualiteRowLite`/`mergeQualityRows` (Task1) génériques compatibles avec `QualiteRow` de la page (Task2).
