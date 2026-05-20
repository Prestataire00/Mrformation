# Entité active des routes CRM pour super_admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Les routes API CRM GET/POST utilisent l'entité sélectionnée pour un super_admin (cross-entité), `profile.entity_id` pour les autres rôles.

**Architecture:** Un helper pur `resolveActiveEntityId(profile)` lit le cookie `entity_id` pour les super_admin uniquement. Les 11 fichiers de route remplacent `profile.entity_id` (scoping de liste/création/calcul) par un appel au helper.

**Tech Stack:** Next.js 14 (route handlers, `cookies()` de `next/headers`), TypeScript, Vitest.

**Spec :** `docs/superpowers/specs/2026-05-20-crm-active-entity-design.md`

**Règle anti-régression clé :** pour un rôle ≠ super_admin, `resolveActiveEntityId` renvoie `profile.entity_id` → comportement identique à l'actuel. Ne JAMAIS remplacer un `profile.entity_id` servant à un contrôle d'autorisation (ex. `existing.entity_id !== profile.entity_id` dans les DELETE/PATCH déjà corrigés).

**Vérification :** pas de harnais de test pour les routes → chaque tâche route se vérifie par `npx tsc --noEmit` (doit passer). Le helper, lui, est testé unitairement (Task 1).

---

### Task 1 : Helper `resolveActiveEntityId` + test unitaire

**Files:**
- Create: `src/lib/crm/active-entity.ts`
- Create: `src/lib/crm/__tests__/active-entity.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `src/lib/crm/__tests__/active-entity.test.ts` :

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Cookie mocké, contrôlable par test. vi.hoisted pour être dispo dans vi.mock.
const h = vi.hoisted(() => ({ cookie: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string) =>
      name === "entity_id" && h.cookie ? { value: h.cookie } : undefined,
  }),
}));

import { resolveActiveEntityId } from "../active-entity";

const MR = "f8acea54-71ab-4a22-8cf3-4e7170543bf1";
const C3V = "51e959a3-eaaf-4f4a-bd7f-f41784595d90";

describe("resolveActiveEntityId", () => {
  beforeEach(() => { h.cookie = undefined; });

  it("super_admin + cookie UUID valide → renvoie le cookie", () => {
    h.cookie = MR;
    expect(resolveActiveEntityId({ role: "super_admin", entity_id: C3V })).toBe(MR);
  });

  it("super_admin sans cookie → renvoie profile.entity_id", () => {
    expect(resolveActiveEntityId({ role: "super_admin", entity_id: C3V })).toBe(C3V);
  });

  it("super_admin + cookie non-UUID → renvoie profile.entity_id", () => {
    h.cookie = "pas-un-uuid";
    expect(resolveActiveEntityId({ role: "super_admin", entity_id: C3V })).toBe(C3V);
  });

  it("rôle non super_admin + cookie présent → renvoie profile.entity_id", () => {
    h.cookie = MR;
    expect(resolveActiveEntityId({ role: "admin", entity_id: C3V })).toBe(C3V);
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/crm/__tests__/active-entity.test.ts`
Expected: FAIL — `Cannot find module '../active-entity'`.

- [ ] **Step 3 : Écrire le helper**

Créer `src/lib/crm/active-entity.ts` :

```ts
import { cookies } from "next/headers";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Entité "active" d'une requête API CRM.
 * - super_admin : entité sélectionnée (cookie `entity_id`), car cross-entité.
 * - autres rôles : profile.entity_id. Le cookie n'est PAS digne de confiance
 *   pour eux (non httpOnly, modifiable côté client) → ignoré.
 * Repli : super_admin sans cookie / cookie non-UUID → profile.entity_id.
 */
export function resolveActiveEntityId(
  profile: { role: string; entity_id: string },
): string {
  if (profile.role === "super_admin") {
    const cookieEntity = cookies().get("entity_id")?.value;
    if (cookieEntity && UUID_RE.test(cookieEntity)) return cookieEntity;
  }
  return profile.entity_id;
}
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/crm/__tests__/active-entity.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/crm/active-entity.ts src/lib/crm/__tests__/active-entity.test.ts
git commit -m "feat(crm): helper resolveActiveEntityId (entité active super_admin)"
```

