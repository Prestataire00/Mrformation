# Sous-chantier Émargement — Volet F Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une couverture de tests Vitest sur `src/lib/services/load-signatures.ts` (seul fichier émargement-spécifique sans tests) + verrouiller la qualité avec un coverage threshold 100%.

**Architecture:**
1. Créer `src/lib/services/__tests__/load-signatures.test.ts` avec 10 tests TDD couvrant tous les chemins du code (1 query Supabase, 5 conditions logiques, 4 structures retournées).
2. Réutiliser le pattern `makeSupabaseMock` du fichier `load-session-aggregates.test.ts` (helper local, thenable pour `await query`).
3. Étendre `vitest.config.ts` avec le coverage threshold 100% sur `load-signatures.ts` (pattern identique à `questionnaire-scoring.ts`).

**Tech Stack:** Vitest + @vitest/coverage-v8 (déjà configurés), mock Supabase minimaliste local au fichier de test.

**Branche cible** : `feat/emargement-volet-f-tests` (depuis `main` à `16a00cb`).

**Source spec** : [docs/superpowers/specs/2026-05-27-emargement-volet-f-tests-design.md](../specs/2026-05-27-emargement-volet-f-tests-design.md)

---

## File Structure

**Created** :
- `src/lib/services/__tests__/load-signatures.test.ts` — 10 tests Vitest + helper `makeSupabaseMock` local

**Modified** :
- `vitest.config.ts` — extension de `coverage.include` + `coverage.thresholds` pour inclure `load-signatures.ts` à 100%

**Pas touchés** :
- `src/lib/services/load-signatures.ts` — code applicatif intact, aucune modification
- Aucun autre fichier de production

---

## Task 0: Baseline + branche + exploration

**Files:** Aucun (vérifications uniquement)

- [ ] **Step 1: Vérifier état initial**

Run: `git status`
Expected: `On branch main, ...` (les untracked files .claude/skills/* sont pré-existants, OK)

Run: `git log -1 --oneline`
Expected: `9e83e63 docs(spec): Sous-chantier 3 Émargement Volet F Tests` (ou commit ultérieur si plan committed)

Run: `npx vitest run --reporter=basic 2>&1 | grep -E "Test Files|Tests "`
Expected: `Test Files  48 passed (48)` et `Tests  539 passed (539)`

Run: `npx tsc --noEmit 2>&1 | head -3`
Expected: aucune sortie (clean)

- [ ] **Step 2: Créer la branche depuis main**

```bash
git checkout -b feat/emargement-volet-f-tests
```

Expected: `Switched to a new branch 'feat/emargement-volet-f-tests'`

- [ ] **Step 3: Lire le SUT `load-signatures.ts`**

Run: `cat src/lib/services/load-signatures.ts`

Tu dois voir la fonction `loadSignaturesBySessionId(supabase, sessionId)` qui :
- Fait `supabase.from("signatures").select("signer_id, signer_type, signature_data, time_slot_id").eq("session_id", sessionId)`
- Itère sur les rows, skip si `!signer_id` (early continue)
- Si `signature_data` non-null : ajoute à `signaturesById`. Si aussi `time_slot_id && signer_type` : ajoute à `signaturesBySlotPerson` avec clé `"${slot}|${signer}|${type}"`
- Si `signer_type === "learner"` : ajoute à `signedLearnerIds`
- Retourne `{ signaturesById, signaturesBySlotPerson, signedLearnerIds, totalCount }`

Note : `totalCount = typed.length` = count des rows incluant celles skipped (signer_id null).

- [ ] **Step 4: Lire le pattern mock dans `load-session-aggregates.test.ts`**

Run: `sed -n '1,50p' src/lib/services/__tests__/load-session-aggregates.test.ts`

Tu dois voir le pattern `makeSupabaseMock` qui :
- Capture les `from()` et `eq()` calls
- Retourne un query objet avec `.select`, `.eq`, `.in`, `.single`, et `.then` (thenable)
- `.then(resolve)` resolve avec `{ data, error }` — c'est ce qui permet `await query` de fonctionner

Note clé : `await supabase.from("X").select().eq("col", val)` déclenche `.then()` du thenable car le retour de `.eq()` est awaité. Donc le mock peut juste avoir `query.then = (resolve) => resolve({ data: rows, error: null })`.

---

## Task 1: Écrire les 10 tests TDD dans `load-signatures.test.ts`

**Files:**
- Create: `src/lib/services/__tests__/load-signatures.test.ts`

- [ ] **Step 1: Créer le fichier test avec helper + 10 tests**

Créer `src/lib/services/__tests__/load-signatures.test.ts` avec ce contenu EXACT :

```ts
import { describe, it, expect, vi } from "vitest";
import { loadSignaturesBySessionId } from "@/lib/services/load-signatures";

/**
 * Mock minimaliste de SupabaseClient pour loadSignaturesBySessionId.
 * Pattern identique à load-session-aggregates.test.ts.
 *
 * La fonction sous test fait :
 *   await supabase.from("signatures").select(...).eq("session_id", sessionId)
 *
 * Le `await` déclenche `query.then(resolve)` du thenable → resolve avec
 * { data: rows, error: null }.
 */
type Row = {
  signer_id: string | null;
  signer_type: string | null;
  signature_data: string | null;
  time_slot_id: string | null;
};

function makeSupabaseMock(rows: Row[]) {
  const fromCalls: string[] = [];
  const eqCalls: Array<{ column: string; value: unknown }> = [];

  const query: Record<string, unknown> = {};
  const chainable = () => query;
  query.select = vi.fn(chainable);
  query.eq = vi.fn((column: string, value: unknown) => {
    eqCalls.push({ column, value });
    return query;
  });
  query.then = (resolve: (v: unknown) => void) =>
    resolve({ data: rows, error: null });

  return {
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      return query;
    }),
    fromCalls,
    eqCalls,
  };
}

