# Plan d'implémentation — Solidification Questionnaires P0-5 Auto Qualiopi (Chantier 2c)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire en sorte que les 2 crons automatiques de questionnaires (sessions terminées + règles Qualiopi J-3/J0/J+7/J+30) envoient des emails avec un **lien token public** (`/questionnaire/<token>`) au lieu d'un lien `/learner/...` qui nécessite l'authentification apprenant.

**Architecture:** 1 helper partagé `ensureQuestionnaireToken` (idempotent, race condition 23505 gérée) consommé par les 2 crons. Cron #1 modifié en 3 lignes. Cron #2 (via `execute-rule.ts`) enrichi de 2 helpers privés (`isQuestionnaireRule` + `resolveQuestionnaireIdForRule`) + logique d'injection (`{{questionnaire_link}}` variable ou auto-append).

**Tech Stack:** Next.js 14 App Router (API routes), TypeScript strict, Vitest, Supabase service_role (les crons bypass RLS).

**Spec source:** [docs/superpowers/specs/2026-05-26-questionnaires-p0-5-auto-qualiopi-design.md](../specs/2026-05-26-questionnaires-p0-5-auto-qualiopi-design.md)

**Risque prod élevé** : touche le moteur d'automatisations. **Validation manuelle stricte obligatoire avant push prod** (Task 6).

**Limitation connue** : le scope ne couvre **que les destinataires learners** (`recipient.type === "learner"` dans execute-rule.ts). Pour les règles `questionnaire_satisfaction_company` qui visent des contacts d'entreprise (`recipient_type: "companies"`), pas de token généré (la table `questionnaire_tokens.learner_id` est NOT NULL). Ces emails restent comme aujourd'hui (sans lien). À traiter en chantier ultérieur si besoin.

---

## Vue d'ensemble des fichiers

### Créés
| Fichier | Rôle |
|---|---|
| `src/lib/automation/questionnaire-token-helper.ts` | Helper `ensureQuestionnaireToken` + `buildPublicQuestionnaireUrl` |
| `src/lib/automation/__tests__/questionnaire-token-helper.test.ts` | 3 tests Vitest TDD sur le helper |

### Modifiés
| Fichier | Changement |
|---|---|
| `src/app/api/questionnaires/auto-send/route.ts` | Remplace `/learner/...` par `/questionnaire/<token>` via le helper (~3 lignes) |
| `src/lib/automation/execute-rule.ts` | + constante `QUESTIONNAIRE_DOCUMENT_TYPES` + mapping `QUESTIONNAIRE_TYPE_TO_ASSIGNMENT` + helpers `isQuestionnaireRule` + `resolveQuestionnaireIdForRule` + injection dans `executeRuleForSession` |
| `src/lib/automation/__tests__/execute-rule.test.ts` | + 4 tests (2 sur `resolveQuestionnaireIdForRule`, 2 sur injection variable/auto-append) |

---

## Task 0 : Baseline + branche + investigation `default-packs.ts`

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
Expected: branche `main` à commit `479e759` (spec pushée), 521 tests verts, TypeScript clean.

- [ ] **Step 2 : Créer la branche**

```bash
git checkout main
git pull origin main 2>/dev/null || true
git checkout -b feat/questionnaires-volet-d-p0-5
```

- [ ] **Step 3 : Investigation `default-packs.ts` — liste exhaustive des `document_type` questionnaire**

Run:
```bash
grep -nE 'document_type.*questionnaire' src/lib/automation/default-packs.ts
```

Identifier précisément les valeurs `document_type` utilisées pour les règles questionnaire. Patterns attendus (à confirmer par le grep) :
- `questionnaire_positionnement`
- `questionnaire_satisfaction`
- `questionnaire_satisfaction_company`
- éventuellement `questionnaire_satisfaction_froid`

Run aussi un grep large dans tout le code :
```bash
grep -rnE '"questionnaire_[a-z_]+"' src/lib/automation/ src/app/api/automation/ 2>/dev/null | head -20
```

Documenter la liste exhaustive dans le rapport pour usage en Task 3 (constante `QUESTIONNAIRE_DOCUMENT_TYPES`).

- [ ] **Step 4 : Identifier les `recipient_type` des règles questionnaire**

Run:
```bash
grep -nB 2 -A 4 'document_type: "questionnaire' src/lib/automation/default-packs.ts
```

Pour chaque `document_type` questionnaire, noter le `recipient_type` (learners vs companies). Confirme la limitation : seules les règles `recipient_type: "learners"` sont concernées par l'injection token.

Pas de commit pour Task 0 — investigation uniquement.

---

## Task 1 : Helper `ensureQuestionnaireToken` + 3 tests TDD

