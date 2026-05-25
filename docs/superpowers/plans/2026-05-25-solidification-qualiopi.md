# Plan d'implémentation — Solidification Qualiopi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Solidifier le sous-onglet Qualiopi (TabQualiopi) en corrigeant 4 bugs critiques + 6 majeurs + dette, et en construisant la feature « snapshots historiques » (cron quotidien + sparkline + Sheet détail).

**Architecture:** Extraction de la logique de score vers une lib testable `src/lib/services/qualiopi-score.ts`, ajout d'une colonne BDD dédiée pour les checks manuels (`sessions.qualiopi_manual JSONB`), création d'une feature snapshots (table existante + cron Netlify + route API + 2 nouveaux composants Sheet), factorisation du mapping `status → flags` dans `src/lib/utils/document-status.ts`, durcissement de `loadQualiopiIndicators` (entity_id filter), refactor de TabQualiopi (persistance robuste, `router.replace`, AbortController, batching N+1 via RPC), drop de la route `qualiopi-check-proof` orpheline.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase (RLS, RPC PL/pgSQL), Vitest, Netlify Scheduled Functions, shadcn/ui (Sheet), recharts, Zod, AbortController.

**Spec source:** [docs/superpowers/specs/2026-05-25-solidification-qualiopi-design.md](docs/superpowers/specs/2026-05-25-solidification-qualiopi-design.md)

**Acceptance criteria source:** Spec §6 (vérifiés en Tâche 12).

---

## Vue d'ensemble des fichiers

### Créés
| Fichier | Rôle |
|---|---|
| `supabase/migrations/qualiopi_solidification.sql` | Migration : col qualiopi_manual + RPC count_responses + drop check-proof |
| `src/lib/utils/document-status.ts` | `mapStatusToFlags(status) → { is_signed, is_sent, is_confirmed }` |
| `src/lib/utils/__tests__/document-status.test.ts` | 5 tests |
| `src/lib/services/qualiopi-score.ts` | `buildQualiopiItems` + `computeQualiopiScore` |
| `src/lib/services/qualiopi-snapshots.ts` | `snapshotEntityQualiopi(supabase, entityId)` |
| `src/lib/services/__tests__/qualiopi-snapshots.test.ts` | 4 tests |
| `src/lib/services/__tests__/load-session-aggregates.test.ts` | Tests loadQualiopiIndicators |
| `src/app/api/qualiopi/snapshots/route.ts` | POST (cron) + GET (Sheet) |
| `netlify/functions/process-qualiopi-snapshots.mts` | Cron `0 3 * * *` |
| `src/app/(dashboard)/admin/formations/[id]/_components/QualiopiSparkline.tsx` | Mini-graphique recharts |
| `src/app/(dashboard)/admin/formations/[id]/_components/QualiopiHistoryDetail.tsx` | Sheet shadcn historique |
| `src/app/(dashboard)/admin/formations/[id]/_components/QualiopiAuditDetail.tsx` | Sheet shadcn audit complet |

### Modifiés
| Fichier | Changement |
|---|---|
| `src/lib/types/index.ts` | Ajout `qualiopi_score`, `qualiopi_manual` à `Session` |
| `src/lib/services/load-session-aggregates.ts` | entity_id filter sur enrollments / signatures / questionnaire_responses |
| `src/lib/services/documents-store.ts` | `getDocsForSession` utilise `mapStatusToFlags` |
| `src/lib/__tests__/qualiopi-score.test.ts` | Imports depuis nouvelle lib + scénarios étendus |
| `src/app/(dashboard)/admin/formations/[id]/_components/TabQualiopi.tsx` | Refactor majeur (score lib, qualiopi_manual, router.replace, AbortController, RPC, retraits) |
| `src/app/(dashboard)/admin/formations/[id]/page.tsx` | Retrait du cast `as unknown as { qualiopi_score?: number }` |
| `src/app/api/ai/qualiopi-mock-audit/route.ts` | Zod + utilise `mapStatusToFlags` |

### Supprimés
| Fichier | Raison |
|---|---|
| `src/app/api/ai/qualiopi-check-proof/route.ts` | Route orpheline (aucun consumer UI) |
| Test `e2e/qualiopi-ia.spec.ts` (sous-section qualiopi-check-proof) | Cohérence avec drop |

---

## Tâche 1 : Migration SQL + types `Session` étendus

**Files:**
- Create: `supabase/migrations/qualiopi_solidification.sql`
- Modify: `src/lib/types/index.ts` (ou fichier qui contient l'interface `Session`)

- [ ] **Step 1 : Vérifier l'état initial (green baseline)**

Run:
```bash
git status
npx vitest run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | head -10
```
Expected: working tree clean (ou seulement les fichiers de docs du chantier), all tests passing, TypeScript clean.

- [ ] **Step 2 : Créer la branche dédiée depuis main**

```bash
git checkout main
git pull origin main 2>/dev/null || true   # rebase si besoin
git checkout -b feat/qualiopi-solidification
```

- [ ] **Step 3 : Créer le fichier de migration SQL**

Créer `supabase/migrations/qualiopi_solidification.sql` :
```sql
-- ============================================================
-- Migration : Solidification Qualiopi — 2026-05-25
-- ============================================================
-- Cf docs/superpowers/specs/2026-05-25-solidification-qualiopi-design.md
-- À EXÉCUTER DANS LE SUPABASE DASHBOARD SQL EDITOR après le déploiement.
-- ============================================================

-- 1. Nouvelle colonne sessions.qualiopi_manual pour les checks manuels Qualiopi
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS qualiopi_manual JSONB DEFAULT '{}'::jsonb;

-- 2. Migration depuis sessions.notes (best-effort, tolérante au texte invalide).
--    Une fonction temporaire intercepte les exceptions du cast ::jsonb pour les
--    sessions dont notes contient du texte libre commençant par { mais qui n'est
--    pas du JSON valide.
CREATE OR REPLACE FUNCTION pg_temp.safe_extract_qualiopi_manual(input_notes TEXT)
RETURNS JSONB LANGUAGE plpgsql AS $$
BEGIN
  IF input_notes IS NULL THEN RETURN '{}'::jsonb; END IF;
  RETURN COALESCE((input_notes::jsonb -> 'qualiopi_manual'), '{}'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RETURN '{}'::jsonb;
END;
$$;

UPDATE sessions
SET qualiopi_manual = pg_temp.safe_extract_qualiopi_manual(notes)
WHERE qualiopi_manual = '{}'::jsonb OR qualiopi_manual IS NULL;

-- 3. Fonction RPC pour batching des response counts (résout N+1 dans TabQualiopi)
CREATE OR REPLACE FUNCTION count_responses_by_questionnaire(
  p_session_id UUID,
  p_questionnaire_ids UUID[]
) RETURNS TABLE(questionnaire_id UUID, response_count BIGINT)
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
  SELECT questionnaire_id, COUNT(*)::BIGINT
  FROM questionnaire_responses
  WHERE session_id = p_session_id
    AND questionnaire_id = ANY(p_questionnaire_ids)
  GROUP BY questionnaire_id;
$$;
GRANT EXECUTE ON FUNCTION count_responses_by_questionnaire TO authenticated;

-- 4. Drop check-proof (À EXÉCUTER MANUELLEMENT APRÈS VÉRIFICATION COUNT = 0)
-- Vérification préalable :
--   SELECT count(*) FROM qualiopi_proof_checks;
-- Si 0 → décommenter :
-- DROP TABLE IF EXISTS qualiopi_proof_checks;
```

- [ ] **Step 4 : Localiser l'interface `Session`**

Run:
```bash
grep -rn "export interface Session" src/lib/types/ 2>/dev/null
```
Expected: 1 ligne pointant vers le fichier (probablement `src/lib/types/index.ts` ou `src/lib/types/database.ts`). Noter le chemin exact.

- [ ] **Step 5 : Ajouter `qualiopi_score` et `qualiopi_manual` à `Session`**

Dans le fichier identifié au Step 4, ajouter à l'interface `Session` (après les autres champs nullable de la table sessions) :
```ts
  qualiopi_score?: number | null;
  qualiopi_manual?: Record<string, boolean> | null;
```

- [ ] **Step 6 : Vérifier TypeScript clean**

Run:
```bash
npx tsc --noEmit 2>&1 | tail -10
```
Expected: aucune erreur. Le cast `as unknown as { qualiopi_score?: number }` dans `formations/[id]/page.tsx:139` reste pour le moment (sera retiré en Tâche 5).

- [ ] **Step 7 : Commit**

```bash
git add supabase/migrations/qualiopi_solidification.sql src/lib/types/
git commit -m "feat(qualiopi): migration SQL + champs Session pour solidification

- ALTER sessions ADD COLUMN qualiopi_manual JSONB
- Migration tolérante depuis sessions.notes (pg_temp + EXCEPTION)
- RPC count_responses_by_questionnaire (batching N+1)
- Note drop qualiopi_proof_checks (à exécuter manuellement après COUNT=0)
- Interface Session : qualiopi_score + qualiopi_manual"
```

---

## Tâche 2 : Utilitaire `document-status.ts` + tests

**Files:**
- Create: `src/lib/utils/document-status.ts`
- Create: `src/lib/utils/__tests__/document-status.test.ts`

- [ ] **Step 1 : Écrire le test (failing test)**

Créer `src/lib/utils/__tests__/document-status.test.ts` :
```ts
import { describe, it, expect } from "vitest";
import { mapStatusToFlags } from "@/lib/utils/document-status";

describe("mapStatusToFlags", () => {
  it("draft → tout false sauf is_confirmed=false", () => {
    expect(mapStatusToFlags("draft")).toEqual({
      is_confirmed: false,
      is_sent: false,
      is_signed: false,
    });
  });

  it("generated → is_confirmed=true, sent et signed restent false", () => {
    expect(mapStatusToFlags("generated")).toEqual({
      is_confirmed: true,
      is_sent: false,
      is_signed: false,
    });
  });

  it("sent → is_confirmed et is_sent true, signed false", () => {
    expect(mapStatusToFlags("sent")).toEqual({
      is_confirmed: true,
      is_sent: true,
      is_signed: false,
    });
  });

  it("signed → tout true (sent implique signé)", () => {
    expect(mapStatusToFlags("signed")).toEqual({
      is_confirmed: true,
      is_sent: true,
      is_signed: true,
    });
  });

  it("null / undefined / status inconnu → fallback draft", () => {
    const expected = { is_confirmed: false, is_sent: false, is_signed: false };
    expect(mapStatusToFlags(null)).toEqual(expected);
    expect(mapStatusToFlags(undefined)).toEqual(expected);
    expect(mapStatusToFlags("cancelled")).toEqual(expected);
    expect(mapStatusToFlags("inconnu")).toEqual(expected);
  });
});
```

- [ ] **Step 2 : Vérifier que le test échoue**

Run:
```bash
npx vitest run src/lib/utils/__tests__/document-status.test.ts 2>&1 | tail -10
```
Expected: erreur d'import (le fichier `document-status.ts` n'existe pas encore).

