# UX Suivi Qualité — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans. Étapes en checkbox `- [ ]`. Branche : `feat/qualite-ux`. Commits ciblés (`git add <fichiers>`, jamais `-A`).

**Goal:** Que la page Suivi Qualité ne paraisse plus cassée : année par défaut fournie, états vides explicites, satisfaction mise en avant.

**Architecture:** Fonction pure `pickDefaultQualityYear` (TDD) + modifs UX localisées dans `admin/reports/qualite/page.tsx` (défaut année calculé au 1er chargement, rendu des vides, résumé satisfaction). Aucune modif de données.

**Tech Stack:** Next.js 14, TypeScript strict, Vitest, Supabase, shadcn/ui.

**Référence spec :** `docs/superpowers/specs/2026-06-17-qualite-ux-design.md`

---

## File Structure
| Fichier | Rôle | Action |
|---------|------|--------|
| `src/lib/reports/quality-default-year.ts` | Fonction pure choix d'année | Créer |
| `src/lib/reports/__tests__/quality-default-year.test.ts` | Tests TDD | Créer |
| `src/app/(dashboard)/admin/reports/qualite/page.tsx` | Défaut année + vides + résumé satisfaction | Modifier |

---

## Task 1 : Fonction pure `pickDefaultQualityYear` (TDD)

**Files:** Create `src/lib/reports/quality-default-year.ts`, Test `src/lib/reports/__tests__/quality-default-year.test.ts`

- [ ] **Step 1 : Test**
```ts
import { describe, it, expect } from "vitest";
import { pickDefaultQualityYear } from "../quality-default-year";

describe("pickDefaultQualityYear", () => {
  it("choisit l'année la plus fournie", () => {
    expect(pickDefaultQualityYear([{ year: 2025, dataCount: 63 }, { year: 2026, dataCount: 4 }], 2026)).toBe(2025);
  });
  it("égalité → année la plus récente", () => {
    expect(pickDefaultQualityYear([{ year: 2024, dataCount: 10 }, { year: 2025, dataCount: 10 }], 2026)).toBe(2025);
  });
  it("liste vide → année courante", () => {
    expect(pickDefaultQualityYear([], 2026)).toBe(2026);
  });
  it("aucune année avec données (counts 0) → année courante", () => {
    expect(pickDefaultQualityYear([{ year: 2025, dataCount: 0 }, { year: 2026, dataCount: 0 }], 2026)).toBe(2026);
  });
  it("une seule année avec données → elle", () => {
    expect(pickDefaultQualityYear([{ year: 2023, dataCount: 5 }], 2026)).toBe(2023);
  });
});
```

- [ ] **Step 2 : Échec** : `npx vitest run src/lib/reports/__tests__/quality-default-year.test.ts` → FAIL.

- [ ] **Step 3 : Implémentation `src/lib/reports/quality-default-year.ts`**
```ts
export interface YearData { year: number; dataCount: number; }

/** Choisit l'année à afficher par défaut : celle qui a le plus de données
 *  (égalité → la plus récente). Si aucune année n'a de données, l'année courante. */
export function pickDefaultQualityYear(years: YearData[], currentYear: number): number {
  const withData = years.filter((y) => y.dataCount > 0);
  if (withData.length === 0) return currentYear;
  return withData.reduce((best, y) =>
    y.dataCount > best.dataCount || (y.dataCount === best.dataCount && y.year > best.year) ? y : best,
  ).year;
}
```

- [ ] **Step 4 : Vert** : 5/5 PASS ; `npx tsc --noEmit` → 0 erreur.
- [ ] **Step 5 : Commit** : `git add src/lib/reports/quality-default-year.ts src/lib/reports/__tests__/quality-default-year.test.ts && git commit -m "feat(qualite): pure fn choix année par défaut (TDD)"`

---

## Task 2 : Intégration UX dans la page

**Files:** Modify `src/app/(dashboard)/admin/reports/qualite/page.tsx`

- [ ] **Step 1 : Lire** la page pour repérer : `formatPct`/`formatPctWithColor` (≈ l.36-46), `avg` (≈ l.50-52), `const [year, setYear] = useState<number>(2026)` (l.132), `entityId`, le fetch `quality_scores` (≈ l.149), le composant de rendu du tableau + l'en-tête (titre/toolbar), et les colonnes satisfaction (`satisfaction_chaud`, `satisfaction_froid`) dans `ALL_INDICATOR_COLUMNS`.

- [ ] **Step 2 : Import** : `import { pickDefaultQualityYear } from "@/lib/reports/quality-default-year";`

