# Plan d'implémentation — Solidification Questionnaires Volet D UX (Chantier 2b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Résoudre la pain principale Wissam (« pas facile de piloter la partie questionnaire ») en enrichissant `TabQuestionnaires` avec 4 nouveaux composants UX : vue d'ensemble Qualiopi, stats par stage, grid statut apprenants avec relance, modal détails réponses.

**Architecture:** Code-only (pas de migration SQL, pas de nouvelle route API). 2 helpers purs créés dans `src/lib/utils/questionnaire-stats.ts` (testés TDD) consommés par 4 composants UI dans `src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/`. Réutilisation des services existants (`loadSessionAggregates`, `/api/questionnaires/relaunch`).

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Vitest, shadcn/ui (Dialog, Badge, Button déjà disponibles).

**Spec source:** [docs/superpowers/specs/2026-05-26-questionnaires-volet-d-ux-design.md](../specs/2026-05-26-questionnaires-volet-d-ux-design.md)
**Deep-dive source:** [docs/deep-dive-tab-questionnaires.md](../../deep-dive-tab-questionnaires.md)
**Chantier 2a précédent :** mergé à `0162ad1` (Volets B + C + F + bug multiple_choice)

**Risque faible** : pas de side-effects prod (UI only). Validation manuelle légère (test sur 1 session réelle).

---

## Vue d'ensemble des fichiers

### Créés
| Fichier | Rôle |
|---|---|
| `src/lib/utils/questionnaire-stats.ts` | 2 helpers purs : `computeStageStats(stage, ...)` + `computeLearnerStatuses(...)` |
| `src/lib/utils/__tests__/questionnaire-stats.test.ts` | 7 tests Vitest sur les 2 helpers |
| `src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/QuestionnaireOverview.tsx` | Bannière compacte (4 KPIs + ligne Qualiopi) |
| `src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/StageStatsBar.tsx` | Stats inline par stage card |
| `src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/LearnerStatusGrid.tsx` | Grid apprenants × questionnaires + filtres + relance |
| `src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/LearnerResponsesDialog.tsx` | Modal read-only des réponses détaillées |

### Modifiés
| Fichier | Changement |
|---|---|
| `src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx` | Étendre `fetchData()` pour charger `questionnaire_tokens` + `loadQualiopiIndicators`. Remplacer le header actuel par `<QuestionnaireOverview>`. Insérer `<StageStatsBar>` dans chaque stage card. Ajouter `<LearnerStatusGrid>` en bas. |

### Out of scope (Chantier 2c)
- Refactor du cron auto Qualiopi (P0-5)

---

## Task 0 : Baseline + branche + investigation indicateurs Qualiopi

**Files:**
- Read-only (investigation)

- [ ] **Step 1 : Vérifier état initial (green baseline)**

Run:
```bash
git status
git branch --show-current
npx vitest run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | head -5
```
Expected: branche `main` à commit `7fdfed5` (spec validée), 514 tests verts, TypeScript clean.

- [ ] **Step 2 : Créer la branche**

```bash
git checkout main
git pull origin main 2>/dev/null || true
git checkout -b feat/questionnaires-volet-d-ux
```

- [ ] **Step 3 : Investigation indicateurs Qualiopi liés aux questionnaires**

Run:
```bash
grep -nA 50 "export async function loadQualiopiIndicators" src/lib/services/load-session-aggregates.ts | head -90
```

Identifier précisément :
- La structure de retour `QualiopiIndicators` (champs disponibles)
- Quels champs sont **calculés à partir des réponses questionnaire** (vs émargement, signature, etc.)

À partir de ce qu'on a déjà vu :
- `satisfactionRate` (% moyenne) + `satisfactionResponses` (count) → **Q22 Satisfaction**
- `acquisitionRate` (% acquis) + `evaluationCount` (count) → **Q24 Acquisition / Évaluation**
- `completionRate` n'est PAS lié aux questionnaires (basé sur signatures émargement)
- **Pas de KPI "positionnement avant"** explicite — à dériver des `responses` filtrées sur `eval_preformation`

Documenter dans le rapport quels indicateurs sont **directement disponibles** vs **à calculer côté composant**. Pour la ligne Qualiopi de QuestionnaireOverview, le composant pourra :
1. Afficher Satisfaction (✅ si `satisfactionResponses > 0` et `satisfactionRate >= 70`, ⚠ si `0 < satisfactionResponses < expected`, ⏸ si `satisfactionResponses === 0`)
2. Afficher Acquisition (idem avec `evaluationCount` / `acquisitionRate`)
3. (Optionnel si rapide) Positionnement = nb de responses avec type `eval_preformation` / nb apprenants

Pas de commit pour Task 0 — investigation uniquement.

---

## Task 1 : Helper `computeStageStats` + 3 tests TDD

**Files:**
- Create: `src/lib/utils/questionnaire-stats.ts`
- Create: `src/lib/utils/__tests__/questionnaire-stats.test.ts`

- [ ] **Step 1 : Écrire les 3 tests failing-first**

Créer `src/lib/utils/__tests__/questionnaire-stats.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { computeStageStats } from "@/lib/utils/questionnaire-stats";

type Stage = { id: string; itemTypes: Array<{ category: "evaluation" | "satisfaction"; type: string; target: "learner" | "company" }> };

describe("computeStageStats", () => {
  it("retourne 0/0/0/0 pour un stage sans attribution", () => {
    const stage: Stage = {
      id: "before",
      itemTypes: [{ category: "evaluation", type: "eval_preformation", target: "learner" }],
    };
    const result = computeStageStats(stage, [], [], [], [], []);
    expect(result).toEqual({ attributed: 0, sent: 0, expectedSent: 0, answered: 0, rate: 0 });
  });

  it("retourne stats partiels pour un stage avec 1 attribution + 2 réponses sur 3 apprenants", () => {
    const stage: Stage = {
      id: "before",
      itemTypes: [{ category: "evaluation", type: "eval_preformation", target: "learner" }],
    };
    const evalAssignments = [{ questionnaire_id: "q1", evaluation_type: "eval_preformation" }];
    const satisAssignments: Array<Record<string, unknown>> = [];
    const tokens = [
      { questionnaire_id: "q1", learner_id: "L1" },
      { questionnaire_id: "q1", learner_id: "L2" },
      { questionnaire_id: "q1", learner_id: "L3" },
    ];
    const responses = [
      { questionnaire_id: "q1", learner_id: "L1" },
      { questionnaire_id: "q1", learner_id: "L2" },
    ];
    const learners = [{ learner: { id: "L1" } }, { learner: { id: "L2" } }, { learner: { id: "L3" } }];
    const companies: Array<Record<string, unknown>> = [];

    const result = computeStageStats(stage, evalAssignments, satisAssignments, tokens, responses, learners, companies);
    expect(result.attributed).toBe(1);
    expect(result.sent).toBe(3);
    expect(result.expectedSent).toBe(3);
    expect(result.answered).toBe(2);
    expect(result.rate).toBe(67); // 2/3 ≈ 66.67 → 67
  });

  it("retourne 100% pour un stage complet (tous apprenants ont répondu)", () => {
    const stage: Stage = {
      id: "before",
      itemTypes: [{ category: "evaluation", type: "eval_preformation", target: "learner" }],
    };
    const evalAssignments = [{ questionnaire_id: "q1", evaluation_type: "eval_preformation" }];
    const tokens = [
      { questionnaire_id: "q1", learner_id: "L1" },
      { questionnaire_id: "q1", learner_id: "L2" },
    ];
    const responses = [
      { questionnaire_id: "q1", learner_id: "L1" },
      { questionnaire_id: "q1", learner_id: "L2" },
    ];
    const learners = [{ learner: { id: "L1" } }, { learner: { id: "L2" } }];

    const result = computeStageStats(stage, evalAssignments, [], tokens, responses, learners, []);
    expect(result.attributed).toBe(1);
    expect(result.sent).toBe(2);
    expect(result.expectedSent).toBe(2);
    expect(result.answered).toBe(2);
    expect(result.rate).toBe(100);
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent (TDD red)**

```bash
npx vitest run src/lib/utils/__tests__/questionnaire-stats.test.ts 2>&1 | tail -10
```
Expected : erreur d'import (`computeStageStats` pas exporté).

- [ ] **Step 3 : Implémenter le helper**

Créer `src/lib/utils/questionnaire-stats.ts` :

```ts
/**
 * Helpers de stats pour TabQuestionnaires (Volet D UX pilotage).
 *
 * - computeStageStats : agrégats par stage (attribués/envoyés/répondus/taux)
 * - computeLearnerStatuses : matrice apprenants × questionnaires (Task 2)
 *
 * Source : docs/superpowers/specs/2026-05-26-questionnaires-volet-d-ux-design.md §3.2
 */

