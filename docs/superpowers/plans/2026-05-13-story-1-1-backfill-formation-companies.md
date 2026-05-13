# Story 1.1 — Backfill `formation_companies` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stopper toute lecture et écriture de la colonne legacy `sessions.client_id` au profit de `formation_companies`, sans rupture utilisateur observable, et préparer Story 1.2 (`DROP COLUMN`) dans une release ultérieure.

**Architecture:** (1) Migration SQL idempotente qui backfille `formation_companies` depuis `sessions.client_id`. (2) Extraction de 3 helpers purs dans `src/lib/services/sessions.ts` (nouveau fichier) avec tests unitaires Vitest et Supabase mocké. (3) Refactor des routes `/api/sessions` et `/api/sessions/[id]` pour utiliser ces helpers. (4) Validation par grep + tsc + tests manuels Loris.

**Tech Stack:** Next.js 14 App Router · TypeScript strict · Supabase (Postgres + JS client) · Vitest 3 (mock Supabase via `vi.fn()`) · `sanitizeDbError` helper existant.

**Spec source :** [docs/superpowers/specs/2026-05-13-story-1-1-backfill-formation-companies-design.md](../specs/2026-05-13-story-1-1-backfill-formation-companies-design.md)

---

## File Structure

### Files to create

| Path | Responsibility |
|---|---|
| `supabase/migrations/backfill_formation_companies_from_legacy_client_id.sql` | Migration SQL idempotente avec block de diagnostic. Exécutée manuellement en prod. |
| `src/lib/services/sessions.ts` | 3 helpers purs : `getSessionIdsByClient`, `linkSessionToCompany`, `createSessionWithOptionalCompany`. Pas de I/O React. Logique pure orchestrée autour du client Supabase passé en argument. |
| `src/lib/services/__tests__/sessions.test.ts` | Tests Vitest avec Supabase mocké pour les 3 helpers (idempotence, rollback, branches null). |

### Files to modify

| Path | Responsibility | Changement |
|---|---|---|
| `src/app/api/sessions/route.ts` | GET filtre `?client_id=X` + POST création | Remplace l'usage direct de `sessions.client_id` par les helpers. Plus court, plus testable. |
| `src/app/api/sessions/[id]/route.ts` | PATCH modification | Retire `client_id` du UPDATE ; appelle `linkSessionToCompany` si fourni. |

---

## Task 1: Migration SQL idempotente

**Files:**
- Create: `supabase/migrations/backfill_formation_companies_from_legacy_client_id.sql`

- [ ] **Step 1: Créer le fichier de migration**

Contenu exact à écrire (copié depuis le spec, section 3) :

```sql
-- Migration : Backfill formation_companies à partir du legacy sessions.client_id
-- Idempotente : ON CONFLICT (session_id, client_id) DO NOTHING
-- Prérequis : aucun (la table formation_companies existe depuis add-formation-management.sql).

INSERT INTO formation_companies (session_id, client_id, amount)
SELECT
  s.id          AS session_id,
  s.client_id   AS client_id,
  s.total_price AS amount   -- INTRA mono-entreprise : amount = total_price ; ajustable manuellement par Loris ensuite
FROM sessions s
WHERE s.client_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM formation_companies fc
    WHERE fc.session_id = s.id
      AND fc.client_id  = s.client_id
  )
ON CONFLICT (session_id, client_id) DO NOTHING;

-- Diagnostic (visible dans psql / Supabase SQL Editor) :
DO $$
DECLARE
  v_legacy_count   INTEGER;
  v_backfilled_now INTEGER;
  v_orphans        INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_legacy_count FROM sessions WHERE client_id IS NOT NULL;
  RAISE NOTICE 'Sessions avec sessions.client_id non null : %', v_legacy_count;

  SELECT COUNT(*) INTO v_backfilled_now
  FROM sessions s
  WHERE s.client_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM formation_companies fc
      WHERE fc.session_id = s.id AND fc.client_id = s.client_id
    );
  RAISE NOTICE 'Sessions ayant désormais une ligne formation_companies correspondante : %', v_backfilled_now;

  v_orphans := v_legacy_count - v_backfilled_now;
  RAISE NOTICE 'Sessions legacy SANS formation_companies après migration (devrait être 0) : %', v_orphans;

  IF v_orphans <> 0 THEN
    RAISE WARNING 'Backfill incomplet : % sessions legacy non backfillées. À investiguer.', v_orphans;
  END IF;
END $$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/backfill_formation_companies_from_legacy_client_id.sql
git commit -m "feat(formations): add backfill migration for formation_companies from legacy sessions.client_id"
```

