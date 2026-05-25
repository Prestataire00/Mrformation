# Plan d'implémentation — Solidification TabConventionDocs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Solidifier le sous-onglet Documents > Conventions (`TabConventionDocs`, 2101 LOC, le plus gros tab) — corriger 6 bugs critiques de sécurité multi-tenant + 6 majeurs (robustesse, type safety), créer 15 routes batch email manquantes (Stories F1.x/F2.x), supprimer les fallbacks client 600-800 ms × N docs.

**Architecture:** Pas de migration SQL. 4 nouveaux helpers de sécurité dans `documents-store.ts` + 1 orchestrateur `batchSendDocsEmail` dans `batch-email-handler.ts` qui réutilise l'`executeBatchEmailSend` existant. 15 nouvelles routes API thin-wrapper qui suivent le pattern existant (`send-certificats-realisation-batch-email`). Refactor de `TabConventionDocs` pour utiliser ces helpers + ajouts await/try-catch/visibility/error.message.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase, Vitest, Resend (via email_queue), CloudConvert (pour DOCX → PDF mode docx_fidelity).

**Spec source:** [docs/superpowers/specs/2026-05-25-solidification-tab-convention-docs-design.md](docs/superpowers/specs/2026-05-25-solidification-tab-convention-docs-design.md)
**Deep-dive source:** [docs/deep-dive-tab-convention-docs.md](docs/deep-dive-tab-convention-docs.md)

**Risques modérés assumés (cf brainstorming)** :
- Préserver le branchement template Word custom (`mode=docx_fidelity` + `default_for_doc_type`) dans le nouvel orchestrateur `batchSendDocsEmail`
- Utiliser `ownerType` du registry HTML comme source unique de vérité pour le mapping recipient
- Validation manuelle post-merge prévue (test envoi d'1 doc de chaque type)

---

## Vue d'ensemble des fichiers

### Créés
| Fichier | Rôle |
|---|---|
| `src/lib/services/__tests__/documents-store.test.ts` | Tests des 4 nouveaux helpers (~16 tests Vitest) |
| `src/app/api/documents/send-cgv-batch-email/route.ts` | Story F1.x |
| `src/app/api/documents/send-reglement-interieur-batch-email/route.ts` | Story F1.x |
| `src/app/api/documents/send-politique-confidentialite-batch-email/route.ts` | Story F1.x |
| `src/app/api/documents/send-planning-semaine-batch-email/route.ts` | Story F1.x |
| `src/app/api/documents/send-feuille-emargement-vierge-batch-email/route.ts` | Story F1.x |
| `src/app/api/documents/send-bilans-poe-batch-email/route.ts` | Story F2.x |
| `src/app/api/documents/send-reponses-evaluations-batch-email/route.ts` | Story F2.x |
| `src/app/api/documents/send-reponses-satisfaction-batch-email/route.ts` | Story F2.x |
| `src/app/api/documents/send-resultats-evaluations-batch-email/route.ts` | Story F2.x |
| `src/app/api/documents/send-attestations-aipr-batch-email/route.ts` | Story F2.x |
| `src/app/api/documents/send-attestations-competences-batch-email/route.ts` | Story F2.x |
| `src/app/api/documents/send-attestations-abandon-batch-email/route.ts` | Story F2.x |
| `src/app/api/documents/send-certificats-travail-hauteur-batch-email/route.ts` | Story F2.x |
| `src/app/api/documents/send-certificats-diplome-batch-email/route.ts` | Story F2.x |
| `src/app/api/documents/send-avis-habilitation-electrique-batch-email/route.ts` | Story F2.x (9 variantes via body) |

### Modifiés
| Fichier | Changement |
|---|---|
| `src/lib/services/documents-store.ts` | + 4 helpers : `updateDocsByDocType`, `updateDocsForOwner`, `getTemplateById`, `getLatestSignatureForDoc` |
| `src/lib/services/batch-email-handler.ts` | + orchestrateur `batchSendDocsEmail(supabase, entityId, sessionId, docType)` qui réutilise `executeBatchEmailSend` |
| `src/lib/utils/batch-doc-send.ts` | `BATCH_SEND_ENDPOINTS` enrichi avec les 15 nouveaux doc_types |
| `src/lib/types/index.ts` | `FormationConventionDocument.signer_email?` + `signer_name?` (si confirmé en BDD) |
| `src/components/formations/DocMatrixSection.tsx` | `docTypes: readonly string[]` |
| `src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx` | Refactor : helpers + await + try/catch + visibility + retrait casts + retrait fallbacks |

---

## Tâche 1 : Baseline + branche + investigation signer_email

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
Expected: branche `main`, 475 tests verts, TypeScript clean.

- [ ] **Step 2 : Créer la branche**

```bash
git checkout main
git pull origin main 2>/dev/null || true
git checkout -b feat/tab-convention-docs-solidification
```

- [ ] **Step 3 : Investigation `signer_email` (résout B4 ambiguïté)**

Run:
```bash
grep -rn "signer_email" supabase/ src/lib/types/ src/lib/services/documents-store.ts src/app/api/documents/sign-request/route.ts src/app/api/documents/sign-status/route.ts 2>/dev/null | head -20
```

Analyser le résultat. 3 cas possibles :
1. **Colonne BDD existe** (dans `documents`, `signing_tokens`, ou `formation_convention_documents`) → noter la table et la colonne, le Volet B étendra le type pour matcher.
2. **Présent dans une jointure de `getDocsForSession`** → noter la jointure.
3. **Aucune occurrence en BDD ni jointure** → le champ est dead code, le tooltip ligne 1140 ne reçoit jamais de valeur. Plan : retirer le tooltip + le cast en Tâche 14.

Documenter le résultat dans un commentaire de commit pour Tâche 14 :
```
[INVESTIGATION] signer_email vit dans <X>, jointure <Y> à conserver.
OU [INVESTIGATION] signer_email est dead code → retirer tooltip ligne 1140.
```

Pas de commit nécessaire pour cette tâche — c'est de l'investigation préparatoire.

---

## Tâche 2 : Types `FormationConventionDocument` + `DocMatrixSection.docTypes`

**Files:**
- Modify: `src/lib/types/index.ts`
- Modify: `src/components/formations/DocMatrixSection.tsx`

- [ ] **Step 1 : Locate `FormationConventionDocument` interface**

Run:
```bash
grep -n "^export interface FormationConventionDocument" src/lib/types/index.ts
```
Noter le numéro de ligne.

- [ ] **Step 2 : Étendre `FormationConventionDocument`**

**Selon l'investigation de Tâche 1 Step 3** :
- **Si `signer_email` existe en BDD** : ajouter dans l'interface (au bon endroit, après les autres champs nullable) :
  ```ts
    /** Injecté par jointure document_signatures (ou autre source identifiée en Tâche 1). */
    signer_email?: string | null;
    /** Injecté par jointure document_signatures. */
    signer_name?: string | null;
  ```
- **Si `signer_email` est dead code** : ne pas ajouter au type. Tâche 14 retirera le tooltip qui utilise ce champ.

- [ ] **Step 3 : Locate `DocMatrixSectionProps.docTypes`**

Run:
```bash
grep -n "docTypes" src/components/formations/DocMatrixSection.tsx
```

- [ ] **Step 4 : Élargir `docTypes` à `readonly string[]`**

Dans `src/components/formations/DocMatrixSection.tsx`, modifier la définition du type :
```ts
// Avant : docTypes: string[];
// Après :
docTypes: readonly string[];
```

`readonly string[]` accepte `ConventionDocType[]` (un union literal `readonly`) sans cast `as unknown as string[]`.

- [ ] **Step 5 : Vérifier TypeScript clean**

Run:
```bash
npx tsc --noEmit 2>&1 | head -10
```
Expected: aucune erreur. Note : les 3 casts dans `TabConventionDocs.tsx:1629/1643/1657` restent pour l'instant (Tâche 14 les retire).

- [ ] **Step 6 : Commit**

```bash
git add src/lib/types/index.ts src/components/formations/DocMatrixSection.tsx
git commit -m "feat(types): étendre FormationConventionDocument + DocMatrixSection.docTypes

- FormationConventionDocument : ajout signer_email? + signer_name? (si confirmé
  en BDD lors de l'investigation Tâche 1) pour retirer le cast as unknown as
  Record<string, string> ligne 1140 de TabConventionDocs.
- DocMatrixSection.docTypes accepte désormais readonly string[] (au lieu de
  string[]) — compatible avec les unions ConventionDocType[], retire les 3
  casts as unknown as string[] dans TabConventionDocs (lignes 1629, 1643, 1657)."
```

---

## Tâche 3 : Helper `updateDocsByDocType` + tests

**Files:**
- Modify: `src/lib/services/documents-store.ts`
- Create: `src/lib/services/__tests__/documents-store.test.ts`

- [ ] **Step 1 : Écrire les tests (failing first)**

Créer `src/lib/services/__tests__/documents-store.test.ts` :
```ts
import { describe, it, expect, vi } from "vitest";
import { updateDocsByDocType } from "@/lib/services/documents-store";

describe("updateDocsByDocType", () => {
  it("filtre par entity_id + source_table + source_id + doc_type", async () => {
    const eqCalls: Array<{ col: string; val: unknown }> = [];
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(function chain(this: object, col: string, val: unknown) {
            eqCalls.push({ col, val });
            return Object.assign(this, {
              eq: vi.fn(function chain2(this: object, col2: string, val2: unknown) {
                eqCalls.push({ col: col2, val: val2 });
                return Object.assign(this, {
                  eq: vi.fn(function chain3(this: object, col3: string, val3: unknown) {
                    eqCalls.push({ col: col3, val: val3 });
                    return Object.assign(this, {
                      eq: vi.fn((col4: string, val4: unknown) => {
                        eqCalls.push({ col: col4, val: val4 });
                        return {
                          select: vi.fn(() => Promise.resolve({ error: null, count: 3 })),
                        };
                      }),
                    });
                  }),
                });
              }),
            });
          }),
        })),
      })),
    };
    const res = await updateDocsByDocType(
      supabase as never, "ENT-A", "SESS-1", "convocation",
      { is_confirmed: true },
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.updated).toBe(3);
    expect(eqCalls).toContainEqual({ col: "entity_id", val: "ENT-A" });
    expect(eqCalls).toContainEqual({ col: "source_table", val: "sessions" });
    expect(eqCalls).toContainEqual({ col: "source_id", val: "SESS-1" });
    expect(eqCalls).toContainEqual({ col: "doc_type", val: "convocation" });
  });

  it("ajoute le filtre status quand onlyStatus est spécifié", async () => {
    const eqCalls: Array<{ col: string; val: unknown }> = [];
    function makeChain(): object {
      return {
        eq: vi.fn(function (col: string, val: unknown) {
          eqCalls.push({ col, val });
          return makeChain();
        }),
        select: vi.fn(() => Promise.resolve({ error: null, count: 1 })),
      };
    }
    const supabase = {
      from: vi.fn(() => ({ update: vi.fn(() => makeChain()) })),
    };
    await updateDocsByDocType(
      supabase as never, "ENT-A", "SESS-1", "convocation",
      { is_confirmed: true },
      { onlyStatus: "draft" },
    );
    expect(eqCalls).toContainEqual({ col: "status", val: "draft" });
  });

  it("retourne { ok: false, error } si Supabase erreur", async () => {
    function makeChain(): object {
      return {
        eq: vi.fn(function () { return makeChain(); }),
        select: vi.fn(() => Promise.resolve({ error: { message: "DB error", code: "42P01" }, count: null })),
      };
    }
    const supabase = {
      from: vi.fn(() => ({ update: vi.fn(() => makeChain()) })),
    };
    const res = await updateDocsByDocType(
      supabase as never, "ENT-A", "SESS-1", "convocation",
      { is_confirmed: true },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toBe("DB error");
      expect(res.error.code).toBe("42P01");
    }
  });

  it("retourne updated: 0 si aucune row trouvée", async () => {
    function makeChain(): object {
      return {
        eq: vi.fn(function () { return makeChain(); }),
        select: vi.fn(() => Promise.resolve({ error: null, count: 0 })),
      };
    }
    const supabase = {
      from: vi.fn(() => ({ update: vi.fn(() => makeChain()) })),
    };
    const res = await updateDocsByDocType(
      supabase as never, "ENT-A", "SESS-1", "convocation",
      { is_confirmed: true },
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.updated).toBe(0);
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

Run:
```bash
npx vitest run src/lib/services/__tests__/documents-store.test.ts 2>&1 | tail -10
```
Expected: erreur d'import (`updateDocsByDocType` pas encore exportée).

- [ ] **Step 3 : Ajouter le helper à `documents-store.ts`**

À la fin de `src/lib/services/documents-store.ts`, ajouter :
```ts
/**
 * UPDATE en masse de documents par doc_type pour une session.
 * Filtre par entity_id + source_table='sessions' + source_id (session) + doc_type.
 * Filtre optionnel onlyStatus (pattern legacy mass confirm).
 *
 * Résout les UPDATE inline (TabConventionDocs.tsx:960, 1576) qui manquaient
 * .eq("entity_id", entityId) — violation CLAUDE.md AR20.
 */
export async function updateDocsByDocType(
  supabase: SupabaseClient,
  entityId: string,
  sessionId: string,
  docType: string,
  patch: Record<string, unknown>,
  options?: { onlyStatus?: string },
): Promise<ServiceResult<{ updated: number }>> {
  let query = supabase
    .from("documents")
    .update(patch)
    .eq("entity_id", entityId)
    .eq("source_table", "sessions")
    .eq("source_id", sessionId)
    .eq("doc_type", docType);
  if (options?.onlyStatus) {
    query = query.eq("status", options.onlyStatus);
  }
  const { error, count } = await query.select("id", { count: "exact", head: true });
  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return { ok: true, updated: count ?? 0 };
}
```

Si `ServiceResult` n'est pas déjà exporté du fichier (ou importé depuis ailleurs), l'ajouter en haut :
```ts
export type ServiceResult<T = Record<never, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: { message: string; code?: string } };
```

Vérifier d'abord : `grep -n "ServiceResult" src/lib/services/documents-store.ts`.

- [ ] **Step 4 : Vérifier que les tests passent**

Run:
```bash
npx vitest run src/lib/services/__tests__/documents-store.test.ts 2>&1 | tail -6
```
Expected: `4 passed`.

- [ ] **Step 5 : Suite + TypeScript**

Run:
```bash
npx vitest run 2>&1 | tail -4
npx tsc --noEmit 2>&1 | head -5
```
Expected: 479 verts (475 + 4), TypeScript clean.

- [ ] **Step 6 : Commit**

```bash
git add src/lib/services/documents-store.ts src/lib/services/__tests__/documents-store.test.ts
git commit -m "feat(documents-store): updateDocsByDocType helper + 4 tests