---

## Tâches route — procédure commune

Pour chaque fichier de route ci-dessous :
1. Ajouter l'import en tête : `import { resolveActiveEntityId } from "@/lib/crm/active-entity";`
2. Dans CHAQUE fonction concernée (GET / POST), juste après le bloc de garde `if (… !profile?.entity_id …) { return …; }`, ajouter :
   `const activeEntityId = resolveActiveEntityId(profile);`
3. Remplacer les occurrences de `profile.entity_id` indiquées par `activeEntityId`.
4. NE PAS toucher : les `profile?.entity_id` des gardes, ni les `profile.entity_id` des contrôles d'autorisation (`existing.entity_id !== profile.entity_id`).
5. `npx tsc --noEmit -p tsconfig.json` doit passer.
6. Commit.

---

### Task 2 : `src/app/api/crm/tasks/route.ts` (GET + POST)

**Files:** Modify: `src/app/api/crm/tasks/route.ts`

- [ ] **Step 1 : Import** — ajouter `import { resolveActiveEntityId } from "@/lib/crm/active-entity";`.
- [ ] **Step 2 : GET** — ajouter `const activeEntityId = resolveActiveEntityId(profile);` après la garde (~ligne 39). Remplacer dans le GET : `.eq("entity_id", profile.entity_id)` (~L70) → `.eq("entity_id", activeEntityId)`.
- [ ] **Step 3 : POST** — ajouter `const activeEntityId = resolveActiveEntityId(profile);` après la garde (~ligne 161). Remplacer dans le POST les 4 occurrences `profile.entity_id` → `activeEntityId` : `entity_id: profile.entity_id` (~L194, création de la tâche), `entityId: profile.entity_id` (~L221, logAudit), `entityId: profile.entity_id` (~L233), `entity_id: profile.entity_id` (~L246, notification).
- [ ] **Step 4 : Typecheck** — Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "crm/tasks/route" || echo OK`. Expected: `OK`.
- [ ] **Step 5 : Commit**

```bash
git add src/app/api/crm/tasks/route.ts
git commit -m "fix(crm): tasks GET/POST — entité active pour super_admin"
```

---

### Task 3 : `src/app/api/crm/prospects/route.ts` (GET + POST)

**Files:** Modify: `src/app/api/crm/prospects/route.ts`

- [ ] **Step 1 : Import** — ajouter `import { resolveActiveEntityId } from "@/lib/crm/active-entity";`.
- [ ] **Step 2 : GET** — `const activeEntityId = resolveActiveEntityId(profile);` après la garde (~L30). Remplacer `.eq("entity_id", profile.entity_id)` (~L59) → `.eq("entity_id", activeEntityId)`.
- [ ] **Step 3 : POST** — `const activeEntityId = resolveActiveEntityId(profile);` après la garde (~L131). Remplacer : `entity_id: profile.entity_id` (~L158, création) et `entityId: profile.entity_id` (~L181, logAudit) → `activeEntityId`.
- [ ] **Step 4 : Typecheck** — Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "crm/prospects/route" || echo OK`. Expected: `OK`.
- [ ] **Step 5 : Commit**

```bash
git add src/app/api/crm/prospects/route.ts
git commit -m "fix(crm): prospects GET/POST — entité active pour super_admin"
```

---

### Task 4 : `src/app/api/crm/quotes/route.ts` (GET + POST)

**Files:** Modify: `src/app/api/crm/quotes/route.ts`

