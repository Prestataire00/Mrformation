# Accès formateur — liaison & création de compte plateforme — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Depuis l'espace admin (fiche formateur + cards du hub), permettre par formateur de créer un accès plateforme, relier à un compte formateur orphelin existant, réinitialiser le mot de passe et délier.

**Architecture:** Un service `trainer-account.ts` (service_role) centralise toute la logique de compte formateur ; des routes `/api/trainers/[id]/access` (POST/PATCH/DELETE) + `/candidates` (GET) l'exposent avec `requireRole` + garde cross-entité ; deux composants UI (`TrainerAccessCard`, `LinkExistingAccountDialog`) câblent la fiche détail, et un badge signale l'état du compte sur les cards du hub. La route batch existante est refactorée pour réutiliser le même service.

**Tech Stack:** Next.js 14 (App Router), TypeScript strict, Supabase (service_role admin client), Vitest, shadcn/ui.

**Référence spec:** `docs/superpowers/specs/2026-06-19-acces-formateur-compte-plateforme-design.md`

---

## File Structure

**Créer :**
- `src/lib/services/trainer-account.ts` — service : `ensureTrainerAccount`, `resetTrainerPassword`, `listOrphanTrainerAccounts`, `linkTrainerToProfile`, `unlinkTrainerProfile` + helpers email/password.
- `src/lib/services/__tests__/trainer-account.test.ts` — tests Vitest du service.
- `src/app/api/trainers/[id]/access/route.ts` — POST (créer/reset), PATCH (relier), DELETE (délier).
- `src/app/api/trainers/[id]/access/candidates/route.ts` — GET (comptes orphelins).
- `src/app/(dashboard)/admin/trainers/_components/TrainerAccessCard.tsx` — carte « Accès plateforme » de la fiche détail.
- `src/app/(dashboard)/admin/trainers/_components/LinkExistingAccountDialog.tsx` — dialog de liaison à un orphelin.

**Modifier :**
- `src/app/api/trainers/batch-create-credentials/route.ts` — réutiliser `ensureTrainerAccount` (suppression de la logique inline).
- `src/app/(dashboard)/admin/trainers/[id]/page.tsx` — rendre `TrainerAccessCard` dans l'onglet Profil.
- `src/app/(dashboard)/admin/trainers/page.tsx` — badge « Compte ✓ / Pas de compte » sur les cards.

**Aucune migration SQL** (`trainers.profile_id` existe déjà).

---

## Task 1: Service — helpers + `ensureTrainerAccount`

**Files:**
- Create: `src/lib/services/trainer-account.ts`
- Test: `src/lib/services/__tests__/trainer-account.test.ts`

- [ ] **Step 1: Écrire le fichier de tests (helper de mock + tests `ensureTrainerAccount`)**

Create `src/lib/services/__tests__/trainer-account.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import {
  ensureTrainerAccount,
  buildTrainerSyntheticEmail,
} from "@/lib/services/trainer-account";

/**
 * Mock chaînable d'un query builder Supabase : chaque méthode renvoie `this`,
 * l'objet est thenable → `await` résout `result`.
 */
function chainResolving(result: unknown) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "in", "not", "update", "upsert", "order", "single"]) {
    builder[m] = vi.fn(() => builder);
  }
  (builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result);
  return builder;
}

describe("buildTrainerSyntheticEmail", () => {
  it("génère un email synthétique non routable basé sur nom + id + slug entité", () => {
    const email = buildTrainerSyntheticEmail(
      { id: "abcd1234ef56", first_name: "Jean", last_name: "Dupont" },
      "mr-formation",
    );
    expect(email).toBe("dupont-jean.abcd1234@trainer.mr-formation.local");
  });
});

describe("ensureTrainerAccount", () => {
  it("est idempotent : si déjà relié, ne crée rien (status 'skipped')", async () => {
    const createUser = vi.fn();
    const from = vi.fn();
    const admin = { from, auth: { admin: { createUser } } } as never;

    const res = await ensureTrainerAccount(admin, {
      trainer: { id: "t1", entity_id: "ENT-A", first_name: "J", last_name: "D", email: "j@ex.com", profile_id: "existing" },
      entitySlug: "mr-formation",
    });

    expect(res.status).toBe("skipped");
    expect(createUser).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("crée le compte auth, upsert le profil 'trainer' et relie la fiche (email réel)", async () => {
    const createUser = vi.fn().mockResolvedValue({ data: { user: { id: "new-uid" } }, error: null });
    const profilesUpsert = chainResolving({ error: null });
    const trainersUpdate = chainResolving({ error: null });
    const from = vi.fn()
      .mockReturnValueOnce(profilesUpsert)
      .mockReturnValueOnce(trainersUpdate);
    const admin = { from, auth: { admin: { createUser } } } as never;

    const res = await ensureTrainerAccount(admin, {
      trainer: { id: "t1", entity_id: "ENT-A", first_name: "Jean", last_name: "Dupont", email: "jean@ex.com", profile_id: null },
      entitySlug: "mr-formation",
    });

    expect(res.status).toBe("created");
    expect(res.email).toBe("jean@ex.com");
    expect(res.password).toEqual(expect.any(String));
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: "jean@ex.com", email_confirm: true }));
    expect(profilesUpsert.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "new-uid", role: "trainer", entity_id: "ENT-A" }),
      { onConflict: "id" },
    );
    expect(trainersUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({ profile_id: "new-uid", email: "jean@ex.com" }),
    );
  });

  it("utilise un email synthétique quand le formateur n'a pas d'email réel", async () => {
    const createUser = vi.fn().mockResolvedValue({ data: { user: { id: "uid" } }, error: null });
    const from = vi.fn().mockReturnValue(chainResolving({ error: null }));
    const admin = { from, auth: { admin: { createUser } } } as never;

    const res = await ensureTrainerAccount(admin, {
      trainer: { id: "abcd1234ef", entity_id: "ENT-A", first_name: "Jean", last_name: "Dupont", email: null, profile_id: null },
      entitySlug: "mr-formation",
    });

    expect(res.status).toBe("created");
    expect(res.syntheticEmailUsed).toBe(true);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: expect.stringContaining("@trainer.mr-formation.local") }),
    );
  });

  it("renvoie status 'error' si la création auth échoue (et pas de repli si déjà synthétique)", async () => {
    const createUser = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const from = vi.fn();
    const admin = { from, auth: { admin: { createUser } } } as never;

    const res = await ensureTrainerAccount(admin, {
      trainer: { id: "t1", entity_id: "ENT-A", first_name: null, last_name: null, email: null, profile_id: null },
      entitySlug: "s",
    });

    expect(res.status).toBe("error");
    expect(res.error).toBe("boom");
    expect(from).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `npx vitest run src/lib/services/__tests__/trainer-account.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/services/trainer-account"`.