UPDATE en masse de documents filtré par entity_id + source_table + source_id
+ doc_type. Filtre optionnel onlyStatus pour le pattern mass-confirm legacy.

Remplace les UPDATE inline de TabConventionDocs.tsx:960, 1576 qui manquaient
entity_id (violation CLAUDE.md AR20)."
```

---

## Tâche 4 : Helper `updateDocsForOwner` + tests

**Files:**
- Modify: `src/lib/services/documents-store.ts`
- Modify: `src/lib/services/__tests__/documents-store.test.ts`

- [ ] **Step 1 : Ajouter les tests à la suite des précédents**

Ajouter à `src/lib/services/__tests__/documents-store.test.ts` :
```ts
import { updateDocsForOwner } from "@/lib/services/documents-store";

describe("updateDocsForOwner", () => {
  it("filtre par entity_id + source_table + source_id + owner_type + owner_id", async () => {
    const eqCalls: Array<{ col: string; val: unknown }> = [];
    function makeChain(): object {
      return {
        eq: vi.fn(function (col: string, val: unknown) {
          eqCalls.push({ col, val });
          return makeChain();
        }),
        select: vi.fn(() => Promise.resolve({ error: null, count: 2 })),
      };
    }
    const supabase = {
      from: vi.fn(() => ({ update: vi.fn(() => makeChain()) })),
    };
    const res = await updateDocsForOwner(
      supabase as never, "ENT-A", "SESS-1", "learner", "L-1",
      { is_confirmed: true },
    );
    expect(res.ok).toBe(true);
    expect(eqCalls).toContainEqual({ col: "entity_id", val: "ENT-A" });
    expect(eqCalls).toContainEqual({ col: "source_table", val: "sessions" });
    expect(eqCalls).toContainEqual({ col: "source_id", val: "SESS-1" });
    expect(eqCalls).toContainEqual({ col: "owner_type", val: "learner" });
    expect(eqCalls).toContainEqual({ col: "owner_id", val: "L-1" });
  });

  it("retourne erreur sur erreur Supabase", async () => {
    function makeChain(): object {
      return {
        eq: vi.fn(function () { return makeChain(); }),
        select: vi.fn(() => Promise.resolve({ error: { message: "err", code: "X" }, count: null })),
      };
    }
    const supabase = {
      from: vi.fn(() => ({ update: vi.fn(() => makeChain()) })),
    };
    const res = await updateDocsForOwner(
      supabase as never, "ENT-A", "SESS-1", "company", "C-1", { is_sent: true },
    );
    expect(res.ok).toBe(false);
  });

  it("supporte les 6 owner types", async () => {
    function makeChain(): object {
      return {
        eq: vi.fn(function () { return makeChain(); }),
        select: vi.fn(() => Promise.resolve({ error: null, count: 1 })),
      };
    }
    const supabase = { from: vi.fn(() => ({ update: vi.fn(() => makeChain()) })) };
    for (const ownerType of ["learner", "company", "trainer", "session", "client", "financier"] as const) {
      const res = await updateDocsForOwner(supabase as never, "ENT", "SESS", ownerType, "ID", {});
      expect(res.ok).toBe(true);
    }
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

Run:
```bash
npx vitest run src/lib/services/__tests__/documents-store.test.ts 2>&1 | tail -6
```
Expected: 3 nouveaux tests fail (`updateDocsForOwner` pas exportée).

- [ ] **Step 3 : Ajouter le helper**

À la fin de `src/lib/services/documents-store.ts`, ajouter :
```ts
export type OwnerType = "session" | "learner" | "company" | "trainer" | "client" | "financier";

/**
 * UPDATE en masse de documents pour un destinataire (owner) précis.
 * Filtre par entity_id + source_id (session) + owner_type + owner_id.
 *
 * Résout TabConventionDocs.tsx:1016, 1796.
 */
export async function updateDocsForOwner(
  supabase: SupabaseClient,
  entityId: string,
  sessionId: string,
  ownerType: OwnerType,
  ownerId: string,
  patch: Record<string, unknown>,
): Promise<ServiceResult<{ updated: number }>> {
  const { error, count } = await supabase
    .from("documents")
    .update(patch)
    .eq("entity_id", entityId)
    .eq("source_table", "sessions")
    .eq("source_id", sessionId)
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId)
    .select("id", { count: "exact", head: true });
  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return { ok: true, updated: count ?? 0 };
}
```

- [ ] **Step 4 : Vérifier**

Run:
```bash
npx vitest run src/lib/services/__tests__/documents-store.test.ts 2>&1 | tail -4
```
Expected: 7 passed (4 updateDocsByDocType + 3 updateDocsForOwner).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/services/documents-store.ts src/lib/services/__tests__/documents-store.test.ts
git commit -m "feat(documents-store): updateDocsForOwner helper + 3 tests

UPDATE en masse de documents pour 1 destinataire (owner) précis.
Filtre par entity_id + source_id (session) + owner_type + owner_id.

Remplace les UPDATE inline de TabConventionDocs.tsx:1016, 1796."
```

---

## Tâche 5 : Helper `getTemplateById` + tests

**Files:**
- Modify: `src/lib/services/documents-store.ts`
- Modify: `src/lib/services/__tests__/documents-store.test.ts`

- [ ] **Step 1 : Identifier l'interface `DocumentTemplate`**

Run:
```bash
grep -n "interface DocumentTemplate\|type DocumentTemplate" src/lib/types/ src/lib/services/documents-store.ts 2>/dev/null
```

Noter si l'interface est déjà exportée. Si non, vérifier les colonnes pertinentes en lisant `document_templates` dans `schema.sql`.

- [ ] **Step 2 : Ajouter les tests**

Ajouter à `src/lib/services/__tests__/documents-store.test.ts` :
```ts
import { getTemplateById } from "@/lib/services/documents-store";

describe("getTemplateById", () => {
  it("retourne le template si trouvé avec entity_id match", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({
          data: { id: "T-1", name: "Convention custom", type: "agreement", mode: "docx_fidelity", source_docx_url: "https://x/y.docx" },
          error: null,
        })),
      })),
    };
    const res = await getTemplateById(supabase as never, "ENT-A", "T-1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.template?.id).toBe("T-1");
      expect(res.template?.mode).toBe("docx_fidelity");
    }
  });

  it("retourne template null si pas trouvé (ou pas dans entity)", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      })),
    };
    const res = await getTemplateById(supabase as never, "ENT-A", "UNKNOWN");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.template).toBeNull();
  });

  it("retourne erreur sur erreur Supabase", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: null, error: { message: "DB error", code: "ERR" } })),
      })),
    };
    const res = await getTemplateById(supabase as never, "ENT-A", "T-1");
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 3 : Vérifier failing**