---

## Task 2: Helper `getSessionIdsByClient` (TDD)

**Files:**
- Create: `src/lib/services/sessions.ts` (initialisé avec ce helper uniquement)
- Create: `src/lib/services/__tests__/sessions.test.ts`

- [ ] **Step 1: Écrire le test qui échoue (`getSessionIdsByClient`)**

Crée le fichier `src/lib/services/__tests__/sessions.test.ts` avec :

```ts
import { describe, it, expect, vi } from "vitest";
import { getSessionIdsByClient } from "@/lib/services/sessions";

// Type minimal du client Supabase utilisé par les helpers
type MockSupabase = {
  from: ReturnType<typeof vi.fn>;
};

function makeSupabaseMock(response: { data: unknown; error: unknown }): MockSupabase {
  const eq = vi.fn().mockResolvedValue(response);
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { from };
}

describe("getSessionIdsByClient", () => {
  it("retourne les session_ids liés à un client_id via formation_companies", async () => {
    const supabase = makeSupabaseMock({
      data: [{ session_id: "s1" }, { session_id: "s2" }],
      error: null,
    });

    const result = await getSessionIdsByClient(supabase as never, "client-1");

    expect(result).toEqual({ ok: true, sessionIds: ["s1", "s2"] });
    expect(supabase.from).toHaveBeenCalledWith("formation_companies");
  });

  it("retourne un tableau vide quand aucune session liée", async () => {
    const supabase = makeSupabaseMock({ data: [], error: null });
    const result = await getSessionIdsByClient(supabase as never, "client-no-match");
    expect(result).toEqual({ ok: true, sessionIds: [] });
  });

  it("propage l'erreur Supabase", async () => {
    const supabase = makeSupabaseMock({
      data: null,
      error: { message: "DB down", code: "PGRST500" },
    });
    const result = await getSessionIdsByClient(supabase as never, "client-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe("DB down");
    }
  });
});
```

- [ ] **Step 2: Faire échouer le test**

Run: `npx vitest run src/lib/services/__tests__/sessions.test.ts`
Expected: FAIL (le module `@/lib/services/sessions` n'existe pas encore, ou la fonction n'est pas exportée).

- [ ] **Step 3: Implémenter `getSessionIdsByClient` minimal pour faire passer le test**

Créer `src/lib/services/sessions.ts` :

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type ServiceResult<T> =
  | { ok: true } & T
  | { ok: false; error: { message: string; code?: string } };

/**
 * Retourne les session_ids liés à un client via formation_companies.
 * Source canonique unique de la liaison session ↔ entreprise (cf. Story 1.1).
 */
export async function getSessionIdsByClient(
  supabase: SupabaseClient,
  clientId: string
): Promise<ServiceResult<{ sessionIds: string[] }>> {
  const { data, error } = await supabase
    .from("formation_companies")
    .select("session_id")
    .eq("client_id", clientId);

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }

  const sessionIds = (data ?? []).map((r: { session_id: string }) => r.session_id);
  return { ok: true, sessionIds };
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run src/lib/services/__tests__/sessions.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no error.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/sessions.ts src/lib/services/__tests__/sessions.test.ts
git commit -m "feat(sessions): add getSessionIdsByClient helper with tests"
```

---

## Task 3: Helper `linkSessionToCompany` (TDD)

**Files:**
- Modify: `src/lib/services/sessions.ts` (ajout du helper)
- Modify: `src/lib/services/__tests__/sessions.test.ts` (ajout des tests)

- [ ] **Step 1: Écrire les tests qui échouent**

Ajoute à `src/lib/services/__tests__/sessions.test.ts` :

```ts
import { linkSessionToCompany } from "@/lib/services/sessions";

