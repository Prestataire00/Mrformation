# Sous-chantier Émargement — Volet F Tests

> **Spec validée par Wissam le 2026-05-27.**
> Source : Deep-dive [docs/deep-dive-tab-emargements.md](../../deep-dive-tab-emargements.md).
> Pré-requis : Sous-chantiers 1 et 2 mergés en prod (commits `f0fb68e` + `16a00cb`).

---

## 1. Contexte

Les Sous-chantiers 1 et 2 ont solidifié l'émargement côté sécurité (P0-1 RLS + P0-2 canvas + 4 cross-tenant fixes + ownership checks) et type safety/robustesse (B + C). Score TabEmargements : 6/10 → 8/10.

Ce **Sous-chantier 3 (Volet F)** ajoute une couverture de tests Vitest sur le seul fichier émargement-spécifique côté `src/lib/` qui n'en a pas — `src/lib/services/load-signatures.ts`. Il sert de **filet de sécurité avant le Sous-chantier 4 (Volet E refacto architectural)** qui touchera plus en profondeur le code de prod.

**Scope réel** : l'exploration a confirmé que le deep-dive avait sur-estimé (cohérent avec Volets B+C). Le périmètre effectif est **~3-4h** (vs 14h estimé initialement) car :
- `src/lib/services/load-signatures.ts` (57 LOC) est le seul fichier à tester
- "save-signature" mentionné dans le deep-dive n'existe pas comme service — la logique est inline dans 2 routes API (extraction = Volet E)
- Les autres fichiers émargement-relevants sont déjà testés (`trainer-hours.ts`, `load-session-aggregates.ts`, `sort-time-slots.ts`, `validate-bulk-signature.ts`)

---

## 2. Goal

Ajouter une couverture de tests Vitest sur `src/lib/services/load-signatures.ts` + verrouiller la qualité avec un coverage threshold 100% (pattern identique à `questionnaire-scoring.ts` du Sous-chantier 2a Questionnaires).

---

## 3. Périmètre

### 3.1 In-scope — 1 livrable

| # | Livrable | Fichiers | Estimation |
|---|----------|----------|-----------|
| 1 | Tests Vitest `load-signatures.test.ts` (~8-10 tests) + coverage threshold 100% | `src/lib/services/__tests__/load-signatures.test.ts` (créé) + `vitest.config.ts` (modifié) | 3-4h |

### 3.2 Out-of-scope (reporté au Sous-chantier 4 Volet E)

- Extraction de la logique `save-signature` (actuellement inline dans `/api/signatures` POST et `/api/emargement/sign` POST) dans un service testable
- Découpage de TabEmargements 1144 LOC en sections/
- Retrait de `/admin/signatures` legacy 1279 LOC

### 3.3 Out-of-scope (déjà refusé)

- Volet D : UX pilotage

---

## 4. Architecture

### 4.1 Fonction à tester

[src/lib/services/load-signatures.ts](../../../src/lib/services/load-signatures.ts) — 57 lignes :

```ts
export async function loadSignaturesBySessionId(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<{
  signaturesById: Map<string, string>;
  signaturesBySlotPerson: Map<string, string>;
  signedLearnerIds: Set<string>;
  totalCount: number;
}>
```

**Comportement** :
1. Query `signatures.select("signer_id, signer_type, signature_data, time_slot_id").eq("session_id", sessionId)`
2. Pour chaque ligne `r` du résultat :
   - Si `!r.signer_id` → skip (early continue)
   - Si `r.signature_data` :
     - `signaturesById.set(r.signer_id, r.signature_data)` (overwrite si déjà présent)
     - Si `r.time_slot_id && r.signer_type` → `signaturesBySlotPerson.set("${slot}|${signer}|${type}", signature_data)`
   - Si `r.signer_type === "learner"` → `signedLearnerIds.add(r.signer_id)`
3. Return les 4 structures + `totalCount = typed.length`