Run:
```bash
npx vitest run src/lib/services/__tests__/documents-store.test.ts 2>&1 | tail -6
```
Expected: 3 nouveaux tests fail.

- [ ] **Step 4 : Ajouter le helper**

```ts
export interface DocumentTemplate {
  id: string;
  name: string;
  type: string | null;
  content?: string | null;
  variables?: Record<string, unknown> | null;
  mode?: "editable" | "docx_fidelity" | null;
  source_docx_url?: string | null;
  default_for_doc_type?: string | null;
}

/**
 * SELECT un template par ID en filtrant par entity_id (défense en profondeur).
 *
 * Résout TabConventionDocs.tsx:508 qui fetchait par template_id seulement —
 * un attaquant connaissant l'UUID pouvait charger un template cross-tenant.
 */
export async function getTemplateById(
  supabase: SupabaseClient,
  entityId: string,
  templateId: string,
): Promise<ServiceResult<{ template: DocumentTemplate | null }>> {
  const { data, error } = await supabase
    .from("document_templates")
    .select("id, name, type, content, variables, mode, source_docx_url, default_for_doc_type")
    .eq("entity_id", entityId)
    .eq("id", templateId)
    .maybeSingle();
  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return { ok: true, template: (data as DocumentTemplate | null) ?? null };
}
```

Note : si une interface `DocumentTemplate` existe déjà ailleurs (`src/lib/types/`), réutiliser au lieu de redéfinir.

- [ ] **Step 5 : Vérifier**

```bash
npx vitest run src/lib/services/__tests__/documents-store.test.ts 2>&1 | tail -4
```
Expected: 10 passed.

- [ ] **Step 6 : Commit**

```bash
git add src/lib/services/documents-store.ts src/lib/services/__tests__/documents-store.test.ts
git commit -m "feat(documents-store): getTemplateById helper + 3 tests

SELECT template par id filtré par entity_id (défense en profondeur).
Résout TabConventionDocs.tsx:508 qui chargeait n'importe quel template
si l'UUID était connu (risque cross-tenant)."
```

---

## Tâche 6 : Helper `getLatestSignatureForDoc` + tests

**Files:**
- Modify: `src/lib/services/documents-store.ts`
- Modify: `src/lib/services/__tests__/documents-store.test.ts`

- [ ] **Step 1 : Tests**

Ajouter :
```ts
import { getLatestSignatureForDoc } from "@/lib/services/documents-store";

describe("getLatestSignatureForDoc", () => {
  it("retourne la signature si doc appartient à entityId", async () => {
    const fromCalls: string[] = [];
    const supabase = {
      from: vi.fn((table: string) => {
        fromCalls.push(table);
        if (table === "documents") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn(async () => ({ data: { id: "D-1" }, error: null })),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({
            data: { signer_name: "Jean Dupont", signed_at: "2026-05-25T10:00:00Z" },
            error: null,
          })),
        };
      }),
    };
    const res = await getLatestSignatureForDoc(supabase as never, "ENT-A", "D-1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.signature?.signer_name).toBe("Jean Dupont");
    }
    expect(fromCalls).toContain("documents");
    expect(fromCalls).toContain("document_signatures");
  });

  it("retourne signature: null si doc pas dans entityId", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      })),
    };
    const res = await getLatestSignatureForDoc(supabase as never, "ENT-A", "D-UNKNOWN");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.signature).toBeNull();
  });

  it("retourne signature: null si pas de signature", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "documents") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn(async () => ({ data: { id: "D-1" }, error: null })),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        };
      }),
    };
    const res = await getLatestSignatureForDoc(supabase as never, "ENT-A", "D-1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.signature).toBeNull();
  });
});
```

- [ ] **Step 2 : Failing check**

```bash
npx vitest run src/lib/services/__tests__/documents-store.test.ts 2>&1 | tail -6
```

- [ ] **Step 3 : Implémenter**

```ts
/**
 * SELECT la dernière signature pour un document.
 * Vérifie d'abord que le document appartient à entityId (défense en profondeur)
 * puis lit la signature depuis document_signatures.
 *
 * Résout TabConventionDocs.tsx:472.
 */
export async function getLatestSignatureForDoc(
  supabase: SupabaseClient,
  entityId: string,
  documentId: string,
): Promise<ServiceResult<{ signature: { signer_name: string | null; signed_at: string | null } | null }>> {
  // 1. Confirmer que le doc appartient à entityId
  const { data: doc } = await supabase
    .from("documents")
    .select("id")
    .eq("id", documentId)
    .eq("entity_id", entityId)
    .maybeSingle();
  if (!doc) return { ok: true, signature: null };

  // 2. Lire la signature
  const { data: sig, error } = await supabase
    .from("document_signatures")
    .select("signer_name, signed_at")
    .eq("document_id", documentId)
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return { ok: true, signature: sig ?? null };
}
```

- [ ] **Step 4 : Vérifier**

```bash
npx vitest run src/lib/services/__tests__/documents-store.test.ts 2>&1 | tail -4
```
Expected: 13 passed.

- [ ] **Step 5 : Suite complète + tsc**

```bash
npx vitest run 2>&1 | tail -4
npx tsc --noEmit 2>&1 | head -5
```
Expected: ≥ 488 verts, clean.

- [ ] **Step 6 : Commit**

```bash
git add src/lib/services/documents-store.ts src/lib/services/__tests__/documents-store.test.ts
git commit -m "feat(documents-store): getLatestSignatureForDoc helper + 3 tests

SELECT 2-step : (1) doc appartient à entityId, (2) signature depuis
document_signatures. Si doc cross-tenant ou pas de signature → signature: null.

Résout TabConventionDocs.tsx:472 qui chargeait n'importe quelle signature
si l'UUID du document était tamperé."
```

---

## Tâche 7 : Orchestrateur `batchSendDocsEmail`