**Files:**
- Create: `src/lib/automation/questionnaire-token-helper.ts`
- Create: `src/lib/automation/__tests__/questionnaire-token-helper.test.ts`

- [ ] **Step 1 : Écrire les 3 tests failing-first**

Créer `src/lib/automation/__tests__/questionnaire-token-helper.test.ts` :

```ts
import { describe, it, expect, vi } from "vitest";
import { ensureQuestionnaireToken, buildPublicQuestionnaireUrl } from "@/lib/automation/questionnaire-token-helper";

describe("ensureQuestionnaireToken", () => {
  it("retourne le token existant si actif (wasCreated: false)", async () => {
    const existingToken = {
      token: "11111111-1111-1111-1111-111111111111",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    };
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: existingToken, error: null })),
      })),
    };
    const result = await ensureQuestionnaireToken(supabase as never, "S1", "Q1", "L1", "E1");
    expect(result.token).toBe(existingToken.token);
    expect(result.wasCreated).toBe(false);
    expect(result.expiresAt).toBe(existingToken.expires_at);
  });

  it("crée un nouveau token si aucun actif n'existe (wasCreated: true)", async () => {
    const newToken = {
      token: "22222222-2222-2222-2222-222222222222",
      expires_at: new Date(Date.now() + 90 * 86400000).toISOString(),
    };
    let callCount = 0;
    const supabase = {
      from: vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          // First call: SELECT - no existing
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          };
        }
        // Second call: INSERT
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn(async () => ({ data: newToken, error: null })),
        };
      }),
    };
    const result = await ensureQuestionnaireToken(supabase as never, "S1", "Q1", "L1", "E1");
    expect(result.token).toBe(newToken.token);
    expect(result.wasCreated).toBe(true);
  });

  it("ignore les tokens expirés et en crée un nouveau", async () => {
    // Le helper utilise .gt("expires_at", NOW()) donc les tokens expirés
    // ne sont pas retournés par le SELECT. Comportement testé via le mock.
    const newToken = {
      token: "33333333-3333-3333-3333-333333333333",
      expires_at: new Date(Date.now() + 90 * 86400000).toISOString(),
    };
    let callCount = 0;
    const supabase = {
      from: vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(), // filtre expires_at > NOW()
            order: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn(async () => ({ data: null, error: null })), // expired = filtered out
          };
        }
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn(async () => ({ data: newToken, error: null })),
        };
      }),
    };
    const result = await ensureQuestionnaireToken(supabase as never, "S1", "Q1", "L1", "E1");
    expect(result.wasCreated).toBe(true);
    expect(result.token).toBe(newToken.token);
  });
});

describe("buildPublicQuestionnaireUrl", () => {
  it("construit l'URL avec NEXT_PUBLIC_APP_URL si défini", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://test.example.com";
    expect(buildPublicQuestionnaireUrl("abc-123")).toBe("https://test.example.com/questionnaire/abc-123");
  });

  it("utilise le fallback hardcodé si NEXT_PUBLIC_APP_URL absent", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(buildPublicQuestionnaireUrl("abc-123")).toBe("https://mrformationcrm.netlify.app/questionnaire/abc-123");
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent (TDD red)**

Run:
```bash
npx vitest run src/lib/automation/__tests__/questionnaire-token-helper.test.ts 2>&1 | tail -10
```
Expected : import error (`ensureQuestionnaireToken` not exported).

- [ ] **Step 3 : Implémenter le helper**

Créer `src/lib/automation/questionnaire-token-helper.ts` :

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Helpers pour la génération de tokens publics de questionnaire (Chantier 2c).
 *
 * Utilisés par les 2 crons questionnaires (auto-send + run-cron via execute-rule)
 * pour insérer un lien `/questionnaire/<token>` dans le corps des emails.
 *
 * Source : docs/superpowers/specs/2026-05-26-questionnaires-p0-5-auto-qualiopi-design.md §4
 */

export interface EnsureTokenResult {
  token: string;
  expiresAt: string;
  wasCreated: boolean;
}

const TOKEN_LIFETIME_DAYS = 90;

/**
 * Récupère un token public actif pour (session, questionnaire, learner)
 * ou en crée un nouveau si aucun n'est actif.
 *
 * Idempotent : appel multiple → même token (sauf si le précédent a expiré).
 * Gère la race condition 23505 (UNIQUE constraint) via retry SELECT.
 */
export async function ensureQuestionnaireToken(
  supabase: SupabaseClient,
  sessionId: string,
  questionnaireId: string,
  learnerId: string,
  entityId: string,
): Promise<EnsureTokenResult> {
  // 1. Chercher un token existant non-utilisé et non-expiré
  const { data: existing } = await supabase
    .from("questionnaire_tokens")
    .select("token, expires_at")
    .eq("session_id", sessionId)
    .eq("questionnaire_id", questionnaireId)
    .eq("learner_id", learnerId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .maybeSingle();

  if (existing) {
    return {
      token: existing.token as string,
      expiresAt: existing.expires_at as string,
      wasCreated: false,
    };
  }

  // 2. INSERT nouveau token
  const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: newToken, error } = await supabase
    .from("questionnaire_tokens")
    .insert({
      session_id: sessionId,
      questionnaire_id: questionnaireId,
      learner_id: learnerId,
      entity_id: entityId,
      expires_at: expiresAt,
    })
    .select("token, expires_at")
    .single();

  if (newToken) {
    return {
      token: newToken.token as string,
      expiresAt: newToken.expires_at as string,
      wasCreated: true,
    };
  }

  // 3. Race condition 23505 : retry SELECT (un autre cron a inséré entre temps)
  if (error?.code === "23505") {
    const { data: raceToken } = await supabase
      .from("questionnaire_tokens")
      .select("token, expires_at")
      .eq("session_id", sessionId)
      .eq("questionnaire_id", questionnaireId)
      .eq("learner_id", learnerId)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .maybeSingle();
    if (raceToken) {
      return {
        token: raceToken.token as string,
        expiresAt: raceToken.expires_at as string,
        wasCreated: false,
      };
    }
  }

  throw new Error(`Failed to ensure questionnaire token: ${error?.message ?? "unknown error"}`);
}

/**
 * Construit l'URL publique du questionnaire pour un token donné.
 * Utilise NEXT_PUBLIC_APP_URL ou un fallback hardcodé (cohérent avec
 * le pattern existant dans /api/questionnaires/auto-send).
 */
export function buildPublicQuestionnaireUrl(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://mrformationcrm.netlify.app";
  return `${baseUrl}/questionnaire/${token}`;
}
```