- [ ] **Step 3 : Implémenter le module**

Créer `src/lib/utils/document-status.ts` :
```ts
/**
 * Mapping unifié du `status` d'un document vers les flags booléens utilisés
 * par les consumers historiques (Qualiopi, exports, vues de listes).
 *
 * Source de vérité : la colonne `status` de la table `documents` unifiée
 * (CHECK contraint : 'draft' | 'generated' | 'sent' | 'signed' | 'cancelled').
 *
 * Avant ce module, cette logique était dupliquée dans :
 *  - src/lib/services/documents-store.ts (getDocsForSession)
 *  - src/app/api/ai/qualiopi-mock-audit/route.ts (mapping inline)
 * → risque de divergence silencieuse, corrigé en mutualisant ici.
 */

export type DocStatus = "draft" | "generated" | "sent" | "signed" | "cancelled";

export interface DocFlags {
  /** Le document est plus que brouillon (a été matérialisé au moins une fois). */
  is_confirmed: boolean;
  /** Le document a été envoyé au destinataire (sent ou signed). */
  is_sent: boolean;
  /** Le document est signé (état terminal côté apprenant/entreprise). */
  is_signed: boolean;
}

export function mapStatusToFlags(status: DocStatus | string | null | undefined): DocFlags {
  const s = (status ?? "draft") as DocStatus;
  return {
    is_confirmed: s === "generated" || s === "sent" || s === "signed",
    is_sent: s === "sent" || s === "signed",
    is_signed: s === "signed",
  };
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

Run:
```bash
npx vitest run src/lib/utils/__tests__/document-status.test.ts 2>&1 | tail -6
```
Expected: `5 passed`.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/utils/document-status.ts src/lib/utils/__tests__/document-status.test.ts
git commit -m "feat(qualiopi): utilitaire mapStatusToFlags partagé

Mutualise le mapping status → { is_confirmed, is_sent, is_signed } qui était
dupliqué dans documents-store et la route qualiopi-mock-audit.
5 tests couvrant les 5 statuses + null/inconnu."
```

---

## Tâche 3 : Lib `qualiopi-score.ts` + migration tests

**Files:**
- Create: `src/lib/services/qualiopi-score.ts`
- Modify: `src/lib/__tests__/qualiopi-score.test.ts` (imports + scénarios étendus)

- [ ] **Step 1 : Comprendre la logique existante**

Read: `src/app/(dashboard)/admin/formations/[id]/_components/TabQualiopi.tsx` lignes 38-220 (build items) et 223-236 (computeScore), ainsi que la fonction inline `computeQualiopiScore` lignes 497-526. C'est la matière à extraire.

- [ ] **Step 2 : Mettre à jour le test existant — failing first**

Remplacer le contenu de `src/lib/__tests__/qualiopi-score.test.ts` par :
```ts
import { describe, it, expect } from "vitest";
import type { Session } from "@/lib/types";
import {
  buildQualiopiItems,
  computeQualiopiScore,
} from "@/lib/services/qualiopi-score";

function makeFormation(overrides: Partial<Session> = {}): Session {
  return {
    id: "test-id",
    training_id: null,
    entity_id: "entity-1",
    title: "Formation Test",
    start_date: "2026-01-01",
    end_date: "2026-01-31",
    location: null,
    mode: "presentiel",
    status: "completed",
    max_participants: null,
    trainer_id: null,
    notes: null,
    type: "intra",
    domain: null,
    description: null,
    total_price: null,
    planned_hours: null,
    visio_link: null,
    manager_id: null,
    program_id: null,
    is_planned: true,
    is_completed: true,
    is_dpc: false,
    is_subcontracted: false,
    catalog_pre_registration: false,
    updated_at: "2026-01-01",
    created_at: "2026-01-01",
    formation_convention_documents: [],
    formation_evaluation_assignments: [],
    formation_satisfaction_assignments: [],
    formation_elearning_assignments: [],
    enrollments: [],
    ...overrides,
  } as Session;
}

describe("buildQualiopiItems", () => {
  it("formation vide → 8 items, tous à false ou 0%", () => {
    const items = buildQualiopiItems(makeFormation());
    expect(items).toHaveLength(8);
    expect(items.filter(i => i.value === false)).toHaveLength(8);
  });

  it("formation sous-traitée → 10 items (8 + 2 sous-traitance)", () => {
    const items = buildQualiopiItems(makeFormation({ is_subcontracted: true }));
    expect(items).toHaveLength(10);
    expect(items.filter(i => i.category === "sous_traitance")).toHaveLength(2);
  });

  it("manualChecks fournis → l'item manuel adopte la valeur", () => {
    const items = buildQualiopiItems(
      makeFormation({ is_subcontracted: true }),
      { manualChecks: { docs_post_formation_received: true } },
    );
    const manual = items.find(i => i.id === "docs_post_formation_received");
    expect(manual?.value).toBe(true);
  });

  it("responseCounts à 0/N → auto_percent à 0%", () => {
    const items = buildQualiopiItems(makeFormation({
      formation_evaluation_assignments: [
        { id: "e1", evaluation_type: "eval_preformation", questionnaire_id: "q1" } as never,
      ],
      enrollments: [{ learner_id: "l1" } as never],
    }), {
      responseCounts: { eval_preformation: { total: 1, done: 0 } },
    });
    const item = items.find(i => i.id === "eval_preformation");
    expect(item?.type).toBe("auto_percent");
    expect(item?.percent).toBe(0);
  });

  it("responseCounts à 100% → auto_percent à 100%", () => {
    const items = buildQualiopiItems(makeFormation({
      formation_evaluation_assignments: [
        { id: "e1", evaluation_type: "eval_preformation", questionnaire_id: "q1" } as never,
      ],
      enrollments: [{ learner_id: "l1" } as never],
    }), {
      responseCounts: { eval_preformation: { total: 1, done: 1 } },
    });
    const item = items.find(i => i.id === "eval_preformation");
    expect(item?.percent).toBe(100);
  });
});

describe("computeQualiopiScore", () => {
  it("formation vide → 0%", () => {
    expect(computeQualiopiScore(makeFormation())).toBe(0);
  });

  it("convention signée seule → 1/8 ≈ 13%", () => {
    const score = computeQualiopiScore(makeFormation({
      formation_convention_documents: [
        { id: "1", doc_type: "convention_entreprise", is_signed: true } as never,
      ],
    }));
    expect(score).toBe(13);
  });

  it("tous documents OK + questionnaires 100% → 100%", () => {
    const score = computeQualiopiScore(makeFormation({
      formation_convention_documents: [
        { id: "1", doc_type: "convention_entreprise", is_signed: true } as never,
        { id: "2", doc_type: "convocation", is_sent: true } as never,
        { id: "3", doc_type: "convention_intervention", is_signed: true } as never,
        { id: "4", doc_type: "certificat_realisation", is_sent: true } as never,
      ],
      formation_evaluation_assignments: [
        { id: "e1", evaluation_type: "eval_preformation", questionnaire_id: "q1" } as never,
        { id: "e2", evaluation_type: "eval_postformation", questionnaire_id: "q2" } as never,
      ],
      formation_satisfaction_assignments: [
        { id: "s1", questionnaire_id: "q3" } as never,
      ],
      formation_elearning_assignments: [{ id: "el1" } as never],
      enrollments: [{ learner_id: "l1" } as never],
    }), {
      responseCounts: {
        eval_preformation: { total: 1, done: 1 },
        eval_postformation: { total: 1, done: 1 },
        satisfaction: { total: 1, done: 1 },
      },
    });
    expect(score).toBe(100);
  });

  it("le score est toujours entre 0 et 100", () => {
    const s = computeQualiopiScore(makeFormation());
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 3 : Vérifier que les tests échouent**

Run:
```bash
npx vitest run src/lib/__tests__/qualiopi-score.test.ts 2>&1 | tail -10
```
Expected: erreur d'import (lib `qualiopi-score.ts` pas encore créée).

- [ ] **Step 4 : Implémenter la lib**

Créer `src/lib/services/qualiopi-score.ts` :
```ts
/**
 * Calcul du score Qualiopi d'une formation.
 *
 * Source de vérité unique remplaçant la double implémentation (composant inline +
 * fonction "for list views" exportée, fantôme — confirmé non utilisée en runtime
 * le 2026-05-25 par grep).
 *
 * 8 items de base + 2 items sous-traitance si is_subcontracted. Le score est
 * (sum_achieved / count_items) * 100 où achieved = 1 pour les booléens vrais et
 * percent/100 pour les auto_percent.
 *
 * Consumers :
 *  - TabQualiopi.tsx : passe { responseCounts, manualChecks } pour un score exact
 *  - qualiopi-snapshots.ts : idem (après chargement des counts en BDD)
 *  - listes formations : lisent directement sessions.qualiopi_score (colonne BDD
 *    persistée par TabQualiopi). Pas d'appel runtime à cette lib.
 */

import type { Session } from "@/lib/types";

export type QualiopiCategory = "documents" | "evaluations" | "sous_traitance";
export type QualiopiItemType = "auto" | "auto_percent" | "manual";

export interface QualiopiScoreItem {
  id: string;
  label: string;
  category: QualiopiCategory;
  type: QualiopiItemType;
  value: boolean;
  percent?: number;
  subLabel?: string;
}

export interface ComputeOptions {
  /**
   * Counts de réponses par clé : eval_preformation, eval_postformation, satisfaction.
   * Quand absent ou que la clé n'est pas fournie, l'item auto_percent vaut 0%.
   */
  responseCounts?: Record<string, { total: number; done: number }>;
  /** Lu pour les checks manuels (sous-traitance). Sinon false. */
  manualChecks?: Record<string, boolean>;
}

function getPercent(
  key: string,
  responseCounts?: ComputeOptions["responseCounts"],
): number {
  const c = responseCounts?.[key];
  if (!c || c.total === 0) return 0;
  return Math.round((c.done / c.total) * 100);
}

function hasAnySigned(docs: { doc_type: string; is_signed?: boolean }[], docType: string): boolean {
  return docs.some(d => d.doc_type === docType && d.is_signed === true);
}

function allSent(docs: { doc_type: string; is_sent?: boolean }[], docType: string): boolean {
  const typeDocs = docs.filter(d => d.doc_type === docType);
  return typeDocs.length > 0 && typeDocs.every(d => d.is_sent === true);
}

function countByType(
  docs: { doc_type: string; is_sent?: boolean }[],
  docType: string,
): { sent: number; total: number } {
  const typeDocs = docs.filter(d => d.doc_type === docType);
  return {
    sent: typeDocs.filter(d => d.is_sent === true).length,
    total: typeDocs.length,
  };
}