**Files:**
- Modify: `src/lib/services/batch-email-handler.ts`

**⚠ CRITIQUE — Préserver le branchement template Word custom (mode docx_fidelity)**

- [ ] **Step 1 : Lire le contexte existant**

Read intégralement :
- `src/lib/services/batch-email-handler.ts` (~205 LOC) — comprend la structure de `RecipientGenerationTask` et `executeBatchEmailSend`
- `src/lib/services/email-attachments-resolver.ts` (focus sur `findDefaultOverride` + `convertDocxToPdfWithVariables`) — pattern à reproduire pour le branchement docx_fidelity

- [ ] **Step 2 : Lire 2-3 routes batch existantes pour comprendre le pattern**

Read :
- `src/app/api/documents/send-certificats-realisation-batch-email/route.ts` (139 LOC) — le pattern de référence
- `src/app/api/documents/send-conventions-batch-email/route.ts` (151 LOC) — variante company
- `src/app/api/documents/send-conventions-intervention-batch-email/route.ts` (172 LOC) — variante trainer

Identifier comment chaque route :
- Charge la session + ses relations
- Itère sur les destinataires (learners/companies/trainers selon le doc_type)
- Construit un `RecipientGenerationTask` avec `generatePdf()` lazy
- Appelle `executeBatchEmailSend`

- [ ] **Step 3 : Ajouter l'orchestrateur à `batch-email-handler.ts`**

Ajouter à la fin du fichier :
```ts
import { renderSystemTemplate, isValidDocType } from "@/lib/templates/registry";
import { resolveDocumentVariables, loadEntitySettings, type ResolveContext } from "@/lib/utils/resolve-variables";
import { DocumentGenerationService, createDefaultEngine } from "@/lib/services/document-generation";
import { convertDocxToPdfWithVariables } from "@/lib/services/docx-converter";

interface ResolvedDocType {
  ownerType: "learner" | "company" | "trainer" | "session";
  qualiopiBlocking: boolean;
  // Plus de champs selon registry
}

interface BatchSendDocsResult {
  ok: true;
  sent: number;
  failed: number;
  errors: Array<{ recipient: string; reason: string }>;
}
interface BatchSendDocsError {
  ok: false;
  error: { message: string; code?: string };
}

/**
 * Orchestrateur générique pour les routes /api/documents/send-{type}-batch-email
 * (Stories F1.x/F2.x).
 *
 * Pour un docType donné :
 *  1. Charge la session avec entity_id filter
 *  2. Charge les destinataires selon ownerType du registry (learner/company/trainer/session)
 *  3. Pour chaque destinataire, construit un RecipientGenerationTask qui :
 *     a. Vérifie si un template Word custom (mode=docx_fidelity, default_for_doc_type)
 *        existe → utilise convertDocxToPdfWithVariables
 *     b. Sinon → utilise le template HTML système via DocumentGenerationService
 *  4. Délègue à executeBatchEmailSend pour l'envoi par email + log email_history
 *
 * ⚠ CRITIQUE : le branchement docx_fidelity (3a) reproduit fidèlement la logique
 * de email-attachments-resolver.ts:findDefaultOverride() pour ne pas casser les
 * clients qui ont uploadé un template Word personnalisé.
 *
 * Retourne { sent, failed, errors[] } avec détail par destinataire.
 */
export async function batchSendDocsEmail(
  supabase: SupabaseClient,
  entityId: string,
  sessionId: string,
  docType: string,
): Promise<BatchSendDocsResult | BatchSendDocsError> {
  // ATTENTION : voir la note ⚠ ci-dessus. Cette fonction doit reproduire
  // fidèlement la logique de génération de PDF utilisée dans les routes
  // generate-*-batch existantes ET le branchement docx_fidelity de
  // email-attachments-resolver.ts. À implémenter avec soin.
  
  // 1. Charger session + check entity_id
  const { data: session, error: sessErr } = await supabase
    .from("sessions")
    .select("*, training:trainings(*)")
    .eq("id", sessionId)
    .eq("entity_id", entityId)
    .single();
  if (sessErr || !session) {
    return { ok: false, error: { message: sessErr?.message ?? "Session introuvable" } };
  }

  // 2. Résoudre ownerType depuis le registry
  const registry = await import("@/lib/templates/registry");
  const tpl = registry.SYSTEM_TEMPLATES_BY_DOC_TYPE[docType];
  if (!tpl) {
    return { ok: false, error: { message: `Doc_type inconnu : ${docType}` } };
  }
  const ownerType = tpl.ownerType;

  // 3. Charger les destinataires selon ownerType
  const recipients = await loadRecipientsByOwnerType(supabase, sessionId, ownerType);
  if (recipients.length === 0) {
    return { ok: true, sent: 0, failed: 0, errors: [] };
  }

  // 4. Charger entité settings (logo, branding) pour les templates HTML
  const entitySettings = await loadEntitySettings(supabase, entityId);

  // 5. Vérifier s'il existe un template Word custom (docx_fidelity) pour ce doc_type
  const { data: customTpl } = await supabase
    .from("document_templates")
    .select("source_docx_url")
    .eq("entity_id", entityId)
    .eq("default_for_doc_type", docType)
    .eq("mode", "docx_fidelity")
    .maybeSingle();
  const customDocxUrl = customTpl?.source_docx_url ?? null;

  // 6. Construire les RecipientGenerationTask
  const tasks: RecipientGenerationTask[] = recipients.map((recipient) => ({
    ownerId: recipient.id,
    ownerName: recipient.name,
    ownerEmail: recipient.email,
    emailSubject: buildEmailSubject(docType, session, recipient),
    generatePdf: async (): Promise<Buffer> => {
      const variables = await resolveDocumentVariables(supabase, {
        session: session as Session,
        learner: ownerType === "learner" ? (recipient as unknown as Learner) : undefined,
        company: ownerType === "company" ? (recipient as unknown as Client) : undefined,
        trainer: ownerType === "trainer" ? (recipient as unknown as Trainer) : undefined,
        entitySettings,
      });

      // 6a. Branchement docx_fidelity prioritaire si template custom existe
      if (customDocxUrl) {
        const pdf = await convertDocxToPdfWithVariables(customDocxUrl, variables);
        return pdf.buffer;
      }

      // 6b. Sinon, template HTML système
      const html = renderSystemTemplate(docType, variables);
      const engine = createDefaultEngine();
      const generator = new DocumentGenerationService(engine);
      return await generator.generatePdfFromHtml(html, docType);
    },
  }));

  // 7. Déléguer à executeBatchEmailSend
  return await executeBatchEmailSend({
    supabase,
    entityId,
    sessionId,
    docType,
    tasks,
  });
}

/**
 * Charge les destinataires d'une session selon ownerType.
 * Pattern interne — pas exporté.
 */
async function loadRecipientsByOwnerType(
  supabase: SupabaseClient,
  sessionId: string,
  ownerType: "learner" | "company" | "trainer" | "session",
): Promise<Array<{ id: string; name: string; email: string | null }>> {
  if (ownerType === "learner") {
    const { data } = await supabase
      .from("enrollments")
      .select("learner:learners(id, email, first_name, last_name)")
      .eq("session_id", sessionId)
      .in("status", ["registered", "confirmed", "completed"]);
    return (data ?? [])
      .map((row) => {
        const l = (row.learner as unknown as { id: string; email: string | null; first_name: string; last_name: string } | null);
        return l ? { id: l.id, name: `${l.first_name} ${l.last_name}`, email: l.email } : null;
      })
      .filter((x): x is { id: string; name: string; email: string | null } => x !== null);
  }
  if (ownerType === "company") {
    const { data } = await supabase
      .from("formation_companies")
      .select("client_id, email, client:clients(id, company_name)")
      .eq("session_id", sessionId);
    return (data ?? [])
      .map((row) => {
        const c = (row.client as unknown as { id: string; company_name: string } | null);
        return c ? { id: c.id, name: c.company_name, email: (row.email as string) ?? null } : null;
      })
      .filter((x): x is { id: string; name: string; email: string | null } => x !== null);
  }
  if (ownerType === "trainer") {
    const { data } = await supabase
      .from("formation_trainers")
      .select("trainer:trainers(id, email, first_name, last_name)")
      .eq("session_id", sessionId);
    return (data ?? [])
      .map((row) => {
        const t = (row.trainer as unknown as { id: string; email: string | null; first_name: string; last_name: string } | null);
        return t ? { id: t.id, name: `${t.first_name} ${t.last_name}`, email: t.email } : null;
      })
      .filter((x): x is { id: string; name: string; email: string | null } => x !== null);
  }
  // ownerType === "session" : on envoie à TOUS les apprenants inscrits (cas CGV, RGPD, etc.)
  return loadRecipientsByOwnerType(supabase, sessionId, "learner");
}

function buildEmailSubject(docType: string, session: { title: string }, _recipient: { name: string }): string {
  const labels: Record<string, string> = {
    cgv: "Conditions Générales de Vente",
    reglement_interieur: "Règlement intérieur",
    politique_confidentialite: "Politique de confidentialité",
    planning_semaine: "Planning hebdomadaire",
    bilan_poe: "Bilan POE",
    // ... à compléter par doc_type
  };
  const label = labels[docType] ?? docType;
  return `${label} — ${session.title}`;
}
```