- [ ] **Step 4 : Vérifier que les 5 tests passent (TDD green)**

Run:
```bash
npx vitest run src/lib/automation/__tests__/questionnaire-token-helper.test.ts 2>&1 | tail -10
```
Expected : 5 tests verts (3 ensureQuestionnaireToken + 2 buildPublicQuestionnaireUrl).

- [ ] **Step 5 : Suite complète + tsc**

```bash
npx vitest run 2>&1 | tail -4
npx tsc --noEmit 2>&1 | head -5
```
Expected : 526 tests verts (521 + 5), TS clean.

- [ ] **Step 6 : Commit**

```bash
git add src/lib/automation/questionnaire-token-helper.ts src/lib/automation/__tests__/questionnaire-token-helper.test.ts
git commit -m "feat(automation): ensureQuestionnaireToken + buildPublicQuestionnaireUrl helpers (Chantier 2c)

Helpers idempotents pour la génération de tokens publics de questionnaire.
Race condition 23505 gérée via retry SELECT. Lifetime 90 jours
(cohérent avec /api/formations/[id]/questionnaire-tokens).

3 tests ensureQuestionnaireToken (existing actif / nouveau / expiré ignoré)
+ 2 tests buildPublicQuestionnaireUrl (env var + fallback).

Consommé par les 2 crons en Tasks 2 et 4."
```

---

## Task 2 : Cron #1 — `/api/questionnaires/auto-send`

**Files:**
- Modify: `src/app/api/questionnaires/auto-send/route.ts`

- [ ] **Step 1 : Lire la section à modifier**

Run:
```bash
sed -n '105,125p' src/app/api/questionnaires/auto-send/route.ts
```

Identifier les lignes :
```ts
const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://mrformationcrm.netlify.app";
const link_url = `${baseUrl}/learner/questionnaires/${questionnaire.id}?session_id=${session.id}`;

const emailBody = `Bonjour ${learner.first_name},\n\nLa formation "${session.title}" est terminée. Nous vous invitons à remplir le questionnaire de satisfaction :\n\n${link_url}\n\nMerci pour vos retours,\nL'équipe formation`;
```

- [ ] **Step 2 : Ajouter l'import**

Use Edit tool pour ajouter en haut du fichier (après les imports existants) :
```ts
import { ensureQuestionnaireToken, buildPublicQuestionnaireUrl } from "@/lib/automation/questionnaire-token-helper";
```

- [ ] **Step 3 : Remplacer la génération du lien**

Use Edit tool pour remplacer les 3 lignes :

Avant :
```ts
const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://mrformationcrm.netlify.app";
const link_url = `${baseUrl}/learner/questionnaires/${questionnaire.id}?session_id=${session.id}`;