describe("loadSignaturesBySessionId", () => {
  it("aucune signature → empty maps + count=0", async () => {
    const mock = makeSupabaseMock([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await loadSignaturesBySessionId(mock as any, "SESS-1");

    expect(result.signaturesById.size).toBe(0);
    expect(result.signaturesBySlotPerson.size).toBe(0);
    expect(result.signedLearnerIds.size).toBe(0);
    expect(result.totalCount).toBe(0);
  });

  it("1 signature complète learner → présente dans les 3 structures", async () => {
    const mock = makeSupabaseMock([
      {
        signer_id: "LEARNER-1",
        signer_type: "learner",
        signature_data: "<svg>L1</svg>",
        time_slot_id: "SLOT-A",
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await loadSignaturesBySessionId(mock as any, "SESS-1");

    expect(result.signaturesById.get("LEARNER-1")).toBe("<svg>L1</svg>");
    expect(result.signaturesBySlotPerson.get("SLOT-A|LEARNER-1|learner")).toBe("<svg>L1</svg>");
    expect(result.signedLearnerIds.has("LEARNER-1")).toBe(true);
    expect(result.totalCount).toBe(1);
  });

  it("1 signature trainer avec time_slot_id → signaturesById + slotPerson, PAS signedLearnerIds", async () => {
    const mock = makeSupabaseMock([
      {
        signer_id: "TRAINER-1",
        signer_type: "trainer",
        signature_data: "<svg>T1</svg>",
        time_slot_id: "SLOT-A",
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await loadSignaturesBySessionId(mock as any, "SESS-1");

    expect(result.signaturesById.get("TRAINER-1")).toBe("<svg>T1</svg>");
    expect(result.signaturesBySlotPerson.get("SLOT-A|TRAINER-1|trainer")).toBe("<svg>T1</svg>");
    expect(result.signedLearnerIds.has("TRAINER-1")).toBe(false);
  });

  it("signature avec signer_id=null → skippée (mais totalCount inclut)", async () => {
    const mock = makeSupabaseMock([
      {
        signer_id: null,
        signer_type: "learner",
        signature_data: "<svg>orphan</svg>",
        time_slot_id: "SLOT-A",
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await loadSignaturesBySessionId(mock as any, "SESS-1");

    expect(result.signaturesById.size).toBe(0);
    expect(result.signaturesBySlotPerson.size).toBe(0);
    expect(result.signedLearnerIds.size).toBe(0);
    expect(result.totalCount).toBe(1); // typed.length inclut les rows skipped via continue
  });

  it("signature avec signature_data=null + learner → signaturesById vide, signedLearnerIds contient", async () => {
    const mock = makeSupabaseMock([
      {
        signer_id: "LEARNER-2",
        signer_type: "learner",
        signature_data: null, // présence cochée sans dessin (admin_bulk pre-fix par exemple)
        time_slot_id: "SLOT-A",
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await loadSignaturesBySessionId(mock as any, "SESS-1");

    expect(result.signaturesById.has("LEARNER-2")).toBe(false);
    expect(result.signaturesBySlotPerson.size).toBe(0);
    expect(result.signedLearnerIds.has("LEARNER-2")).toBe(true);
    expect(result.totalCount).toBe(1);
  });

  it("signature sans time_slot_id → signaturesById seulement", async () => {
    const mock = makeSupabaseMock([
      {
        signer_id: "LEARNER-3",
        signer_type: "learner",
        signature_data: "<svg>L3</svg>",
        time_slot_id: null, // signature globale (legacy avant slots)
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await loadSignaturesBySessionId(mock as any, "SESS-1");

    expect(result.signaturesById.get("LEARNER-3")).toBe("<svg>L3</svg>");
    expect(result.signaturesBySlotPerson.size).toBe(0);
    expect(result.signedLearnerIds.has("LEARNER-3")).toBe(true);
  });

  it("signature sans signer_type mais avec time_slot_id → signaturesById PAS signaturesBySlotPerson", async () => {
    const mock = makeSupabaseMock([
      {
        signer_id: "X-1",
        signer_type: null, // les 2 conditions doivent être true pour rejoindre slotPerson
        signature_data: "<svg>X</svg>",
        time_slot_id: "SLOT-A",
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await loadSignaturesBySessionId(mock as any, "SESS-1");

    expect(result.signaturesById.get("X-1")).toBe("<svg>X</svg>");
    expect(result.signaturesBySlotPerson.size).toBe(0);
    expect(result.signedLearnerIds.has("X-1")).toBe(false); // signer_type !== "learner"
  });

  it("2 signatures même signer_id → la dernière gagne (Map overwrite)", async () => {
    const mock = makeSupabaseMock([
      {
        signer_id: "LEARNER-4",
        signer_type: "learner",
        signature_data: "<svg>first</svg>",
        time_slot_id: null,
      },
      {
        signer_id: "LEARNER-4",
        signer_type: "learner",
        signature_data: "<svg>second</svg>",
        time_slot_id: null,
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await loadSignaturesBySessionId(mock as any, "SESS-1");

    expect(result.signaturesById.get("LEARNER-4")).toBe("<svg>second</svg>");
    expect(result.signaturesById.size).toBe(1);
    expect(result.totalCount).toBe(2);
  });

  it("filtre .eq('session_id', sessionId) appelé correctement", async () => {
    const mock = makeSupabaseMock([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await loadSignaturesBySessionId(mock as any, "SESS-123");

    expect(mock.fromCalls).toEqual(["signatures"]);
    expect(mock.eqCalls).toEqual([{ column: "session_id", value: "SESS-123" }]);
  });

  it("mix réaliste : 3 learners (2 signés, 1 sans data) + 1 trainer + 1 null", async () => {
    const mock = makeSupabaseMock([
      // Learner 1 : signé avec data + slot
      {
        signer_id: "L1",
        signer_type: "learner",
        signature_data: "<svg>L1</svg>",
        time_slot_id: "SLOT-A",
      },
      // Learner 2 : signé avec data, sans slot (legacy)
      {
        signer_id: "L2",
        signer_type: "learner",
        signature_data: "<svg>L2</svg>",
        time_slot_id: null,
      },
      // Learner 3 : présence cochée mais signature_data null
      {
        signer_id: "L3",
        signer_type: "learner",
        signature_data: null,
        time_slot_id: "SLOT-A",
      },
      // Trainer 1 : signé avec data + slot
      {
        signer_id: "T1",
        signer_type: "trainer",
        signature_data: "<svg>T1</svg>",
        time_slot_id: "SLOT-A",
      },
      // Row orpheline : signer_id null → skippée
      {
        signer_id: null,
        signer_type: "learner",
        signature_data: "<svg>orphan</svg>",
        time_slot_id: "SLOT-A",
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await loadSignaturesBySessionId(mock as any, "SESS-1");

    // signaturesById : L1 + L2 + T1 (L3 sans data, orphan skip)
    expect(result.signaturesById.size).toBe(3);
    expect(result.signaturesById.get("L1")).toBe("<svg>L1</svg>");
    expect(result.signaturesById.get("L2")).toBe("<svg>L2</svg>");
    expect(result.signaturesById.get("T1")).toBe("<svg>T1</svg>");

    // signaturesBySlotPerson : L1 + T1 (L2 sans slot, L3 sans data, orphan skip)
    expect(result.signaturesBySlotPerson.size).toBe(2);
    expect(result.signaturesBySlotPerson.get("SLOT-A|L1|learner")).toBe("<svg>L1</svg>");
    expect(result.signaturesBySlotPerson.get("SLOT-A|T1|trainer")).toBe("<svg>T1</svg>");

    // signedLearnerIds : L1 + L2 + L3 (tous les learners avec signer_id non-null)
    expect(result.signedLearnerIds.size).toBe(3);
    expect(result.signedLearnerIds.has("L1")).toBe(true);
    expect(result.signedLearnerIds.has("L2")).toBe(true);
    expect(result.signedLearnerIds.has("L3")).toBe(true);
    expect(result.signedLearnerIds.has("T1")).toBe(false);

    // totalCount inclut TOUTES les rows (5 incluant l'orpheline skipped)
    expect(result.totalCount).toBe(5);
  });
});
```

- [ ] **Step 2: Lancer les tests pour confirmer 10/10 passent**

Run: `npx vitest run src/lib/services/__tests__/load-signatures.test.ts --reporter=basic 2>&1 | tail -10`
Expected: `Tests  10 passed (10)`

Si un test échoue, lis le diff entre attendu et obtenu, ajuste le test concerné (généralement ce sont des assertions sur `size` qui peuvent être off-by-one). **NE PAS modifier `load-signatures.ts`** — le SUT est le code de référence.

- [ ] **Step 3: Vérifier la suite complète Vitest verte**

Run: `npx vitest run --reporter=basic 2>&1 | grep -E "Test Files|Tests "`
Expected: `Test Files  49 passed (49)` et `Tests  549 passed (549)`

- [ ] **Step 4: Vérifier TypeScript clean**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: aucune sortie

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/__tests__/load-signatures.test.ts
git commit -m "test(emargement): 10 tests Vitest sur loadSignaturesBySessionId (Volet F)

Couverture exhaustive de la fonction loadSignaturesBySessionId :
- Aucune signature → empty structures
- Signature learner / trainer avec time_slot_id → 3 structures correctement peuplées
- Edge cases : signer_id null (skip), signature_data null (signedLearnerIds only),
  time_slot_id null (signaturesById only), signer_type null (signaturesById only)
- Overwrite : 2 signatures même signer_id → dernière gagne
- Filtre .eq('session_id', sessionId) vérifié
- Mix réaliste 5 rows variées

Pattern mock Supabase identique à load-session-aggregates.test.ts
(thenable resolve avec { data, error }).

Aucune modification du code applicatif. 539 baseline + 10 = 549 tests.

Refs: docs/superpowers/specs/2026-05-27-emargement-volet-f-tests-design.md § 5"
```

---

## Task 2: Ajouter coverage threshold dans `vitest.config.ts`

**Files:**
- Modify: `vitest.config.ts:15-23`

- [ ] **Step 1: Lire le contexte actuel**

Run: `cat vitest.config.ts`

Tu dois voir la config existante avec `coverage.include: ["src/lib/services/questionnaire-scoring.ts"]` et le threshold 100% sur ce seul fichier.

- [ ] **Step 2: Étendre `coverage.include` et `coverage.thresholds`**

Trouver le bloc EXACT :

```ts
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      // Threshold ciblé uniquement sur le helper scoring — pas sur tout le
      // projet (les 45 fichiers de tests existants ne couvrent pas 100%
      // partout, le threshold global casserait la suite).
      include: ["src/lib/services/questionnaire-scoring.ts"],
      thresholds: {
        "src/lib/services/questionnaire-scoring.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      },
    },
```

Le remplacer par :

```ts
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      // Threshold ciblé uniquement sur des helpers à valeur critique —
      // pas sur tout le projet (les fichiers de tests existants ne couvrent
      // pas 100% partout, le threshold global casserait la suite).
      include: [
        "src/lib/services/questionnaire-scoring.ts",
        "src/lib/services/load-signatures.ts",
      ],
      thresholds: {
        "src/lib/services/questionnaire-scoring.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/lib/services/load-signatures.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      },
    },
```

- [ ] **Step 3: Vérifier que la coverage atteint 100% sur load-signatures.ts**

Run: `npx vitest run --coverage 2>&1 | tail -30`

Tu dois voir une ligne pour `load-signatures.ts` avec `100 | 100 | 100 | 100` (statements / branches / functions / lines). Si une des métriques est < 100, identifier la branche non couverte (généralement c'est dans le report HTML/text) et ajuster un test pour la couvrir.

Si le threshold échoue, la commande exit non-0 et affiche quelque chose comme :
```
ERROR: Coverage for X (Y%) does not meet global threshold (100%)
```

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts
git commit -m "test(emargement): coverage threshold 100% sur load-signatures.ts (Volet F)

Étend vitest.config.ts coverage.include et coverage.thresholds pour
inclure src/lib/services/load-signatures.ts à 100% (pattern identique
à questionnaire-scoring.ts du Sous-chantier 2a Questionnaires).

Toute régression future qui réduirait la coverage de loadSignaturesBySessionId
sous 100% (e.g. nouvelle branche non testée) cassera le build.

Refs: docs/superpowers/specs/2026-05-27-emargement-volet-f-tests-design.md § 4.3"
```

---

## Task 3: Vérification finale

**Files:** Aucun (vérifications uniquement)

- [ ] **Step 1: Suite Vitest complète verte**

Run: `npx vitest run --reporter=basic 2>&1 | grep -E "Test Files|Tests "`
Expected: `Test Files  49 passed (49)` et `Tests  549 passed (549)`

- [ ] **Step 2: TypeScript clean**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: aucune sortie

- [ ] **Step 3: Build Next.js success**

Run: `npm run build 2>&1 | grep -E "Compiled|error\b|Error\b" | head -5`
Expected: `✓ Compiled successfully` (les "Dynamic server usage" sur d'autres routes sont pré-existantes, ignorer)

- [ ] **Step 4: Coverage 100% maintenu sur les 2 fichiers ciblés**

Run: `npx vitest run --coverage 2>&1 | grep -E "questionnaire-scoring|load-signatures|ERROR.*threshold" | head -10`

Expected : 2 lignes avec `100 | 100 | 100 | 100` pour `questionnaire-scoring.ts` et `load-signatures.ts`. Aucun `ERROR` lié au threshold.

- [ ] **Step 5: Récap des commits du sous-chantier**

Run: `git log --oneline 9e83e63..HEAD` (ou `git log --oneline main..HEAD` si le hash de base a évolué)

Expected : 2 commits :
```
<sha> test(emargement): coverage threshold 100% sur load-signatures.ts (Volet F)
<sha> test(emargement): 10 tests Vitest sur loadSignaturesBySessionId (Volet F)
```

---

## Task 4: finishing-a-development-branch (merge + push prod)

**Files:** Aucun (orchestration git)

> ⚠️ **PAS de Task STOP/smoke check manuel** : ce sous-chantier ne touche aucun code applicatif, aucune surface UX à valider. La garde est : Vitest 549/549 + tsc clean + build success + coverage 100% (toutes Task 3 step 1-4).

- [ ] **Step 1: Invoquer finishing-a-development-branch**

Annoncer : "I'm using the finishing-a-development-branch skill to complete this work."

Utiliser superpowers:finishing-a-development-branch :
1. Verify tests : `npx vitest run` → 549 passed
2. Determine base : main (depuis `16a00cb`)
3. Pattern habituel : **merge local sur main + push prod**
4. Cleanup branch `feat/emargement-volet-f-tests`

- [ ] **Step 2: Confirmer le push prod**

Run: `git log --oneline origin/main..HEAD` (après push)
Expected: liste vide (tout est pushé)

Run: `git log --oneline -3`
Expected: les commits du sous-chantier + le merge commit en tête de `main`.

---

## Résumé du sous-chantier

| Tâche | Livrable | Estimation |
|-------|----------|-----------|
| 0 | Baseline + branche + exploration | 10 min |
| 1 | 10 tests Vitest + helper mock | 2h |
| 2 | Coverage threshold dans vitest.config.ts | 20 min |
| 3 | Vérifications finales | 10 min |
| 4 | finishing + push prod | 10 min |
| **Total** | | **~3h** |

**Critères d'acceptance** (cf. spec § 6) : tous validés avant Task 4.

**Risque prod** : ZÉRO. Aucune modification du code applicatif. Pure addition de fichiers de tests + extension config Vitest.

**Score qualité TabEmargements** : reste 8/10 (Volet F renforce la confiance sans changer le score visible).