export interface StageStats {
  attributed: number;   // nb d'ItemType du stage avec ≥ 1 attribution
  sent: number;         // nb tokens générés pour les questionnaires du stage
  expectedSent: number; // attributions × destinataires concernés
  answered: number;     // nb réponses distinctes pour le stage
  rate: number;         // answered / sent en %, arrondi
}

interface Stage {
  id: string;
  itemTypes: Array<{
    category: "evaluation" | "satisfaction";
    type: string;
    target: "learner" | "company";
  }>;
}

interface AssignmentRow {
  questionnaire_id?: string;
  evaluation_type?: string;
  satisfaction_type?: string;
  [key: string]: unknown;
}

interface TokenRow {
  questionnaire_id?: string;
  learner_id?: string;
  [key: string]: unknown;
}

interface ResponseRow {
  questionnaire_id?: string;
  learner_id?: string;
  [key: string]: unknown;
}

interface EnrollmentRow {
  learner?: { id?: string };
  [key: string]: unknown;
}

interface CompanyRow {
  [key: string]: unknown;
}

export function computeStageStats(
  stage: Stage,
  evalAssignments: AssignmentRow[],
  satisAssignments: AssignmentRow[],
  tokens: TokenRow[],
  responses: ResponseRow[],
  learners: EnrollmentRow[],
  companies: CompanyRow[],
): StageStats {
  // 1. Identifier les questionnaires attribués pour ce stage
  const questionnaireIdsByItem = stage.itemTypes.map((item) => {
    const source = item.category === "evaluation" ? evalAssignments : satisAssignments;
    const typeKey = item.category === "evaluation" ? "evaluation_type" : "satisfaction_type";
    return {
      item,
      qids: source
        .filter((a) => a[typeKey] === item.type)
        .map((a) => a.questionnaire_id)
        .filter((id): id is string => typeof id === "string"),
    };
  });

  // 2. attributed = nb d'items du stage avec ≥ 1 questionnaire
  const attributed = questionnaireIdsByItem.filter((row) => row.qids.length > 0).length;

  // 3. expectedSent = attributions × destinataires concernés
  let expectedSent = 0;
  for (const row of questionnaireIdsByItem) {
    const recipientsCount = row.item.target === "learner" ? learners.length : companies.length;
    expectedSent += row.qids.length * recipientsCount;
  }

  // 4. Set des questionnaire_ids du stage
  const stageQids = new Set(questionnaireIdsByItem.flatMap((r) => r.qids));

  // 5. sent = nb tokens pour ces questionnaire_ids
  const sent = tokens.filter((t) => typeof t.questionnaire_id === "string" && stageQids.has(t.questionnaire_id)).length;

  // 6. answered = nb réponses distinctes (par paire q_id + learner_id) pour ces questionnaires
  const answeredKeys = new Set<string>();
  for (const r of responses) {
    if (typeof r.questionnaire_id === "string" && stageQids.has(r.questionnaire_id) && typeof r.learner_id === "string") {
      answeredKeys.add(`${r.questionnaire_id}::${r.learner_id}`);
    }
  }
  const answered = answeredKeys.size;

  // 7. Taux = answered / sent (arrondi). Si sent=0, rate=0.
  const rate = sent === 0 ? 0 : Math.round((answered / sent) * 100);

  return { attributed, sent, expectedSent, answered, rate };
}
```

- [ ] **Step 4 : Vérifier que les 3 tests passent (TDD green)**

```bash
npx vitest run src/lib/utils/__tests__/questionnaire-stats.test.ts 2>&1 | tail -10
```
Expected : 3 tests verts.

- [ ] **Step 5 : Suite complète + tsc**

```bash
npx vitest run 2>&1 | tail -4
npx tsc --noEmit 2>&1 | head -5
```
Expected : 517 tests verts (514 + 3), TS clean.

- [ ] **Step 6 : Commit**

```bash
git add src/lib/utils/questionnaire-stats.ts src/lib/utils/__tests__/questionnaire-stats.test.ts
git commit -m "feat(questionnaires-stats): computeStageStats helper + 3 tests TDD (Volet D)

Helper pur qui agrège pour un stage donné : nb d'items attribués,
nb tokens envoyés, nb réponses distinctes, taux complétion (arrondi).
Consommé par StageStatsBar (Task 5) et indirectement par
QuestionnaireOverview (Task 4).

3 tests : stage vide, stage partiel 67%, stage complet 100%."
```

---

## Task 2 : Helper `computeLearnerStatuses` + 4 tests TDD

**Files:**
- Modify: `src/lib/utils/questionnaire-stats.ts`
- Modify: `src/lib/utils/__tests__/questionnaire-stats.test.ts`

- [ ] **Step 1 : Ajouter les 4 tests failing-first**

Ajouter à la fin de `src/lib/utils/__tests__/questionnaire-stats.test.ts` (avant le `});` final si applicable, sinon en nouveau `describe`) :

```ts
import { computeLearnerStatuses } from "@/lib/utils/questionnaire-stats";