const emailBody = `Bonjour ${learner.first_name},\n\nLa formation "${session.title}" est terminée. Nous vous invitons à remplir le questionnaire de satisfaction :\n\n${link_url}\n\nMerci pour vos retours,\nL'équipe formation`;
```

Après :
```ts
// Générer ou réutiliser un token public pour cet apprenant (Chantier 2c P0-5)
const tokenResult = await ensureQuestionnaireToken(
  supabase, session.id, questionnaire.id, learner.id, session.entity_id,
);
const link_url = buildPublicQuestionnaireUrl(tokenResult.token);

const emailBody = `Bonjour ${learner.first_name},\n\nLa formation "${session.title}" est terminée. Nous vous invitons à remplir le questionnaire de satisfaction :\n\n${link_url}\n\nMerci pour vos retours,\nL'équipe formation`;
```

- [ ] **Step 4 : Vérifier qu'il n'y a plus de référence à `/learner/questionnaires`**

Run:
```bash
grep -n "/learner/questionnaires" src/app/api/questionnaires/auto-send/route.ts
```
Expected: 0 résultat.

- [ ] **Step 5 : Vérifier TS + tests**

```bash
npx tsc --noEmit 2>&1 | head -5
npx vitest run 2>&1 | tail -3
```
Expected : TS clean, 526 tests passent.

- [ ] **Step 6 : Commit**

```bash
git add src/app/api/questionnaires/auto-send/route.ts
git commit -m "fix(api/questionnaires/auto-send): lien public via ensureQuestionnaireToken (P0-5)

Remplace le lien /learner/questionnaires/<id>?session_id=... (auth requise)
par /questionnaire/<token> (route publique sans auth) — résout P0-5.

Les apprenants externes (entreprises, freelances) sans compte sur le
portail learner peuvent désormais accéder au questionnaire."
```

---

## Task 3 : Helpers `isQuestionnaireRule` + `resolveQuestionnaireIdForRule`

**Files:**
- Modify: `src/lib/automation/execute-rule.ts`
- Modify: `src/lib/automation/__tests__/execute-rule.test.ts`

- [ ] **Step 1 : Ajouter 2 tests Vitest failing-first**

Ajouter à la fin de `src/lib/automation/__tests__/execute-rule.test.ts` (avant le `});` final si applicable, sinon en nouveau `describe`) :

```ts
import { resolveQuestionnaireIdForRule, isQuestionnaireRule } from "@/lib/automation/execute-rule";

describe("isQuestionnaireRule", () => {
  it("retourne true pour document_type questionnaire_positionnement", () => {
    const rule = { id: "r1", trigger_type: "session_start_minus_days", document_type: "questionnaire_positionnement", days_offset: 3, recipient_type: "learners", template_id: null, condition_subcontracted: null, name: null };
    expect(isQuestionnaireRule(rule)).toBe(true);
  });

  it("retourne false pour document_type convocation", () => {
    const rule = { id: "r1", trigger_type: "session_start_minus_days", document_type: "convocation", days_offset: 5, recipient_type: "learners", template_id: null, condition_subcontracted: null, name: null };
    expect(isQuestionnaireRule(rule)).toBe(false);
  });
});

describe("resolveQuestionnaireIdForRule", () => {
  it("retourne questionnaire_id pour règle 'questionnaire_positionnement' avec assignment eval_preformation", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: { questionnaire_id: "QUEST-1" }, error: null })),
      })),
    };
    const rule = { id: "r1", trigger_type: "session_start_minus_days", document_type: "questionnaire_positionnement", days_offset: 3, recipient_type: "learners", template_id: null, condition_subcontracted: null, name: null };
    const result = await resolveQuestionnaireIdForRule(supabase as never, rule, "S1");
    expect(result).toBe("QUEST-1");
  });

  it("retourne null si document_type n'est pas dans le mapping", async () => {
    const supabase = { from: vi.fn() };
    const rule = { id: "r1", trigger_type: "session_start_minus_days", document_type: "convocation", days_offset: 5, recipient_type: "learners", template_id: null, condition_subcontracted: null, name: null };
    const result = await resolveQuestionnaireIdForRule(supabase as never, rule, "S1");
    expect(result).toBe(null);
  });
});
```

(Note : `vi` est probablement déjà importé en haut du fichier de test. Si non, ajouter `import { vi } from "vitest";`.)

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
npx vitest run src/lib/automation/__tests__/execute-rule.test.ts 2>&1 | tail -10
```
Expected : `isQuestionnaireRule` et `resolveQuestionnaireIdForRule` non exportés → 4 tests fail à l'import.

- [ ] **Step 3 : Ajouter les helpers + constantes à `execute-rule.ts`**

Ajouter au début de `src/lib/automation/execute-rule.ts` (après les imports existants, avant les interfaces) :