**Note** : ce code utilise certains symboles (`SYSTEM_TEMPLATES_BY_DOC_TYPE`, `DocumentGenerationService`, etc.) qui doivent exister dans la codebase. Vérifier les imports lors de l'implémentation et adapter si nécessaire (ex: si `renderSystemTemplate` a une signature différente).

- [ ] **Step 4 : Vérifier compilation + tests**

Run:
```bash
npx tsc --noEmit 2>&1 | head -10
npx vitest run 2>&1 | tail -4
```
Expected: clean, 488 verts (pas de nouveaux tests dans cette tâche — c'est un service intégré qui sera validé par les tests des routes en aval).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/services/batch-email-handler.ts
git commit -m "feat(batch-email): orchestrateur batchSendDocsEmail (Stories F1.x/F2.x)

Service unifié qui :
- Charge session + check entity_id
- Résout ownerType via registry système (source unique)
- Charge destinataires selon ownerType (learner/company/trainer/session)
- Vérifie branchement template Word custom (mode=docx_fidelity,
  default_for_doc_type) → convertDocxToPdfWithVariables
- Sinon génère PDF depuis template HTML système
- Délègue à executeBatchEmailSend existant pour l'envoi + log

Préserve fidèlement le branchement docx_fidelity de email-attachments-resolver
pour ne pas casser les clients qui ont uploadé un template Word personnalisé.

Sera consommé par 15 routes thin-wrapper (Tâches 8-12)."
```

---

## Tâche 8 : 3 routes batch email — Pack F1.x partie 1 (cgv, reglement_interieur, politique_confidentialite)

**Files:**
- Create: `src/app/api/documents/send-cgv-batch-email/route.ts`
- Create: `src/app/api/documents/send-reglement-interieur-batch-email/route.ts`
- Create: `src/app/api/documents/send-politique-confidentialite-batch-email/route.ts`

**Pattern** : Toutes les routes suivent strictement le même template (basé sur `send-certificats-realisation-batch-email/route.ts`). Différence : la 4ᵉ valeur passée à `batchSendDocsEmail` (le `docType`).

- [ ] **Step 1 : Créer `send-cgv-batch-email/route.ts`**

```ts
import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import { batchSendDocsEmail } from "@/lib/services/batch-email-handler";

/**
 * POST /api/documents/send-cgv-batch-email
 *
 * Envoie les Conditions Générales de Vente à tous les apprenants inscrits.
 * Story F1.x.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles").select("id, entity_id, role").eq("id", user.id).single();
    if (!profile?.entity_id) return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    if (!["admin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    const body = (await request.json()) as { sessionId?: string };
    if (!body.sessionId) return NextResponse.json({ error: "sessionId est obligatoire" }, { status: 400 });

    const result = await batchSendDocsEmail(supabase, profile.entity_id, body.sessionId, "cgv");
    if (!result.ok) return NextResponse.json({ error: result.error.message }, { status: 500 });
    return NextResponse.json({ success: true, sent: result.sent, failed: result.failed, errors: result.errors });
  } catch (err: unknown) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
```

- [ ] **Step 2 : Créer `send-reglement-interieur-batch-email/route.ts`**

Identique à Step 1 mais remplacer :
- Commentaire JSDoc → « Envoie le Règlement Intérieur à tous les apprenants inscrits. Story F1.x. »
- `batchSendDocsEmail(supabase, profile.entity_id, body.sessionId, "cgv")` → `..., "reglement_interieur")`

- [ ] **Step 3 : Créer `send-politique-confidentialite-batch-email/route.ts`**

Idem avec `"politique_confidentialite"` + commentaire « Envoie la Politique de Confidentialité à tous les apprenants inscrits. Story F1.x. »

- [ ] **Step 4 : Vérifier tsc + tests**

```bash
npx tsc --noEmit 2>&1 | head -10
npx vitest run 2>&1 | tail -4
```
Expected: clean, 488 verts.

- [ ] **Step 5 : Commit**

```bash
git add src/app/api/documents/send-cgv-batch-email/ src/app/api/documents/send-reglement-interieur-batch-email/ src/app/api/documents/send-politique-confidentialite-batch-email/
git commit -m "feat(api): 3 routes batch email Story F1.x (CGV, RI, RGPD)

Pattern strict mirror de send-certificats-realisation-batch-email :
auth admin/super_admin + entity_id + delegation à batchSendDocsEmail.
Diffèrent uniquement par la valeur du docType passée."
```

---

## Tâche 9 : 3 routes batch email — Pack F1.x partie 2 (planning_semaine, feuille_emargement_vierge, bilan_poe)

**Files:**
- Create: `src/app/api/documents/send-planning-semaine-batch-email/route.ts`
- Create: `src/app/api/documents/send-feuille-emargement-vierge-batch-email/route.ts`
- Create: `src/app/api/documents/send-bilans-poe-batch-email/route.ts`

- [ ] **Step 1 : Créer les 3 routes** (pattern identique à Tâche 8)

Pour chaque route, créer un fichier `route.ts` avec EXACTEMENT le même template que Tâche 8 Step 1 mais en changeant :
- Le chemin du fichier
- Le commentaire JSDoc (selon le label)
- La 4ᵉ valeur passée à `batchSendDocsEmail` :
  - `send-planning-semaine-batch-email` → `"planning_semaine"` ; JSDoc : « Envoie le planning hebdomadaire »
  - `send-feuille-emargement-vierge-batch-email` → `"feuille_emargement_vierge"` ; JSDoc : « Envoie une feuille d'émargement vierge »
  - `send-bilans-poe-batch-email` → `"bilan_poe"` ; JSDoc : « Envoie les bilans POE. Story F2.x. »

- [ ] **Step 2 : Vérifier tsc + tests**

```bash
npx tsc --noEmit 2>&1 | head -10
npx vitest run 2>&1 | tail -4
```

- [ ] **Step 3 : Commit**

```bash
git add src/app/api/documents/send-planning-semaine-batch-email/ src/app/api/documents/send-feuille-emargement-vierge-batch-email/ src/app/api/documents/send-bilans-poe-batch-email/
git commit -m "feat(api): 3 routes batch email — planning hebdo + émargement vierge + bilan POE

Pattern strict — délégation à batchSendDocsEmail avec docType respectif."
```

---

## Tâche 10 : 3 routes batch email — Pack F2.x partie 1 (questionnaires)

**Files:**
- Create: `src/app/api/documents/send-reponses-evaluations-batch-email/route.ts`
- Create: `src/app/api/documents/send-reponses-satisfaction-batch-email/route.ts`
- Create: `src/app/api/documents/send-resultats-evaluations-batch-email/route.ts`

- [ ] **Step 1 : Créer les 3 routes** (pattern identique)

Chacune avec son `docType` :
- `send-reponses-evaluations-batch-email` → `"reponses_evaluations"` ; JSDoc : « Envoie les réponses aux évaluations. Story F2.x. »
- `send-reponses-satisfaction-batch-email` → `"reponses_satisfaction_session"` ; JSDoc : « Envoie les réponses aux questionnaires de satisfaction. Story F2.x. »
- `send-resultats-evaluations-batch-email` → `"resultats_evaluations"` ; JSDoc : « Envoie les résultats des évaluations. Story F2.x. »

- [ ] **Step 2 : Vérifier**

```bash
npx tsc --noEmit 2>&1 | head -5
npx vitest run 2>&1 | tail -4
```

- [ ] **Step 3 : Commit**

```bash
git add src/app/api/documents/send-reponses-evaluations-batch-email/ src/app/api/documents/send-reponses-satisfaction-batch-email/ src/app/api/documents/send-resultats-evaluations-batch-email/
git commit -m "feat(api): 3 routes batch email — questionnaires (réponses éval, satisfaction, résultats)"
```

---

## Tâche 11 : 3 routes batch email — Pack F2.x partie 2 (attestations métier)

**Files:**
- Create: `src/app/api/documents/send-attestations-aipr-batch-email/route.ts`
- Create: `src/app/api/documents/send-attestations-competences-batch-email/route.ts`
- Create: `src/app/api/documents/send-attestations-abandon-batch-email/route.ts`

- [ ] **Step 1 : Créer les 3 routes** (pattern identique)

- `send-attestations-aipr-batch-email` → `"attestation_aipr"` ; JSDoc : « Envoie les attestations AIPR. Story F2.x. »
- `send-attestations-competences-batch-email` → `"attestation_competences"` ; JSDoc : « Envoie les attestations de compétences. Story F2.x. »
- `send-attestations-abandon-batch-email` → `"attestation_abandon_formation"` ; JSDoc : « Envoie les attestations d'abandon de formation. Story F2.x. »

- [ ] **Step 2-3 : Vérifier + Commit**

```bash
npx tsc --noEmit 2>&1 | head -5
git add src/app/api/documents/send-attestations-aipr-batch-email/ src/app/api/documents/send-attestations-competences-batch-email/ src/app/api/documents/send-attestations-abandon-batch-email/
git commit -m "feat(api): 3 routes batch email — attestations (AIPR, compétences, abandon)"
```

---

## Tâche 12 : 3 routes batch email — Pack F2.x partie 3 (certificats + habilitation électrique)

**Files:**
- Create: `src/app/api/documents/send-certificats-travail-hauteur-batch-email/route.ts`
- Create: `src/app/api/documents/send-certificats-diplome-batch-email/route.ts`
- Create: `src/app/api/documents/send-avis-habilitation-electrique-batch-email/route.ts` (variante : accepte doc_type dans body)

- [ ] **Step 1 : Créer `send-certificats-travail-hauteur-batch-email`**

Pattern standard avec `"certificat_travail_hauteur"`. JSDoc : « Envoie les certificats de travail en hauteur. Story F2.x. »

- [ ] **Step 2 : Créer `send-certificats-diplome-batch-email`**

Pattern standard avec `"certificat_diplome"`. JSDoc : « Envoie les certificats de diplôme. Story F2.x. »

- [ ] **Step 3 : Créer `send-avis-habilitation-electrique-batch-email` (variante avec body Zod enum)**

Cette route accepte le doc_type spécifique (9 variantes) dans le body :

```ts
import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { batchSendDocsEmail } from "@/lib/services/batch-email-handler";

const Body = z.object({
  sessionId: z.string().uuid(),
  docType: z.enum([
    "avis_hab_elec_generique",
    "avis_hab_elec_b0_bf_bs",
    "avis_hab_elec_b1v_b2v_br",
    "avis_hab_elec_bf_hf",
    "avis_hab_elec_bt",
    "avis_hab_elec_bt_ht",
    "avis_hab_elec_h0_b0",
    "avis_hab_elec_h0_b0_bf_hf_bs",
    "avis_hab_elec_h0_b0_initial",
  ]),
});

/**
 * POST /api/documents/send-avis-habilitation-electrique-batch-email
 *
 * Envoie les avis d'habilitation électrique à tous les apprenants inscrits.
 * Story F2.x. La variante spécifique (B0_BF_BS, B1V_B2V_BR, BT, etc.) est
 * passée dans le body — une seule route couvre les 9 variantes.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles").select("id, entity_id, role").eq("id", user.id).single();
    if (!profile?.entity_id) return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    if (!["admin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Body invalide" }, { status: 400 });
    }

    const result = await batchSendDocsEmail(
      supabase, profile.entity_id, parsed.data.sessionId, parsed.data.docType,
    );
    if (!result.ok) return NextResponse.json({ error: result.error.message }, { status: 500 });
    return NextResponse.json({ success: true, sent: result.sent, failed: result.failed, errors: result.errors });
  } catch (err: unknown) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
```

- [ ] **Step 4 : Vérifier + Commit**

```bash
npx tsc --noEmit 2>&1 | head -5
npx vitest run 2>&1 | tail -4
git add src/app/api/documents/send-certificats-travail-hauteur-batch-email/ src/app/api/documents/send-certificats-diplome-batch-email/ src/app/api/documents/send-avis-habilitation-electrique-batch-email/
git commit -m "feat(api): 3 routes batch email — certificats hauteur/diplôme + habilitation électrique

send-avis-habilitation-electrique-batch-email accepte doc_type dans le body
(Zod enum strict sur les 9 variantes) — 1 route couvre les 9, évite la
duplication."
```

---

## Tâche 13 : Update `BATCH_SEND_ENDPOINTS` dans `batch-doc-send.ts`

**Files:**
- Modify: `src/lib/utils/batch-doc-send.ts`

- [ ] **Step 1 : Lire le fichier existant**

```bash
cat src/lib/utils/batch-doc-send.ts
```

Identifier la constante `BATCH_SEND_ENDPOINTS` et son format actuel.

- [ ] **Step 2 : Ajouter les 15 nouveaux doc_types**

Étendre `BATCH_SEND_ENDPOINTS` avec les nouveaux mappings :

```ts
// Existants (à conserver)
certificat_realisation: "send-certificats-realisation-batch-email",
attestation_assiduite: "send-attestations-assiduite-batch-email",
convention_entreprise: "send-conventions-batch-email",
feuille_emargement: "send-emargements-individuels-batch-email",
convention_intervention: "send-conventions-intervention-batch-email",
convocation: "send-convocations-batch-email",

// Nouveaux (Stories F1.x/F2.x)
cgv: "send-cgv-batch-email",
reglement_interieur: "send-reglement-interieur-batch-email",
politique_confidentialite: "send-politique-confidentialite-batch-email",
planning_semaine: "send-planning-semaine-batch-email",
feuille_emargement_vierge: "send-feuille-emargement-vierge-batch-email",
bilan_poe: "send-bilans-poe-batch-email",
reponses_evaluations: "send-reponses-evaluations-batch-email",
reponses_satisfaction_session: "send-reponses-satisfaction-batch-email",
resultats_evaluations: "send-resultats-evaluations-batch-email",
attestation_aipr: "send-attestations-aipr-batch-email",
attestation_competences: "send-attestations-competences-batch-email",
attestation_abandon_formation: "send-attestations-abandon-batch-email",
certificat_travail_hauteur: "send-certificats-travail-hauteur-batch-email",
certificat_diplome: "send-certificats-diplome-batch-email",
// Habilitation électrique : 1 route pour 9 variantes
avis_hab_elec_generique: "send-avis-habilitation-electrique-batch-email",
avis_hab_elec_b0_bf_bs: "send-avis-habilitation-electrique-batch-email",
avis_hab_elec_b1v_b2v_br: "send-avis-habilitation-electrique-batch-email",
avis_hab_elec_bf_hf: "send-avis-habilitation-electrique-batch-email",
avis_hab_elec_bt: "send-avis-habilitation-electrique-batch-email",
avis_hab_elec_bt_ht: "send-avis-habilitation-electrique-batch-email",
avis_hab_elec_h0_b0: "send-avis-habilitation-electrique-batch-email",
avis_hab_elec_h0_b0_bf_hf_bs: "send-avis-habilitation-electrique-batch-email",
avis_hab_elec_h0_b0_initial: "send-avis-habilitation-electrique-batch-email",
```

**Important** : `hasBatchSendEndpoint(docType)` doit retourner `true` pour les ≥ 30 doc_types (6 existants + 15 nouveaux mappings + 9 variantes habilitation pointant vers la même route).

- [ ] **Step 3 : Si la fonction `sendBatchEmail` doit aussi être adaptée pour passer `doc_type` dans le body de habilitation électrique**

Vérifier la signature actuelle de `sendBatchEmail`. Si elle envoie juste `{ sessionId }` au lieu de `{ sessionId, docType }`, étendre pour passer aussi le docType (utile pour les 9 variantes habilitation).

- [ ] **Step 4 : Vérifier**

```bash
npx tsc --noEmit 2>&1 | head -5
npx vitest run 2>&1 | tail -4
```

- [ ] **Step 5 : Commit**

```bash
git add src/lib/utils/batch-doc-send.ts
git commit -m "feat(batch-doc-send): BATCH_SEND_ENDPOINTS enrichi (21 doc_types couverts)

Mapping étendu avec les 15 nouveaux doc_types des Stories F1.x/F2.x + les
9 variantes d'habilitation électrique (qui pointent vers une route unique).
hasBatchSendEndpoint() retourne désormais true pour ≥ 30 doc_types."
```

---

## Tâche 14 : Refactor TabConventionDocs — Volet B (casts) + Volet C (robustesse)

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx`

**Note** : Cette tâche est la plus délicate du chantier (gros fichier 2101 LOC, multiples modifications ciblées). Procéder section par section.

- [ ] **Step 1 : Retirer les 3 casts `as unknown as string[]` (lignes 1629, 1643, 1657)**

Localiser les 3 sites :
```bash
grep -n "as unknown as string\[\]" src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabConventionDocs.tsx
```

Pour chacun, retirer `as unknown as string[]` :
```tsx
// Avant
docTypes={DEFAULT_LEARNER_DOCS as unknown as string[]}

// Après (la signature DocMatrixSection.docTypes a été élargie en Tâche 2)
docTypes={DEFAULT_LEARNER_DOCS}
```

Idem pour `DEFAULT_COMPANY_DOCS` et `DEFAULT_TRAINER_DOCS`.

- [ ] **Step 2 : Traiter le cast `signer_email` ligne 1140**

Selon l'investigation de Tâche 1 Step 3 :

**Si `signer_email` existe dans une jointure** (ex: `getDocsForSession` le charge déjà), supprimer le cast :
```tsx
// Avant
const signerEmail = (doc as unknown as Record<string, string>).signer_email;

// Après (le type FormationConventionDocument.signer_email? a été ajouté en Tâche 2)
const signerEmail = doc.signer_email;
```

**Si `signer_email` est dead code** (pas en BDD), retirer le tooltip + le cast :
```tsx
// Avant
return <span title={signerEmail ? `Envoyé à ${signerEmail}` : "Envoyé pour signature"}>En attente</span>;

// Après
return <span title="Envoyé pour signature">En attente</span>;
```

Vérifier ensuite :
```bash
grep -n "as unknown as" src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabConventionDocs.tsx
```
Expected: 0 résultat.

- [ ] **Step 3 : `await onRefresh()` partout (14 sites)**

Localiser les sites :
```bash
grep -nE "^[[:space:]]+onRefresh\(\);" src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabConventionDocs.tsx
```

Pour chaque occurrence (estimées aux lignes 596, 610, 628, 722, 800, 856, 972, 1009, 1028, 1059, 1101, 1127, 1854, 2096), ajouter `await` devant.

Si la fonction englobante n'est pas `async`, la rendre `async`.

Re-run :
```bash
grep -nE "^[[:space:]]+onRefresh\(\);" src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabConventionDocs.tsx
```
Expected: 0 résultat.

- [ ] **Step 4 : Try/catch sur `handleMassConfirm` (L958) — sera réécrit en Tâche 15 via helper**

Pour cette tâche, juste ajouter try/catch autour de l'UPDATE inline :
```tsx
const handleMassConfirm = async (docType: string) => {
  setSaving(`confirm-all-${docType}`);
  try {
    const { error } = await supabase.from("documents")
      .update({ is_confirmed: true })
      .eq("source_table", "sessions")
      .eq("source_id", formation.id)
      .eq("doc_type", docType)
      .eq("status", "draft");
    if (error) throw error;
    toast({ title: "Documents figés" });
    await onRefresh();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur";
    toast({ title: "Erreur", description: message, variant: "destructive" });
  } finally {
    setSaving(null);
  }
};
```

Note : la Tâche 15 remplacera la query inline par `updateDocsByDocType` (avec entity_id filter).

- [ ] **Step 5 : Try/catch sur `handleConfirmAllForOwner` (L1013) — sera réécrit en Tâche 15**

Pattern identique au Step 4.

- [ ] **Step 6 : Compteur `failed++` dans `catch {}` ligne 844**

Localiser le `catch {}` vide dans `handleMassSendWithPDF()` :
```bash
grep -n "} catch {" src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabConventionDocs.tsx | head -5
```

Modifier ligne 844 :
```tsx
// Avant
} catch { /* swallow */ }