describe("computeLearnerStatuses", () => {
  it("retourne 'answered' pour les apprenants avec réponse", () => {
    const enrollments = [{ learner: { id: "L1", first_name: "Alice", last_name: "Martin" } }];
    const evalAssignments = [{ questionnaire_id: "q1", evaluation_type: "eval_preformation", questionnaire: { title: "Positionnement" } }];
    const tokens = [{ questionnaire_id: "q1", learner_id: "L1", expires_at: new Date(Date.now() + 86400000).toISOString() }];
    const responses = [{ questionnaire_id: "q1", learner_id: "L1", id: "r1" }];

    const result = computeLearnerStatuses(enrollments, evalAssignments, [], tokens, responses);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("answered");
    expect(result[0].learnerName).toBe("Alice Martin");
    expect(result[0].questionnaireTitle).toBe("Positionnement");
  });

  it("retourne 'sent' pour token actif sans réponse", () => {
    const enrollments = [{ learner: { id: "L1", first_name: "Bob", last_name: "Dupont" } }];
    const evalAssignments = [{ questionnaire_id: "q1", evaluation_type: "eval_preformation", questionnaire: { title: "Q" } }];
    const tokens = [{ questionnaire_id: "q1", learner_id: "L1", expires_at: new Date(Date.now() + 86400000).toISOString() }];
    const responses: Array<Record<string, unknown>> = [];

    const result = computeLearnerStatuses(enrollments, evalAssignments, [], tokens, responses);
    expect(result[0].status).toBe("sent");
  });

  it("retourne 'expired' pour token expiré sans réponse", () => {
    const enrollments = [{ learner: { id: "L1", first_name: "Carl", last_name: "X" } }];
    const evalAssignments = [{ questionnaire_id: "q1", evaluation_type: "eval_preformation", questionnaire: { title: "Q" } }];
    const tokens = [{ questionnaire_id: "q1", learner_id: "L1", expires_at: new Date(Date.now() - 86400000).toISOString() }];
    const responses: Array<Record<string, unknown>> = [];

    const result = computeLearnerStatuses(enrollments, evalAssignments, [], tokens, responses);
    expect(result[0].status).toBe("expired");
  });

  it("retourne 'not_sent' pour attribution sans token", () => {
    const enrollments = [{ learner: { id: "L1", first_name: "Diana", last_name: "Y" } }];
    const evalAssignments = [{ questionnaire_id: "q1", evaluation_type: "eval_preformation", questionnaire: { title: "Q" } }];
    const tokens: Array<Record<string, unknown>> = [];
    const responses: Array<Record<string, unknown>> = [];

    const result = computeLearnerStatuses(enrollments, evalAssignments, [], tokens, responses);
    expect(result[0].status).toBe("not_sent");
  });
});
```

- [ ] **Step 2 : Vérifier que les 4 tests échouent**

```bash
npx vitest run src/lib/utils/__tests__/questionnaire-stats.test.ts 2>&1 | tail -10
```
Expected : `computeLearnerStatuses` pas exporté → 4 tests fail à l'import.

- [ ] **Step 3 : Ajouter le helper à `questionnaire-stats.ts`**

Ajouter à la fin de `src/lib/utils/questionnaire-stats.ts` :

```ts
export type LearnerStatus = "answered" | "sent" | "not_sent" | "not_assigned" | "expired";

export interface LearnerStatusCell {
  learnerId: string;
  learnerName: string;
  questionnaireId: string;
  questionnaireTitle: string;
  status: LearnerStatus;
  responseId?: string;
  tokenExpiresAt?: string;
}

interface EnrollmentWithLearner {
  learner?: {
    id?: string;
    first_name?: string;
    last_name?: string;
  };
  [key: string]: unknown;
}

interface AssignmentWithQuestionnaire extends AssignmentRow {
  questionnaire?: { title?: string };
}

export function computeLearnerStatuses(
  enrollments: EnrollmentWithLearner[],
  evalAssignments: AssignmentWithQuestionnaire[],
  satisAssignments: AssignmentWithQuestionnaire[],
  tokens: Array<{ questionnaire_id?: string; learner_id?: string; expires_at?: string; id?: string }>,
  responses: Array<{ questionnaire_id?: string; learner_id?: string; id?: string }>,
): LearnerStatusCell[] {
  const now = Date.now();
  const result: LearnerStatusCell[] = [];

  // Construire la liste des couples (questionnaire_id, title) attribués (eval + satis)
  const allAssignments = [...evalAssignments, ...satisAssignments];
  const questionnaireMap = new Map<string, string>();
  for (const a of allAssignments) {
    if (typeof a.questionnaire_id === "string") {
      const title = a.questionnaire?.title ?? "(sans titre)";
      questionnaireMap.set(a.questionnaire_id, title);
    }
  }

  // Pour chaque apprenant × chaque questionnaire attribué, déterminer le statut
  for (const enr of enrollments) {
    const lId = enr.learner?.id;
    if (typeof lId !== "string") continue;
    const lName = `${enr.learner?.first_name ?? ""} ${enr.learner?.last_name ?? ""}`.trim() || lId;

    for (const [qId, qTitle] of questionnaireMap.entries()) {
      const response = responses.find((r) => r.questionnaire_id === qId && r.learner_id === lId);
      const token = tokens.find((t) => t.questionnaire_id === qId && t.learner_id === lId);

      let status: LearnerStatus;
      if (response) {
        status = "answered";
      } else if (token) {
        const expiresMs = token.expires_at ? Date.parse(token.expires_at) : NaN;
        status = !isNaN(expiresMs) && expiresMs < now ? "expired" : "sent";
      } else {
        status = "not_sent";
      }

      result.push({
        learnerId: lId,
        learnerName: lName,
        questionnaireId: qId,
        questionnaireTitle: qTitle,
        status,
        responseId: response?.id,
        tokenExpiresAt: token?.expires_at,
      });
    }
  }

  return result;
}
```

- [ ] **Step 4 : Vérifier que les 4 tests passent**

```bash
npx vitest run src/lib/utils/__tests__/questionnaire-stats.test.ts 2>&1 | tail -10
```
Expected : 7 tests verts (3 computeStageStats + 4 computeLearnerStatuses).

- [ ] **Step 5 : Suite complète + tsc**

```bash
npx vitest run 2>&1 | tail -4
npx tsc --noEmit 2>&1 | head -5
```
Expected : 521 tests verts (514 + 7), TS clean.

- [ ] **Step 6 : Commit**

```bash
git add src/lib/utils/questionnaire-stats.ts src/lib/utils/__tests__/questionnaire-stats.test.ts
git commit -m "feat(questionnaires-stats): computeLearnerStatuses helper + 4 tests TDD (Volet D)

Helper pur qui calcule la matrice apprenants × questionnaires attribués
avec 5 statuts possibles (answered / sent / not_sent / not_assigned /
expired). Consommé par LearnerStatusGrid (Task 6).

Types exportés : LearnerStatus enum + LearnerStatusCell interface.

4 tests : answered, sent (token actif), expired (token périmé), not_sent
(attribution sans token)."
```

---

## Task 3 : Étendre `fetchData()` de TabQuestionnaires

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx`

- [ ] **Step 1 : Lire la structure actuelle de fetchData**

```bash
sed -n '60,95p' 'src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx'
```

- [ ] **Step 2 : Ajouter 2 nouveaux states**

Use Edit tool pour ajouter à la liste des `useState` (autour des lignes 61-66) :

```ts
const [tokens, setTokens] = useState<Array<Record<string, unknown>>>([]);
const [qualiopiIndicators, setQualiopiIndicators] = useState<{
  satisfactionRate: number | null;
  satisfactionResponses: number;
  acquisitionRate: number | null;
  evaluationCount: number;
} | null>(null);
```