### 4.2 Pattern de mock Supabase

Réutilisation du pattern existant dans [src/lib/services/__tests__/load-session-aggregates.test.ts](../../../src/lib/services/__tests__/load-session-aggregates.test.ts) — un mock minimaliste qui intercepte `.from()` et `.eq()` et retourne des `data: rows` configurables.

**Forme adaptée** pour `load-signatures` (une seule query simple) :

```ts
function makeSupabaseMock(rows: Array<{
  signer_id: string | null;
  signer_type: string | null;
  signature_data: string | null;
  time_slot_id: string | null;
}>) {
  const eqCalls: Array<{ column: string; value: unknown }> = [];

  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      eqCalls.push({ column, value });
      return query;
    }),
    then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
  };

  return {
    from: vi.fn(() => query),
    eqCalls,
  };
}
```

Cela permet de tester :
- Le filtre `.eq("session_id", sessionId)` est bien appelé (via `eqCalls`)
- Les 4 structures sont correctement construites selon les rows fournies

### 4.3 Coverage threshold

Ajouter `src/lib/services/load-signatures.ts` à la config existante de [vitest.config.ts](../../../vitest.config.ts) qui couvre déjà `questionnaire-scoring.ts` à 100% :

**AVANT** :
```ts
coverage: {
  provider: "v8",
  reporter: ["text", "json", "html"],
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

**APRÈS** :
```ts
coverage: {
  provider: "v8",
  reporter: ["text", "json", "html"],
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

---

## 5. Tests à écrire

### 5.1 Liste exhaustive des tests (~10 tests)

Tous dans `src/lib/services/__tests__/load-signatures.test.ts`.

| # | Description | Inputs | Outputs attendus |
|---|-------------|--------|------------------|
| 1 | Aucune signature → empty maps + count=0 | `rows = []` | Tous Maps/Set vides, `totalCount = 0` |
| 2 | 1 signature complète learner (signer_id + signature_data + time_slot_id + signer_type=learner) | 1 row complète | Présente dans les 3 structures |
| 3 | 1 signature trainer avec time_slot_id | 1 row signer_type=trainer | Dans `signaturesById` + `signaturesBySlotPerson`, PAS dans `signedLearnerIds` |
| 4 | Signature avec `signer_id = null` → skippée | 1 row avec signer_id null | Maps vides, mais `totalCount = 1` (count inclut les skipped) |
| 5 | Signature avec `signature_data = null` (presence cochée sans dessin) + signer_type=learner | 1 row avec signature_data null, signer_type=learner | `signaturesById` vide, MAIS `signedLearnerIds` contient le signer_id |
| 6 | Signature sans `time_slot_id` (signature globale, pas par créneau) | 1 row time_slot_id null | Dans `signaturesById` seulement, PAS dans `signaturesBySlotPerson` |
| 7 | Signature sans `signer_type` mais avec time_slot_id | 1 row signer_type null, time_slot_id set | Dans `signaturesById` mais PAS dans `signaturesBySlotPerson` (les 2 conditions doivent être true) |
| 8 | 2 signatures pour le même `signer_id` → la dernière gagne (Map overwrite) | 2 rows même signer_id, signature_data différentes | `signaturesById.get(id)` = signature_data du 2ème row |
| 9 | Filtre `.eq("session_id", sessionId)` est bien appelé avec le bon argument | Quelconque | `eqCalls.find({column: "session_id", value: "SESS-123"})` exists |
| 10 | Mix réaliste : 3 learners (2 avec signature, 1 sans) + 1 trainer signé + 1 row null | 5 rows variées | Vérifie `signaturesById.size`, `signaturesBySlotPerson.size`, `signedLearnerIds.size`, `totalCount = 5` |

### 5.2 Pattern de fichier de test

```ts
import { describe, it, expect, vi } from "vitest";
import { loadSignaturesBySessionId } from "@/lib/services/load-signatures";

function makeSupabaseMock(rows: Array<{ /* ... */ }>) {
  // ... (voir § 4.2)
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

  // ... 9 autres tests
});
```

Le `as any` cast est cohérent avec le pattern existant dans `load-session-aggregates.test.ts` (où on mock un Supabase client minimal sans étendre tout le type).

---

## 6. Critères d'acceptance

**Technique** :
- [ ] Fichier `src/lib/services/__tests__/load-signatures.test.ts` créé avec exactement les 10 tests listés au § 5.1
- [ ] `vitest.config.ts` modifié pour inclure `load-signatures.ts` dans `coverage.include` + thresholds 100%
- [ ] Tous les tests passent : Vitest baseline (539) + 10 nouveaux = **549 tests**
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run build` success
- [ ] Coverage 100/100/100/100 atteint sur `load-signatures.ts` (vérifié via `npx vitest run --coverage`)

**Pas de validation manuelle** : c'est pur add-tests, aucune surface UX touchée.

---

## 7. Pattern d'exécution

**Branche** : `feat/emargement-volet-f-tests` (depuis `main` à `16a00cb`)

**~4-5 tâches bite-sized** :

1. **Task 0** — Baseline + branche + lire `load-signatures.ts` + lire pattern mock de `load-session-aggregates.test.ts`
2. **Task 1** — Écrire les 10 tests TDD dans `load-signatures.test.ts` (failing-first → minimal mock → tests passent)
3. **Task 2** — Ajouter coverage threshold dans `vitest.config.ts` + vérifier coverage 100% atteint via `npx vitest run --coverage`
4. **Task 3** — Vérification finale (Vitest + tsc + build + coverage report)
5. **Task 4** — finishing-a-development-branch (merge + push prod, **pas de Task STOP** car aucune surface UX à smoke-tester)

**Sécurité prod** : ZÉRO risque applicatif (pure addition de fichiers de tests). La seule "régression possible" est si la suite Vitest perd un test existant — protégé par la baseline 539 maintenue + nouveaux 10 ajoutés.

---

## 8. Risques et mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Le mock Supabase minimaliste ne reflète pas le comportement réel (e.g. `.eq()` chain order) | Faible | Faible | Pattern existant dans `load-session-aggregates.test.ts` déjà éprouvé sur tests verts depuis le Sous-chantier 1 Questionnaires |
| Coverage 100% impossible à atteindre (branches non testables) | Très faible | Moyen | La fonction est triviale (1 query, 1 for-loop, 5 conditions). Toutes les branches sont atteignables avec inputs simples. |
| Ajout du threshold casse la suite Vitest existante via une régression sur `questionnaire-scoring.ts` | Très faible | Faible | Les 2 thresholds sont indépendants. `questionnaire-scoring.ts` à 100% est maintenu depuis Chantier 2a. |
| Tests trop verbose / DRY violations | Faible | Faible | Le `makeSupabaseMock()` est helper local. ~10 tests partagent ce helper, restent lisibles individuellement. |

---

## 9. Estimation finale

| Livrable | Estimation |
|----------|-----------|
| Écrire 10 tests + helper mock | 2h |
| Coverage threshold + vérif coverage 100% | 30 min |
| Vérifications finales + finishing | 30 min |
| **Total Sous-chantier 3** | **~3h** |

---

## 10. Suite

Après merge prod du Sous-chantier 3 :

- **Score TabEmargements** : reste 8/10 (le Volet F renforce la confiance sans changer le score visible).
- **Sous-chantier 4 (Volet E refacto architectural)** : sera brainstormé ensuite. Le filet de tests créé ici permet de refactor avec confiance — toute extraction ou découpage qui casserait `loadSignaturesBySessionId` sera attrapée par les 10 tests.
- **Sous-système Émargement** : couverture testée renforcée. Maintenance et évolutions futures plus sûres.