describe("linkSessionToCompany", () => {
  it("upsert une ligne formation_companies avec amount", async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = vi.fn().mockReturnValue({ upsert });
    const supabase = { from } as never;

    const result = await linkSessionToCompany(supabase, {
      sessionId: "s1",
      clientId: "c1",
      amount: 1000,
    });

    expect(result.ok).toBe(true);
    expect(from).toHaveBeenCalledWith("formation_companies");
    expect(upsert).toHaveBeenCalledWith(
      { session_id: "s1", client_id: "c1", amount: 1000 },
      { onConflict: "session_id,client_id" }
    );
  });

  it("upsert sans amount si non fourni", async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = vi.fn().mockReturnValue({ upsert });
    const supabase = { from } as never;

    await linkSessionToCompany(supabase, { sessionId: "s1", clientId: "c1" });

    expect(upsert).toHaveBeenCalledWith(
      { session_id: "s1", client_id: "c1", amount: null },
      { onConflict: "session_id,client_id" }
    );
  });

  it("propage l'erreur Supabase", async () => {
    const upsert = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "FK violation", code: "23503" },
    });
    const from = vi.fn().mockReturnValue({ upsert });
    const supabase = { from } as never;

    const result = await linkSessionToCompany(supabase, { sessionId: "s1", clientId: "c1" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe("FK violation");
      expect(result.error.code).toBe("23503");
    }
  });
});
```

- [ ] **Step 2: Faire échouer les tests**

Run: `npx vitest run src/lib/services/__tests__/sessions.test.ts`
Expected: 3 tests fail (linkSessionToCompany not exported).

- [ ] **Step 3: Implémenter `linkSessionToCompany`**

Ajoute à `src/lib/services/sessions.ts` :

```ts
export type LinkSessionToCompanyInput = {
  sessionId: string;
  clientId: string;
  amount?: number | null;
};

/**
 * Lie (ou met à jour) une session à une entreprise via formation_companies.
 * Upsert sur la clé (session_id, client_id) : idempotent.
 */