- [ ] **Step 1 : Import** — ajouter `import { resolveActiveEntityId } from "@/lib/crm/active-entity";`.
- [ ] **Step 2 : GET** — `const activeEntityId = resolveActiveEntityId(profile);` après la garde (~L31). Remplacer `.eq("entity_id", profile.entity_id)` (~L62) → `.eq("entity_id", activeEntityId)`.
- [ ] **Step 3 : POST** — `const activeEntityId = resolveActiveEntityId(profile);` après la garde (~L132). Remplacer les 4 occurrences `profile.entity_id` → `activeEntityId` : `entity_id: profile.entity_id` (~L159, création) ; la condition `if (data && prospect_id && profile.entity_id)` (~L180) ; l'argument `evaluateProspectStatusFromQuotes(supabase, prospect_id, profile.entity_id)` (~L181) ; `entityId: profile.entity_id` (~L186, logAudit).
- [ ] **Step 4 : Typecheck** — Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "crm/quotes/route" || echo OK`. Expected: `OK`.
- [ ] **Step 5 : Commit**

```bash
git add src/app/api/crm/quotes/route.ts
git commit -m "fix(crm): quotes GET/POST — entité active pour super_admin"
```

---

### Task 5 : `src/app/api/crm/suivi/route.ts` (GET + POST uniquement)

**⚠️ NE PAS toucher la fonction DELETE** (déjà corrigée PR #145 ; son `existing.entity_id !== profile.entity_id` ~L282 est un contrôle d'autorisation, à conserver tel quel).

**Files:** Modify: `src/app/api/crm/suivi/route.ts`

- [ ] **Step 1 : Import** — ajouter `import { resolveActiveEntityId } from "@/lib/crm/active-entity";`.
- [ ] **Step 2 : GET** — `const activeEntityId = resolveActiveEntityId(profile);` après la garde (~L38). Remplacer `.eq("entity_id", profile.entity_id)` (~L71) → `.eq("entity_id", activeEntityId)`.
- [ ] **Step 3 : POST** — `const activeEntityId = resolveActiveEntityId(profile);` après la garde (~L150). Remplacer : `entity_id: profile.entity_id` (~L180, création) et `entityId: profile.entity_id` (~L201, logAudit) → `activeEntityId`.
- [ ] **Step 4 : Typecheck** — Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "crm/suivi/route" || echo OK`. Expected: `OK`.
- [ ] **Step 5 : Commit**

```bash
git add src/app/api/crm/suivi/route.ts
git commit -m "fix(crm): suivi GET/POST — entité active pour super_admin"
```

---

### Task 6 : `src/app/api/crm/automations/route.ts` (GET uniquement)