export function buildQualiopiItems(
  formation: Session,
  opts: ComputeOptions = {},
): QualiopiScoreItem[] {
  const docs = (formation.formation_convention_documents || []) as { doc_type: string; is_sent?: boolean; is_signed?: boolean; owner_type?: string }[];
  const evalAssignments = formation.formation_evaluation_assignments || [];
  const satisAssignments = formation.formation_satisfaction_assignments || [];
  const elearningAssignments = formation.formation_elearning_assignments || [];
  const isSubcontracted = formation.is_subcontracted === true;
  const manualChecks = opts.manualChecks || {};
  const responseCounts = opts.responseCounts;

  const convocCounts = countByType(docs, "convocation");
  const certifCounts = countByType(docs, "certificat_realisation");

  const evalPrePercent = getPercent("eval_preformation", responseCounts);
  const evalPostPercent = getPercent("eval_postformation", responseCounts);
  const satisPercent = getPercent("satisfaction", responseCounts);

  const items: QualiopiScoreItem[] = [
    { id: "convention_signed", label: "Convention signée", category: "documents", type: "auto",
      value: hasAnySigned(docs, "convention_entreprise") },
    { id: "convocation_sent", label: "Convocation envoyée", category: "documents", type: "auto",
      value: allSent(docs, "convocation"),
      subLabel: `${convocCounts.sent}/${convocCounts.total}` },
    { id: "convention_intervention_signed", label: "Contrat intervention formateur signé",
      category: "documents", type: "auto",
      value: hasAnySigned(docs, "convention_intervention") },
    { id: "eval_preformation", label: "Questionnaire positionnement rempli",
      category: "evaluations", type: "auto_percent",
      value: evalPrePercent === 100, percent: evalPrePercent },
    { id: "eval_postformation", label: "Questionnaire fin de formation rempli",
      category: "evaluations", type: "auto_percent",
      value: evalPostPercent === 100, percent: evalPostPercent },
    { id: "satisfaction_learner", label: "Questionnaire satisfaction apprenant rempli",
      category: "evaluations", type: "auto_percent",
      value: satisPercent === 100, percent: satisPercent },
    { id: "certificat_sent", label: "Certificat de réalisation envoyé",
      category: "documents", type: "auto",
      value: allSent(docs, "certificat_realisation"),
      subLabel: `${certifCounts.sent}/${certifCounts.total}` },
    { id: "support_cours", label: "Support de cours déposé", category: "documents", type: "auto",
      value: elearningAssignments.length > 0 },
  ];

  if (isSubcontracted) {
    items.push(
      { id: "docs_formation_sent", label: "Documents formation envoyés au formateur",
        category: "sous_traitance", type: "auto",
        value: docs.filter(d => d.owner_type === "trainer" && d.is_sent).length > 0 },
      { id: "docs_post_formation_received", label: "Documents post-formation reçus",
        category: "sous_traitance", type: "manual",
        value: manualChecks["docs_post_formation_received"] === true },
    );
  }

  // évite warning "satisAssignments unused" si jamais — la variable sert au composant
  // qui lit la longueur pour décider si afficher le block. Ici, présence de questionnaire
  // satisfaction implicite via responseCounts.satisfaction.
  void evalAssignments;
  void satisAssignments;

  return items;
}

export function computeQualiopiScore(
  formation: Session,
  opts: ComputeOptions = {},
): number {
  const items = buildQualiopiItems(formation, opts);
  if (items.length === 0) return 0;
  let totalWeight = 0;
  let achieved = 0;
  for (const item of items) {
    totalWeight += 1;
    if (item.type === "auto_percent") achieved += (item.percent || 0) / 100;
    else if (item.value) achieved += 1;
  }
  return Math.round((achieved / totalWeight) * 100);
}
```

- [ ] **Step 5 : Vérifier que les tests passent**

Run:
```bash
npx vitest run src/lib/__tests__/qualiopi-score.test.ts 2>&1 | tail -8
```
Expected: `9 passed` (5 buildQualiopiItems + 4 computeQualiopiScore).

- [ ] **Step 6 : Vérifier l'ensemble de la suite (pas de régression)**

Run:
```bash
npx vitest run 2>&1 | tail -6
```
Expected: 100% passing (peut afficher le compte total — typiquement ≥ 446 tests passants + nos 5 nouveaux pour Tâche 2 + 5-9 nouveaux ici = ≥ 460).

- [ ] **Step 7 : Commit**

```bash
git add src/lib/services/qualiopi-score.ts src/lib/__tests__/qualiopi-score.test.ts
git commit -m "feat(qualiopi): extraire buildQualiopiItems + computeQualiopiScore en lib testable

Avant : logique de score inline dans TabQualiopi (526L, intestable sans monter
React) + fonction computeQualiopiScore exportée mais utilisée nulle part en
runtime (vérifié par grep, seul consumer = tests).

Après : src/lib/services/qualiopi-score.ts source unique. Le composant et le
cron snapshots l'appellent avec { responseCounts, manualChecks } pour un calcul
exact. 9 tests Vitest sur la lib (build + compute + sous-traitance + manualChecks)."
```

---

## Tâche 4 : `loadQualiopiIndicators` entity_id filter + tests

**Files:**
- Modify: `src/lib/services/load-session-aggregates.ts`
- Create: `src/lib/services/__tests__/load-session-aggregates.test.ts`

- [ ] **Step 1 : Identifier les queries à filtrer**

Read: `src/lib/services/load-session-aggregates.ts` autour des lignes 147-261 (`loadQualiopiIndicators`). Noter les queries `enrollments`, `signatures`, `questionnaire_sessions`, `questionnaire_responses`.

- [ ] **Step 2 : Écrire le test (failing)**

Créer `src/lib/services/__tests__/load-session-aggregates.test.ts` :
```ts
import { describe, it, expect, vi } from "vitest";
import { loadQualiopiIndicators } from "@/lib/services/load-session-aggregates";

/**
 * Mock minimaliste de SupabaseClient pour observer les filtres entity_id.
 * On capture chaque appel à .eq() pour vérifier que entity_id est toujours présent.
 */
function makeSupabaseMock() {
  const eqCalls: Array<{ table: string; column: string; value: unknown }> = [];

  function createQuery(table: string) {
    const query: Record<string, unknown> = {};
    const chainable = () => query;
    query.select = vi.fn(chainable);
    query.eq = vi.fn((column: string, value: unknown) => {
      eqCalls.push({ table, column, value });
      return query;
    });
    query.in = vi.fn(chainable);
    query.single = vi.fn(async () => ({
      data: table === "sessions" ? { entity_id: "ENTITY-A" } : null,
      error: null,
    }));
    query.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
    return query;
  }

  return {
    from: vi.fn((table: string) => createQuery(table)),
    eqCalls,
  };
}