export async function linkSessionToCompany(
  supabase: SupabaseClient,
  input: LinkSessionToCompanyInput
): Promise<ServiceResult<Record<string, never>>> {
  const { error } = await supabase
    .from("formation_companies")
    .upsert(
      {
        session_id: input.sessionId,
        client_id: input.clientId,
        amount: input.amount ?? null,
      },
      { onConflict: "session_id,client_id" }
    );

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Vérifier que tous les tests passent**

Run: `npx vitest run src/lib/services/__tests__/sessions.test.ts`
Expected: 6 tests pass (3 de Task 2 + 3 nouveaux).

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no error.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/sessions.ts src/lib/services/__tests__/sessions.test.ts
git commit -m "feat(sessions): add linkSessionToCompany helper with tests"
```

---

## Task 4: Helper `createSessionWithOptionalCompany` avec rollback (TDD)

**Files:**
- Modify: `src/lib/services/sessions.ts`
- Modify: `src/lib/services/__tests__/sessions.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajoute à `src/lib/services/__tests__/sessions.test.ts` :

```ts
import { createSessionWithOptionalCompany } from "@/lib/services/sessions";

describe("createSessionWithOptionalCompany", () => {
  function makeSupabaseForCreate(opts: {
    insertSession: { data: unknown; error: unknown };
    insertFormationCompanies?: { data: unknown; error: unknown };
    deleteSession?: { data: unknown; error: unknown };
  }) {
    const insertSingleSession = vi.fn().mockResolvedValue(opts.insertSession);
    const selectAfterInsertSession = vi.fn().mockReturnValue({ single: insertSingleSession });
    const insertSession = vi.fn().mockReturnValue({ select: selectAfterInsertSession });

    const insertFormationCompanies = vi.fn().mockResolvedValue(
      opts.insertFormationCompanies ?? { data: null, error: null }
    );

    const eqDelete = vi.fn().mockResolvedValue(opts.deleteSession ?? { data: null, error: null });
    const deleteSession = vi.fn().mockReturnValue({ eq: eqDelete });

    const from = vi.fn((table: string) => {
      if (table === "sessions") {
        return { insert: insertSession, delete: deleteSession };
      }
      if (table === "formation_companies") {
        return { insert: insertFormationCompanies };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    return { supabase: { from } as never, insertSession, insertFormationCompanies, eqDelete };
  }

  it("crée la session sans client_id et n'appelle pas formation_companies si clientId absent", async () => {
    const { supabase, insertSession, insertFormationCompanies } = makeSupabaseForCreate({
      insertSession: { data: { id: "s1", title: "Test" }, error: null },
    });

    const result = await createSessionWithOptionalCompany(supabase, {
      sessionData: { entity_id: "e1", title: "Test" },
      clientId: null,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.session).toEqual({ id: "s1", title: "Test" });
    expect(insertSession).toHaveBeenCalledTimes(1);
    expect(insertFormationCompanies).not.toHaveBeenCalled();
  });

  it("crée la session et upsert formation_companies si clientId fourni", async () => {
    const { supabase, insertFormationCompanies } = makeSupabaseForCreate({
      insertSession: { data: { id: "s1", title: "T" }, error: null },
    });

    const result = await createSessionWithOptionalCompany(supabase, {
      sessionData: { entity_id: "e1", title: "T", price: 500 },
      clientId: "c1",
    });

    expect(result.ok).toBe(true);
    expect(insertFormationCompanies).toHaveBeenCalledWith({
      session_id: "s1",
      client_id: "c1",
      amount: 500,
    });
  });

  it("rollback (delete session) si insert formation_companies échoue", async () => {
    const { supabase, eqDelete } = makeSupabaseForCreate({
      insertSession: { data: { id: "s1" }, error: null },
      insertFormationCompanies: { data: null, error: { message: "FK error", code: "23503" } },
    });

    const result = await createSessionWithOptionalCompany(supabase, {
      sessionData: { entity_id: "e1", title: "T" },
      clientId: "c1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe("FK error");
    expect(eqDelete).toHaveBeenCalledWith("id", "s1");
  });

  it("retourne l'erreur si l'insert session échoue (pas de tentative formation_companies)", async () => {
    const { supabase, insertFormationCompanies } = makeSupabaseForCreate({
      insertSession: { data: null, error: { message: "RLS denied", code: "42501" } },
    });

    const result = await createSessionWithOptionalCompany(supabase, {
      sessionData: { entity_id: "e1", title: "T" },
      clientId: "c1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe("RLS denied");
    expect(insertFormationCompanies).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Faire échouer les tests**

Run: `npx vitest run src/lib/services/__tests__/sessions.test.ts`
Expected: 4 tests fail (createSessionWithOptionalCompany not exported).

- [ ] **Step 3: Implémenter `createSessionWithOptionalCompany`**

Ajoute à `src/lib/services/sessions.ts` :

```ts
export type CreateSessionInput = {
  sessionData: Record<string, unknown>;
  clientId: string | null | undefined;
};

export type SessionRow = {
  id: string;
  [key: string]: unknown;
};

/**
 * Crée une session et, optionnellement, sa liaison formation_companies (atomicité applicative).
 * Si la liaison échoue, la session est supprimée (rollback applicatif).
 * Le champ `client_id` ne doit JAMAIS apparaître dans sessionData (Story 1.1 — colonne legacy).
 */
export async function createSessionWithOptionalCompany(
  supabase: SupabaseClient,
  input: CreateSessionInput
): Promise<ServiceResult<{ session: SessionRow }>> {
  const { data: session, error: insertError } = await supabase
    .from("sessions")
    .insert(input.sessionData)
    .select()
    .single();

  if (insertError || !session) {
    return {
      ok: false,
      error: {
        message: insertError?.message ?? "Failed to create session",
        code: insertError?.code,
      },
    };
  }

  if (input.clientId) {
    const amount = typeof input.sessionData.price === "number" ? input.sessionData.price : null;
    const { error: fcError } = await supabase
      .from("formation_companies")
      .insert({
        session_id: session.id,
        client_id: input.clientId,
        amount,
      });

    if (fcError) {
      await supabase.from("sessions").delete().eq("id", session.id);
      return {
        ok: false,
        error: { message: fcError.message, code: fcError.code },
      };
    }
  }

  return { ok: true, session };
}
```

- [ ] **Step 4: Vérifier que tous les tests passent**

Run: `npx vitest run src/lib/services/__tests__/sessions.test.ts`
Expected: 10 tests pass.

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no error.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/sessions.ts src/lib/services/__tests__/sessions.test.ts
git commit -m "feat(sessions): add createSessionWithOptionalCompany helper with rollback + tests"
```

---

## Task 5: Refactor GET `/api/sessions` (filtre `?client_id=X`)

**Files:**
- Modify: `src/app/api/sessions/route.ts:45-83` (filtre GET)

- [ ] **Step 1: Lire le fichier pour identifier la zone à modifier**

Lire `src/app/api/sessions/route.ts` lignes 40-100 pour confirmer l'emplacement exact du filtre `?client_id=X`.

- [ ] **Step 2: Importer le helper et remplacer le filtre**

Au début du fichier, ajouter :

```ts
import { getSessionIdsByClient } from "@/lib/services/sessions";
```

Puis remplacer le bloc :

```ts
if (clientId) {
  query = query.eq("client_id", clientId);
}
```

Par :

```ts
if (clientId) {
  const result = await getSessionIdsByClient(supabase, clientId);
  if (!result.ok) {
    return NextResponse.json(
      { data: null, error: result.error.message },
      { status: 500 }
    );
  }
  if (result.sessionIds.length === 0) {
    return NextResponse.json({
      data: [],
      error: null,
      meta: { total: 0, page, per_page: perPage, total_pages: 0 },
    });
  }
  query = query.in("id", result.sessionIds);
}
```

- [ ] **Step 3: Vérifier le SELECT — retirer la jointure `clients (id, company_name)` si elle existait via FK `sessions.client_id`**

Lire les lignes 50-65 du fichier. Si le SELECT contient `clients (id, company_name)` (jointure implicite via la FK `sessions.client_id`), la jointure va échouer après le DROP COLUMN de Story 1.2 mais reste fonctionnelle pendant R1 tant que la colonne existe.

**Décision** : retirer cette jointure **dès maintenant** pour éviter le caller du frontend qui s'attend à `session.clients` (s'il existe). Remplacer si présent :