- [ ] **Step 3: Écrire le service (helpers + `ensureTrainerAccount`)**

Create `src/lib/services/trainer-account.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateTempPassword } from "@/lib/services/learner-account";

/** Fiche formateur minimale nécessaire aux opérations de compte. */
export type TrainerAccountRow = {
  id: string;
  entity_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  profile_id: string | null;
};

function slugify(s: string): string {
  return (
    (s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "formateur"
  );
}

/** Email synthétique non routable, identique au format historique de la batch route. */
export function buildTrainerSyntheticEmail(
  trainer: { id: string; first_name?: string | null; last_name?: string | null },
  entitySlug: string,
): string {
  const name = slugify(`${trainer.last_name ?? ""}-${trainer.first_name ?? ""}`);
  return `${name}.${trainer.id.slice(0, 8)}@trainer.${entitySlug}.local`;
}

export type EnsureTrainerAccountResult = {
  status: "created" | "skipped" | "error";
  email: string | null;
  password: string | null;
  syntheticEmailUsed: boolean;
  error: string | null;
};

/**
 * Crée le compte Supabase Auth d'un formateur (email réel sinon synthétique),
 * upsert son profil `trainer` et relie la fiche (`trainers.profile_id` + `email`).
 * Idempotent : si la fiche est déjà reliée → status 'skipped' sans rien recréer.
 * `usedEmails` permet de dédupliquer les emails réels au sein d'un batch.
 * Requiert un client service_role (appels `auth.admin.*`).
 */
export async function ensureTrainerAccount(
  admin: SupabaseClient,
  params: { trainer: TrainerAccountRow; entitySlug: string; usedEmails?: Set<string> },
): Promise<EnsureTrainerAccountResult> {
  const { trainer, entitySlug } = params;
  const usedEmails = params.usedEmails ?? new Set<string>();

  if (trainer.profile_id) {
    return { status: "skipped", email: trainer.email, password: null, syntheticEmailUsed: false, error: null };
  }

  const realEmail = (trainer.email ?? "").trim().toLowerCase();
  const hasUsableEmail =
    !!realEmail && realEmail.includes("@") && !realEmail.endsWith(".local") && !usedEmails.has(realEmail);
  let resolvedEmail = hasUsableEmail ? realEmail : buildTrainerSyntheticEmail(trainer, entitySlug);
  let syntheticUsed = !hasUsableEmail;

  const password = generateTempPassword();

  let { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: resolvedEmail,
    password,
    email_confirm: true,
    user_metadata: { first_name: trainer.first_name, last_name: trainer.last_name },
  });

  // Email déjà pris dans Auth → repli sur synthétique (une seule fois).
  if (authError && !syntheticUsed) {
    resolvedEmail = buildTrainerSyntheticEmail(trainer, entitySlug);
    syntheticUsed = true;
    ({ data: authUser, error: authError } = await admin.auth.admin.createUser({
      email: resolvedEmail,
      password,
      email_confirm: true,
      user_metadata: { first_name: trainer.first_name, last_name: trainer.last_name },
    }));
  }

  if (authError || !authUser?.user) {
    return {
      status: "error",
      email: resolvedEmail,
      password: null,
      syntheticEmailUsed: syntheticUsed,
      error: authError?.message ?? "Création auth échouée",
    };
  }

  usedEmails.add(resolvedEmail);

  await admin.from("profiles").upsert(
    {
      id: authUser.user.id,
      email: resolvedEmail,
      first_name: trainer.first_name,
      last_name: trainer.last_name,
      role: "trainer",
      entity_id: trainer.entity_id,
      is_active: true,
    },
    { onConflict: "id" },
  );

  await admin
    .from("trainers")
    .update({ profile_id: authUser.user.id, email: resolvedEmail })
    .eq("id", trainer.id)
    .eq("entity_id", trainer.entity_id);

  return { status: "created", email: resolvedEmail, password, syntheticEmailUsed: syntheticUsed, error: null };
}
```

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Run: `npx vitest run src/lib/services/__tests__/trainer-account.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/trainer-account.ts src/lib/services/__tests__/trainer-account.test.ts
git commit -m "feat(trainer-account): ensureTrainerAccount + helpers (service partagé)"
```