// Après
} catch {
  failed++;
}
```

- [ ] **Step 7 : Toast sur `console.error` ligne 427 (`initializeDefaultDocs`)**

Localiser :
```bash
grep -n "console.error.*initializeDefaultDocs\|insert error" src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabConventionDocs.tsx
```

Ajouter un toast d'erreur après le console.error :
```tsx
} catch (err) {
  console.error("[initializeDefaultDocs] insert error:", err);
  toast({
    title: "Erreur",
    description: "Impossible de créer les documents par défaut",
    variant: "destructive",
  });
}
```

- [ ] **Step 8 : Toast sur `console.error` ligne 1096 (`handleAssignTemplateToAll`)**

```tsx
} catch (err: unknown) {
  console.error("[handleAssignTemplateToAll] upsert failed:", err);
  const message = err instanceof Error ? err.message : "Échec de l'attribution";
  toast({ title: "Erreur", description: message, variant: "destructive" });
}
```

- [ ] **Step 9 : Vérifier tsc + tests**

```bash
npx tsc --noEmit 2>&1 | head -10
npx vitest run 2>&1 | tail -4
```
Expected: clean, ≥ 488 verts.

- [ ] **Step 10 : Commit**

```bash
git add src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/ src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabConventionDocs.tsx
git commit -m "refactor(tab-convention-docs): Volet B (casts) + Volet C (robustesse)