```ts
.select(
  `
  *,
  trainings (id, title, duration_hours),
  trainers (id, first_name, last_name, email),
  clients (id, company_name),
  enrollments (count)
`,
  { count: "exact" }
)
```

Par :

```ts
.select(
  `
  *,
  trainings (id, title, duration_hours),
  trainers (id, first_name, last_name, email),
  formation_companies (id, client_id, amount, client:clients(id, company_name)),
  enrollments (count)
`,
  { count: "exact" }
)
```

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no error (si erreur sur le typage de la réponse Supabase, ajouter un cast `as unknown as ...` minimal et localisé).

- [ ] **Step 5: Build smoke**

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/sessions/route.ts
git commit -m "refactor(sessions): re-route GET ?client_id filter via formation_companies"
```

---

## Task 6: Refactor POST `/api/sessions` (création session sans `client_id`)

**Files:**
- Modify: `src/app/api/sessions/route.ts:118-219` (handler POST)

- [ ] **Step 1: Importer le helper**

Si pas déjà fait en Task 5, ajouter :

```ts
import { createSessionWithOptionalCompany } from "@/lib/services/sessions";
```

- [ ] **Step 2: Remplacer le bloc INSERT par l'appel au helper**

Localiser le bloc actuel `const { data, error } = await supabase.from("sessions").insert({...}).select().single();` (autour des lignes 161-186).

Remplacer par :

```ts
const result = await createSessionWithOptionalCompany(supabase, {
  sessionData: {
    entity_id: profile.entity_id,
    training_id: training_id ?? null,
    program_id: program_id ?? null,
    trainer_id: trainer_id ?? null,
    // PAS de client_id ici — Story 1.1
    start_date: start_date ?? null,
    end_date: end_date ?? null,
    mode: body.mode ?? "presentiel",
    location: location ?? null,
    address: body.address ?? null,
    city: body.city ?? null,
    postal_code: body.postal_code ?? null,
    max_participants: max_participants ?? null,
    status: status ?? "upcoming",
    notes: notes ?? null,
    price: body.price ?? null,
    internal_notes: body.internal_notes ?? null,
    created_by: user.id,
  },
  clientId: client_id ?? null,
});

if (!result.ok) {
  return NextResponse.json(
    { data: null, error: sanitizeDbError(result.error, "create session") },
    { status: 500 }
  );
}

const data = result.session;
```

Le reste du handler (`logAudit`, `fetch automation`, `return NextResponse.json({ data, ... })`) reste inchangé.

- [ ] **Step 3: Vérifier que `sanitizeDbError` accepte le format `{ message, code }`**

Lire `src/lib/utils/sanitize-error.ts` (ou équivalent — chercher `sanitizeDbError` dans `src/lib/`). Si la signature attend un objet `PostgrestError` avec d'autres champs, créer un adaptateur ou appeler `result.error.message` directement.

Run: `grep -rEn "export.*sanitizeDbError" src/lib/`

Si l'adaptation est nécessaire, remplacer :

```ts
error: sanitizeDbError(result.error, "create session"),
```

Par :

```ts
error: result.error.message,
```

(plus simple, suffisant pour la story).

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no error.

- [ ] **Step 5: Build smoke**

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/sessions/route.ts
git commit -m "refactor(sessions): stop writing sessions.client_id on POST, upsert formation_companies instead"
```