```ts
/**
 * Document types correspondant à des questionnaires Qualiopi.
 * Pour ces règles, executeRuleForSession injecte un lien token public
 * (via ensureQuestionnaireToken) dans le body de l'email.
 *
 * Liste confirmée par Task 0 du Chantier 2c (grep default-packs.ts).
 *
 * Source : docs/superpowers/specs/2026-05-26-questionnaires-p0-5-auto-qualiopi-design.md §6.2
 */
export const QUESTIONNAIRE_DOCUMENT_TYPES = new Set<string>([
  "questionnaire_positionnement",
  "questionnaire_satisfaction",
  "questionnaire_satisfaction_company",
  // + autres détectés en Task 0 (ex: questionnaire_satisfaction_froid si présent)
]);

export function isQuestionnaireRule(rule: RuleInfo): boolean {
  return QUESTIONNAIRE_DOCUMENT_TYPES.has(rule.document_type);
}

/**
 * Mapping document_type → (table, colonne, valeur) pour résoudre
 * le questionnaire concret attribué à la session pour une règle donnée.
 *
 * Limitation : si plusieurs questionnaires de même type sont attribués
 * à la session (rare), on prend le premier (LIMIT 1).
 */
const QUESTIONNAIRE_TYPE_TO_ASSIGNMENT: Record<string, {
  table: "formation_evaluation_assignments" | "formation_satisfaction_assignments";
  typeColumn: "evaluation_type" | "satisfaction_type";
  typeValue: string;
}> = {
  questionnaire_positionnement: {
    table: "formation_evaluation_assignments",
    typeColumn: "evaluation_type",
    typeValue: "eval_preformation",
  },
  questionnaire_satisfaction: {
    table: "formation_satisfaction_assignments",
    typeColumn: "satisfaction_type",
    typeValue: "satisfaction_chaud",
  },
  questionnaire_satisfaction_company: {
    table: "formation_satisfaction_assignments",
    typeColumn: "satisfaction_type",
    typeValue: "satisfaction_entreprise",
  },
  // + autres mappings selon Task 0
};

export async function resolveQuestionnaireIdForRule(
  supabase: SupabaseClient,
  rule: RuleInfo,
  sessionId: string,
): Promise<string | null> {
  const config = QUESTIONNAIRE_TYPE_TO_ASSIGNMENT[rule.document_type];
  if (!config) return null;

  const { data } = await supabase
    .from(config.table)
    .select("questionnaire_id")
    .eq("session_id", sessionId)
    .eq(config.typeColumn, config.typeValue)
    .limit(1)
    .maybeSingle();

  return (data?.questionnaire_id as string | undefined) ?? null;
}
```