- Retrait des 4 casts as unknown as (3 string[] sur DocMatrixSection.docTypes
  + 1 Record<string, string> sur signer_email selon investigation Tâche 1)
- await onRefresh() partout (14 sites — M1)
- try/catch sur handleMassConfirm + handleConfirmAllForOwner (M2)
- Compteur failed++ dans catch vide ligne 844 (M3)
- Toasts d'erreur sur les 2 console.error des lignes 427 + 1096 (M4)

Tâche 15 finalisera Volet A : migration vers les 4 helpers documents-store
avec entity_id filter."
```

---

## Tâche 15 : Refactor TabConventionDocs — Volet A (migration vers helpers + entity_id)

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx`

**⚠ Cette tâche résout les 6 bugs critiques de sécurité multi-tenant.**

- [ ] **Step 1 : Importer les 4 helpers**

En tête du fichier (déjà import depuis `documents-store`, étendre la liste) :
```tsx
import {
  getDocKeysForSession,
  insertDocs,
  upsertDocsIgnoreDuplicates,
  markDocConfirmed,
  unmarkDocConfirmed,
  markDocSent,
  // Nouveaux helpers (Volet A)
  updateDocsByDocType,
  updateDocsForOwner,
  getTemplateById,
  getLatestSignatureForDoc,
} from "@/lib/services/documents-store";
```

- [ ] **Step 2 : Migrer le SELECT `document_templates` ligne 508 (B2)**

Localiser le pattern dans `generateDocHtml` :
```bash
grep -nA 5 'from("document_templates")' src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabConventionDocs.tsx
```

Remplacer le `supabase.from("document_templates").select(...).eq("id", doc.template_id).single()` par :
```tsx
const tplResult = await getTemplateById(supabase, formation.entity_id, doc.template_id);
if (!tplResult.ok || !tplResult.template) {
  // gérer le cas pas trouvé / erreur
  return null;
}
const tpl = tplResult.template;
```