---

## Task 7: Refactor PATCH `/api/sessions/[id]` (update sans `client_id`)

**Files:**
- Modify: `src/app/api/sessions/[id]/route.ts:96-180` (handler PATCH)

- [ ] **Step 1: Importer le helper**

Ajouter en tête de fichier :

```ts
import { linkSessionToCompany } from "@/lib/services/sessions";
```

- [ ] **Step 2: Retirer `client_id` du UPDATE**

Localiser le bloc :

```ts
.update({
  training_id,
  trainer_id: trainer_id ?? null,
  client_id: client_id ?? null,
  // ...
})
```

Remplacer par :

```ts
.update({
  training_id,
  trainer_id: trainer_id ?? null,
  // PAS de client_id ici — Story 1.1
  start_date,
  end_date: end_date ?? null,
  mode: mode ?? "présentiel",
  location: location ?? null,
  address: address ?? null,
  city: city ?? null,
  postal_code: postal_code ?? null,
  max_participants: max_participants ?? null,
  status: sessionStatus ?? "planned",
  notes: notes ?? null,
  price: price ?? null,
  internal_notes: internal_notes ?? null,
  meeting_url: body.meeting_url ?? null,
  updated_at: new Date().toISOString(),
})
```

- [ ] **Step 3: Ajouter l'appel à `linkSessionToCompany` après le UPDATE réussi**

Juste après le bloc `if (updateError) { return NextResponse.json(...) }` (qui gère l'erreur de l'UPDATE), ajouter :

```ts
// Story 1.1 — si client_id fourni dans le body, upsert formation_companies.
// Décision (a) conservatrice : si client_id === null, ne rien faire ; Loris détache via ResumeCompanies.
if (client_id !== undefined && client_id !== null) {
  const linkResult = await linkSessionToCompany(supabase, {
    sessionId: params.id,
    clientId: client_id,
    amount: typeof price === "number" ? price : null,
  });
  if (!linkResult.ok) {
    return NextResponse.json(
      {
        data: null,
        error: `Session mise à jour mais la liaison entreprise a échoué : ${linkResult.error.message}`,
      },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no error.

- [ ] **Step 5: Vérifier que tous les tests passent**

Run: `npx vitest run`
Expected: tous les tests passent (les 10 de `sessions.test.ts` plus les tests existants du projet).

- [ ] **Step 6: Build smoke**

Run: `npm run build`
Expected: success.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/sessions/[id]/route.ts
git commit -m "refactor(sessions): stop writing sessions.client_id on PATCH, upsert formation_companies instead"
```

---

## Task 8: Audit final code source

**Files:**
- No file changes — pure verification.

- [ ] **Step 1: Audit strict des routes sessions**

Run:

```bash
grep -rEn '"client_id"|client_id:' src/app/api/sessions/
```

Expected: aucune occurrence de `client_id` dans les routes `sessions` (sauf dans des commentaires ou la déstructuration du body — qui est attendue). Plus précisément, aucune occurrence où `client_id` est passé comme champ à `.insert()` ou `.update()` sur la table `sessions`.

Si une occurrence inattendue apparaît, investiguer et corriger.

- [ ] **Step 2: Audit large — confirmation absence de lectures résiduelles**

Run :

```bash
grep -rEn 'sessions.*client_id|session\.client_id' src/ --include="*.ts" --include="*.tsx" \
  | grep -vE "formation_companies|enrollments|learners|prospects|quotes|client_id IN|recipient_id|action_type|prospect_id|task_id|quote_id|invoice|//"
```

Expected: aucune occurrence légitime de `sessions.client_id` (les exclusions filtrent les autres tables et les commentaires).

- [ ] **Step 3: Audit callers — vérifier que `?client_id=X` n'est pas utilisé d'une façon non identifiée**

Run :

```bash
grep -rEn 'client_id=|client_id:' src/app/\(dashboard\)/ --include="*.ts" --include="*.tsx"
```

Examiner chaque résultat : doit pointer vers du code CRM, des forms d'apprenants, ou des helpers — pas vers un appel à `/api/sessions?client_id=...` non documenté.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no error (ou warnings préexistants seulement).

- [ ] **Step 5: Build smoke**

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Full test suite**