---

## Task 2: Service — `resetTrainerPassword`

**Files:**
- Modify: `src/lib/services/trainer-account.ts`
- Test: `src/lib/services/__tests__/trainer-account.test.ts` (le helper `chainResolving` y est déjà défini en Task 1)

- [ ] **Step 1: Ajouter les tests `resetTrainerPassword`**

Ajouter l'import en tête du fichier de test (compléter la ligne d'import existante) :

```ts
import {
  ensureTrainerAccount,
  buildTrainerSyntheticEmail,
  resetTrainerPassword,
} from "@/lib/services/trainer-account";
```

Ajouter ce bloc à la fin du fichier de test :

```ts
describe("resetTrainerPassword", () => {
  it("régénère le mot de passe via updateUserById quand la fiche a un profile_id", async () => {
    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue(
      chainResolving({ data: { id: "t1", entity_id: "ENT-A", email: "j@ex.com", profile_id: "p1" }, error: null }),
    );
    const admin = { from, auth: { admin: { updateUserById } } } as never;

    const res = await resetTrainerPassword(admin, { entityId: "ENT-A", trainerId: "t1" });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.email).toBe("j@ex.com");
      expect(res.password).toEqual(expect.any(String));
    }
    expect(updateUserById).toHaveBeenCalledWith("p1", { password: expect.any(String) });
  });

  it("échoue sans toucher à Auth si la fiche n'a pas de profile_id", async () => {
    const updateUserById = vi.fn();
    const from = vi.fn().mockReturnValue(
      chainResolving({ data: { id: "t1", entity_id: "ENT-A", email: null, profile_id: null }, error: null }),
    );
    const admin = { from, auth: { admin: { updateUserById } } } as never;

    const res = await resetTrainerPassword(admin, { entityId: "ENT-A", trainerId: "t1" });

    expect(res.ok).toBe(false);
    expect(updateUserById).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `npx vitest run src/lib/services/__tests__/trainer-account.test.ts`
Expected: FAIL — `resetTrainerPassword is not exported` / not a function.

- [ ] **Step 3: Implémenter `resetTrainerPassword`**

Ajouter à `src/lib/services/trainer-account.ts` :

```ts
export type ResetTrainerPasswordResult =
  | { ok: true; email: string | null; password: string }
  | { ok: false; error: string };