- [ ] **Step 3 : Étendre `Promise.all` de fetchData**

Use Edit tool. Importer en haut du fichier :
```ts
import { loadQualiopiIndicators } from "@/lib/services/load-session-aggregates";
```

Modifier le `Promise.all` actuel :

```ts
const fetchData = useCallback(async () => {
  setLoading(true);
  try {
    const [qR, eR, sR, rR, tR, qiR] = await Promise.all([
      supabase.from("questionnaires").select("id, title, type").eq("entity_id", formation.entity_id).eq("is_active", true).order("title"),
      supabase.from("formation_evaluation_assignments").select("*, questionnaire:questionnaires(title)").eq("session_id", formation.id),
      supabase.from("formation_satisfaction_assignments").select("*, questionnaire:questionnaires(title)").eq("session_id", formation.id),
      supabase.from("questionnaire_responses").select("id, questionnaire_id, learner_id").eq("session_id", formation.id),
      supabase.from("questionnaire_tokens").select("id, questionnaire_id, learner_id, expires_at").eq("session_id", formation.id),
      loadQualiopiIndicators(supabase, formation.id),
    ]);
    if (qR.data) setQuestionnaires(qR.data);
    if (eR.data) setEvalAssignments(eR.data);
    if (sR.data) setSatisAssignments(sR.data);
    if (rR.data) setResponses(rR.data);
    if (tR.data) setTokens(tR.data);
    setQualiopiIndicators({
      satisfactionRate: qiR.satisfactionRate,
      satisfactionResponses: qiR.satisfactionResponses,
      acquisitionRate: qiR.acquisitionRate,
      evaluationCount: qiR.evaluationCount,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur de chargement";
    toast({ title: "Erreur", description: message, variant: "destructive" });
  } finally {
    setLoading(false);
  }
}, [formation.id, formation.entity_id, supabase, toast]);
```

- [ ] **Step 4 : Vérifier TS + tests**

```bash
npx tsc --noEmit 2>&1 | head -5
npx vitest run 2>&1 | tail -3
```
Expected : TS clean, 521 tests passent.

- [ ] **Step 5 : Commit**

```bash
git add 'src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx'
git commit -m "feat(tab-questionnaires): étendre fetchData() avec tokens + qualiopiIndicators (Volet D)

Ajout de 2 fetchs en Promise.all :
- questionnaire_tokens (pour StageStatsBar + LearnerStatusGrid)
- loadQualiopiIndicators (pour la ligne Qualiopi de QuestionnaireOverview)

2 nouveaux states : tokens + qualiopiIndicators. Consommés par les
composants Task 4-7."
```

---

## Task 4 : Composant `QuestionnaireOverview`

**Files:**
- Create: `src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/QuestionnaireOverview.tsx`
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx`

- [ ] **Step 1 : Créer le composant**

Créer `src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/QuestionnaireOverview.tsx` :

```tsx
"use client";

import { CheckCircle2, AlertCircle, Pause } from "lucide-react";

interface Props {
  attributed: number;
  sent: number;
  expectedSent: number;
  answered: number;
  pending: number;
  qualiopi: {
    satisfactionRate: number | null;
    satisfactionResponses: number;
    acquisitionRate: number | null;
    evaluationCount: number;
  } | null;
  onScrollToPending?: () => void;
}

function getQualiopiStatus(rate: number | null, count: number): "ok" | "partial" | "pending" {
  if (count === 0) return "pending";
  if (rate !== null && rate >= 70) return "ok";
  return "partial";
}

function StatusIcon({ status }: { status: "ok" | "partial" | "pending" }) {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-600 inline" />;
  if (status === "partial") return <AlertCircle className="h-4 w-4 text-amber-600 inline" />;
  return <Pause className="h-4 w-4 text-gray-400 inline" />;
}