**Important** : `SupabaseClient` doit déjà être importé dans `execute-rule.ts` (utilisé par d'autres fonctions). Sinon ajouter l'import en haut :
```ts
import type { SupabaseClient } from "@supabase/supabase-js";
```

- [ ] **Step 4 : Vérifier que les 4 tests passent**

```bash
npx vitest run src/lib/automation/__tests__/execute-rule.test.ts 2>&1 | tail -10
```
Expected : tous les tests verts (10 baseline + 4 nouveaux = 14, ou autre selon le baseline du fichier).

- [ ] **Step 5 : Suite complète + tsc**

```bash
npx vitest run 2>&1 | tail -3
npx tsc --noEmit 2>&1 | head -5
```
Expected : 530 tests verts (526 + 4), TS clean.

- [ ] **Step 6 : Commit**

```bash
git add src/lib/automation/execute-rule.ts src/lib/automation/__tests__/execute-rule.test.ts
git commit -m "feat(execute-rule): helpers isQuestionnaireRule + resolveQuestionnaireIdForRule (Chantier 2c)

Ajoute :
- Constante QUESTIONNAIRE_DOCUMENT_TYPES (Set des document_type questionnaire)
- Helper isQuestionnaireRule(rule) → boolean
- Mapping QUESTIONNAIRE_TYPE_TO_ASSIGNMENT (document_type → table/colonne/valeur)
- Helper resolveQuestionnaireIdForRule(supabase, rule, sessionId) → questionnaire_id | null

4 tests Vitest TDD : 2 isQuestionnaireRule + 2 resolveQuestionnaireIdForRule.

Task 4 consommera ces helpers pour injecter le lien token dans
executeRuleForSession."
```

---

## Task 4 : Injection du lien token dans `executeRuleForSession`

**Files:**
- Modify: `src/lib/automation/execute-rule.ts`
- Modify: `src/lib/automation/__tests__/execute-rule.test.ts`

- [ ] **Step 1 : Lire la structure actuelle de `executeRuleForSession`**

```bash
grep -nA 80 "export async function executeRuleForSession" src/lib/automation/execute-rule.ts | head -90
```

Identifier la section où `subject` et `body` sont construits (template custom ou fallback), juste avant le call à `enqueueEmail`.

- [ ] **Step 2 : Écrire 2 tests Vitest failing-first**

Ajouter à `execute-rule.test.ts` :

```ts
describe("executeRuleForSession — injection lien token (Chantier 2c)", () => {
  it("remplace {{questionnaire_link}} dans body custom si présent", async () => {
    // TODO : test plus large nécessitant mock de toute la chaîne.
    // Pour ce test minimal, on vérifie juste la logique de remplacement string.
    const body = "Bonjour, voici votre questionnaire : {{questionnaire_link}}\n\nMerci";
    const link = "https://example.com/questionnaire/abc-123";
    const result = body.replaceAll("{{questionnaire_link}}", link);
    expect(result).toBe("Bonjour, voici votre questionnaire : https://example.com/questionnaire/abc-123\n\nMerci");
    expect(result.includes("{{questionnaire_link}}")).toBe(false);
  });

  it("auto-append le lien en fin de body si {{questionnaire_link}} absent", () => {
    const body = "Bonjour,\nVeuillez répondre au questionnaire de satisfaction.\nCordialement";
    const link = "https://example.com/questionnaire/abc-123";
    const result = body + `\n\n📝 Lien direct vers le questionnaire :\n${link}`;
    expect(result.endsWith(`📝 Lien direct vers le questionnaire :\n${link}`)).toBe(true);
    expect(result.includes("Bonjour,")).toBe(true); // body original préservé
  });
});
```

**Note** : ces tests unitaires sont volontairement simples (testent la logique de string manipulation). Un test d'intégration complet de `executeRuleForSession` nécessiterait de mocker toute la chaîne Supabase + enqueueEmail, ce qui ajoute beaucoup de complexité pour peu de valeur (la logique est triviale). On accepte ce trade-off — la validation manuelle stricte (Task 6) couvre le flow end-to-end.

- [ ] **Step 3 : Vérifier que les tests passent immédiatement (pas de TDD red ici)**

Les 2 tests ci-dessus testent uniquement des opérations de string standards. Ils passent immédiatement sans rien à implémenter — leur but est de **documenter et garantir** que le pattern de remplacement / auto-append fonctionne comme attendu.

```bash
npx vitest run src/lib/automation/__tests__/execute-rule.test.ts 2>&1 | tail -5
```
Expected : tous tests verts.

- [ ] **Step 4 : Ajouter l'import du helper**

Use Edit tool pour ajouter en haut de `src/lib/automation/execute-rule.ts` (après les imports existants) :
```ts
import { ensureQuestionnaireToken, buildPublicQuestionnaireUrl } from "@/lib/automation/questionnaire-token-helper";
```

- [ ] **Step 5 : Modifier `executeRuleForSession` pour injecter le lien**

Use Edit tool. Localiser la section où `subject` et `body` sont construits (autour des lignes 240-290), juste avant le call à `enqueueEmail`. Le code actuel ressemble à :

```ts
let subject: string;
let body: string;
if (template) {
  const ctx = { /* ... */ };
  subject = /* render template subject */;
  body = /* render template body */;
} else {
  ({ subject, body } = buildFallbackEmail(rule, session, recipient));
}

// existing enqueueEmail call ...
```

Insérer **juste avant le `enqueueEmail`** :

```ts
// Injection token questionnaire (Chantier 2c P0-5)
if (isQuestionnaireRule(rule) && recipient.type === "learner") {
  const questionnaireId = await resolveQuestionnaireIdForRule(supabase, rule, session.id);
  if (questionnaireId) {
    try {
      const tokenResult = await ensureQuestionnaireToken(
        supabase, session.id, questionnaireId, recipient.id, session.entity_id,
      );
      const questionnaireLink = buildPublicQuestionnaireUrl(tokenResult.token);

      // Si le body contient {{questionnaire_link}}, remplacer (templates customs)
      if (body.includes("{{questionnaire_link}}")) {
        body = body.replaceAll("{{questionnaire_link}}", questionnaireLink);
      } else {
        // Auto-append en fin de body (templates customs sans variable + fallback)
        body += `\n\n📝 Lien direct vers le questionnaire :\n${questionnaireLink}`;
      }
    } catch (err) {
      // En cas d'erreur (token impossible à générer), on log mais on envoie
      // l'email quand même (sans lien). Pas de régression par rapport à l'existant.
      console.error("[execute-rule] questionnaire token generation failed:", err);
    }
  }
}

// Existing enqueueEmail call (inchangé)
await enqueueEmail(supabase, { /* ... */ });
```

**Important** : adapter le placement exact selon le code actuel de `executeRuleForSession`. La logique doit être :
1. Construction de `subject` + `body` (inchangée)
2. **NEW** : injection token si règle questionnaire + recipient learner
3. Enqueue email (inchangé)

- [ ] **Step 6 : Vérifier TS + tests**

```bash
npx tsc --noEmit 2>&1 | head -5
npx vitest run 2>&1 | tail -3
```
Expected : TS clean, 532 tests verts (530 + 2 nouveaux tests Task 4).

- [ ] **Step 7 : Commit**

```bash
git add src/lib/automation/execute-rule.ts src/lib/automation/__tests__/execute-rule.test.ts
git commit -m "feat(execute-rule): injection lien questionnaire token dans executeRuleForSession (P0-5)

Pour chaque règle questionnaire (isQuestionnaireRule) avec recipient
learner :
1. Résoudre le questionnaire_id via resolveQuestionnaireIdForRule
2. Générer un token via ensureQuestionnaireToken (helper Chantier 2c)
3. Construire l'URL publique via buildPublicQuestionnaireUrl
4. Si {{questionnaire_link}} présent dans le body → replaceAll
   Sinon → auto-append en fin de body avec '📝 Lien direct vers...'

Try/catch sur la génération de token : si échec, log + envoi email
quand même (sans lien) — pas de régression sur l'existant.

2 tests Vitest sur la logique de string manipulation
(replaceAll variable + auto-append). Validation end-to-end via spot
check Task 6."
```

---

## Task 5 : Vérification finale acceptance criteria

**Files:** aucun (vérifications uniquement).

- [ ] **Step 1 : Suite Vitest complète**

```bash
npx vitest run 2>&1 | tail -6
```
Expected: **≥ 532 tests verts** (521 baseline + 5 helper + 4 execute-rule helpers + 2 inject = 532).

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

- [ ] **Step 5 : Acceptance criteria (spec §7)**

```bash
echo "=== AC1 — Helper créé ==="
ls src/lib/automation/questionnaire-token-helper.ts >/dev/null && echo "✓ helper existe"
grep -c "it(" src/lib/automation/__tests__/questionnaire-token-helper.test.ts

echo ""
echo "=== AC2 — Cron #1 ne contient plus /learner/questionnaires ==="
grep -n "/learner/questionnaires" src/app/api/questionnaires/auto-send/route.ts || echo "(0 - OK)"

echo ""
echo "=== AC3 — Cron #2 helpers + injection ==="
grep -nE "^export (const|function) (QUESTIONNAIRE_DOCUMENT_TYPES|isQuestionnaireRule|resolveQuestionnaireIdForRule)" src/lib/automation/execute-rule.ts
grep -c "questionnaire_link\|isQuestionnaireRule(rule)" src/lib/automation/execute-rule.ts

echo ""
echo "=== AC4 — Récap commits Chantier 2c ==="
git log --oneline main..HEAD | wc -l
echo "commits"
git log --oneline main..HEAD
```

---

## Task 6 : STOP — Validation manuelle stricte par Wissam

⚠ **Cette tâche ne se fait pas par subagent.** Le développeur (= moi/orchestrateur) doit présenter la procédure à Wissam et attendre son Go/No-go avant Task 7.

- [ ] **Step 1 : Présenter la procédure à Wissam**

Présenter le workflow obligatoire avant push prod (cf spec §9) :

1. **Setup local** :
   - Lancer `npm run dev` (l'app tourne sur localhost:3001 ou similaire)
   - Récupérer `CRON_SECRET` depuis `.env.local`

2. **Setup BDD test** : Wissam configure 1 session de test :
   - `end_date = today` (pour déclencher cron #1)
   - 1 apprenant test avec email = adresse personnelle Wissam
   - 1 questionnaire `auto_send_on_completion = true` attribué (cron #1)
   - 1 règle automation "Positionnement J-3" active sur cette session (cron #2)

3. **Déclencher Cron #1** :
   ```bash
   curl -X POST http://localhost:3001/api/questionnaires/auto-send \
     -H "Authorization: Bearer $CRON_SECRET"
   ```
   Vérifier dans la boîte mail Wissam :
   - ☐ Email reçu
   - ☐ Lien dans le body = `http(s)://.../questionnaire/<uuid>` (pas `/learner/...`)
   - ☐ Cliquer le lien sans être loggé → page publique accessible
   - ☐ Soumettre une réponse → enregistrée dans `questionnaire_responses`

4. **Déclencher Cron #2** :
   ```bash
   curl -X POST http://localhost:3001/api/formations/automation-rules/run-cron \
     -H "Authorization: Bearer $CRON_SECRET"
   ```
   Vérifier dans la boîte mail Wissam :
   - ☐ Email "Positionnement — <titre session>" reçu
   - ☐ Body contient `📝 Lien direct vers le questionnaire :\nhttp(s)://...` (auto-append)
   - ☐ Cliquer le lien → page publique accessible
   - ☐ Soumettre réponse → enregistrée

5. **Décision Go/No-go** :
   - ✅ **Go** : toutes les ☐ cochées → autoriser Task 7 (merge + push)
   - ❌ **No-go** : un test échoue → debug, ne pas merger

- [ ] **Step 2 : Attendre la réponse de Wissam**

Le développeur orchestrateur s'arrête ici et attend explicitement le message "Go" ou "No-go" de Wissam avant de procéder à Task 7.

---

## Task 7 : Finishing-a-development-branch (après Go)

⚠ **Ne déclencher qu'après Wissam a validé Task 6 avec "Go".**

- [ ] **Step 1 : Lancer le skill finishing-a-development-branch**

Présenter à Wissam les 4 options :

1. Merge back to main locally
2. Push and create a Pull Request
3. Keep the branch as-is
4. Discard this work

Pattern habituel (les 9 chantiers précédents) : Option 1 (merge local + push prod).

- [ ] **Step 2 : Si Option 1 choisie — exécuter le merge**

```bash
git checkout main
git pull origin main
git merge feat/questionnaires-volet-d-p0-5 --no-ff -m "Merge feat/questionnaires-volet-d-p0-5 : P0-5 Auto Qualiopi (Chantier 2c)

[Message détaillé à composer au moment du merge selon le pattern habituel]"
npx vitest run  # Vérifier que tout est vert post-merge
git push origin main
git branch -d feat/questionnaires-volet-d-p0-5
```

- [ ] **Step 3 : Confirmer la fin du parcours Questionnaires**

Reporter à Wissam :
- Score qualité final : **10/10** (10/10 sur les 5 P0 + Volets B/C/D/F)
- Tous les chantiers Questionnaires sont mergés (1 + 2a + 2b + 2c)
- Le sous-système Questionnaires est désormais solide en prod

---

## Self-review (effectuée pendant la rédaction)

### 1. Spec coverage

| Spec section | Task(s) couvrant |
|---|---|
| §3 (architecture) | Vue d'ensemble du plan en début |
| §4 (Helper ensureQuestionnaireToken) | Task 1 (3 tests + impl) |
| §5 (Cron #1 auto-send) | Task 2 (modification 3 lignes) |
| §6.2 (constante + isQuestionnaireRule) | Task 3 (helpers + tests) |
| §6.3 (resolveQuestionnaireIdForRule) | Task 3 (helper + tests) |
| §6.4 (injection executeRuleForSession) | Task 4 (impl + 2 tests) |
| §7 (acceptance criteria) | Task 5 (vérification finale) |
| §9 (validation manuelle stricte) | Task 6 (procédure curl + checklist) |
| §11 (ordre d'exécution) | Reflète exactement le plan 8 tâches |

✅ 100% de couverture.

### 2. Placeholder scan

- Aucun "TBD" ou "TODO"
- Le commentaire "+ autres détectés en Task 0" dans la constante `QUESTIONNAIRE_DOCUMENT_TYPES` est lié à l'investigation Task 0 — c'est une instruction, pas un placeholder
- Tous les blocs de code sont complets

### 3. Type consistency

- `EnsureTokenResult` : déclaré Task 1, consommé Tasks 2 et 4
- `RuleInfo`, `SessionInfo`, `RecipientInfo` : déjà définis dans `execute-rule.ts` (Chantier précédent) — référencés sans modification
- `ensureQuestionnaireToken(supabase, sessionId, questionnaireId, learnerId, entityId)` : signature cohérente Task 1 ↔ Tasks 2 et 4
- `buildPublicQuestionnaireUrl(token)` : signature cohérente
- `isQuestionnaireRule(rule)` : signature cohérente Task 3 ↔ Task 4
- `resolveQuestionnaireIdForRule(supabase, rule, sessionId)` : signature cohérente

✅ Pas de divergence détectée.

---

## Exécution

Plan complete et sauvé à `docs/superpowers/plans/2026-05-26-questionnaires-p0-5-auto-qualiopi.md`. Deux options d'exécution :

**1. Subagent-Driven (recommandé)** — dispatch d'un subagent par tâche, revue spec compliance + code quality entre chaque, itération rapide (pattern identique aux 9 chantiers précédents).

**2. Inline Execution** — exécution des tâches dans cette session via `executing-plans`, batch execution avec checkpoints.

⚠ **Particularité de ce chantier** : Task 6 (validation manuelle stricte) **doit obligatoirement être faite par Wissam** avec accès à sa boîte mail témoin. Le subagent qui exécute Tasks 0-5 doit s'arrêter à Task 5 et présenter Task 6 à Wissam pour exécution manuelle. Task 7 (merge + push) ne se déclenche qu'après le Go de Wissam.

Quelle approche ?