/** Régénère le mot de passe d'un formateur déjà relié. Renvoie le nouveau mot de passe (affiché une fois). */
export async function resetTrainerPassword(
  admin: SupabaseClient,
  params: { entityId: string; trainerId: string },
): Promise<ResetTrainerPasswordResult> {
  const { data: trainer } = await admin
    .from("trainers")
    .select("id, entity_id, email, profile_id")
    .eq("id", params.trainerId)
    .eq("entity_id", params.entityId)
    .single();

  if (!trainer) return { ok: false, error: "Formateur introuvable" };
  if (!trainer.profile_id) return { ok: false, error: "Ce formateur n'a pas de compte à réinitialiser" };

  const password = generateTempPassword();
  const { error } = await admin.auth.admin.updateUserById(trainer.profile_id as string, { password });
  if (error) return { ok: false, error: error.message };

  return { ok: true, email: (trainer.email as string | null) ?? null, password };
}
```

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Run: `npx vitest run src/lib/services/__tests__/trainer-account.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/trainer-account.ts src/lib/services/__tests__/trainer-account.test.ts
git commit -m "feat(trainer-account): resetTrainerPassword"
```

---

## Task 3: Service — `listOrphanTrainerAccounts`

**Files:**
- Modify: `src/lib/services/trainer-account.ts`
- Test: `src/lib/services/__tests__/trainer-account.test.ts`

- [ ] **Step 1: Ajouter les tests `listOrphanTrainerAccounts`**

Compléter l'import du fichier de test :

```ts
import {
  ensureTrainerAccount,
  buildTrainerSyntheticEmail,
  resetTrainerPassword,
  listOrphanTrainerAccounts,
} from "@/lib/services/trainer-account";
```

Ajouter à la fin du fichier de test :

```ts
describe("listOrphanTrainerAccounts", () => {
  it("renvoie les profils 'trainer' de l'entité non reliés à une fiche", async () => {
    const from = vi.fn()
      .mockReturnValueOnce(
        chainResolving({
          data: [
            { id: "p1", email: "a@ex.com", first_name: "A", last_name: "A" },
            { id: "p2", email: "b@ex.com", first_name: "B", last_name: "B" },
          ],
          error: null,
        }),
      )
      .mockReturnValueOnce(chainResolving({ data: [{ profile_id: "p2" }], error: null }));
    const admin = { from } as never;

    const res = await listOrphanTrainerAccounts(admin, "ENT-A");

    expect(res.map((o) => o.id)).toEqual(["p1"]);
    expect(from).toHaveBeenNthCalledWith(1, "profiles");
    expect(from).toHaveBeenNthCalledWith(2, "trainers");
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `npx vitest run src/lib/services/__tests__/trainer-account.test.ts`
Expected: FAIL — `listOrphanTrainerAccounts is not a function`.

- [ ] **Step 3: Implémenter `listOrphanTrainerAccounts`**

Ajouter à `src/lib/services/trainer-account.ts` :

```ts
export type OrphanTrainerAccount = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
};

/**
 * Comptes formateur "orphelins" : profils `role = 'trainer'` de l'entité qui ne sont
 * reliés à aucune fiche `trainers`. Sert à proposer une liaison à un compte existant.
 */
export async function listOrphanTrainerAccounts(
  admin: SupabaseClient,
  entityId: string,
): Promise<OrphanTrainerAccount[]> {
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, first_name, last_name")
    .eq("role", "trainer")
    .eq("entity_id", entityId);

  const { data: linked } = await admin
    .from("trainers")
    .select("profile_id")
    .eq("entity_id", entityId)
    .not("profile_id", "is", null);

  const linkedIds = new Set((linked ?? []).map((r) => r.profile_id as string));
  return ((profiles ?? []) as OrphanTrainerAccount[]).filter((p) => !linkedIds.has(p.id));
}
```

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Run: `npx vitest run src/lib/services/__tests__/trainer-account.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/trainer-account.ts src/lib/services/__tests__/trainer-account.test.ts
git commit -m "feat(trainer-account): listOrphanTrainerAccounts"
```

---

## Task 4: Service — `linkTrainerToProfile` + `unlinkTrainerProfile`

**Files:**
- Modify: `src/lib/services/trainer-account.ts`
- Test: `src/lib/services/__tests__/trainer-account.test.ts`

- [ ] **Step 1: Ajouter les tests link/unlink**

Compléter l'import du fichier de test :

```ts
import {
  ensureTrainerAccount,
  buildTrainerSyntheticEmail,
  resetTrainerPassword,
  listOrphanTrainerAccounts,
  linkTrainerToProfile,
  unlinkTrainerProfile,
} from "@/lib/services/trainer-account";
```

Ajouter à la fin du fichier de test :

```ts
describe("linkTrainerToProfile", () => {
  it("refuse un profil qui n'est pas un orphelin (et n'appelle pas update)", async () => {
    // profiles → p1 seul ; linked → vide ⇒ orphelins = [p1]. On tente de lier p9.
    const from = vi.fn()
      .mockReturnValueOnce(chainResolving({ data: [{ id: "p1", email: null, first_name: null, last_name: null }], error: null }))
      .mockReturnValueOnce(chainResolving({ data: [], error: null }));
    const admin = { from } as never;

    const res = await linkTrainerToProfile(admin, { entityId: "ENT-A", trainerId: "t1", profileId: "p9" });

    expect(res.ok).toBe(false);
    expect(from).toHaveBeenCalledTimes(2); // pas de 3e appel (update)
  });

  it("relie la fiche au profil orphelin valide", async () => {
    const updateChain = chainResolving({ error: null });
    const from = vi.fn()
      .mockReturnValueOnce(chainResolving({ data: [{ id: "p1", email: null, first_name: null, last_name: null }], error: null }))
      .mockReturnValueOnce(chainResolving({ data: [], error: null }))
      .mockReturnValueOnce(updateChain);
    const admin = { from } as never;

    const res = await linkTrainerToProfile(admin, { entityId: "ENT-A", trainerId: "t1", profileId: "p1" });

    expect(res.ok).toBe(true);
    expect(updateChain.update).toHaveBeenCalledWith({ profile_id: "p1" });
  });
});

describe("unlinkTrainerProfile", () => {
  it("met profile_id à null sur la fiche", async () => {
    const updateChain = chainResolving({ error: null });
    const from = vi.fn().mockReturnValue(updateChain);
    const admin = { from } as never;

    const res = await unlinkTrainerProfile(admin, { entityId: "ENT-A", trainerId: "t1" });

    expect(res.ok).toBe(true);
    expect(updateChain.update).toHaveBeenCalledWith({ profile_id: null });
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `npx vitest run src/lib/services/__tests__/trainer-account.test.ts`
Expected: FAIL — `linkTrainerToProfile is not a function`.

- [ ] **Step 3: Implémenter link/unlink**

Ajouter à `src/lib/services/trainer-account.ts` :

```ts
export type LinkResult = { ok: true } | { ok: false; error: string };

/** Relie une fiche à un compte formateur orphelin de la MÊME entité (validation serveur). */
export async function linkTrainerToProfile(
  admin: SupabaseClient,
  params: { entityId: string; trainerId: string; profileId: string },
): Promise<LinkResult> {
  const orphans = await listOrphanTrainerAccounts(admin, params.entityId);
  if (!orphans.some((o) => o.id === params.profileId)) {
    return { ok: false, error: "Compte non éligible (doit être un compte formateur non relié de cette entité)" };
  }
  const { error } = await admin
    .from("trainers")
    .update({ profile_id: params.profileId })
    .eq("id", params.trainerId)
    .eq("entity_id", params.entityId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Délie une fiche de son compte (le compte auth subsiste → redevient orphelin, ré-liable). */
export async function unlinkTrainerProfile(
  admin: SupabaseClient,
  params: { entityId: string; trainerId: string },
): Promise<LinkResult> {
  const { error } = await admin
    .from("trainers")
    .update({ profile_id: null })
    .eq("id", params.trainerId)
    .eq("entity_id", params.entityId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
```

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Run: `npx vitest run src/lib/services/__tests__/trainer-account.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/trainer-account.ts src/lib/services/__tests__/trainer-account.test.ts
git commit -m "feat(trainer-account): link/unlink fiche ↔ compte orphelin"
```

---

## Task 5: Refactor de la route batch pour réutiliser `ensureTrainerAccount`

**Files:**
- Modify: `src/app/api/trainers/batch-create-credentials/route.ts`

- [ ] **Step 1: Remplacer les helpers inline par l'import du service**

Dans `src/app/api/trainers/batch-create-credentials/route.ts` :

1. Ajouter sous les imports existants :

```ts
import { ensureTrainerAccount } from "@/lib/services/trainer-account";
```

2. **Supprimer** les fonctions locales devenues inutiles : `generatePassword` (lignes ~31-36), `slugify` (lignes ~38-46) et `buildTrainerSyntheticEmail` (lignes ~48-51).

- [ ] **Step 2: Remplacer le corps de la boucle par un appel au service**

Remplacer toute la boucle `for (const trainer of targets) { … }` (du `const fullName` jusqu'à la fin du `catch`, lignes ~134-211) par :

```ts
    for (const trainer of targets) {
      const fullName = `${trainer.first_name ?? ""} ${trainer.last_name ?? ""}`.trim() || "Formateur";
      const res = await ensureTrainerAccount(adminClient, { trainer, entitySlug, usedEmails });
      results.push({
        trainerId: trainer.id,
        fullName,
        success: res.status !== "error",
        email: res.email,
        password: res.password,
        syntheticEmailUsed: res.syntheticEmailUsed,
        error: res.error,
        skipped: res.status === "skipped",
      });
    }
```

(`usedEmails` reste déclaré juste avant la boucle : `const usedEmails = new Set<string>();`. Le `const results: BatchResultItem[] = [];` reste inchangé.)

- [ ] **Step 3: Vérifier le typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "batch-create-credentials" || echo "OK"`
Expected: `OK` (aucune erreur sur ce fichier). Note : `TrainerLite` (déjà défini dans la route) a exactement la forme de `TrainerAccountRow` → assignable.

- [ ] **Step 4: Vérifier que la suite de tests reste verte**

Run: `npx vitest run`
Expected: tous les tests passent (aucun test ne couvrait la route batch ; la logique est préservée — email réel/synthétique, repli, skip si déjà relié ; seul le mot de passe passe de 10 à 12 caractères, ce qui est sans impact fonctionnel).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/trainers/batch-create-credentials/route.ts
git commit -m "refactor(trainers/batch): réutiliser ensureTrainerAccount (DRY)"
```

---

## Task 6: Route `/api/trainers/[id]/access` (POST/PATCH/DELETE)

**Files:**
- Create: `src/app/api/trainers/[id]/access/route.ts`

- [ ] **Step 1: Écrire la route**

Create `src/app/api/trainers/[id]/access/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/require-role";
import { logAudit } from "@/lib/audit-log";
import {
  ensureTrainerAccount,
  resetTrainerPassword,
  linkTrainerToProfile,
  unlinkTrainerProfile,
  type TrainerAccountRow,
} from "@/lib/services/trainer-account";

interface RouteContext {
  params: { id: string };
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Charge la fiche + garde cross-entité (super_admin bypass). Renvoie la fiche ou une réponse d'erreur. */
async function loadTrainerGuarded(
  admin: SupabaseClient,
  trainerId: string,
  auth: { profile: { role: string; entity_id: string | null } },
): Promise<{ trainer: TrainerAccountRow } | { error: NextResponse }> {
  const { data: trainer } = await admin
    .from("trainers")
    .select("id, entity_id, first_name, last_name, email, profile_id")
    .eq("id", trainerId)
    .single();
  if (!trainer) return { error: NextResponse.json({ error: "Formateur introuvable" }, { status: 404 }) };
  const isSuperAdmin = auth.profile.role === "super_admin";
  if (!isSuperAdmin && trainer.entity_id !== auth.profile.entity_id) {
    return { error: NextResponse.json({ error: "Accès refusé" }, { status: 403 }) };
  }
  return { trainer: trainer as TrainerAccountRow };
}

// POST : crée l'accès si la fiche n'a pas de compte, sinon réinitialise le mot de passe.
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const admin = createAdminClient();
    const guard = await loadTrainerGuarded(admin, params.id, auth);
    if ("error" in guard) return guard.error;
    const { trainer } = guard;

    if (trainer.profile_id) {
      const res = await resetTrainerPassword(admin, { entityId: trainer.entity_id, trainerId: trainer.id });
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      logAudit({
        supabase: admin, entityId: trainer.entity_id, userId: auth.user.id,
        action: "update", resourceType: "trainers.access", resourceId: trainer.id, details: { verb: "reset" },
      });
      return NextResponse.json({ ok: true, action: "reset", email: res.email, password: res.password, synthetic_email_used: false });
    }

    const { data: entityRow } = await admin.from("entities").select("slug").eq("id", trainer.entity_id).single();
    const entitySlug = (entityRow?.slug as string | undefined) ?? "mr-formation";
    const res = await ensureTrainerAccount(admin, { trainer, entitySlug });
    if (res.status === "error") return NextResponse.json({ error: res.error }, { status: 400 });
    logAudit({
      supabase: admin, entityId: trainer.entity_id, userId: auth.user.id,
      action: "create", resourceType: "trainers.access", resourceId: trainer.id,
      details: { verb: "created", synthetic: res.syntheticEmailUsed },
    });
    return NextResponse.json({ ok: true, action: "created", email: res.email, password: res.password, synthetic_email_used: res.syntheticEmailUsed });
  } catch (err) {
    console.error("[trainers/[id]/access POST]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur interne" }, { status: 500 });
  }
}

// PATCH : relie la fiche à un compte orphelin existant.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const body = await request.json().catch(() => ({}));
    const profileId: string | undefined = typeof body.profile_id === "string" ? body.profile_id : undefined;
    if (!profileId) return NextResponse.json({ error: "profile_id requis" }, { status: 400 });

    const admin = createAdminClient();
    const guard = await loadTrainerGuarded(admin, params.id, auth);
    if ("error" in guard) return guard.error;
    const { trainer } = guard;

    const res = await linkTrainerToProfile(admin, { entityId: trainer.entity_id, trainerId: trainer.id, profileId });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    logAudit({
      supabase: admin, entityId: trainer.entity_id, userId: auth.user.id,
      action: "update", resourceType: "trainers.access", resourceId: trainer.id, details: { verb: "linked", profileId },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[trainers/[id]/access PATCH]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur interne" }, { status: 500 });
  }
}

// DELETE : délie la fiche (le compte auth subsiste).
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const admin = createAdminClient();
    const guard = await loadTrainerGuarded(admin, params.id, auth);
    if ("error" in guard) return guard.error;
    const { trainer } = guard;

    const res = await unlinkTrainerProfile(admin, { entityId: trainer.entity_id, trainerId: trainer.id });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    logAudit({
      supabase: admin, entityId: trainer.entity_id, userId: auth.user.id,
      action: "delete", resourceType: "trainers.access", resourceId: trainer.id, details: { verb: "unlinked" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[trainers/[id]/access DELETE]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur interne" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Vérifier le typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "access/route" || echo "OK"`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/trainers/[id]/access/route.ts"
git commit -m "feat(api): /api/trainers/[id]/access (créer/reset/relier/délier)"
```

---

## Task 7: Route `GET /api/trainers/[id]/access/candidates`

**Files:**
- Create: `src/app/api/trainers/[id]/access/candidates/route.ts`

- [ ] **Step 1: Écrire la route**

Create `src/app/api/trainers/[id]/access/candidates/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/require-role";
import { listOrphanTrainerAccounts } from "@/lib/services/trainer-account";

interface RouteContext {
  params: { id: string };
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Liste les comptes formateur orphelins de l'entité de la fiche (pour le dialog de liaison).
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const admin = createAdminClient();
    const { data: trainer } = await admin
      .from("trainers")
      .select("id, entity_id")
      .eq("id", params.id)
      .single();
    if (!trainer) return NextResponse.json({ error: "Formateur introuvable" }, { status: 404 });
    const isSuperAdmin = auth.profile.role === "super_admin";
    if (!isSuperAdmin && trainer.entity_id !== auth.profile.entity_id) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    const candidates = await listOrphanTrainerAccounts(admin, trainer.entity_id as string);
    return NextResponse.json({ ok: true, candidates });
  } catch (err) {
    console.error("[trainers/[id]/access/candidates GET]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur interne" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Vérifier le typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "candidates/route" || echo "OK"`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/trainers/[id]/access/candidates/route.ts"
git commit -m "feat(api): GET /api/trainers/[id]/access/candidates (orphelins)"
```

---

## Task 8: Composant `LinkExistingAccountDialog`

**Files:**
- Create: `src/app/(dashboard)/admin/trainers/_components/LinkExistingAccountDialog.tsx`

- [ ] **Step 1: Écrire le composant**

Create `src/app/(dashboard)/admin/trainers/_components/LinkExistingAccountDialog.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Search, Link2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

interface OrphanAccount {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
}

interface LinkExistingAccountDialogProps {
  trainerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: () => void;
}

export default function LinkExistingAccountDialog({
  trainerId,
  open,
  onOpenChange,
  onLinked,
}: LinkExistingAccountDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<OrphanAccount[]>([]);
  const [search, setSearch] = useState("");

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/trainers/${trainerId}/access/candidates`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur de chargement");
      setCandidates(data.candidates ?? []);
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [trainerId, toast]);

  useEffect(() => {
    if (open) {
      setSearch("");
      loadCandidates();
    }
  }, [open, loadCandidates]);

  const filtered = candidates.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (c.email ?? "").toLowerCase().includes(q) ||
      `${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase().includes(q)
    );
  });

  const handleLink = async (profileId: string) => {
    setLinkingId(profileId);
    try {
      const res = await fetch(`/api/trainers/${trainerId}/access`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: profileId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec de la liaison");
      toast({ title: "Compte relié", description: "La fiche est désormais reliée au compte sélectionné." });
      onOpenChange(false);
      onLinked();
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur", variant: "destructive" });
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Relier à un compte existant</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par email ou nom"
              className="pl-8"
            />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border divide-y">
            {loading ? (
              <div className="py-10 text-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                <p className="text-sm">Chargement…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Aucun compte formateur non relié disponible.
              </div>
            ) : (
              filtered.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "—"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{c.email || "—"}</p>
                  </div>
                  <Button size="sm" variant="outline" disabled={linkingId !== null} onClick={() => handleLink(c.id)}>
                    {linkingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    Relier
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Vérifier le typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "LinkExistingAccountDialog" || echo "OK"`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/admin/trainers/_components/LinkExistingAccountDialog.tsx"
git commit -m "feat(trainers): dialog de liaison à un compte orphelin"
```

---

## Task 9: Composant `TrainerAccessCard`

**Files:**
- Create: `src/app/(dashboard)/admin/trainers/_components/TrainerAccessCard.tsx`

- [ ] **Step 1: Écrire le composant**

Create `src/app/(dashboard)/admin/trainers/_components/TrainerAccessCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Loader2, KeyRound, Link2, Unlink, Copy, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import LinkExistingAccountDialog from "./LinkExistingAccountDialog";

interface TrainerAccessCardProps {
  trainer: {
    id: string;
    profile_id: string | null;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    entity_id: string;
  };
  onChanged: () => void;
}

interface AccessResult {
  action: "created" | "reset";
  email: string | null;
  password: string | null;
  synthetic_email_used: boolean;
}

export default function TrainerAccessCard({ trainer, onChanged }: TrainerAccessCardProps) {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [processing, setProcessing] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [result, setResult] = useState<AccessResult | null>(null);
  const hasAccount = !!trainer.profile_id;

  const callAccess = async (method: "POST" | "DELETE") => {
    setProcessing(true);
    try {
      const res = await fetch(`/api/trainers/${trainer.id}/access`, { method });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec de l'opération");
      return data;
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateOrReset = async () => {
    try {
      const data = await callAccess("POST");
      if (data.password) {
        setResult({
          action: data.action,
          email: data.email,
          password: data.password,
          synthetic_email_used: data.synthetic_email_used === true,
        });
      }
      toast({
        title: data.action === "reset" ? "Mot de passe réinitialisé" : "Accès créé",
        description: data.synthetic_email_used
          ? "Email synthétique utilisé (le formateur n'a pas d'email réel)."
          : undefined,
      });
      onChanged();
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur", variant: "destructive" });
    }
  };

  const handleUnlink = async () => {
    const ok = await confirm({
      title: "Délier le compte ?",
      description: "La fiche ne sera plus reliée à ce compte. Le compte n'est pas supprimé et pourra être relié à nouveau.",
    });
    if (!ok) return;
    try {
      await callAccess("DELETE");
      toast({ title: "Compte délié" });
      onChanged();
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur", variant: "destructive" });
    }
  };

  const copyCredentials = () => {
    if (!result) return;
    const text = `Email: ${result.email ?? ""}\tMot de passe: ${result.password ?? ""}`;
    navigator.clipboard.writeText(text);
    toast({ title: "Copié", description: "Identifiants copiés dans le presse-papiers." });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Accès plateforme</CardTitle>
        {hasAccount ? (
          <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Compte actif
          </Badge>
        ) : (
          <Badge variant="outline" className="text-gray-500">Pas de compte</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {hasAccount ? (
          <>
            <p className="text-sm text-muted-foreground">
              Email de connexion : <span className="font-medium text-gray-800">{trainer.email || "—"}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={processing} onClick={handleCreateOrReset}>
                {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Réinitialiser le mot de passe
              </Button>
              <Button variant="outline" size="sm" disabled={processing} onClick={handleUnlink}>
                <Unlink className="h-4 w-4" /> Délier
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Ce formateur n'a pas encore d'accès à la plateforme.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={processing} onClick={handleCreateOrReset}>
                {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Créer l'accès
              </Button>
              <Button variant="outline" size="sm" disabled={processing} onClick={() => setLinkOpen(true)}>
                <Link2 className="h-4 w-4" /> Relier à un compte existant
              </Button>
            </div>
          </>
        )}
      </CardContent>

      <LinkExistingAccountDialog
        trainerId={trainer.id}
        open={linkOpen}
        onOpenChange={setLinkOpen}
        onLinked={onChanged}
      />

      <Dialog open={!!result} onOpenChange={(o) => !o && setResult(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{result?.action === "reset" ? "Nouveau mot de passe" : "Accès créé"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Ces identifiants ne seront affichés qu'une seule fois. Copiez-les et transmettez-les au formateur de façon sécurisée.
            </p>
            {result?.synthetic_email_used && (
              <p className="text-xs text-amber-600">
                ⚠️ Email synthétique : le formateur n'a pas d'email réel, il se connecte avec l'email ci-dessous.
              </p>
            )}
            <div className="rounded-lg border bg-gray-50 p-3 text-sm font-mono space-y-1">
              <div><span className="text-gray-500">Email : </span>{result?.email}</div>
              <div><span className="text-gray-500">Mot de passe : </span>{result?.password}</div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={copyCredentials}><Copy className="h-4 w-4" /> Copier</Button>
            <Button onClick={() => setResult(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog />
    </Card>
  );
}
```

- [ ] **Step 2: Vérifier le typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "TrainerAccessCard" || echo "OK"`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/admin/trainers/_components/TrainerAccessCard.tsx"
git commit -m "feat(trainers): carte Accès plateforme (créer/reset/relier/délier)"
```

---

## Task 10: Câbler `TrainerAccessCard` dans la fiche détail

**Files:**
- Modify: `src/app/(dashboard)/admin/trainers/[id]/page.tsx`

- [ ] **Step 1: Ajouter l'import**

Dans `src/app/(dashboard)/admin/trainers/[id]/page.tsx`, ajouter après les imports existants (vers le haut du fichier) :

```ts
import TrainerAccessCard from "../_components/TrainerAccessCard";
```

- [ ] **Step 2: Rendre la carte en haut de l'onglet Profil**

Repérer (vers la ligne 588) :

```tsx
        {/* PROFIL TAB */}
        <TabsContent value="profil" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informations personnelles</CardTitle>
```

Insérer le bloc `TrainerAccessCard` juste après `<TabsContent value="profil" className="mt-6">` et avant `<Card>` :

```tsx
        {/* PROFIL TAB */}
        <TabsContent value="profil" className="mt-6">
          {trainer && (
            <div className="mb-6">
              <TrainerAccessCard
                trainer={{
                  id: trainer.id,
                  profile_id: trainer.profile_id,
                  email: trainer.email,
                  first_name: trainer.first_name,
                  last_name: trainer.last_name,
                  entity_id: trainer.entity_id,
                }}
                onChanged={fetchTrainer}
              />
            </div>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informations personnelles</CardTitle>
```

(`trainer` et `fetchTrainer` sont déjà disponibles dans ce composant — état `trainer` ligne ~100, `fetchTrainer` ligne ~195.)

- [ ] **Step 3: Vérifier le typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "trainers/\[id\]/page" || echo "OK"`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/admin/trainers/[id]/page.tsx"
git commit -m "feat(trainers): afficher la carte Accès plateforme sur la fiche détail"
```

---

## Task 11: Badge d'état du compte sur les cards du hub

**Files:**
- Modify: `src/app/(dashboard)/admin/trainers/page.tsx`

- [ ] **Step 1: Ajouter le badge sous l'email de la card**

Repérer (vers la ligne 467-470) :

```tsx
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate group-hover:text-[#DC2626]">{trainer.first_name} {trainer.last_name}</p>
                    <p className="text-xs text-muted-foreground">{trainer.email || ""}</p>
                  </div>
```

Le remplacer par :

```tsx
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate group-hover:text-[#DC2626]">{trainer.first_name} {trainer.last_name}</p>
                    <p className="text-xs text-muted-foreground">{trainer.email || ""}</p>
                    {trainer.profile_id ? (
                      <Badge variant="outline" className="mt-1 h-5 px-1.5 text-[10px] font-normal text-emerald-700 border-emerald-200 bg-emerald-50">
                        Compte ✓
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="mt-1 h-5 px-1.5 text-[10px] font-normal text-gray-500">
                        Pas de compte
                      </Badge>
                    )}
                  </div>
```

(`Badge` est déjà importé ligne 13 ; `trainer.profile_id` est typé via `Trainer` — le state `trainers` est `TrainerWithCompetencies[]` et la requête sélectionne `*`.)

- [ ] **Step 2: Vérifier le typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "trainers/page" || echo "OK"`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/admin/trainers/page.tsx"
git commit -m "feat(trainers): badge état du compte sur les cards du hub"
```

---

## Task 12: Vérification finale

**Files:** aucun (vérification + push)

- [ ] **Step 1: Suite de tests complète**

Run: `npx vitest run`
Expected: tous les tests passent, dont les 11 de `trainer-account.test.ts`.

- [ ] **Step 2: Typecheck global**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `0`.

- [ ] **Step 3: Push + PR**

```bash
git push -u origin feat/acces-formateur-compte-plateforme
gh pr create --base main --title "feat(trainers): liaison & création de compte plateforme par formateur" --body "Voir docs/superpowers/specs/2026-06-19-acces-formateur-compte-plateforme-design.md. Service trainer-account.ts + routes /api/trainers/[id]/access + UI fiche/hub. Aucune migration."
```

---

## Notes de vérification manuelle (smoke test post-merge)

Le projet ne dispose pas de harness de test pour les routes/UI ; après déploiement preview, vérifier manuellement :
1. Fiche d'un formateur **sans compte** → « Créer l'accès » → dialog avec email + mot de passe, badge passe à « Compte actif ».
2. Fiche d'un formateur **sans compte** → « Relier à un compte existant » → la liste propose les comptes `trainer` orphelins de l'entité ; relier → badge « Compte actif ».
3. Fiche d'un formateur **avec compte** → « Réinitialiser le mot de passe » → nouveau mot de passe affiché.
4. « Délier » → confirmation → badge repasse à « Pas de compte » ; le compte réapparaît dans la liste des orphelins.
5. Hub : badges « Compte ✓ / Pas de compte » cohérents.
6. Isolation : un admin ne voit/agit que sur les formateurs de son entité (403 sinon).