**⚠️ NE PAS toucher la fonction PATCH** (déjà corrigée PR #145 ; son `existing.entity_id !== profile.entity_id` ~L182 est un contrôle d'autorisation).

**Files:** Modify: `src/app/api/crm/automations/route.ts`

- [ ] **Step 1 : Import** — ajouter `import { resolveActiveEntityId } from "@/lib/crm/active-entity";`.
- [ ] **Step 2 : GET** — `const activeEntityId = resolveActiveEntityId(profile);` après la garde (~L101). Remplacer les 3 occurrences `profile.entity_id` du GET → `activeEntityId` : `.eq("entity_id", profile.entity_id)` (~L109, vérif existence) ; `entity_id: profile.entity_id` (~L114, seed des règles par défaut) ; `.eq("entity_id", profile.entity_id)` (~L124, fetch des règles).
- [ ] **Step 3 : Typecheck** — Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "crm/automations/route" || echo OK`. Expected: `OK`.
- [ ] **Step 4 : Commit**

```bash
git add src/app/api/crm/automations/route.ts
git commit -m "fix(crm): automations GET — entité active pour super_admin"
```

---

### Task 7 : `src/app/api/crm/tags/route.ts` (GET + POST uniquement)

**⚠️ NE PAS toucher la fonction DELETE** (déjà corrigée PR #145 ; son `existing.entity_id !== profile.entity_id` ~L153 est un contrôle d'autorisation).

**Files:** Modify: `src/app/api/crm/tags/route.ts`

- [ ] **Step 1 : Import** — ajouter `import { resolveActiveEntityId } from "@/lib/crm/active-entity";`.
- [ ] **Step 2 : GET** — `const activeEntityId = resolveActiveEntityId(profile);` après la garde (~L33). Remplacer `.eq("entity_id", profile.entity_id)` (~L40) → `.eq("entity_id", activeEntityId)`.
- [ ] **Step 3 : POST** — `const activeEntityId = resolveActiveEntityId(profile);` après la garde (~L73). Remplacer `entity_id: profile.entity_id` (~L87, création) → `activeEntityId`.
- [ ] **Step 4 : Typecheck** — Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "crm/tags/route" || echo OK`. Expected: `OK`.
- [ ] **Step 5 : Commit**

```bash
git add src/app/api/crm/tags/route.ts
git commit -m "fix(crm): tags GET/POST — entité active pour super_admin"
```

---

### Task 8 : Les 5 routes à assignation unique

Ces routes assignent l'entité à une variable locale `entityId` en une seule ligne. Pour chacune, remplacer `const entityId = profile.entity_id;` (ou `entityId = profile.entity_id;`) par l'appel au helper, et ajouter l'import.

**⚠️ Routes notifications : ne modifier que la branche « mode utilisateur »** (celle avec `profile`). La branche « mode cron » utilise `body.entity_id` — ne pas y toucher.

**Files:**
- Modify: `src/app/api/crm/segment-count/route.ts`
- Modify: `src/app/api/crm/automations/run/route.ts`
- Modify: `src/app/api/crm/notifications/daily-digest/route.ts`
- Modify: `src/app/api/crm/notifications/weekly-summary/route.ts`
- Modify: `src/app/api/crm/notifications/generate/route.ts`

- [ ] **Step 1 : `segment-count/route.ts`** — ajouter l'import `import { resolveActiveEntityId } from "@/lib/crm/active-entity";` ; remplacer `const entityId = profile.entity_id;` (~L36) par `const entityId = resolveActiveEntityId(profile);`.
- [ ] **Step 2 : `automations/run/route.ts`** — ajouter l'import ; remplacer `const entityId = profile.entity_id;` (~L34) par `const entityId = resolveActiveEntityId(profile);`.
- [ ] **Step 3 : `notifications/daily-digest/route.ts`** — ajouter l'import ; dans la branche mode utilisateur, remplacer `entityId = profile.entity_id;` (~L40) par `entityId = resolveActiveEntityId(profile);`.
- [ ] **Step 4 : `notifications/weekly-summary/route.ts`** — ajouter l'import ; remplacer `entityId = profile.entity_id;` (~L37) par `entityId = resolveActiveEntityId(profile);`.
- [ ] **Step 5 : `notifications/generate/route.ts`** — ajouter l'import ; remplacer `entityId = profile.entity_id;` (~L40) par `entityId = resolveActiveEntityId(profile);`.
- [ ] **Step 6 : Typecheck** — Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "segment-count|automations/run|notifications/" || echo OK`. Expected: `OK`.
- [ ] **Step 7 : Commit**

```bash
git add src/app/api/crm/segment-count/route.ts src/app/api/crm/automations/run/route.ts src/app/api/crm/notifications/daily-digest/route.ts src/app/api/crm/notifications/weekly-summary/route.ts src/app/api/crm/notifications/generate/route.ts
git commit -m "fix(crm): segment-count, automations/run, notifications — entité active"
```

---

### Task 9 : Vérification finale

- [ ] **Step 1 : Typecheck global** — Run: `npx tsc --noEmit -p tsconfig.json`. Expected: aucune erreur.
- [ ] **Step 2 : Suite de tests** — Run: `npx vitest run`. Expected: 400 tests passent (396 existants + 4 du helper).

---

### Vérification manuelle (après déploiement)

- [ ] Connecté en super_admin, sélectionner une entité ≠ celle du profil : les listes (tâches, prospects, devis, suivi, tags) montrent les données de l'entité **sélectionnée**.
- [ ] Créer un prospect / une tâche / un devis : le nouvel enregistrement appartient à l'entité **sélectionnée**.
- [ ] Connecté en admin (non super_admin) : aucun changement de comportement (toujours son entité).