Run: `npx vitest run`
Expected: tous les tests passent (incluant les 10 nouveaux de `sessions.test.ts`).

---

## Task 9: Commit final + documentation PR

**Files:**
- No code changes — verification + PR creation.

- [ ] **Step 1: Vérifier l'historique des commits**

Run: `git log --oneline main..HEAD`

Expected output (ordre) :

```
<sha7> refactor(sessions): stop writing sessions.client_id on PATCH, upsert formation_companies instead
<sha6> refactor(sessions): stop writing sessions.client_id on POST, upsert formation_companies instead
<sha5> refactor(sessions): re-route GET ?client_id filter via formation_companies
<sha4> feat(sessions): add createSessionWithOptionalCompany helper with rollback + tests
<sha3> feat(sessions): add linkSessionToCompany helper with tests
<sha2> feat(sessions): add getSessionIdsByClient helper with tests
<sha1> feat(formations): add backfill migration for formation_companies from legacy sessions.client_id
<sha0> docs(story-1.1): add design spec for backfill formation_companies + drop sessions.client_id legacy
```

(8 commits atomiques + le commit du spec doc déjà fait au début.)

- [ ] **Step 2: Push vers origin**

```bash
git push -u origin feat/story-1.1-backfill-formation-companies
```

- [ ] **Step 3: HALT — Handoff manuel à Wissam pour la suite**

Les étapes restantes nécessitent **action humaine** :
1. Exécuter le dry-run sur snapshot prod et coller l'output des `RAISE NOTICE` dans la PR description.
2. Créer la PR via `gh pr create` (titre + description selon le spec section 9).
3. Exécuter la migration en prod (avant le merge de la PR).
4. Merge la PR → Netlify deploy auto.
5. Monitoring Sentry 7 jours — vérifier l'absence d'erreurs liées à `client_id` sur les routes `sessions`.
6. Si OK après 7j → ouvrir Story 1.2.

**Ne pas créer la PR ni pousser en prod sans la validation manuelle de Wissam.**

---

## Self-Review (auteur du plan)

**1. Spec coverage**

| Spec section | Task couvrant |
|---|---|
| §3 Migration SQL | Task 1 |
| §4 Refactor GET | Task 5 |
| §4 Refactor POST | Tasks 4 + 6 (helper + intégration) |
| §5 Refactor PATCH | Tasks 3 + 7 (helper + intégration) |
| §5 PATCH `client_id = null` conservateur | Task 7 step 3 (condition `client_id !== null`) |
| §5 Rollback PATCH partiel = 500 clair | Task 7 step 3 (message d'erreur explicite) |
| §6 Validation | Tasks 2-4 (tests Vitest) + Task 8 (audit + build + lint) |
| §7 Risques (mitigations applicatives) | Couverts par Tasks 4 (rollback POST), 7 (no-rollback PATCH) |
| §8 Audit code final | Task 8 |
| §9 Stratégie commits | Tasks 1-7 (1 commit par task) + Task 9 |
| §10 Hors scope | Pas de task — Story 1.2 |

Coverage complète, aucune section orpheline.

**2. Placeholder scan**

Aucun "TODO", "TBD", "implement later". Tous les snippets de code sont complets. Tous les commands ont un "Expected output" explicite.

**3. Type consistency**

- `ServiceResult<T>` défini en Task 2, utilisé en Tasks 3 et 4. ✓
- `getSessionIdsByClient`, `linkSessionToCompany`, `createSessionWithOptionalCompany` — signatures cohérentes entre tests et implementations. ✓
- `client_id` (snake_case) utilisé partout côté DB et body API ; `clientId` (camelCase) utilisé côté helpers TypeScript. Cohérent avec le reste du projet. ✓
- `sessionData` champ `price` typé optionnel `number` → cohérent entre Task 4 helper et Task 6 caller. ✓

**4. Conformité méthodologie utilisateur**

- ✅ Brainstorming superpowers : effectué avant ce plan.
- ✅ TDD pour la logique critique : Tasks 2, 3, 4 (helpers extraits + tests Vitest first).
- ✅ Commits atomiques : 1 task = 1 commit.
- ✅ `npx tsc --noEmit` + tests à chaque commit : étapes explicites dans chaque task.
- ✅ Push + PR : Task 9.
- ✅ Validation des AC Given/When/Then : implicite via Task 8 (audit code) + handoff Wissam (tests manuels Loris).

Plan complet et exécutable.