- [ ] **Step 3 : Année par défaut calculée (1er chargement)** — ajouter un effet qui ne s'exécute qu'une fois pour positionner l'année sur la plus fournie. Garder `useState(new Date().getFullYear())` comme valeur initiale (au lieu de `2026` figé), puis :
```ts
const didInitYear = useRef(false);
useEffect(() => {
  if (didInitYear.current || !entityId) return;
  didInitYear.current = true;
  (async () => {
    const { data } = await supabase
      .from("quality_scores")
      .select("year, eval_preformation, eval_pendant, eval_postformation, satisfaction_chaud, satisfaction_froid")
      .eq("entity_id", entityId);
    if (!data) return;
    const byYear = new Map<number, number>();
    for (const r of data as Record<string, unknown>[]) {
      const y = r.year as number;
      const hasData = ["eval_preformation","eval_pendant","eval_postformation","satisfaction_chaud","satisfaction_froid"]
        .some((c) => r[c] !== null && r[c] !== undefined);
      byYear.set(y, (byYear.get(y) ?? 0) + (hasData ? 1 : 0));
    }
    const years = Array.from(byYear.entries()).map(([year, dataCount]) => ({ year, dataCount }));
    setYear(pickDefaultQualityYear(years, new Date().getFullYear()));
  })();
}, [entityId, supabase]);
```
> ⚠️ Remplacer `useState<number>(2026)` par `useState<number>(new Date().getFullYear())`. La navigation manuelle `< >` (setYear) reste prioritaire (l'effet ne se rejoue pas grâce à `didInitYear`). Vérifier que `useRef` est importé.

- [ ] **Step 4 : États vides explicites** — modifier `formatPct` et `formatPctWithColor` : le `null` rend désormais un tiret discret. Comme `formatPct` retourne une string, exposer plutôt un rendu via une petite fonction qui retourne soit la string `%`, soit un `<span title="Pas encore de réponse" className="text-gray-300">—</span>`. Concrètement : là où la cellule affiche `formatPct(val)`/`formatPctWithColor(val).text`, remplacer par :
```tsx
{val === null || val === undefined
  ? <span title="Pas encore de réponse" className="text-gray-300">—</span>
  : `${val.toFixed(1)} %`}
```
(Adapter aux 2 endroits de rendu — vue simple et vue détaillée. Garder le `bg` de couleur pour les valeurs présentes.)

- [ ] **Step 5 : Bandeau « évaluations non renseignées »** — au-dessus du tableau, afficher un bandeau si TOUTES les valeurs `eval_*` de l'année sont nulles :
```tsx
{rows.length > 0 && rows.every((r) => r.eval_preformation == null && r.eval_pendant == null && r.eval_postformation == null) && (
  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 mb-3">
    Les évaluations (préformation / pendant / postformation) ne sont pas encore renseignées pour cette période.
  </div>
)}
```
(Adapter `rows` au nom réel du tableau de données dans le composant.)

- [ ] **Step 6 : Résumé satisfaction en tête** — au-dessus du tableau (ou sous la toolbar), un petit bandeau de stats réutilisant `avg(...)` :
```tsx
{(() => {
  const chaud = avg(rows.map((r) => r.satisfaction_chaud).filter((v): v is number => v != null));
  const froid = avg(rows.map((r) => r.satisfaction_froid).filter((v): v is number => v != null));
  const n = rows.filter((r) => r.satisfaction_chaud != null || r.satisfaction_froid != null).length;
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm mb-3">
      <span>Satisfaction à chaud : <strong>{chaud != null ? `${chaud.toFixed(1)} %` : "—"}</strong></span>
      <span>Satisfaction à froid : <strong>{froid != null ? `${froid.toFixed(1)} %` : "—"}</strong></span>
      <span className="text-gray-500">{n} formation(s) évaluée(s)</span>
    </div>
  );
})()}
```
(Vérifier la signature de `avg` — il renvoie `number | null` ; adapter le nom du champ de données.)

- [ ] **Step 7 : Vérifier** : `npx tsc --noEmit` → 0 erreur ; `npx vitest run` → vert. (Aucun import orphelin.)
- [ ] **Step 8 : Commit** : `git add "src/app/(dashboard)/admin/reports/qualite/page.tsx" && git commit -m "feat(qualite): année par défaut fournie, états vides explicites, résumé satisfaction"`

---

## Notes d'exécution
- **TDD** strict sur Task 1. Task 2 : tsc + suite verte.
- **Isolation `entity_id`** : conservée (déjà filtré). Le fetch des années est aussi filtré `entity_id`.
- **Ne pas toucher** : Excel/PDF/Qualiopi/Vue détaillée (fonctionnent) ; les données.
- Effet visuel à confirmer après déploiement (atterrit sur 2025, satisfaction visible, plus de « -- % » brut).

## Self-Review (fait)
- Couverture spec : D1 défaut année (Task1 + Task2 §3) ✓ · D2 états vides (Task2 §4 + §5) ✓ · D3 satisfaction (Task2 §6) ✓ · entity_id ✓ · navigation manuelle préservée (didInitYear) ✓ · boutons inchangés ✓.
- Placeholders : aucun (code réel ; ancrages + lecture préalable pour les noms de variables locales `rows`/`avg`).
- Cohérence types : `YearData`/`pickDefaultQualityYear` identiques Task 1 ↔ Task 2.