export function QuestionnaireOverview({ attributed, sent, expectedSent, answered, pending, qualiopi, onScrollToPending }: Props) {
  const satisfactionStatus = qualiopi ? getQualiopiStatus(qualiopi.satisfactionRate, qualiopi.satisfactionResponses) : "pending";
  const acquisitionStatus = qualiopi ? getQualiopiStatus(qualiopi.acquisitionRate, qualiopi.evaluationCount) : "pending";

  return (
    <div className="bg-gradient-to-br from-indigo-600 to-purple-700 text-white rounded-xl p-5 mb-6">
      <h2 className="text-lg font-semibold mb-4">Questionnaires de la session</h2>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-white/10 rounded-lg p-3">
          <p className="text-[11px] text-white/60 uppercase">Attribués</p>
          <p className="text-2xl font-bold mt-1">{attributed}</p>
        </div>
        <div className="bg-white/10 rounded-lg p-3">
          <p className="text-[11px] text-white/60 uppercase">Envoyés</p>
          <p className="text-2xl font-bold mt-1">{sent}<span className="text-sm text-white/60">/{expectedSent}</span></p>
        </div>
        <div className="bg-white/10 rounded-lg p-3">
          <p className="text-[11px] text-white/60 uppercase">Répondus</p>
          <p className="text-2xl font-bold mt-1">{answered}<span className="text-sm text-white/60">/{sent}</span></p>
        </div>
        <button
          onClick={onScrollToPending}
          className="bg-white/10 rounded-lg p-3 text-left hover:bg-white/20 transition-colors cursor-pointer"
          disabled={!onScrollToPending}
        >
          <p className="text-[11px] text-white/60 uppercase">En attente</p>
          <p className="text-2xl font-bold mt-1">{pending}</p>
        </button>
      </div>

      <div className="text-sm flex items-center flex-wrap gap-x-4 gap-y-1 text-white/90">
        <span className="text-white/70 font-semibold">Qualiopi :</span>
        <span><StatusIcon status={satisfactionStatus} /> Satisfaction ({qualiopi?.satisfactionResponses ?? 0} réponse{(qualiopi?.satisfactionResponses ?? 0) > 1 ? "s" : ""})</span>
        <span><StatusIcon status={acquisitionStatus} /> Acquisition ({qualiopi?.evaluationCount ?? 0} évaluation{(qualiopi?.evaluationCount ?? 0) > 1 ? "s" : ""})</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2 : Intégrer dans TabQuestionnaires**

Use Edit tool dans `TabQuestionnaires.tsx` :

1. Ajouter l'import en haut du fichier :
```tsx
import { QuestionnaireOverview } from "./questionnaires/QuestionnaireOverview";
import { computeStageStats } from "@/lib/utils/questionnaire-stats";
```

2. Calculer les agrégats globaux juste avant le `return (` (autour des lignes 110) :
```tsx
const globalStats = STAGES.reduce(
  (acc, stage) => {
    const s = computeStageStats(stage, evalAssignments, satisAssignments, tokens, responses, enrollments, companies);
    acc.attributed += s.attributed;
    acc.sent += s.sent;
    acc.expectedSent += s.expectedSent;
    acc.answered += s.answered;
    return acc;
  },
  { attributed: 0, sent: 0, expectedSent: 0, answered: 0 },
);
const pending = Math.max(globalStats.sent - globalStats.answered, 0);

const learnerGridRef = useRef<HTMLDivElement>(null);
const handleScrollToPending = () => {
  learnerGridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
};
```

Ajouter en haut du fichier :
```tsx
import { useRef } from "react";
```
(ou modifier l'import existant `import { useState, useEffect, useCallback } from "react";` pour ajouter `useRef`.)

3. Remplacer le header actuel (lignes 117-122 approximatives, le gradient avec les 2 compteurs) par :
```tsx
<QuestionnaireOverview
  attributed={globalStats.attributed}
  sent={globalStats.sent}
  expectedSent={globalStats.expectedSent}
  answered={globalStats.answered}
  pending={pending}
  qualiopi={qualiopiIndicators}
  onScrollToPending={handleScrollToPending}
/>
```

4. Le `learnerGridRef` sera attaché au `LearnerStatusGrid` en Task 6.

- [ ] **Step 3 : Vérifier TS + tests**

```bash
npx tsc --noEmit 2>&1 | head -10
npx vitest run 2>&1 | tail -3
```
Expected : TS clean, 521 tests passent.

- [ ] **Step 4 : Commit**

```bash
git add 'src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/QuestionnaireOverview.tsx' 'src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx'
git commit -m "feat(questionnaires-overview): bannière compacte 4 KPIs + ligne Qualiopi (Volet D)

Remplace l'ancien header (2 compteurs : Réponses total + Complétion %)
par une bannière enrichie :
- 4 KPIs : Attribués / Envoyés / Répondus / En attente
- Ligne Qualiopi : 2 indicateurs (Satisfaction, Acquisition) avec
  statut ✅/⚠/⏸ basé sur loadQualiopiIndicators
- Click sur 'En attente' scrolle au LearnerStatusGrid (Task 6)"
```

---

## Task 5 : Composant `StageStatsBar`

**Files:**
- Create: `src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/StageStatsBar.tsx`
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx`

- [ ] **Step 1 : Créer le composant**

Créer `src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/StageStatsBar.tsx` :

```tsx
"use client";

import { cn } from "@/lib/utils";

interface StageStatsBarProps {
  attributed: number;
  sent: number;
  expectedSent: number;
  answered: number;
  rate: number;
}

function getRateColorClasses(rate: number): string {
  if (rate < 26) return "bg-red-100 text-red-700";
  if (rate <= 70) return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

export function StageStatsBar({ attributed, sent, expectedSent, answered, rate }: StageStatsBarProps) {
  if (attributed === 0) {
    return (
      <div className="border-t border-b border-gray-200 py-2 my-3 text-xs text-gray-400 text-center italic">
        Aucun questionnaire attribué pour ce stage
      </div>
    );
  }

  return (
    <div className="border-t border-b border-gray-200 py-2 my-3 flex items-center gap-3 text-xs">
      <span className="text-gray-600">
        <b>{attributed}</b> attribué{attributed > 1 ? "s" : ""}
      </span>
      <span className="text-gray-400">·</span>
      <span className="text-gray-600">
        <b>{sent}</b>/{expectedSent} envoyé{sent > 1 ? "s" : ""}
      </span>
      <span className="text-gray-400">·</span>
      <span className="text-gray-600">
        <b>{answered}</b> répondu{answered > 1 ? "s" : ""}
      </span>
      <span className="ml-auto">
        <span className={cn("px-2 py-0.5 rounded-full font-semibold", getRateColorClasses(rate))}>
          {rate}%
        </span>
      </span>
    </div>
  );
}
```

- [ ] **Step 2 : Intégrer dans chaque stage card de TabQuestionnaires**

Use Edit tool. Ajouter l'import en haut :
```tsx
import { StageStatsBar } from "./questionnaires/StageStatsBar";
```

Localiser la boucle qui rend chaque stage (autour des lignes 130-180). Pour chaque stage, calculer les stats juste avant de rendre les items :

```tsx
{STAGES.map((stage) => {
  const stageStats = computeStageStats(stage, evalAssignments, satisAssignments, tokens, responses, enrollments, companies);
  return (
    <div key={stage.id} className={cn("rounded-xl p-5", SC[stage.color].bg, "border", SC[stage.color].border)}>
      {/* ... header existant (icon + title + timing + objective) ... */}

      {/* NEW : StageStatsBar */}
      <StageStatsBar
        attributed={stageStats.attributed}
        sent={stageStats.sent}
        expectedSent={stageStats.expectedSent}
        answered={stageStats.answered}
        rate={stageStats.rate}
      />

      {/* ... liste des items existante ... */}
    </div>
  );
})}
```

**Note importante** : la boucle `STAGES.map` actuelle est un peu différente (vérifier le code réel). Adapter la position d'insertion pour que le `StageStatsBar` apparaisse entre l'objectif (existant) et la liste des items (existante).

- [ ] **Step 3 : Vérifier TS + tests**

```bash
npx tsc --noEmit 2>&1 | head -5
npx vitest run 2>&1 | tail -3
```
Expected : TS clean, 521 tests passent.

- [ ] **Step 4 : Commit**

```bash
git add 'src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/StageStatsBar.tsx' 'src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx'
git commit -m "feat(stage-stats-bar): mini-barre stats inline par stage card (Volet D)

4 chiffres compacts dans chaque stage card (avant/pendant/après/froid) :
- N attribués
- X/Y envoyés (sent / expectedSent)
- Z répondus
- W% taux complétion avec code couleur rouge/orange/vert

Empty state explicite si stage sans attribution."
```

---

## Task 6 : Composant `LearnerStatusGrid`

**Files:**
- Create: `src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/LearnerStatusGrid.tsx`
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx`

- [ ] **Step 1 : Créer le composant**

Créer `src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/LearnerStatusGrid.tsx` :

```tsx
"use client";

import { useState, useMemo } from "react";
import { CheckCircle2, Mail, Pause, Clock, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import type { LearnerStatusCell, LearnerStatus } from "@/lib/utils/questionnaire-stats";

interface LearnerStatusGridProps {
  sessionId: string;
  cells: LearnerStatusCell[];
  onSelectAnswered: (cell: LearnerStatusCell) => void;
  onRefresh: () => Promise<void>;
}

const STATUS_LABELS: Record<LearnerStatus, string> = {
  answered: "Répondu",
  sent: "Envoyé",
  not_sent: "Pas envoyé",
  not_assigned: "Non attribué",
  expired: "Expiré",
};

const STATUS_ICONS: Record<LearnerStatus, React.ReactNode> = {
  answered: <CheckCircle2 className="h-3.5 w-3.5 inline" />,
  sent: <Mail className="h-3.5 w-3.5 inline" />,
  not_sent: <Pause className="h-3.5 w-3.5 inline" />,
  not_assigned: <span>—</span>,
  expired: <Clock className="h-3.5 w-3.5 inline text-red-500" />,
};

const STATUS_COLORS: Record<LearnerStatus, string> = {
  answered: "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 cursor-pointer",
  sent: "bg-blue-50 text-blue-700 border border-blue-200",
  not_sent: "bg-gray-50 text-gray-500 border border-gray-200",
  not_assigned: "text-gray-300 text-center",
  expired: "bg-red-50 text-red-700 border border-red-200",
};

export function LearnerStatusGrid({ sessionId, cells, onSelectAnswered, onRefresh }: LearnerStatusGridProps) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(cells.length >= 25); // auto-expand sur grosse session
  const [filter, setFilter] = useState<LearnerStatus | "all" | "pending">("all");
  const [relaunching, setRelaunching] = useState(false);

  // Apprenants uniques + questionnaires uniques pour structurer la grille
  const learners = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of cells) map.set(c.learnerId, c.learnerName);
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [cells]);

  const questionnaires = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of cells) map.set(c.questionnaireId, c.questionnaireTitle);
    return Array.from(map, ([id, title]) => ({ id, title }));
  }, [cells]);

  // Filtre actif (sur statut)
  const filteredCells = useMemo(() => {
    if (filter === "all") return cells;
    if (filter === "pending") return cells.filter((c) => c.status === "sent" || c.status === "expired");
    return cells.filter((c) => c.status === filter);
  }, [cells, filter]);

  // Apprenants à relancer = uniques apprenants non répondants après filtre
  const learnerIdsToRelaunch = useMemo(() => {
    const ids = new Set<string>();
    for (const c of filteredCells) {
      if (c.status === "sent" || c.status === "expired") ids.add(c.learnerId);
    }
    return Array.from(ids);
  }, [filteredCells]);

  // Cellule par couple (learner, questionnaire)
  const cellMap = useMemo(() => {
    const map = new Map<string, LearnerStatusCell>();
    for (const c of cells) map.set(`${c.learnerId}::${c.questionnaireId}`, c);
    return map;
  }, [cells]);

  const handleRelaunch = async () => {
    if (learnerIdsToRelaunch.length === 0) {
      toast({ title: "Aucun apprenant à relancer", variant: "default" });
      return;
    }
    setRelaunching(true);
    try {
      const res = await fetch("/api/questionnaires/relaunch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, learner_ids: learnerIdsToRelaunch }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Erreur ${res.status}`);
      }
      toast({ title: `${learnerIdsToRelaunch.length} relance(s) envoyée(s)` });
      await onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur de relance";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setRelaunching(false);
    }
  };

  if (cells.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 border border-gray-200 rounded-xl bg-white">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <span className="font-semibold text-gray-700">État des réponses par apprenant</span>
        <Badge variant="secondary">{learners.length} apprenant{learners.length > 1 ? "s" : ""} × {questionnaires.length} questionnaire{questionnaires.length > 1 ? "s" : ""}</Badge>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {expanded && (
        <div className="border-t border-gray-200 p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left py-2 px-2 sticky left-0 bg-white">Apprenant</th>
                  {questionnaires.map((q) => (
                    <th key={q.id} className="text-center py-2 px-2 font-medium text-xs text-gray-600">{q.title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {learners.map((l) => (
                  <tr key={l.id} className="border-t border-gray-100">
                    <td className="py-2 px-2 font-medium sticky left-0 bg-white">{l.name}</td>
                    {questionnaires.map((q) => {
                      const cell = cellMap.get(`${l.id}::${q.id}`);
                      const status: LearnerStatus = cell?.status ?? "not_assigned";
                      return (
                        <td key={q.id} className="text-center py-2 px-1">
                          <span
                            onClick={() => { if (status === "answered" && cell) onSelectAnswered(cell); }}
                            className={cn("inline-flex items-center gap-1 px-2 py-1 rounded text-xs", STATUS_COLORS[status])}
                            title={status === "sent" && cell?.tokenExpiresAt ? `Token expire le ${new Date(cell.tokenExpiresAt).toLocaleDateString("fr-FR")}` : STATUS_LABELS[status]}
                          >
                            {STATUS_ICONS[status]}
                            <span className="hidden sm:inline">{STATUS_LABELS[status]}</span>
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <Select value={filter} onValueChange={(v) => setFilter(v as LearnerStatus | "all" | "pending")}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filtrer" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="pending">Non-répondants (envoyé + expiré)</SelectItem>
                <SelectItem value="answered">Répondu</SelectItem>
                <SelectItem value="sent">Envoyé</SelectItem>
                <SelectItem value="not_sent">Pas envoyé</SelectItem>
                <SelectItem value="expired">Expiré</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="default"
              onClick={handleRelaunch}
              disabled={relaunching || learnerIdsToRelaunch.length === 0}
            >
              {relaunching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
              Relancer non-répondants ({learnerIdsToRelaunch.length})
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2 : Intégrer dans TabQuestionnaires**

Use Edit tool. Ajouter l'import :
```tsx
import { LearnerStatusGrid } from "./questionnaires/LearnerStatusGrid";
import { computeLearnerStatuses, type LearnerStatusCell } from "@/lib/utils/questionnaire-stats";
```

Calculer les cells juste avant le `return (` :
```tsx
const learnerStatusCells = computeLearnerStatuses(
  enrollments as Parameters<typeof computeLearnerStatuses>[0],
  evalAssignments as Parameters<typeof computeLearnerStatuses>[1],
  satisAssignments as Parameters<typeof computeLearnerStatuses>[2],
  tokens as Parameters<typeof computeLearnerStatuses>[3],
  responses as Parameters<typeof computeLearnerStatuses>[4],
);
const [responseDialogCell, setResponseDialogCell] = useState<LearnerStatusCell | null>(null);
```

Note : le `useState` doit être déplacé en haut avec les autres `useState`, pas avant le return. Adapter.

Ajouter le composant `<LearnerStatusGrid>` dans le JSX, après les 4 stage cards (juste avant la fermeture de la div racine, ou avant `{detailItem && <ItemDetail ...>}`) :

```tsx
<div ref={learnerGridRef}>
  <LearnerStatusGrid
    sessionId={formation.id}
    cells={learnerStatusCells}
    onSelectAnswered={(cell) => setResponseDialogCell(cell)}
    onRefresh={async () => { await fetchData(); await onRefresh(); }}
  />
</div>
```

- [ ] **Step 3 : Vérifier TS + tests**

```bash
npx tsc --noEmit 2>&1 | head -10
npx vitest run 2>&1 | tail -3
```
Expected : TS clean, 521 tests passent.

- [ ] **Step 4 : Commit**

```bash
git add 'src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/LearnerStatusGrid.tsx' 'src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx'
git commit -m "feat(learner-status-grid): grid apprenants × questionnaires + filtres + relance (Volet D)

Grid pliable (auto-expand si >= 25 cellules) avec :
- 5 statuts par cellule : ✅ Répondu, 📨 Envoyé, ⏸ Pas envoyé, — Non attribué, ❌ Expiré
- Click sur ✅ ouvre LearnerResponsesDialog (Task 7) via callback
- Dropdown filtre par statut + option 'Non-répondants uniquement'
- Bouton 'Relancer non-répondants (N)' : POST /api/questionnaires/relaunch
  + toast succès/erreur

Tooltip affiche la date d'expiration du token pour les statuts sent."
```

---

## Task 7 : Composant `LearnerResponsesDialog`

**Files:**
- Create: `src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/LearnerResponsesDialog.tsx`
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx`

- [ ] **Step 1 : Créer le composant**

Créer `src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/LearnerResponsesDialog.tsx` :

```tsx
"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { normalize, isCorrect } from "@/lib/services/questionnaire-scoring";
import type { LearnerStatusCell } from "@/lib/utils/questionnaire-stats";

interface Props {
  cell: LearnerStatusCell | null;
  sessionId: string;
  onClose: () => void;
}

interface QuestionRow {
  id: string;
  text: string;
  type: string;
  options: unknown;
  order_index: number;
}

interface ResponseRecord {
  responses: Record<string, unknown>;
  submitted_at: string;
}

export function LearnerResponsesDialog({ cell, sessionId, onClose }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [record, setRecord] = useState<ResponseRecord | null>(null);

  useEffect(() => {
    if (!cell) {
      setQuestions([]);
      setRecord(null);
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const supabase = createClient();
        const [qR, rR] = await Promise.all([
          supabase.from("questions").select("id, text, type, options, order_index").eq("questionnaire_id", cell.questionnaireId).order("order_index"),
          supabase.from("questionnaire_responses").select("responses, submitted_at").eq("id", cell.responseId!).single(),
        ]);
        if (qR.data) setQuestions(qR.data);
        if (rR.data) setRecord(rR.data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Erreur de chargement";
        toast({ title: "Erreur", description: message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [cell, toast]);

  if (!cell) return null;

  return (
    <Dialog open={!!cell} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Réponses de {cell.learnerName} — {cell.questionnaireTitle}</DialogTitle>
        </DialogHeader>

        {loading && <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>}

        {!loading && record && (
          <div className="space-y-1">
            <p className="text-xs text-gray-500">Soumis le {new Date(record.submitted_at).toLocaleString("fr-FR")}</p>
            <ol className="space-y-4 mt-4">
              {questions.map((q, idx) => (
                <li key={q.id} className="border-b border-gray-100 pb-3">
                  <p className="font-medium text-sm text-gray-800 mb-1">{idx + 1}. {q.text}</p>
                  <ResponseRenderer question={q} response={record.responses[q.id]} />
                </li>
              ))}
            </ol>
          </div>
        )}

        {!loading && !record && (
          <p className="py-8 text-center text-gray-500 text-sm">Aucune réponse trouvée</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResponseRenderer({ question, response }: { question: QuestionRow; response: unknown }) {
  if (response === undefined || response === null) {
    return <p className="text-xs text-gray-400 italic">Pas de réponse</p>;
  }

  switch (question.type) {
    case "rating": {
      const max = ((question.options as { max?: number } | null | undefined)?.max) ?? 5;
      return <p className="text-sm">Réponse : <b>{String(response)}/{max}</b></p>;
    }

    case "text":
    case "short_answer": {
      return <p className="text-sm">Réponse : <b className="italic">"{String(response)}"</b></p>;
    }

    case "multiple_choice": {
      const opts = question.options as { options?: string[]; correct_answer?: number } | null | undefined;
      const choices = opts?.options ?? [];
      const correctIdx = typeof opts?.correct_answer === "number" ? opts.correct_answer : null;

      let userLabel: string;
      let userIdx: number;
      if (typeof response === "number") {
        userIdx = response;
        userLabel = choices[response] ?? `Option ${response}`;
      } else {
        const respStr = String(response);
        userIdx = choices.findIndex((o) => normalize(o) === normalize(respStr));
        userLabel = userIdx >= 0 ? choices[userIdx] : respStr;
      }

      const correctness = correctIdx !== null ? isCorrect(question, response) : null;

      return (
        <p className="text-sm">
          Réponse : <b>▸ {userLabel}</b>
          {correctness === true && <span className="text-emerald-600 ml-2"><CheckCircle2 className="h-3.5 w-3.5 inline" /> Correct</span>}
          {correctness === false && <span className="text-red-600 ml-2"><XCircle className="h-3.5 w-3.5 inline" /> Incorrect</span>}
        </p>
      );
    }

    case "yes_no":
    case "true_false": {
      const normalized = normalize(response);
      const display = normalized === "oui" || normalized === "true" ? "Oui" : "Non";
      return <p className="text-sm">Réponse : <b>{display}</b></p>;
    }

    case "program_objectives": {
      // response = Record<objective_text, "Oui"|"Non"|number>
      if (typeof response !== "object" || response === null) {
        return <p className="text-sm">Réponse : <b>{String(response)}</b></p>;
      }
      const entries = Object.entries(response as Record<string, unknown>);
      return (
        <ul className="text-sm space-y-1 ml-3">
          {entries.map(([obj, val]) => (
            <li key={obj} className="text-xs">
              <span className="text-gray-600">{obj} :</span> <b>{String(val)}</b>
            </li>
          ))}
        </ul>
      );
    }

    default:
      return <p className="text-sm">Réponse : <b>{JSON.stringify(response)}</b></p>;
  }
}
```

- [ ] **Step 2 : Intégrer dans TabQuestionnaires**

Use Edit tool. Ajouter l'import :
```tsx
import { LearnerResponsesDialog } from "./questionnaires/LearnerResponsesDialog";
```

Ajouter le composant à la fin du JSX (au même niveau que `LearnerStatusGrid`) :

```tsx
<LearnerResponsesDialog
  cell={responseDialogCell}
  sessionId={formation.id}
  onClose={() => setResponseDialogCell(null)}
/>
```

- [ ] **Step 3 : Vérifier TS + tests**

```bash
npx tsc --noEmit 2>&1 | head -5
npx vitest run 2>&1 | tail -3
```
Expected : TS clean, 521 tests passent.

- [ ] **Step 4 : Commit**

```bash
git add 'src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/LearnerResponsesDialog.tsx' 'src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx'
git commit -m "feat(learner-responses-dialog): modal read-only des réponses détaillées (Volet D)

Modal s'ouvre au clic sur une cellule ✅ Répondu dans LearnerStatusGrid.

ResponseRenderer fait un switch sur question.type pour formater :
- rating : 'Réponse : 3/5'
- text/short_answer : 'Réponse : \"...\"'
- multiple_choice : 'Réponse : ▸ Option X' + ✓ Correct / ✗ Incorrect via isCorrect()
  du helper questionnaire-scoring (réutilisation Chantier 1)
- yes_no/true_false : 'Réponse : Oui/Non'
- program_objectives : liste objectif → acquis

Fetch des questions + réponse complète au montage du dialog."
```

---

## Task 8 : Polish + corrections finales

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx`

- [ ] **Step 1 : Vérifier l'ordre logique du JSX**

L'ordre dans le `return (` de TabQuestionnaires doit être :
1. `<QuestionnaireOverview ...>` (en haut, remplace l'ancien header)
2. Loop `STAGES.map(stage => ...)` avec `<StageStatsBar>` inséré dans chaque card
3. `<ItemDetail ...>` (conditionné par detailItem)
4. `<LearnerStatusGrid ...>` (ref={learnerGridRef})
5. `<LearnerResponsesDialog ...>` (modal contrôlé par responseDialogCell)

Vérifier que cet ordre est respecté visuellement à l'écran (lancer `npm run dev` localement si possible).

- [ ] **Step 2 : Vérifier les imports React**

```bash
grep -nE "^import .* from \"react\"" 'src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx'
```

L'import React doit inclure `useState, useEffect, useCallback, useRef`. Si `useRef` manque, le rajouter :
```tsx
import { useState, useEffect, useCallback, useRef } from "react";
```

- [ ] **Step 3 : LOC count check**

Run:
```bash
wc -l 'src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx'
```
Expected: < 500 LOC après ajouts. Si > 500, c'est OK aussi tant que ça reste sous 600.

- [ ] **Step 4 : Suite complète + tsc + build**

```bash
npx vitest run 2>&1 | tail -3
npx tsc --noEmit 2>&1 | head -5
npm run build 2>&1 | tail -5
```
Expected: 521 tests, TS clean, build OK.

- [ ] **Step 5 : Commit (si modifications)**

```bash
git add 'src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx'
git commit -m "polish(tab-questionnaires): ordre final JSX + imports React (Volet D)

Polish final post-Tasks 4-7. Vérification ordre JSX :
1. QuestionnaireOverview (bannière)
2. STAGES.map → stage cards avec StageStatsBar
3. ItemDetail (conditionnel)
4. LearnerStatusGrid (ref scroll)
5. LearnerResponsesDialog (modal)"
```

Si aucune modification nécessaire, faire commit empty :
```bash
git commit --allow-empty -m "polish(tab-questionnaires): vérification post-Tasks 4-7 ✓ (Volet D)

Ordre JSX correct, imports React complets, LOC sous 600. Aucune
modification nécessaire."
```

---

## Task 9 : Vérification finale acceptance criteria

**Files:** aucun (vérifications uniquement).

- [ ] **Step 1 : Suite Vitest complète**

```bash
npx vitest run 2>&1 | tail -6
```
Expected: **≥ 521 tests verts** (514 baseline + 7 nouveaux helpers).

- [ ] **Step 2 : Coverage threshold maintenu**

```bash
npx vitest run --coverage 2>&1 | tail -15
```
Expected: `questionnaire-scoring.ts` toujours à 100% (non touché par ce chantier).

- [ ] **Step 3 : TypeScript clean**

```bash
npx tsc --noEmit 2>&1
```
Expected: aucun output.

- [ ] **Step 4 : Build Next.js**

```bash
npm run build 2>&1 | tail -10
```
Expected: build successful.

- [ ] **Step 5 : Acceptance criteria (spec §8)**

```bash
echo "=== AC1 — QuestionnaireOverview existe + intégré ==="
ls 'src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/QuestionnaireOverview.tsx'
grep -c "QuestionnaireOverview" 'src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx'

echo ""
echo "=== AC2 — StageStatsBar existe + intégré ==="
ls 'src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/StageStatsBar.tsx'
grep -c "StageStatsBar" 'src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx'

echo ""
echo "=== AC3 — LearnerStatusGrid existe + intégré ==="
ls 'src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/LearnerStatusGrid.tsx'
grep -c "LearnerStatusGrid" 'src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx'

echo ""
echo "=== AC4 — LearnerResponsesDialog existe + intégré ==="
ls 'src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/LearnerResponsesDialog.tsx'
grep -c "LearnerResponsesDialog" 'src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx'

echo ""
echo "=== AC5 — Helper + tests ==="
ls src/lib/utils/questionnaire-stats.ts
grep -c "it(" src/lib/utils/__tests__/questionnaire-stats.test.ts

echo ""
echo "=== AC6 — Récap commits Chantier 2b ==="
git log --oneline main..HEAD | wc -l
echo "commits"
git log --oneline main..HEAD
```

- [ ] **Step 6 : Spot check manuel UI (recommandé)**

Sur l'UI réelle (Wissam) :
1. Lancer `npm run dev` puis ouvrir `/admin/formations/<f_id>` → onglet "Questionnaires"
2. Vérifier que :
   - La bannière `QuestionnaireOverview` apparaît en haut avec 4 KPIs et ligne Qualiopi
   - Chaque stage card a sa `StageStatsBar` avec stats compactes
   - Le `LearnerStatusGrid` est visible en bas (replié ou déplié selon nb de cellules)
   - Click sur "En attente" scrolle au grid
   - Le bouton "Relancer non-répondants (N)" est visible et le clic envoie la requête
   - Click sur un statut ✅ Répondu ouvre `LearnerResponsesDialog` avec les réponses détaillées

- [ ] **Step 7 : Présenter les options finishing**

Présenter à Wissam les 4 options du skill `superpowers:finishing-a-development-branch` :

1. Merge back to main locally
2. Push and create a Pull Request
3. Keep the branch as-is
4. Discard this work

Rappeler :
- Pas de migration SQL
- Validation manuelle légère (spot check UI Step 6) — pas de Dashboard
- Pattern habituel : merge local + push prod

---

## Self-review (effectuée pendant la rédaction)

### 1. Spec coverage

| Spec section | Task(s) couvrant |
|---|---|
| §3 (architecture) | Vue d'ensemble du plan en début |
| §4 (QuestionnaireOverview) | Task 4 (composant + intégration) |
| §5 (StageStatsBar) | Task 5 (composant + intégration dans STAGES.map) |
| §6 (LearnerStatusGrid) | Task 6 (composant + intégration en bas) |
| §7 (LearnerResponsesDialog) | Task 7 (composant + intégration via responseDialogCell state) |
| §3.2 (helper questionnaire-stats) | Task 1 (computeStageStats) + Task 2 (computeLearnerStatuses) |
| §3.3 (modif fetchData) | Task 3 (Promise.all étendu + 2 nouveaux states) |
| §8 (acceptance criteria) | Task 9 (vérification finale) |
| §9 (risques) | Adressés par les validations + spot check Step 6 |
| §11 (ordre d'exécution) | Reflète exactement le plan 10 tâches |

✅ 100% de couverture.

### 2. Placeholder scan

- Aucun "TBD" ou "TODO"
- Aucun "Similar to Task N" sans répétition de code
- Aucun "implement later"
- Tous les blocs de code sont complets

### 3. Type consistency

- `LearnerStatusCell` + `LearnerStatus` : déclarés en Task 2, importés en Tasks 6 + 7
- `StageStats` : déclaré en Task 1, retourné par `computeStageStats`, consommé en Task 5
- `computeStageStats(stage, evalAssignments, satisAssignments, tokens, responses, learners, companies)` : signature cohérente Task 1 ↔ Task 4 ↔ Task 5
- `computeLearnerStatuses(enrollments, evalAssignments, satisAssignments, tokens, responses)` : signature cohérente Task 2 ↔ Task 6

✅ Pas de divergence détectée.

---

## Exécution

Plan complete et sauvé à `docs/superpowers/plans/2026-05-26-questionnaires-volet-d-ux.md`. Deux options d'exécution :

**1. Subagent-Driven (recommandé)** — dispatch d'un subagent par tâche, revue spec compliance + code quality entre chaque, itération rapide (pattern identique aux 8 chantiers précédents).

**2. Inline Execution** — exécution des tâches dans cette session via `executing-plans`, batch execution avec checkpoints.

Quelle approche ?