describe("loadQualiopiIndicators — défense en profondeur entity_id", () => {
  it("toutes les queries downstream filtrent par entity_id", async () => {
    const mock = makeSupabaseMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await loadQualiopiIndicators(mock as any, "SESS-1");
    const enrollmentsCalls = mock.eqCalls.filter(c => c.table === "enrollments");
    const signaturesCalls = mock.eqCalls.filter(c => c.table === "signatures");
    expect(enrollmentsCalls.some(c => c.column === "entity_id" && c.value === "ENTITY-A")).toBe(true);
    expect(signaturesCalls.some(c => c.column === "entity_id" && c.value === "ENTITY-A")).toBe(true);
  });

  it("retourne des valeurs neutres si la session est introuvable", async () => {
    const mock = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(async () => ({ data: null, error: null })),
      })),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await loadQualiopiIndicators(mock as any, "SESS-UNKNOWN");
    expect(res.totalLearners).toBe(0);
    expect(res.completionRate).toBe(0);
    expect(res.satisfactionRate).toBeNull();
  });
});
```

- [ ] **Step 3 : Vérifier que les tests échouent**

Run:
```bash
npx vitest run src/lib/services/__tests__/load-session-aggregates.test.ts 2>&1 | tail -10
```
Expected: 2 tests failing — les queries `enrollments` et `signatures` n'ont pas de `.eq("entity_id", ...)`.

- [ ] **Step 4 : Refactorer `loadQualiopiIndicators`**

Dans `src/lib/services/load-session-aggregates.ts`, au début de `loadQualiopiIndicators(supabase, sessionId)`, lire l'`entity_id` de la session avant les autres queries :

```ts
export async function loadQualiopiIndicators(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<QualiopiIndicators> {
  // Récupérer l'entity_id de la session une fois pour défense en profondeur.
  // Si session introuvable, retourner des valeurs neutres (cas de session
  // supprimée entre temps).
  const { data: sessionRow } = await supabase
    .from("sessions")
    .select("entity_id")
    .eq("id", sessionId)
    .single();

  if (!sessionRow?.entity_id) {
    return {
      totalLearners: 0,
      signedLearnersCount: 0,
      completionRate: 0,
      satisfactionRate: null,
      satisfactionResponses: 0,
      acquisitionRate: null,
      evaluationCount: 0,
    };
  }
  const entityId = sessionRow.entity_id as string;

  // ... (rest of the function : ajouter .eq("entity_id", entityId) à chaque
  // query enrollments, signatures, questionnaire_sessions, questionnaire_responses)
}
```

Puis ajouter `.eq("entity_id", entityId)` à chaque appel `.from("enrollments")`, `.from("signatures")`, `.from("questionnaire_sessions")`, `.from("questionnaire_responses")` dans le corps de la fonction.

- [ ] **Step 5 : Vérifier que les tests passent**

Run:
```bash
npx vitest run src/lib/services/__tests__/load-session-aggregates.test.ts 2>&1 | tail -6
```
Expected: `2 passed`.

- [ ] **Step 6 : Vérifier l'ensemble**

Run:
```bash
npx vitest run 2>&1 | tail -6
npx tsc --noEmit 2>&1 | head -10
```
Expected: tout passe, TypeScript clean.

- [ ] **Step 7 : Commit**

```bash
git add src/lib/services/load-session-aggregates.ts src/lib/services/__tests__/load-session-aggregates.test.ts
git commit -m "fix(qualiopi): entity_id filter sur loadQualiopiIndicators (défense en profondeur)

Avant : enrollments + signatures + questionnaire_* lus sans filtre entity_id,
violation directe de CLAUDE.md « CHAQUE requête Supabase DOIT filtrer par
entity_id ». Sur un environnement RLS allow_all (constaté en prod), un appel
volontaire ou involontaire avec un sessionId d'une autre entité aurait
calculé les indicateurs cross-entité.

Après : entity_id lu une fois en tête puis propagé à toutes les queries.
Si session introuvable, valeurs neutres (pas de crash). 2 tests."
```

---

## Tâche 5 : Refactor TabQualiopi (persistance + UX + cleanup)

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabQualiopi.tsx`
- Modify: `src/app/(dashboard)/admin/formations/[id]/page.tsx` (suppression du cast + retrait de la prop `onRefresh` dans le call site)

- [ ] **Step 1 : Préparer le composant — imports et signature**

Dans `src/app/(dashboard)/admin/formations/[id]/_components/TabQualiopi.tsx`, modifier les imports en tête :

```ts
"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CheckCircle, XCircle, Loader2, Shield, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import type { Session } from "@/lib/types";
import {
  buildQualiopiItems,
  computeQualiopiScore,
  type QualiopiScoreItem,
} from "@/lib/services/qualiopi-score";
```

Modifier la signature des Props (retrait de `onRefresh`) :
```ts
interface Props {
  formation: Session;
}

export function TabQualiopi({ formation }: Props) {
```

- [ ] **Step 2 : Initialiser les manualChecks depuis la prop (au lieu de notes JSON)**

Remplacer le `useEffect` lignes 47-64 (lecture de `sessions.notes`) par :

```ts
  // Manual checks : lus depuis formation.qualiopi_manual (nouvelle colonne BDD).
  // Plus de lecture/parsing de sessions.notes (champ partagé avec d'autres features).
  const [manualChecks, setManualChecks] = useState<Record<string, boolean>>(
    (formation.qualiopi_manual ?? {}) as Record<string, boolean>,
  );
  const [loading, setLoading] = useState(true);
  const [responseCounts, setResponseCounts] = useState<Record<string, { total: number; done: number }>>({});

  // Audit blanc IA
  const [auditRunning, setAuditRunning] = useState(false);
  const [auditResult, setAuditResult] = useState<{
    overall_verdict: string;
    findings: Array<{ critere: number; status: string; question: string; recommendation: string }>;
    action_plan: Array<{ title: string; priority: string; estimated_effort?: string }>;
  } | null>(null);

  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();
  const abortRef = useRef<AbortController | null>(null);
```

Et au montage simplement :
```ts
  useEffect(() => {
    setLoading(false);
  }, []);
```

(On supprime entièrement le bloc `useEffect` qui lit notes — gardons un setLoading initial.)

- [ ] **Step 3 : Remplacer la construction d'items inline par buildQualiopiItems**

Remplacer le bloc `useMemo<QualiopiItem[]>(() => { ... })` lignes 129-220 (et l'interface `QualiopiItem` ligne 17-25 — déjà importée depuis la lib) par :

```ts
  // Délégation à la lib unique src/lib/services/qualiopi-score.ts
  const items: QualiopiScoreItem[] = useMemo(
    () => buildQualiopiItems(formation, { responseCounts, manualChecks }),
    [formation, responseCounts, manualChecks],
  );

  const score: number = useMemo(
    () => computeQualiopiScore(formation, { responseCounts, manualChecks }),
    [formation, responseCounts, manualChecks],
  );
```

Supprimer l'ancienne interface locale `QualiopiItem` (lignes 17-25) et l'ancienne fonction inline `computeQualiopiScore` exportée tout en bas (lignes 497-526).

Supprimer aussi les helpers locaux qui sont maintenant dans la lib : `hasDoc`, `hasAnySigned`, `hasAnySent`, `allSent`, `getPercent` (lignes 112-126).

- [ ] **Step 4 : Persistance du score robuste (await + error handling, autorise 0)**

Remplacer le `useEffect` lignes 242-245 par :

```ts
  // Persiste qualiopi_score pour les listes formations. Awaited + error handling.
  // 0 est une valeur légitime (formation totalement vide) — on persiste aussi.
  useEffect(() => {
    if (loading) return;
    (async () => {
      const { error } = await supabase
        .from("sessions")
        .update({ qualiopi_score: score })
        .eq("id", formation.id);
      if (error) console.warn("[qualiopi] persist score failed:", error.message);
    })();
  }, [score, loading, formation.id, supabase]);
```

- [ ] **Step 5 : Manual toggle via qualiopi_manual (au lieu de notes JSON)**

Remplacer la fonction `handleManualToggle` lignes 248-271 par :

```ts
  const handleManualToggle = async (itemId: string, checked: boolean) => {
    const newChecks = { ...manualChecks, [itemId]: checked };
    setManualChecks(newChecks);
    const { error } = await supabase
      .from("sessions")
      .update({ qualiopi_manual: newChecks })
      .eq("id", formation.id);
    if (error) {
      // Rollback optimiste : on revient à l'état précédent en cas d'échec.
      setManualChecks(manualChecks);
      toast({
        title: "Échec de la sauvegarde",
        description: error.message,
        variant: "destructive",
      });
    }
  };
```

- [ ] **Step 6 : Bouton « Traiter » via router.replace (au lieu de window.location)**

Remplacer la fonction `goToTab` lignes 317-321 par :

```ts
  const goToTab = (tab: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set("tab", tab);
    router.replace(`${window.location.pathname}?${params.toString()}`);
  };
```

- [ ] **Step 7 : AbortController sur le fetch audit IA**

Dans le bouton « Lancer un audit blanc » (lignes 370-396), modifier le `onClick` :

```tsx
onClick={async () => {
  // Annule un audit en cours si l'utilisateur reclique avant la fin
  abortRef.current?.abort();
  const ctrl = new AbortController();
  abortRef.current = ctrl;

  setAuditRunning(true);
  try {
    const res = await fetch("/api/ai/qualiopi-mock-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "formation", session_id: formation.id }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error("Audit échoué");
    const data = await res.json();
    setAuditResult(data);
    toast({ title: "Audit blanc terminé" });
  } catch (err) {
    if ((err as Error).name === "AbortError") return; // annulation volontaire, pas d'erreur
    toast({ title: "Erreur", description: "Audit IA échoué", variant: "destructive" });
  } finally {
    setAuditRunning(false);
  }
}}
```

Et ajouter un cleanup useEffect (juste après les autres useEffects) :
```ts
  useEffect(() => () => abortRef.current?.abort(), []);
```

- [ ] **Step 8 : Mettre à jour `formations/[id]/page.tsx` pour retirer le cast et la prop `onRefresh`**

Dans `src/app/(dashboard)/admin/formations/[id]/page.tsx` :

Remplacer ligne 139 :
```ts
    qualiopi: (formation as unknown as { qualiopi_score?: number }).qualiopi_score || 0,
```
Par :
```ts
    qualiopi: formation.qualiopi_score ?? 0,
```

Et retirer la prop `onRefresh` du call site (lignes 435-438) :
```tsx
<TabsContent value="qualiopi" className="mt-6">
  <TabQualiopi formation={formation} />
</TabsContent>
```

- [ ] **Step 9 : Vérifier l'ensemble**

Run:
```bash
npx tsc --noEmit 2>&1 | head -10
npx vitest run 2>&1 | tail -6
```
Expected: TypeScript clean, tous les tests verts.

- [ ] **Step 10 : Vérifier qu'il ne reste plus de code mort dans TabQualiopi**

Run:
```bash
grep -n "QualiopiItem\|onRefresh\|computeQualiopiScore\|JSON.parse\|JSON.stringify\|window.location.href" src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabQualiopi.tsx
```
Expected: zéro résultat. (L'interface locale, la prop morte, l'export inline, la sérialisation notes, et le full reload ont tous disparu.)

- [ ] **Step 11 : Commit**

```bash
git add src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabQualiopi.tsx src/app/\(dashboard\)/admin/formations/\[id\]/page.tsx
git commit -m "refactor(qualiopi): TabQualiopi délègue à la lib + persistance robuste + UX

- buildQualiopiItems / computeQualiopiScore depuis @/lib/services/qualiopi-score
- supprime l'interface locale QualiopiItem, les helpers inline, l'export mort
- manualChecks lu depuis formation.qualiopi_manual (au lieu de notes JSON sérialisé)
- update qualiopi_score : await + console.warn, autorise score=0 (légitime)
- update qualiopi_manual : rollback optimiste + toast si échec
- bouton « Traiter » : router.replace (plus de window.location.href)
- fetch audit IA : AbortController + cleanup useEffect (plus de warning unmount)
- retrait de la prop onRefresh inutilisée (du composant ET du call site)
- formations/[id]/page.tsx : suppression du cast as unknown as { qualiopi_score?: number }"
```

---

## Tâche 6 : Batching `fetchResponseCounts` via RPC

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabQualiopi.tsx` (uniquement `fetchResponseCounts`)

- [ ] **Step 1 : Localiser la fonction**

Dans `TabQualiopi.tsx`, repérer le `useCallback fetchResponseCounts` (autour des lignes 67-105 d'origine, maintenant décalées après les refactors précédents).

- [ ] **Step 2 : Remplacer la boucle N+1 par un seul appel RPC**

Remplacer le corps de `fetchResponseCounts` par :

```ts
  const fetchResponseCounts = useCallback(async () => {
    const evalAssignments = formation.formation_evaluation_assignments || [];
    const satisAssignments = formation.formation_satisfaction_assignments || [];
    const enrollmentsCount = (formation.enrollments || []).length || 1;

    const preFormationIds = evalAssignments
      .filter(a => a.evaluation_type === "eval_preformation")
      .map(a => a.questionnaire_id) as string[];
    const postFormationIds = evalAssignments
      .filter(a => a.evaluation_type === "eval_postformation")
      .map(a => a.questionnaire_id) as string[];
    const satisfactionIds = satisAssignments
      .map(a => a.questionnaire_id) as string[];

    const allIds = [...preFormationIds, ...postFormationIds, ...satisfactionIds];
    if (allIds.length === 0) {
      setResponseCounts({});
      return;
    }

    // 1 seul round-trip Supabase via RPC count_responses_by_questionnaire.
    const { data: grouped, error } = await supabase.rpc("count_responses_by_questionnaire", {
      p_session_id: formation.id,
      p_questionnaire_ids: allIds,
    });
    if (error) {
      console.warn("[qualiopi] count_responses_by_questionnaire failed:", error.message);
      setResponseCounts({});
      return;
    }

    const countsByQId = new Map<string, number>(
      (grouped as Array<{ questionnaire_id: string; response_count: number }> | null ?? [])
        .map(r => [r.questionnaire_id, Number(r.response_count)]),
    );

    const sumFor = (ids: string[]) =>
      ids.reduce((s, qid) => s + (countsByQId.get(qid) ?? 0), 0);

    const counts: Record<string, { total: number; done: number }> = {
      eval_preformation: {
        total: preFormationIds.length > 0 ? enrollmentsCount : 0,
        done: Math.min(sumFor(preFormationIds), preFormationIds.length > 0 ? enrollmentsCount : 0),
      },
      eval_postformation: {
        total: postFormationIds.length > 0 ? enrollmentsCount : 0,
        done: Math.min(sumFor(postFormationIds), postFormationIds.length > 0 ? enrollmentsCount : 0),
      },
      satisfaction: {
        total: satisfactionIds.length > 0 ? enrollmentsCount : 0,
        done: Math.min(sumFor(satisfactionIds), satisfactionIds.length > 0 ? enrollmentsCount : 0),
      },
    };

    setResponseCounts(counts);
  }, [
    formation.id,
    formation.formation_evaluation_assignments,
    formation.formation_satisfaction_assignments,
    formation.enrollments,
    supabase,
  ]);
```

- [ ] **Step 3 : Vérifier que tout compile et les tests existants passent**

Run:
```bash
npx tsc --noEmit 2>&1 | head -10
npx vitest run 2>&1 | tail -6
```
Expected: TypeScript clean, tous tests verts.

- [ ] **Step 4 : Commit**

```bash
git add src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabQualiopi.tsx
git commit -m "perf(qualiopi): batching fetchResponseCounts via RPC (N round-trips → 1)

Avant : pour chaque questionnaire assigné (eval pre/post + satisfaction), 1
requête count séquentielle. Pour 5+ questionnaires, ~5 round-trips Supabase à
chaque ouverture du tab.

Après : 1 seul appel rpc('count_responses_by_questionnaire', { session_id,
questionnaire_ids }) qui retourne le GROUP BY côté SQL. La fonction RPC a été
créée dans la migration de la Tâche 1."
```

---

## Tâche 7 : Snapshots — helper + route API + cron Netlify + tests

**Files:**
- Create: `src/lib/services/qualiopi-snapshots.ts`
- Create: `src/lib/services/__tests__/qualiopi-snapshots.test.ts`
- Create: `src/app/api/qualiopi/snapshots/route.ts`
- Create: `netlify/functions/process-qualiopi-snapshots.mts`

- [ ] **Step 1 : Écrire le test (failing) pour le helper**

Créer `src/lib/services/__tests__/qualiopi-snapshots.test.ts` :

```ts
import { describe, it, expect, vi } from "vitest";
import { snapshotEntityQualiopi } from "@/lib/services/qualiopi-snapshots";

/**
 * Mock builder qui rejoue des résultats par table.
 * On configure : sessions actives + dernier snapshot par session_id + comptages eval.
 */
function makeMock(opts: {
  sessions: Array<{ id: string; entity_id: string }>;
  lastSnapshotByCSession: Record<string, number | null>;
  computeScore: (sessionId: string) => number;
  inserted: { session_id: string; global_score: number }[];
}) {
  const supabase = {
    from: vi.fn((table: string) => {
      const builder: Record<string, unknown> = {};
      const chainable = () => builder;
      builder.select = vi.fn(chainable);
      builder.eq = vi.fn(chainable);
      builder.or = vi.fn(chainable);
      builder.order = vi.fn(chainable);
      builder.limit = vi.fn(chainable);

      if (table === "sessions") {
        builder.then = (resolve: (v: unknown) => void) =>
          resolve({ data: opts.sessions, error: null });
      } else if (table === "qualiopi_snapshots") {
        builder.maybeSingle = vi.fn(async () => ({
          data: null, // sera réécrit dans single()
          error: null,
        }));
        builder.single = vi.fn(async function (this: { _ctx: string }) {
          // Le contexte est encodé via .eq() précédent — on simule via opts
          return { data: null, error: null };
        });
        builder.insert = vi.fn(async (row: { session_id: string; global_score: number }) => {
          opts.inserted.push({ session_id: row.session_id, global_score: row.global_score });
          return { data: null, error: null };
        });
      }
      return builder;
    }),
  };
  return supabase;
}

describe("snapshotEntityQualiopi", () => {
  it("entité sans sessions actives → 0 inserted, 0 skipped", async () => {
    const inserted: { session_id: string; global_score: number }[] = [];
    const supabase = makeMock({
      sessions: [],
      lastSnapshotByCSession: {},
      computeScore: () => 0,
      inserted,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await snapshotEntityQualiopi(supabase as any, "ENT-1");
    expect(res.inserted).toBe(0);
    expect(res.skipped).toBe(0);
  });

  it("retourne un objet de la forme { inserted, skipped, errors }", async () => {
    const supabase = makeMock({
      sessions: [],
      lastSnapshotByCSession: {},
      computeScore: () => 0,
      inserted: [],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await snapshotEntityQualiopi(supabase as any, "ENT-X");
    expect(res).toHaveProperty("inserted");
    expect(res).toHaveProperty("skipped");
    expect(res).toHaveProperty("errors");
  });
});
```

(NB : ces tests sont minimalistes vu la complexité du mock Supabase pour les snapshots. Ils couvrent la forme du contrat + le cas trivial 0 sessions. Les tests d'intégration plus complets sur "snapshot si changé" seront ajoutés en bout de tâche après implémentation.)

- [ ] **Step 2 : Vérifier que les tests échouent (lib pas créée)**

Run:
```bash
npx vitest run src/lib/services/__tests__/qualiopi-snapshots.test.ts 2>&1 | tail -10
```
Expected: erreur d'import.

- [ ] **Step 3 : Implémenter le helper**

Créer `src/lib/services/qualiopi-snapshots.ts` :

```ts
/**
 * Snapshots Qualiopi : pour chaque session active d'une entité, recalcule le
 * score actuel et insère un row dans qualiopi_snapshots SI le score diffère
 * du dernier snapshot connu. Évite l'inflation de la table par redondance.
 *
 * Source unique du calcul : @/lib/services/qualiopi-score
 * Appelé par : /api/qualiopi/snapshots (POST) déclenché par le cron Netlify.
 *
 * Définition « session active » :
 *   end_date   >= NOW() - INTERVAL '6 months'
 *   OR start_date <= NOW() + INTERVAL '12 months'
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeQualiopiScore } from "@/lib/services/qualiopi-score";
import type { Session } from "@/lib/types";

export interface SnapshotResult {
  inserted: number;
  skipped: number;
  errors: number;
}

const ACTIVE_END_DATE_FLOOR_MS = 6 * 30 * 24 * 3600 * 1000; // ~6 mois
const ACTIVE_START_DATE_CEIL_MS = 12 * 30 * 24 * 3600 * 1000; // ~12 mois

export async function snapshotEntityQualiopi(
  supabase: SupabaseClient,
  entityId: string,
): Promise<SnapshotResult> {
  const result: SnapshotResult = { inserted: 0, skipped: 0, errors: 0 };

  const now = Date.now();
  const endFloor = new Date(now - ACTIVE_END_DATE_FLOOR_MS).toISOString().slice(0, 10);
  const startCeil = new Date(now + ACTIVE_START_DATE_CEIL_MS).toISOString().slice(0, 10);

  // 1. Lister les sessions actives de l'entité (avec leurs relations utiles pour le score)
  const { data: sessions, error: sessionsErr } = await supabase
    .from("sessions")
    .select(`
      id, entity_id, is_subcontracted, start_date, end_date,
      formation_evaluation_assignments(evaluation_type, questionnaire_id),
      formation_satisfaction_assignments(questionnaire_id),
      formation_elearning_assignments(id),
      enrollments(learner_id),
      qualiopi_manual
    `)
    .eq("entity_id", entityId)
    .or(`end_date.gte.${endFloor},start_date.lte.${startCeil}`);

  if (sessionsErr || !sessions) {
    console.warn(`[qualiopi-snapshots] sessions fetch failed for ${entityId}:`, sessionsErr?.message);
    result.errors += 1;
    return result;
  }

  for (const session of sessions as Array<Session & { id: string; entity_id: string }>) {
    try {
      // 2. Charger les documents (via table unifiée `documents`)
      const { data: documentsRows } = await supabase
        .from("documents")
        .select("doc_type, status, owner_type")
        .eq("entity_id", entityId)
        .eq("source_table", "sessions")
        .eq("source_id", session.id);

      // Adapter shape pour la lib qualiopi-score (qui s'attend à is_signed/is_sent).
      // On délègue à mapStatusToFlags pour rester DRY.
      const { mapStatusToFlags } = await import("@/lib/utils/document-status");
      const docs = (documentsRows ?? []).map(d => {
        const flags = mapStatusToFlags(d.status as string);
        return { doc_type: d.doc_type, owner_type: d.owner_type, ...flags };
      });

      // 3. Charger les responseCounts agrégés via la RPC créée en Tâche 1
      const evalAssignments = (session.formation_evaluation_assignments ?? []) as Array<{ evaluation_type: string; questionnaire_id: string }>;
      const satisAssignments = (session.formation_satisfaction_assignments ?? []) as Array<{ questionnaire_id: string }>;
      const enrollmentsCount = ((session.enrollments ?? []) as Array<{ learner_id: string }>).length || 1;

      const preIds = evalAssignments.filter(a => a.evaluation_type === "eval_preformation").map(a => a.questionnaire_id);
      const postIds = evalAssignments.filter(a => a.evaluation_type === "eval_postformation").map(a => a.questionnaire_id);
      const satisIds = satisAssignments.map(a => a.questionnaire_id);
      const allIds = [...preIds, ...postIds, ...satisIds];

      let responseCounts: Record<string, { total: number; done: number }> = {};
      if (allIds.length > 0) {
        const { data: counts } = await supabase.rpc("count_responses_by_questionnaire", {
          p_session_id: session.id,
          p_questionnaire_ids: allIds,
        });
        const m = new Map<string, number>(
          (counts as Array<{ questionnaire_id: string; response_count: number }> | null ?? [])
            .map(r => [r.questionnaire_id, Number(r.response_count)]),
        );
        const sumFor = (ids: string[]) => ids.reduce((s, q) => s + (m.get(q) ?? 0), 0);
        responseCounts = {
          eval_preformation: { total: preIds.length > 0 ? enrollmentsCount : 0, done: Math.min(sumFor(preIds), preIds.length > 0 ? enrollmentsCount : 0) },
          eval_postformation: { total: postIds.length > 0 ? enrollmentsCount : 0, done: Math.min(sumFor(postIds), postIds.length > 0 ? enrollmentsCount : 0) },
          satisfaction: { total: satisIds.length > 0 ? enrollmentsCount : 0, done: Math.min(sumFor(satisIds), satisIds.length > 0 ? enrollmentsCount : 0) },
        };
      }

      // 4. Score actuel via la lib unifiée
      const sessionForScore = { ...session, formation_convention_documents: docs } as unknown as Session;
      const manualChecks = (session.qualiopi_manual ?? {}) as Record<string, boolean>;
      const score = computeQualiopiScore(sessionForScore, { responseCounts, manualChecks });

      // 5. Lire le dernier snapshot pour cette session
      const { data: lastSnap } = await supabase
        .from("qualiopi_snapshots")
        .select("global_score")
        .eq("session_id", session.id)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastSnap && lastSnap.global_score === score) {
        result.skipped += 1;
        continue;
      }

      // 6. Insert le nouveau snapshot
      const { error: insertErr } = await supabase.from("qualiopi_snapshots").insert({
        session_id: session.id,
        entity_id: entityId,
        global_score: score,
        items: {},  // détail laissé vide pour l'instant — peut être enrichi plus tard
      });
      if (insertErr) {
        console.warn(`[qualiopi-snapshots] insert failed for ${session.id}:`, insertErr.message);
        result.errors += 1;
      } else {
        result.inserted += 1;
      }
    } catch (err) {
      console.error(`[qualiopi-snapshots] error on session ${session.id}:`, err instanceof Error ? err.message : err);
      result.errors += 1;
    }
  }

  return result;
}
```

- [ ] **Step 4 : Vérifier les tests passent**

Run:
```bash
npx vitest run src/lib/services/__tests__/qualiopi-snapshots.test.ts 2>&1 | tail -6
```
Expected: 2 passed (les tests sont volontairement minimalistes vu la complexité du mock Supabase, on couvre l'API contract).

- [ ] **Step 5 : Créer la route API**

Créer `src/app/api/qualiopi/snapshots/route.ts` :

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { snapshotEntityQualiopi } from "@/lib/services/qualiopi-snapshots";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * POST — invoqué par la Netlify Scheduled Function (cron quotidien 3h UTC).
 * Auth : Bearer CRON_SECRET. Itère sur les entités, snapshot par entité.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.CRON_SECRET;
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  try {
    const { data: entities } = await supabase.from("entities").select("id, name");
    let totalInserted = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    const perEntity: Array<{ entity: string; inserted: number; skipped: number; errors: number }> = [];

    for (const entity of entities ?? []) {
      const res = await snapshotEntityQualiopi(supabase, entity.id);
      totalInserted += res.inserted;
      totalSkipped += res.skipped;
      totalErrors += res.errors;
      perEntity.push({ entity: entity.name, ...res });
    }

    return NextResponse.json({
      success: true,
      totalInserted,
      totalSkipped,
      totalErrors,
      perEntity,
      executedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[qualiopi-snapshots POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET — utilisé par QualiopiSparkline et QualiopiHistoryDetail côté front.
 * Query param `session_id`. Filtré par entity_id du caller en défense en profondeur.
 */
const GetQuery = z.object({
  session_id: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  const auth = await requireRole(["admin", "super_admin", "trainer"]);
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const parsed = GetQuery.safeParse({ session_id: url.searchParams.get("session_id") });
  if (!parsed.success) {
    return NextResponse.json({ error: "session_id requis" }, { status: 400 });
  }

  const entityId = auth.profile.entity_id;
  const { data, error } = await auth.supabase
    .from("qualiopi_snapshots")
    .select("snapshot_date, global_score, created_at")
    .eq("session_id", parsed.data.session_id)
    .eq("entity_id", entityId)
    .order("snapshot_date", { ascending: false })
    .limit(90);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ snapshots: data ?? [] });
}
```

- [ ] **Step 6 : Créer la Netlify Scheduled Function**

Créer `netlify/functions/process-qualiopi-snapshots.mts` :

```ts
import type { Config } from "@netlify/functions";

export default async () => {
  const baseUrl = process.env.URL || "http://localhost:3000";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[cron] CRON_SECRET not configured");
    return new Response("CRON_SECRET not configured", { status: 500 });
  }

  try {
    const res = await fetch(`${baseUrl}/api/qualiopi/snapshots`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const data = await res.json();
    console.log("[cron] qualiopi-snapshots result:", JSON.stringify(data));
    return new Response(JSON.stringify(data), { status: res.status });
  } catch (err) {
    console.error("[cron] qualiopi-snapshots failed:", err);
    return new Response("Failed", { status: 500 });
  }
};

// 3h UTC quotidien — hors heures de pointe, après que la queue d'emails du jour
// précédent ait fini de tourner (les workers email tournent toutes les 5 min).
export const config: Config = {
  schedule: "0 3 * * *",
};
```

- [ ] **Step 7 : Vérifier l'ensemble**

Run:
```bash
npx tsc --noEmit 2>&1 | head -10
npx vitest run 2>&1 | tail -6
```
Expected: clean.

- [ ] **Step 8 : Commit**

```bash
git add src/lib/services/qualiopi-snapshots.ts src/lib/services/__tests__/qualiopi-snapshots.test.ts src/app/api/qualiopi/snapshots/route.ts netlify/functions/process-qualiopi-snapshots.mts
git commit -m "feat(qualiopi): snapshots cron quotidien + API + worker

- src/lib/services/qualiopi-snapshots.ts : snapshotEntityQualiopi(supabase, entityId)
  qui itère sur les sessions actives (end_date ≥ -6mois OU start_date ≤ +12mois),
  recalcule le score via @/lib/services/qualiopi-score, et insert dans
  qualiopi_snapshots UNIQUEMENT si le score a changé depuis le dernier snapshot.
- src/app/api/qualiopi/snapshots/route.ts : POST (cron, Bearer CRON_SECRET) +
  GET (session_id, requireRole, filtré par entity_id du caller).
- netlify/functions/process-qualiopi-snapshots.mts : Scheduled Function quotidienne
  à 3h UTC qui ping la route POST.
- Tests minimaux sur le helper (forme du contrat + cas trivial 0 sessions)."
```

---

## Tâche 8 : `QualiopiSparkline` + `QualiopiHistoryDetail`

**Files:**
- Create: `src/app/(dashboard)/admin/formations/[id]/_components/QualiopiSparkline.tsx`
- Create: `src/app/(dashboard)/admin/formations/[id]/_components/QualiopiHistoryDetail.tsx`
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabQualiopi.tsx` (intégration)

- [ ] **Step 1 : Implémenter QualiopiSparkline**

Créer `src/app/(dashboard)/admin/formations/[id]/_components/QualiopiSparkline.tsx` :

```tsx
"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";

interface Snapshot {
  snapshot_date: string;
  global_score: number;
}

interface Props {
  sessionId: string;
}

export function QualiopiSparkline({ sessionId }: Props) {
  const [points, setPoints] = useState<Snapshot[]>([]);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/qualiopi/snapshots?session_id=${sessionId}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const data = await res.json();
        // Inverse l'ordre pour l'affichage chronologique (gauche → droite).
        const snaps = (data.snapshots ?? []).slice(0, 30).reverse() as Snapshot[];
        setPoints(snaps);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
    })();
    return () => ctrl.abort();
  }, [sessionId]);

  if (points.length < 2) {
    // Sparkline non significative en dessous de 2 points
    return null;
  }

  return (
    <div style={{ width: 80, height: 24 }} aria-label="Évolution du score Qualiopi sur 30 jours">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <YAxis domain={[0, 100]} hide />
          <Line
            type="monotone"
            dataKey="global_score"
            stroke="#374151"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2 : Implémenter QualiopiHistoryDetail (Sheet)**

Créer `src/app/(dashboard)/admin/formations/[id]/_components/QualiopiHistoryDetail.tsx` :

```tsx
"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

interface Snapshot {
  snapshot_date: string;
  global_score: number;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  formationTitle: string;
  currentScore: number;
}

export function QualiopiHistoryDetail({ open, onOpenChange, sessionId, formationTitle, currentScore }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/qualiopi/snapshots?session_id=${sessionId}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const data = await res.json();
        setSnapshots(data.snapshots ?? []);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      } finally {
        setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [open, sessionId]);

  // Inversé pour l'axe X chronologique
  const chartData = [...snapshots].reverse();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Historique du score Qualiopi</SheetTitle>
          <SheetDescription>
            {formationTitle} — score actuel : <strong>{currentScore}%</strong>
          </SheetDescription>
        </SheetHeader>

        {loading && <p className="text-sm text-muted-foreground py-4">Chargement…</p>}

        {!loading && snapshots.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <p>Aucun snapshot disponible pour le moment.</p>
            <p className="mt-2">Le premier snapshot sera créé demain à 3h UTC par le cron quotidien.</p>
          </div>
        )}

        {!loading && snapshots.length > 0 && (
          <>
            <div className="h-64 mt-6">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="snapshot_date" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(value: number) => [`${value}%`, "Score"]}
                    labelStyle={{ color: "#374151" }}
                  />
                  <Line type="monotone" dataKey="global_score" stroke="#2563EB" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-6">
              <h4 className="text-sm font-semibold mb-2">Détail des snapshots</h4>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2">Date</th>
                      <th className="text-right px-3 py-2">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {snapshots.slice(0, 30).map((s, i) => (
                      <tr key={`${s.snapshot_date}-${i}`}>
                        <td className="px-3 py-2">{s.snapshot_date}</td>
                        <td className="px-3 py-2 text-right font-medium">{s.global_score}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 3 : Intégrer dans TabQualiopi**

Dans `src/app/(dashboard)/admin/formations/[id]/_components/TabQualiopi.tsx`, ajouter les imports :

```ts
import { QualiopiSparkline } from "./QualiopiSparkline";
import { QualiopiHistoryDetail } from "./QualiopiHistoryDetail";
```

Ajouter un state pour le Sheet :
```ts
const [historyOpen, setHistoryOpen] = useState(false);
```

Modifier le bloc « Score global » en ajoutant la sparkline et un bouton qui ouvre le Sheet :

```tsx
{/* Score global */}
<div className="flex items-center justify-between">
  <div className="flex items-center gap-3">
    <Shield className="h-5 w-5 text-muted-foreground" />
    <div>
      <h3 className="text-sm font-semibold">Conformité Qualiopi</h3>
      <p className="text-xs text-muted-foreground">{items.filter(i => i.value).length}/{items.length} critères validés</p>
    </div>
  </div>
  <div className="flex items-center gap-3">
    <QualiopiSparkline sessionId={formation.id} />
    <button
      onClick={() => setHistoryOpen(true)}
      className="text-[11px] text-blue-600 hover:underline"
    >
      Voir l&apos;historique
    </button>
    <Badge className={`text-lg font-bold px-4 py-1.5 ${scoreColor}`}>{score}%</Badge>
  </div>
</div>

{/* ... reste inchangé ... */}

{/* Tout en bas du composant, avant </div> de fin : */}
<QualiopiHistoryDetail
  open={historyOpen}
  onOpenChange={setHistoryOpen}
  sessionId={formation.id}
  formationTitle={formation.title ?? "Formation"}
  currentScore={score}
/>
```

- [ ] **Step 4 : Vérifier que tout compile**

Run:
```bash
npx tsc --noEmit 2>&1 | head -15
```
Expected: clean. Note : si shadcn `Sheet` n'est pas encore présent, l'erreur indiquera l'import manquant. Dans ce cas, vérifier `src/components/ui/sheet.tsx`.

- [ ] **Step 5 : Vérifier que shadcn Sheet existe**

Run:
```bash
ls src/components/ui/sheet.tsx
```
Expected: file exists. Si non, faire `npx shadcn-ui@latest add sheet` (auquel cas un step supplémentaire est nécessaire avant ce commit).

- [ ] **Step 6 : Run all tests pour s'assurer rien ne casse**

Run:
```bash
npx vitest run 2>&1 | tail -6
```
Expected: tout passe.

- [ ] **Step 7 : Commit**

```bash
git add src/app/\(dashboard\)/admin/formations/\[id\]/_components/QualiopiSparkline.tsx src/app/\(dashboard\)/admin/formations/\[id\]/_components/QualiopiHistoryDetail.tsx src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabQualiopi.tsx
git commit -m "feat(qualiopi): sparkline + Sheet historique des scores

- QualiopiSparkline (80x24px, recharts LineChart hideAxis) : mini-graphique
  fetché depuis GET /api/qualiopi/snapshots, rendu inline à côté du badge score.
  Disparait si < 2 points.
- QualiopiHistoryDetail (Sheet shadcn) : panneau latéral droit avec graphique
  linéaire complet + tableau des 30 derniers snapshots. Empty state si aucun
  snapshot (premier sera créé demain à 3h UTC).
- TabQualiopi : intègre les deux + state historyOpen + bouton « Voir l'historique »."
```

---

## Tâche 9 : `QualiopiAuditDetail` (Sheet audit complet)

**Files:**
- Create: `src/app/(dashboard)/admin/formations/[id]/_components/QualiopiAuditDetail.tsx`
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabQualiopi.tsx` (intégration + retrait du `slice(0, 3)`)

- [ ] **Step 1 : Implémenter QualiopiAuditDetail**

Créer `src/app/(dashboard)/admin/formations/[id]/_components/QualiopiAuditDetail.tsx` :

```tsx
"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, XCircle } from "lucide-react";

export interface AuditFinding {
  critere: number;
  status: string;
  question: string;
  recommendation: string;
}

export interface AuditAction {
  title: string;
  priority: string;
  estimated_effort?: string;
}

export interface AuditResult {
  overall_verdict: string;
  findings: AuditFinding[];
  action_plan: AuditAction[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: AuditResult | null;
}

function verdictBadgeClass(verdict: string): string {
  if (verdict === "conforme") return "bg-green-500";
  if (verdict === "ecarts_majeurs") return "bg-red-500";
  return "bg-amber-500";
}

function verdictLabel(verdict: string): string {
  if (verdict === "conforme") return "Conforme";
  if (verdict === "ecarts_majeurs") return "Écarts majeurs";
  if (verdict === "ecarts_mineurs") return "Écarts mineurs";
  return "À améliorer";
}

function findingIcon(status: string) {
  if (status === "conforme") return <CheckCircle className="h-4 w-4 text-green-600" />;
  if (status === "ecart_majeur") return <XCircle className="h-4 w-4 text-red-600" />;
  return <AlertCircle className="h-4 w-4 text-amber-600" />;
}

function priorityClass(priority: string): string {
  if (priority === "urgent") return "bg-red-50 text-red-700";
  if (priority === "high") return "bg-orange-50 text-orange-700";
  return "bg-blue-50 text-blue-700";
}

export function QualiopiAuditDetail({ open, onOpenChange, result }: Props) {
  if (!result) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Audit blanc IA</SheetTitle>
          </SheetHeader>
          <p className="text-sm text-muted-foreground mt-4">Aucun audit chargé.</p>
        </SheetContent>
      </Sheet>
    );
  }

  // Groupe les findings par critère (1-7)
  const byCritere = new Map<number, AuditFinding[]>();
  for (const f of result.findings) {
    if (!byCritere.has(f.critere)) byCritere.set(f.critere, []);
    byCritere.get(f.critere)!.push(f);
  }
  const sortedCriteres = [...byCritere.keys()].sort((a, b) => a - b);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Audit blanc IA — détail
            <Badge className={verdictBadgeClass(result.overall_verdict)}>
              {verdictLabel(result.overall_verdict)}
            </Badge>
          </SheetTitle>
          <SheetDescription>
            {result.findings.length} constat(s) · {result.action_plan.length} action(s) recommandée(s)
          </SheetDescription>
        </SheetHeader>

        {/* Findings groupés par critère */}
        <div className="mt-6 space-y-5">
          {sortedCriteres.map(critere => (
            <div key={critere} className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-muted/30 text-sm font-semibold">
                Critère {critere}
              </div>
              <div className="divide-y">
                {byCritere.get(critere)!.map((f, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      {findingIcon(f.status)}
                      <div className="flex-1">
                        <p className="text-sm font-medium">{f.question}</p>
                        {f.recommendation && (
                          <p className="text-xs text-muted-foreground mt-1">💡 {f.recommendation}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Plan d'action */}
        {result.action_plan.length > 0 && (
          <div className="mt-8">
            <h4 className="text-sm font-semibold mb-3">Plan d&apos;action recommandé</h4>
            <div className="space-y-2">
              {result.action_plan.map((a, i) => (
                <div key={i} className="border rounded-lg px-4 py-3 flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{a.title}</p>
                    {a.estimated_effort && (
                      <p className="text-xs text-muted-foreground mt-0.5">Effort estimé : {a.estimated_effort}</p>
                    )}
                  </div>
                  <Badge variant="outline" className={`text-xs border-0 ${priorityClass(a.priority)}`}>
                    {a.priority}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2 : Intégrer dans TabQualiopi**

Dans `TabQualiopi.tsx`, ajouter l'import :
```ts
import { QualiopiAuditDetail, type AuditResult } from "./QualiopiAuditDetail";
```

Changer le type de `auditResult` pour utiliser `AuditResult` :
```ts
const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
```

(Supprimer la définition inline du type, qui était lignes 36-37 d'origine.)

Ajouter un state pour le Sheet :
```ts
const [auditOpen, setAuditOpen] = useState(false);
```

Dans le card d'audit IA (en bas du résumé `auditResult &&`), remplacer le `slice(0, 3)` par un résumé compact + bouton « Voir l'audit détaillé » :

```tsx
{auditResult && (
  <div className="bg-white/10 rounded-lg p-4 space-y-3">
    <div className="flex items-center gap-2 flex-wrap">
      <Badge className={auditResult.overall_verdict === "conforme" ? "bg-green-500" : auditResult.overall_verdict === "ecarts_majeurs" ? "bg-red-500" : "bg-amber-500"}>
        {auditResult.overall_verdict === "conforme" ? "Conforme" : auditResult.overall_verdict === "ecarts_majeurs" ? "Écarts majeurs" : "À améliorer"}
      </Badge>
      <span className="text-xs text-white/60">
        {auditResult.findings.filter(f => f.status !== "conforme").length} point(s) d&apos;attention sur {auditResult.findings.length} constat(s)
      </span>
      <button
        onClick={() => setAuditOpen(true)}
        className="ml-auto text-xs text-white/90 hover:text-white underline underline-offset-2"
      >
        Voir l&apos;audit détaillé →
      </button>
    </div>
    {auditResult.action_plan.length > 0 && (
      <p className="text-xs text-white/60">{auditResult.action_plan.length} action(s) recommandée(s)</p>
    )}
  </div>
)}
```

(Note : le `slice(0, 3)` et la boucle d'affichage des findings sont **supprimés** du card — c'est désormais le rôle du Sheet.)

Et ajouter le composant Sheet en bas du JSX (à côté du `QualiopiHistoryDetail`) :
```tsx
<QualiopiAuditDetail
  open={auditOpen}
  onOpenChange={setAuditOpen}
  result={auditResult}
/>
```

- [ ] **Step 3 : Vérifier**

Run:
```bash
npx tsc --noEmit 2>&1 | head -10
npx vitest run 2>&1 | tail -6
```
Expected: clean, tests verts.

- [ ] **Step 4 : Commit**

```bash
git add src/app/\(dashboard\)/admin/formations/\[id\]/_components/QualiopiAuditDetail.tsx src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabQualiopi.tsx
git commit -m "feat(qualiopi): Sheet « audit détaillé » + retrait du slice(0,3)

Avant : seuls les 3 premières non-conformités étaient affichées, le reste
(findings + plan d'action complet) restait dans qualiopi_mock_audits sans
exposition à l'utilisateur.

Après : le card du tab garde un résumé compact (verdict + compteurs + bouton).
Le Sheet QualiopiAuditDetail affiche tous les findings groupés par critère
(1-7) + plan d'action complet avec priority badges."
```

---

## Tâche 10 : Zod sur `qualiopi-mock-audit` + utilise `mapStatusToFlags`

**Files:**
- Modify: `src/app/api/ai/qualiopi-mock-audit/route.ts`

- [ ] **Step 1 : Refactorer la route**

Remplacer le début de `src/app/api/ai/qualiopi-mock-audit/route.ts` (imports + handler) :

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { claudeChat } from "@/lib/ai/claude-client";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { mapStatusToFlags } from "@/lib/utils/document-status";

const SYSTEM = `Tu es un auditeur Qualiopi certifié COFRAC. Tu simules un audit blanc sur un organisme de formation français. Tu connais les 7 critères, 32 indicateurs, le guide de lecture V9. Réponds TOUJOURS en JSON strict, SANS markdown.`;

const Body = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("formation"), session_id: z.string().uuid() }),
  z.object({ mode: z.literal("global") }),
]);

export async function POST(req: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const { allowed, resetAt } = checkRateLimit(`qualiopi-audit-${auth.user.id}`, { limit: 10, windowSeconds: 3600 });
  if (!allowed) return rateLimitResponse(resetAt);

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: "Requête invalide", details: (err as Error).message }, { status: 400 });
  }

  try {
    if (body.mode === "formation") {
      const session_id = body.session_id;
```

(Le reste du bloc `formation` reste identique mais utilise `mapStatusToFlags` au lieu du mapping inline.)

Pour le mapping inline (lignes 35-40 d'origine), remplacer :
```ts
      const docs = (documentsRows ?? []).map((d) => ({
        doc_type: d.doc_type,
        is_confirmed: d.status !== "draft",
        is_signed: d.status === "signed",
        is_sent: d.status === "sent" || d.status === "signed",
      }));
```
Par :
```ts
      const docs = (documentsRows ?? []).map((d) => ({
        doc_type: d.doc_type,
        ...mapStatusToFlags(d.status as string),
      }));
```

Et passer la condition `if (mode === "formation" && session_id)` à juste `if (body.mode === "formation")` puisque Zod a déjà validé `session_id`.

De même, pour le bloc `if (mode === "global")`, devient `if (body.mode === "global")`.

À la fin, le `return NextResponse.json({ error: "Mode invalide..."}, { status: 400 })` est désormais inatteignable (Zod élimine les modes invalides) — on peut le supprimer ou le garder en sécurité (return inatteignable).

- [ ] **Step 2 : Vérifier compilation + tests**

Run:
```bash
npx tsc --noEmit 2>&1 | head -10
npx vitest run 2>&1 | tail -6
```
Expected: clean.

- [ ] **Step 3 : Test manuel (smoke test)**

Run en local (si serveur dev tourne) :
```bash
curl -X POST http://localhost:3000/api/ai/qualiopi-mock-audit \
  -H "Content-Type: application/json" \
  -H "Cookie: <session cookie if any>" \
  -d '{"mode":"formation"}'
```
Expected: 400 "Requête invalide" (session_id manquant). Sans serveur, on saute ce step.

- [ ] **Step 4 : Commit**

```bash
git add src/app/api/ai/qualiopi-mock-audit/route.ts
git commit -m "fix(qualiopi-audit): validation Zod du body + utilise mapStatusToFlags

- z.discriminatedUnion('mode', ...) garantit que le body est { mode: 'formation',
  session_id: UUID } ou { mode: 'global' }. Plus de fallback silencieux ni de
  parseInt sur du texte vide.
- Mapping status → flags via @/lib/utils/document-status (mutualisé avec
  documents-store, plus de duplication)."
```

- [ ] **Step 5 : Migrer aussi `documents-store.ts` vers `mapStatusToFlags`**

Dans `src/lib/services/documents-store.ts`, repérer la fonction `getDocsForSession` et le mapping inline `is_signed/is_sent/is_confirmed`. Remplacer par un appel à `mapStatusToFlags`. (Le pattern inline ressemble à ce qui était dans la route qualiopi-mock-audit avant ce commit.)

Run:
```bash
grep -n "is_signed.*signed\|is_sent.*sent" src/lib/services/documents-store.ts
```
Pour localiser le mapping. Puis le remplacer par :
```ts
import { mapStatusToFlags } from "@/lib/utils/document-status";
// ...
const flags = mapStatusToFlags(row.status);
return { ...row, ...flags };
```

- [ ] **Step 6 : Vérifier + commit**

Run:
```bash
npx tsc --noEmit 2>&1 | head -10
npx vitest run 2>&1 | tail -6
```
Puis :
```bash
git add src/lib/services/documents-store.ts
git commit -m "refactor(documents-store): getDocsForSession utilise mapStatusToFlags

Élimine la dernière duplication du mapping status → flags. Désormais source
unique : @/lib/utils/document-status."
```

---

## Tâche 11 : Cleanup `qualiopi-check-proof`

**Files:**
- Delete: `src/app/api/ai/qualiopi-check-proof/route.ts`
- Modify: `e2e/qualiopi-ia.spec.ts` (retrait du test qui ciblait cette route)

- [ ] **Step 1 : Vérifier que la table ne contient pas de données en prod**

Communiquer à l'utilisateur la requête à exécuter dans Supabase Dashboard prod :
```sql
SELECT count(*) FROM qualiopi_proof_checks;
```
Expected: 0. Si > 0, escalader (à voir avec l'utilisateur ce qu'il veut faire des données).

⚠ **Ne pas continuer la tâche tant que ce check n'est pas validé par l'utilisateur** ou que l'on a explicitement décidé d'accepter la perte de données.

- [ ] **Step 2 : Supprimer le fichier de route**

Run:
```bash
rm src/app/api/ai/qualiopi-check-proof/route.ts
```

- [ ] **Step 3 : Localiser le test e2e à retirer**

Run:
```bash
grep -n "qualiopi-check-proof" e2e/qualiopi-ia.spec.ts
```
Noter les lignes (probable un `test('...check-proof protégée', ...)`).

- [ ] **Step 4 : Retirer la section du test e2e**

Dans `e2e/qualiopi-ia.spec.ts`, supprimer le bloc `test(...)` qui teste `/api/ai/qualiopi-check-proof` (uniquement ce bloc, garder les autres tests Qualiopi).

- [ ] **Step 5 : Décommenter le DROP TABLE dans la migration**

Dans `supabase/migrations/qualiopi_solidification.sql`, après confirmation du Step 1 (COUNT = 0), décommenter les lignes :
```sql
DROP TABLE IF EXISTS qualiopi_proof_checks;
```

- [ ] **Step 6 : Vérifier que rien d'autre ne référence la route ou la table**

Run:
```bash
grep -rn "qualiopi_proof_checks\|qualiopi-check-proof" src/ e2e/ netlify/ supabase/ 2>/dev/null
```
Expected: uniquement la migration SQL (le DROP) — aucune autre référence runtime.

- [ ] **Step 7 : Vérifier compilation + tests**

Run:
```bash
npx tsc --noEmit 2>&1 | head -10
npx vitest run 2>&1 | tail -6
```
Expected: clean.

- [ ] **Step 8 : Commit**

```bash
git add -A   # delete + modify
git commit -m "chore(qualiopi): drop qualiopi-check-proof orpheline

- src/app/api/ai/qualiopi-check-proof/route.ts : supprimé. Route complète et
  testée mais aucun consumer UI (vérifié par grep). Identifié comme M6 dans le
  deep-dive.
- e2e/qualiopi-ia.spec.ts : retrait du test qui ciblait cette route.
- supabase/migrations/qualiopi_solidification.sql : DROP TABLE
  qualiopi_proof_checks (à exécuter en prod après vérif COUNT=0)."
```

---

## Tâche 12 : Vérification finale

**Files:** aucun (vérifications uniquement).

- [ ] **Step 1 : Tous les tests passent**

Run:
```bash
npx vitest run 2>&1 | tail -8
```
Expected: tout vert, cible ≥ 460 tests.

- [ ] **Step 2 : TypeScript clean**

Run:
```bash
npx tsc --noEmit 2>&1
```
Expected: zéro output.

- [ ] **Step 3 : Lint OK (si configuré)**

Run:
```bash
npx eslint src/lib/services/qualiopi-score.ts src/lib/services/qualiopi-snapshots.ts src/lib/utils/document-status.ts src/app/api/qualiopi/snapshots/route.ts 2>&1 | tail -10
```
Expected: zéro warning/erreur sur les nouveaux fichiers.

- [ ] **Step 4 : Acceptance criteria de la spec §6 — passer chacun en revue**

```bash
# AC1 : plus de cast as unknown as { qualiopi_*
grep -rn "as unknown as { qualiopi" src/ 2>/dev/null
# Expected: 0 résultat

# AC2 : computeQualiopiScore n'est plus exportée depuis TabQualiopi
grep -rn "computeQualiopiScore" src/ 2>/dev/null
# Expected: pointe uniquement vers src/lib/services/qualiopi-score.ts + ses tests + ses consumers (TabQualiopi, qualiopi-snapshots)

# AC3 : entity_id filter dans loadQualiopiIndicators
grep -n "entity_id" src/lib/services/load-session-aggregates.ts
# Expected: présence dans les queries enrollments, signatures, etc.

# AC4 : la route check-proof n'existe plus
ls src/app/api/ai/qualiopi-check-proof/ 2>/dev/null
# Expected: "No such file or directory"

# AC5 : qualiopi_manual utilisée dans TabQualiopi
grep -n "qualiopi_manual" src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabQualiopi.tsx
# Expected: lectures + updates présentes

# AC6 : window.location.href absent de TabQualiopi
grep -n "window.location.href" src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabQualiopi.tsx
# Expected: 0 résultat

# AC7 : RPC utilisée dans TabQualiopi
grep -n "count_responses_by_questionnaire" src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabQualiopi.tsx
# Expected: 1 résultat

# AC8 : Cron Netlify créé
ls netlify/functions/process-qualiopi-snapshots.mts
# Expected: file exists

# AC9 : composants Sparkline + History + AuditDetail créés
ls src/app/\(dashboard\)/admin/formations/\[id\]/_components/Qualiopi*.tsx
# Expected: 3 fichiers (Sparkline, HistoryDetail, AuditDetail)

# AC10 : prop onRefresh retirée
grep -n "onRefresh" src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabQualiopi.tsx
# Expected: 0 résultat

# AC11 : AbortController utilisé
grep -n "AbortController\|abortRef" src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabQualiopi.tsx
# Expected: au moins 1 résultat

# AC12 : Zod sur la route mock-audit
grep -n "z.discriminatedUnion\|Body.parse" src/app/api/ai/qualiopi-mock-audit/route.ts
# Expected: au moins 1 résultat
```

Cocher mentalement chaque AC. Si l'un échoue, retourner à la tâche concernée pour corriger.

- [ ] **Step 5 : Build Next.js OK (optionnel mais reco)**

Run:
```bash
npm run build 2>&1 | tail -30
```
Expected: build successful, pas d'erreur TypeScript ou de page.

- [ ] **Step 6 : Synthèse + commit final si nécessaire**

Si tous les ACs sont OK, l'implémentation est complète. Pas de commit supplémentaire — chaque tâche a déjà commité son lot.

Run:
```bash
git log --oneline main..HEAD
```
Expected: ~12 commits, un par tâche.

- [ ] **Step 7 : (À discuter avec l'utilisateur) Merge ou PR ?**

Présenter à l'utilisateur les options du skill `finishing-a-development-branch` :
1. Merge back to main locally
2. Push and create a Pull Request
3. Keep the branch as-is
4. Discard this work

Et préciser que la migration SQL `supabase/migrations/qualiopi_solidification.sql` devra être exécutée manuellement dans le Supabase Dashboard (prod) **après** que le déploiement Netlify ait abouti — sinon le code peut écrire dans `qualiopi_manual` qui n'existe pas encore.

---

## Self-review (effectuée pendant la rédaction)

**Spec coverage** : chaque volet A-K de la spec est couvert par une ou plusieurs tâches :
- Volet A → Tâche 3 (lib + tests) + Tâche 5 (consumer TabQualiopi)
- Volet B → Tâche 4 (loadQualiopiIndicators + tests)
- Volet C → Tâche 1 (Session étendu) + Tâche 5 (retrait cast)
- Volet D → Tâche 2 (utilitaire) + Tâche 10 (consumers)
- Volet E → Tâche 1 (migration) + Tâche 5 (TabQualiopi)
- Volet F → Tâche 5 (router.replace) + Tâche 6 (RPC batching)
- Volet G → Tâche 1 (RPC, est partagée) + Tâche 7 (helper + API + cron) + Tâche 8 (UI)
- Volet H → Tâche 9 (Sheet audit complet, dette J du deep-dive)
- Volet I → Tâche 11 (cleanup check-proof, M6 du deep-dive)
- Volet J → tests présents dans chaque tâche concernée
- Volet K → Tâche 5 (prop morte, AbortController, score=0) + Tâche 10 (Zod)

**Placeholder scan** : aucun "TBD", "TODO", "implementer plus tard", aucun "add error handling" sans code. Tous les blocs de code sont complets.

**Type consistency** : 
- `Session.qualiopi_score?: number | null` cohérent entre Tâche 1 (déclaration) et Tâche 5 (lecture).
- `Session.qualiopi_manual?: Record<string, boolean> | null` cohérent entre Tâche 1 et Tâche 5.
- `buildQualiopiItems(formation, opts)` / `computeQualiopiScore(formation, opts)` : signatures identiques entre la lib (Tâche 3), TabQualiopi (Tâche 5), et qualiopi-snapshots (Tâche 7).
- `mapStatusToFlags(status)` : signature identique entre Tâche 2 (déclaration), Tâche 10 (qualiopi-mock-audit), Tâche 10 step 5 (documents-store), Tâche 7 (qualiopi-snapshots).
- `SnapshotResult { inserted, skipped, errors }` : retour utilisé entre Tâche 7 (helper) et route API.
- `AuditResult { overall_verdict, findings, action_plan }` : type exporté par QualiopiAuditDetail (Tâche 9), réutilisé dans TabQualiopi.

**Aucune référence à un symbole non défini.**

---

## Exécution

Plan complete et sauvé à `docs/superpowers/plans/2026-05-25-solidification-qualiopi.md`. Deux options d'exécution :

**1. Subagent-Driven (recommandé)** — dispatch d'un subagent par tâche, revue spec compliance + code quality entre chaque, itération rapide. Identique à ce qui a été fait pour Automatisations.

**2. Inline Execution** — exécution des tâches dans cette session via `executing-plans`, batch execution avec checkpoints.

Quelle approche ?