Adapter le reste du code qui consomme `tpl` (les champs `content`, `variables`, `mode`, `source_docx_url` existent dans l'interface `DocumentTemplate`).

- [ ] **Step 3 : Migrer le SELECT `document_signatures` ligne 472 (B3)**

Remplacer le `supabase.from("document_signatures").select(...).eq("document_id", doc.id).order(...).limit(1)` par :
```tsx
const sigResult = await getLatestSignatureForDoc(supabase, formation.entity_id, doc.id);
const signature = sigResult.ok ? sigResult.signature : null;
```

- [ ] **Step 4 : Migrer `handleMassConfirm` (L958) vers `updateDocsByDocType`**

Réécrire le handler :
```tsx
const handleMassConfirm = async (docType: string) => {
  setSaving(`confirm-all-${docType}`);
  const result = await updateDocsByDocType(
    supabase, formation.entity_id, formation.id, docType,
    { is_confirmed: true },
    { onlyStatus: "draft" },
  );
  setSaving(null);
  if (!result.ok) {
    toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
    return;
  }
  toast({ title: `${result.updated} documents figés` });
  await onRefresh();
};
```

- [ ] **Step 5 : Migrer `handleConfirmAllForOwner` (L1013) vers `updateDocsForOwner`**

```tsx
const handleConfirmAllForOwner = async (ownerType: OwnerType, ownerId: string) => {
  setSaving(`confirm-all-owner-${ownerId}`);
  const result = await updateDocsForOwner(
    supabase, formation.entity_id, formation.id, ownerType, ownerId,
    { is_confirmed: true },
  );
  setSaving(null);
  if (!result.ok) {
    toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
    return;
  }
  toast({ title: `${result.updated} documents figés` });
  await onRefresh();
};
```

- [ ] **Step 6 : Migrer les 2 UPDATE inline restants (L1576, L1796) vers les helpers**

Localiser :
```bash
grep -nE 'supabase\.from\("documents"\)\.update' src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabConventionDocs.tsx
```

Pour chaque occurrence, remplacer par `updateDocsByDocType` ou `updateDocsForOwner` selon le filtre utilisé. Si le filtre n'est pas exactement `doc_type` ou `owner_type+owner_id`, escalade (cas non couvert par les helpers — soit créer un nouveau helper, soit utiliser le helper le plus proche avec un patch ciblé).

- [ ] **Step 7 : Audit transverse — plus d'inline Supabase**

```bash
grep -nE 'supabase\.from\("(documents|document_templates|document_signatures)"\)' src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabConventionDocs.tsx
```
Expected: 0 résultat.

- [ ] **Step 8 : Vérifier**

```bash
npx tsc --noEmit 2>&1 | head -10
npx vitest run 2>&1 | tail -4
```
Expected: clean, 488 verts.

- [ ] **Step 9 : Commit**

```bash
git add src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabConventionDocs.tsx
git commit -m "refactor(tab-convention-docs): migration vers helpers documents-store (Volet A)

Résout les 6 bugs critiques de sécurité multi-tenant :
- 5 documents.update() inline → updateDocsByDocType / updateDocsForOwner
  (avec entity_id filter — résout B1)
- 1 document_templates.select() inline → getTemplateById
  (avec entity_id filter — résout B2)
- 1 document_signatures.select() inline → getLatestSignatureForDoc
  (check 2-step doc.entity_id — résout B3)

Plus aucun appel Supabase inline sur les 3 tables sensibles. Toutes les
mutations passent désormais par documents-store avec filtres explicites."
```

---

## Tâche 16 : Retrait des fallbacks client-side (TODOs Story F.x)

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx`

- [ ] **Step 1 : Localiser les fallback blocks**

```bash
grep -nB 3 -A 30 "TODO Story F" src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabConventionDocs.tsx
```

- [ ] **Step 2 : Simplifier `handleMassSendWithPDF` (L769)**

Le pattern actuel ressemble à :
```tsx
const handleMassSendWithPDF = async (ownerType: string, docType: string) => {
  setMassSending(`${ownerType}-${docType}`);
  try {
    if (hasBatchSendEndpoint(docType)) {
      // Route server-side optimisée
      const result = await sendBatchEmail({ docType, sessionId: formation.id });
      // ... gestion du résultat
    } else {
      // TODO Story F2.x : migrer les doc_types restants
      // Fallback boucle client 800ms × N
      // ...
    }
  } finally {
    setMassSending(null);
  }
};
```

Avec `hasBatchSendEndpoint(docType)` retournant désormais `true` pour TOUS les doc_types listés (Tâche 13), le bloc `else` (fallback client) devient inatteignable. Le retirer entièrement :

```tsx
const handleMassSendWithPDF = async (ownerType: string, docType: string) => {
  setMassSending(`${ownerType}-${docType}`);
  try {
    // Toutes les routes batch sont serveur-side après Stories F1.x/F2.x.
    const result = await sendBatchEmail({ docType, sessionId: formation.id });
    if (result.ok) {
      toast({
        title: `${result.sent} email(s) envoyé(s)`,
        description: result.failed > 0 ? `${result.failed} échec(s)` : undefined,
        variant: result.failed > 0 ? "destructive" : "default",
      });
      await onRefresh();
    } else {
      toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
    }
  } finally {
    setMassSending(null);
  }
};
```

**Note** : si `sendBatchEmail` n'a pas exactement la signature attendue (retour `{ ok, sent, failed, error }`), adapter en conséquence.

- [ ] **Step 3 : Simplifier `handleDownloadAllPDF` (L861)**

Pattern identique : si `hasBatchEndpoint(docType)` est désormais toujours `true`, retirer le fallback client.

**Note importante** : `hasBatchEndpoint` pointe vers `generate-*-batch` (ZIP), pas `send-*-batch-email`. Vérifier dans `batch-doc-download.ts` que les ZIP server-side existent pour les 15 nouveaux doc_types. Si NON, garder le fallback client pour les doc_types non couverts → ne pas retirer aveuglément.

Adapter selon ce que `hasBatchEndpoint` couvre. Document le résultat dans le commit.

- [ ] **Step 4 : Retirer les 2 TODOs Story F.x**

```bash
grep -n "TODO Story F" src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabConventionDocs.tsx
```
Expected: 0 résultat après le retrait des fallbacks.

- [ ] **Step 5 : Vérifier**

```bash
npx tsc --noEmit 2>&1 | head -10
npx vitest run 2>&1 | tail -4
```

- [ ] **Step 6 : Commit**

```bash
git add src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabConventionDocs.tsx
git commit -m "refactor(tab-convention-docs): retrait des fallbacks client-side (Stories F.x résolues)

handleMassSendWithPDF et handleDownloadAllPDF utilisent désormais
exclusivement les routes server-side batch (BATCH_SEND_ENDPOINTS couvre les
21 doc_types). Suppression des boucles client 600-800ms × N et des 2 TODOs
Story F1.x/F2.x identifiés dans le deep-dive.

Bénéfice UX : plus de blocage navigateur sur les grosses sessions.

Note : si hasBatchEndpoint (ZIP) ne couvre pas encore tous les doc_types,
le fallback client reste pour le ZIP (audit séparé)."
```

---

## Tâche 17 : Vérification finale

**Files:** aucun (vérifications uniquement).

- [ ] **Step 1 : Suite complète**

Run:
```bash
npx vitest run 2>&1 | tail -8
```
Expected: ≥ 488 verts (475 baseline + 13 nouveaux : 4 updateDocsByDocType + 3 updateDocsForOwner + 3 getTemplateById + 3 getLatestSignatureForDoc).

- [ ] **Step 2 : TypeScript clean**

```bash
npx tsc --noEmit 2>&1
```
Expected: zéro output.

- [ ] **Step 3 : Acceptance criteria (spec §5)**

```bash
echo "=== AC1: no inline Supabase on sensitive tables ==="
grep -nE "supabase\.from\(\"(documents|document_templates|document_signatures)\"\)" "src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx" || echo "(empty - good)"

echo "=== AC2: no casts ==="
grep -n "as unknown as" "src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx" || echo "(empty - good)"

echo "=== AC3: onRefresh always awaited ==="
grep -nE "^[[:space:]]+onRefresh\(\);" "src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx" || echo "(empty - good)"

echo "=== AC4: no catch {} empty ==="
grep -n "catch {}" "src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx" || echo "(empty - good)"

echo "=== AC5: console.error always followed by toast ==="
grep -n "console.error" "src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx"
# Verify each is followed by a toast in the same handler — manual check

echo "=== AC6: no TODO Story F.x ==="
grep -n "TODO Story F" "src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx" || echo "(empty - good)"

echo "=== AC7: 4 helpers exported ==="
grep -nE "^export (async )?function (updateDocsByDocType|updateDocsForOwner|getTemplateById|getLatestSignatureForDoc)\b" src/lib/services/documents-store.ts

echo "=== AC8: 15 new routes created ==="
ls src/app/api/documents/send-{cgv,reglement-interieur,politique-confidentialite,planning-semaine,feuille-emargement-vierge,bilans-poe,reponses-evaluations,reponses-satisfaction,resultats-evaluations,attestations-aipr,attestations-competences,attestations-abandon,certificats-travail-hauteur,certificats-diplome,avis-habilitation-electrique}-batch-email/route.ts 2>&1 | wc -l
# Expected: 15

echo "=== AC9: BATCH_SEND_ENDPOINTS extended ==="
grep -c "send-.*-batch-email" src/lib/utils/batch-doc-send.ts
# Expected: ≥ 21 mappings (6 existants + 15 nouveaux + variantes habilitation)
```

- [ ] **Step 4 : Build Next.js**

```bash
npm run build 2>&1 | tail -20
```
Expected: build successful.

- [ ] **Step 5 : Récap des commits du chantier**

```bash
git log --oneline main..HEAD
```
Expected: 16 commits (1 par tâche, sauf Tâche 1 = pas de commit).

- [ ] **Step 6 : Présenter les options finishing**

Présenter à l'utilisateur les options du skill `superpowers:finishing-a-development-branch` :
1. Merge back to main locally
2. Push and create a Pull Request
3. Keep the branch as-is
4. Discard this work

Rappeler que **la validation manuelle post-merge est requise** (cf brainstorming) : tester l'envoi d'1 document de chaque type pour vérifier que :
- Le template Word custom (mode docx_fidelity) est bien utilisé si configuré
- Le mapping recipient (learner/company/trainer) est correct
- Les variables sont résolues correctement dans le PDF généré

---

## Self-review (effectuée pendant la rédaction)

**Spec coverage** :
- Volet A → Tâches 3, 4, 5, 6 (4 helpers) + Tâche 15 (migration)
- Volet B → Tâche 2 (types) + Tâche 14 (retrait casts)
- Volet C → Tâche 14 (await + try/catch + visibility)
- Volet D → Tâche 7 (orchestrateur) + Tâches 8-12 (15 routes) + Tâche 13 (BATCH_SEND_ENDPOINTS) + Tâche 16 (retrait fallbacks)
- Volet F → Tâches 3-6 (tests des helpers)

**Placeholder scan** :
- Aucun "TBD", "TODO", "implementer plus tard"
- 2 mentions "audit séparé" et "validation manuelle post-merge" — assumées en risque

**Type consistency** :
- `ServiceResult<T>` : déclaré en Tâche 3, utilisé partout dans documents-store
- `OwnerType` : déclaré en Tâche 4, importé en Tâche 15
- `DocumentTemplate` : déclaré en Tâche 5, importé en Tâche 15
- `batchSendDocsEmail(supabase, entityId, sessionId, docType)` : signature consistante entre Tâche 7 (déclaration) et Tâches 8-12 (consumers)
- `hasBatchSendEndpoint(docType)` : retour booléen consistant entre Tâche 13 (mapping) et Tâche 16 (consumer)

**Risques résiduels** :
- Tâche 7 : le code de `batchSendDocsEmail` référence des symboles existants (`SYSTEM_TEMPLATES_BY_DOC_TYPE`, `renderSystemTemplate`, `DocumentGenerationService`, etc.) — leur signature exacte sera à vérifier lors de l'implémentation.
- Tâche 16 : `hasBatchEndpoint` (ZIP) peut ne pas couvrir tous les doc_types — fallback ZIP à laisser si nécessaire (mention explicite dans le commit).

---

## Exécution

Plan complete et sauvé à `docs/superpowers/plans/2026-05-25-solidification-tab-convention-docs.md`. Deux options d'exécution :

**1. Subagent-Driven (recommandé)** — dispatch d'un subagent par tâche, revue spec compliance + code quality entre chaque, itération rapide (pattern identique aux 4 chantiers précédents : Automatisations, Qualiopi, Résumé, E-learning).

**2. Inline Execution** — exécution des tâches dans cette session via `executing-plans`, batch execution avec checkpoints.

Quelle approche ?
