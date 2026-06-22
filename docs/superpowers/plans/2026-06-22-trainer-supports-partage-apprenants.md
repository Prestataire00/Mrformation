# Partage de supports formateur aux apprenants — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un formateur de partager ses supports de cours (`trainer_courses`) avec les apprenants inscrits à ses sessions, et aux apprenants de les consulter/télécharger.

**Architecture:** Table de liaison many-to-many `trainer_course_sessions` (support ↔ session). Logique métier isolée dans un service ; routes API fines `/api/trainer/*` (lier/délier) et `/api/learner/*` (download signé) ; UI de partage dans l'espace formateur, section de consultation dans l'espace apprenant. Isolation `entity_id` + garde applicative (la RLS prod est fragile).

**Tech Stack:** Next.js 14 (App Router), Supabase (Postgres + Storage + RLS), TypeScript strict, Vitest, TailwindCSS + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-06-22-trainer-supports-partage-apprenants-design.md`

---

## Fichiers touchés

| Fichier | Rôle |
|---|---|
| `supabase/migrations/add_trainer_course_sessions.sql` (create) | Table de liaison + RLS |
| `src/lib/services/trainer-course-sharing.ts` (create) | Service : résolution courses formateur, ownership, supports apprenant |
| `src/lib/services/__tests__/trainer-course-sharing.test.ts` (create) | Tests unitaires du service |
| `src/app/api/trainer/courses/[id]/sessions/route.ts` (create) | GET (mes sessions + linked) · POST (lier) |
| `src/app/api/trainer/courses/[id]/sessions/[sessionId]/route.ts` (create) | DELETE (délier) |
| `src/app/api/trainer/courses/route.ts` (modify) | GET : ajouter `shared_session_count` par cours |
| `src/lib/auth/permissions.ts` (modify) | Ajouter le préfixe `/api/learner` |
| `src/app/api/learner/supports/[courseId]/file-url/route.ts` (create) | URL signée si apprenant inscrit à une session liée d'un support publié |
| `src/components/trainer/ShareCourseDialog.tsx` (create) | Dialog de partage formateur |
| `src/components/trainer/CourseMaterialsTab.tsx` (modify) | Bouton « Partager » + badge |
| `src/components/learner/LearnerSupportsSection.tsx` (create) | Section consultation apprenant |
| `src/app/(dashboard)/learner/courses/page.tsx` (modify) | Monter la section supports |

---

## Task 1 : Migration table de liaison + RLS

**Files:**
- Create: `supabase/migrations/add_trainer_course_sessions.sql`

- [ ] **Step 1: Écrire la migration**

Créer `supabase/migrations/add_trainer_course_sessions.sql` :

```sql
-- ============================================================
-- Migration: trainer_course_sessions
-- Lie un support de cours formateur (trainer_courses) à une session
-- pour exposer ses fichiers aux apprenants inscrits.
-- ============================================================

CREATE TABLE IF NOT EXISTS trainer_course_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_course_id UUID NOT NULL REFERENCES trainer_courses(id) ON DELETE CASCADE,
  session_id        UUID NOT NULL REFERENCES sessions(id)        ON DELETE CASCADE,
  entity_id         UUID NOT NULL REFERENCES entities(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trainer_course_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_tcs_session ON trainer_course_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_tcs_course  ON trainer_course_sessions(trainer_course_id);

ALTER TABLE trainer_course_sessions ENABLE ROW LEVEL SECURITY;

-- Admin (même entité) : accès complet
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tcs_admin_all') THEN
    CREATE POLICY "tcs_admin_all" ON trainer_course_sessions
      FOR ALL TO authenticated
      USING (
        is_admin_role()
        AND entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid())
      )
      WITH CHECK (
        is_admin_role()
        AND entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

-- Formateur : gère les liens de SES supports vers SES sessions assignées
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tcs_trainer_manage_own') THEN
    CREATE POLICY "tcs_trainer_manage_own" ON trainer_course_sessions
      FOR ALL TO authenticated
      USING (
        trainer_course_id IN (
          SELECT tc.id FROM trainer_courses tc
          WHERE tc.trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
        )
      )
      WITH CHECK (
        trainer_course_id IN (
          SELECT tc.id FROM trainer_courses tc
          WHERE tc.trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
        )
        AND session_id IN (
          SELECT session_id FROM formation_trainers
          WHERE trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
        )
      );
  END IF;
END $$;

-- Apprenant : lecture des liens d'un support PUBLIÉ vers une session où il est inscrit
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tcs_learner_read') THEN
    CREATE POLICY "tcs_learner_read" ON trainer_course_sessions
      FOR SELECT TO authenticated
      USING (
        trainer_course_id IN (SELECT id FROM trainer_courses WHERE status = 'published')
        AND session_id IN (
          SELECT session_id FROM enrollments
          WHERE learner_id IN (SELECT id FROM learners WHERE profile_id = auth.uid())
        )
      );
  END IF;
END $$;
```

- [ ] **Step 2: Vérifier la cohérence du SQL**

Run: `grep -c "CREATE POLICY" supabase/migrations/add_trainer_course_sessions.sql`
Expected: `3`

> ⚠️ La migration doit être exécutée manuellement dans Supabase Dashboard (cf. CLAUDE.md « Migrations SQL »). Le code applicatif ne dépend pas de son exécution pour compiler/tester (mocks), mais la feature ne fonctionnera en prod qu'après exécution.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/add_trainer_course_sessions.sql
git commit -m "feat(db): table trainer_course_sessions (partage supports formateur)"
```

---

## Task 2 : Service `trainer-course-sharing.ts` (TDD)

**Files:**
- Create: `src/lib/services/trainer-course-sharing.ts`
- Test: `src/lib/services/__tests__/trainer-course-sharing.test.ts`

- [ ] **Step 1: Écrire les tests d'abord**

Créer `src/lib/services/__tests__/trainer-course-sharing.test.ts` :

```ts
import { describe, it, expect, vi } from "vitest";
import {
  resolveTrainerCourseIds,
  getOwnedCourse,
  getSharedSupportsForLearner,
} from "../trainer-course-sharing";

type AnyClient = Parameters<typeof resolveTrainerCourseIds>[0];

/**
 * Mock Supabase multi-tables. Chaque table renvoie un résultat awaitable
 * (`then`) ou via `maybeSingle`. Enregistre les filtres `.eq()`/`.in()`.
 */
function makeClient(tables: Record<string, { rows?: unknown[]; single?: unknown }>) {
  const calls: Record<string, Record<string, unknown>> = {};
  function chain(table: string) {
    calls[table] = calls[table] || {};
    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      eq: vi.fn((c: string, v: unknown) => { calls[table][c] = v; return builder; }),
      in: vi.fn((c: string, v: unknown) => { calls[table][c] = v; return builder; }),
      maybeSingle: vi.fn(async () => ({ data: tables[table]?.single ?? null, error: null })),
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        resolve({ data: tables[table]?.rows ?? [], error: null }),
    };
    return builder;
  }
  const client = { from: vi.fn((t: string) => chain(t)), __calls: calls };
  return client as unknown as AnyClient & { __calls: typeof calls };
}

describe("resolveTrainerCourseIds", () => {
  it("retourne les ids des supports de toutes les fiches du formateur", async () => {
    const client = makeClient({
      trainers: { rows: [{ id: "t1" }, { id: "t2" }] },
      trainer_courses: { rows: [{ id: "c1" }, { id: "c2" }] },
    });
    expect(await resolveTrainerCourseIds(client, "profile-1")).toEqual(["c1", "c2"]);
    expect(client.__calls.trainer_courses.trainer_id).toEqual(["t1", "t2"]);
  });

  it("retourne [] si aucune fiche formateur", async () => {
    const client = makeClient({ trainers: { rows: [] } });
    expect(await resolveTrainerCourseIds(client, "x")).toEqual([]);
  });
});

describe("getOwnedCourse", () => {
  it("retourne le cours si une fiche du formateur le possède", async () => {
    const client = makeClient({
      trainer_courses: { single: { id: "c1", status: "published", trainer_id: "t2", entity_id: "e1" } },
      trainers: { rows: [{ id: "t1" }, { id: "t2" }] },
    });
    const course = await getOwnedCourse(client, "profile-1", "c1");
    expect(course).toEqual({ id: "c1", status: "published", trainer_id: "t2", entity_id: "e1" });
  });

  it("retourne null si le cours n'appartient à aucune fiche du formateur", async () => {
    const client = makeClient({
      trainer_courses: { single: { id: "c1", status: "draft", trainer_id: "autre", entity_id: "e1" } },
      trainers: { rows: [{ id: "t1" }] },
    });
    expect(await getOwnedCourse(client, "profile-1", "c1")).toBeNull();
  });

  it("retourne null si le cours est introuvable", async () => {
    const client = makeClient({ trainer_courses: { single: null }, trainers: { rows: [{ id: "t1" }] } });
    expect(await getOwnedCourse(client, "profile-1", "absent")).toBeNull();
  });
});

describe("getSharedSupportsForLearner", () => {
  it("ne renvoie que les supports PUBLIÉS des sessions fournies", async () => {
    const client = makeClient({
      trainer_course_sessions: {
        rows: [
          { id: "l1", session_id: "s1", course: { id: "c1", title: "Pub", description: null, files: [{ name: "a.pdf", type: "application/pdf", size: 1, path: "p/a.pdf" }], status: "published" } },
          { id: "l2", session_id: "s1", course: { id: "c2", title: "Brouillon", description: null, files: [], status: "draft" } },
        ],
      },
    });
    const res = await getSharedSupportsForLearner(client, ["s1"]);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ link_id: "l1", session_id: "s1", course: { id: "c1", title: "Pub" } });
  });

  it("retourne [] si aucune session", async () => {
    const client = makeClient({});
    expect(await getSharedSupportsForLearner(client, [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer les tests (échec attendu)**

Run: `npx vitest run src/lib/services/__tests__/trainer-course-sharing.test.ts`
Expected: FAIL — `Cannot find module '../trainer-course-sharing'`

- [ ] **Step 3: Implémenter le service**

Créer `src/lib/services/trainer-course-sharing.ts` :

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UploadedFile } from "@/components/trainer/types";

/**
 * Logique de partage des supports de cours formateur (`trainer_courses`) vers
 * les sessions (`trainer_course_sessions`) et de leur consultation apprenant.
 *
 * Multi-entité : un `profile_id` peut avoir plusieurs fiches `trainers` (1/entité).
 * On résout donc TOUTES les fiches (pas `.single()`), cohérent avec
 * `src/lib/auth/trainer-session-access.ts`.
 */

export interface OwnedCourse {
  id: string;
  status: string;
  trainer_id: string;
  entity_id: string | null;
}

export interface SharedSupport {
  link_id: string;
  session_id: string;
  course: { id: string; title: string; description: string | null; files: UploadedFile[] };
}

/** Ids de tous les supports appartenant aux fiches formateur de `profileId`. */
export async function resolveTrainerCourseIds(
  supabase: SupabaseClient,
  profileId: string,
): Promise<string[]> {
  const { data: trainers } = await supabase
    .from("trainers")
    .select("id")
    .eq("profile_id", profileId);
  const trainerIds = ((trainers as Array<{ id: string }> | null) ?? []).map((t) => t.id);
  if (trainerIds.length === 0) return [];

  const { data: courses } = await supabase
    .from("trainer_courses")
    .select("id")
    .in("trainer_id", trainerIds);
  return ((courses as Array<{ id: string }> | null) ?? []).map((c) => c.id);
}

/** Retourne le support si une fiche du formateur le possède, sinon null. */
export async function getOwnedCourse(
  supabase: SupabaseClient,
  profileId: string,
  courseId: string,
): Promise<OwnedCourse | null> {
  const { data: course } = await supabase
    .from("trainer_courses")
    .select("id, status, trainer_id, entity_id")
    .eq("id", courseId)
    .maybeSingle();
  if (!course) return null;

  const { data: trainers } = await supabase
    .from("trainers")
    .select("id")
    .eq("profile_id", profileId);
  const trainerIds = ((trainers as Array<{ id: string }> | null) ?? []).map((t) => t.id);

  const c = course as OwnedCourse;
  return trainerIds.includes(c.trainer_id) ? c : null;
}

/** Supports PUBLIÉS liés aux sessions fournies (vue apprenant). */
export async function getSharedSupportsForLearner(
  supabase: SupabaseClient,
  sessionIds: string[],
): Promise<SharedSupport[]> {
  if (sessionIds.length === 0) return [];

  const { data } = await supabase
    .from("trainer_course_sessions")
    .select("id, session_id, course:trainer_courses(id, title, description, files, status)")
    .in("session_id", sessionIds);

  type Row = {
    id: string;
    session_id: string;
    course: { id: string; title: string; description: string | null; files: UploadedFile[] | null; status: string } | null;
  };
  return ((data as unknown as Row[] | null) ?? [])
    .filter((r) => r.course && r.course.status === "published")
    .map((r) => ({
      link_id: r.id,
      session_id: r.session_id,
      course: {
        id: r.course!.id,
        title: r.course!.title,
        description: r.course!.description,
        files: r.course!.files ?? [],
      },
    }));
}
```

- [ ] **Step 4: Lancer les tests (succès attendu)**

Run: `npx vitest run src/lib/services/__tests__/trainer-course-sharing.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/trainer-course-sharing.ts src/lib/services/__tests__/trainer-course-sharing.test.ts
git commit -m "feat(service): trainer-course-sharing (résolution + ownership + vue apprenant)"
```

---

## Task 3 : Routes API formateur (lier / délier / lister)

**Files:**
- Create: `src/app/api/trainer/courses/[id]/sessions/route.ts`
- Create: `src/app/api/trainer/courses/[id]/sessions/[sessionId]/route.ts`

- [ ] **Step 1: Implémenter GET + POST**

Créer `src/app/api/trainer/courses/[id]/sessions/route.ts` :

```ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";
import {
  resolveTrainerSessionIds,
  isTrainerAssignedToSession,
} from "@/lib/auth/trainer-session-access";
import { getOwnedCourse } from "@/lib/services/trainer-course-sharing";

const NIL = "00000000-0000-0000-0000-000000000000";

/** GET — mes sessions assignées + `linked` pour ce support. */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const course = await getOwnedCourse(supabase, user.id, params.id);
    if (!course) {
      return NextResponse.json({ error: "Support introuvable ou non autorisé" }, { status: 404 });
    }

    const sessionIds = await resolveTrainerSessionIds(supabase, user.id);
    const { data: sessions, error: sErr } = await supabase
      .from("sessions")
      .select("id, title, start_date, end_date, training:trainings(title)")
      .in("id", sessionIds.length ? sessionIds : [NIL])
      .order("start_date", { ascending: false });
    if (sErr) {
      return NextResponse.json({ error: sErr.message }, { status: 500 });
    }

    const { data: links } = await supabase
      .from("trainer_course_sessions")
      .select("session_id")
      .eq("trainer_course_id", params.id);
    const linked = new Set(((links as Array<{ session_id: string }> | null) ?? []).map((l) => l.session_id));

    const data = ((sessions as Array<{ id: string }> | null) ?? []).map((s) => ({
      ...s,
      linked: linked.has(s.id),
    }));
    return NextResponse.json({ data, published: course.status === "published" });
  } catch (e) {
    return NextResponse.json(
      { error: sanitizeError(e, "trainer/courses/[id]/sessions GET") },
      { status: 500 },
    );
  }
}

/** POST — lie le support à une session (idempotent). */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = (await request.json()) as { sessionId?: string };
    if (!body.sessionId) {
      return NextResponse.json({ error: "sessionId requis" }, { status: 400 });
    }

    const course = await getOwnedCourse(supabase, user.id, params.id);
    if (!course) {
      return NextResponse.json({ error: "Support introuvable ou non autorisé" }, { status: 404 });
    }
    if (course.status !== "published") {
      return NextResponse.json(
        { error: "Publiez le support avant de le partager." },
        { status: 400 },
      );
    }

    const assigned = await isTrainerAssignedToSession(supabase, user.id, body.sessionId);
    if (!assigned) {
      return NextResponse.json({ error: "Vous n'êtes pas assigné à cette session" }, { status: 403 });
    }

    const { error } = await supabase
      .from("trainer_course_sessions")
      .upsert(
        { trainer_course_id: params.id, session_id: body.sessionId, entity_id: course.entity_id },
        { onConflict: "trainer_course_id,session_id", ignoreDuplicates: true },
      );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: sanitizeError(e, "trainer/courses/[id]/sessions POST") },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Implémenter DELETE**

Créer `src/app/api/trainer/courses/[id]/sessions/[sessionId]/route.ts` :

```ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";
import { getOwnedCourse } from "@/lib/services/trainer-course-sharing";

/** DELETE — délie le support de la session. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; sessionId: string } },
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const course = await getOwnedCourse(supabase, user.id, params.id);
    if (!course) {
      return NextResponse.json({ error: "Support introuvable ou non autorisé" }, { status: 404 });
    }

    const { error } = await supabase
      .from("trainer_course_sessions")
      .delete()
      .eq("trainer_course_id", params.id)
      .eq("session_id", params.sessionId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: sanitizeError(e, "trainer/courses/[id]/sessions/[sessionId] DELETE") },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Vérifier le typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "sessions/route\|sessions/\[sessionId\]" || echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/trainer/courses/[id]/sessions
git commit -m "feat(api): routes formateur lier/délier support↔session"
```

---

## Task 4 : Restreindre `/api/learner` + route de download apprenant

**Files:**
- Modify: `src/lib/auth/permissions.ts`
- Create: `src/app/api/learner/supports/[courseId]/file-url/route.ts`

- [ ] **Step 1: Ajouter le préfixe `/api/learner` à `API_PERMISSIONS`**

Dans `src/lib/auth/permissions.ts`, repérer la ligne :

```ts
  ["/api/trainer",                 ["super_admin", "admin", "trainer"]],
```

Ajouter juste en dessous :

```ts
  ["/api/learner",                 ["super_admin", "admin", "learner"]],
```

- [ ] **Step 2: Implémenter la route de download apprenant**

Créer `src/app/api/learner/supports/[courseId]/file-url/route.ts` :

```ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";

/**
 * GET /api/learner/supports/[courseId]/file-url?path=elearning-documents/...
 *
 * URL signée (1h) pour un fichier d'un support formateur, SI :
 *  - l'apprenant (learners.profile_id = auth.uid()) est inscrit (enrollments)
 *    à une session liée au support (trainer_course_sessions), ET
 *  - le support est publié.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { courseId: string } },
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const filePath = request.nextUrl.searchParams.get("path");
    if (!filePath) {
      return NextResponse.json({ error: "Paramètre 'path' manquant" }, { status: 400 });
    }

    // Support publié ?
    const { data: course } = await supabase
      .from("trainer_courses")
      .select("id, status")
      .eq("id", params.courseId)
      .maybeSingle();
    if (!course || (course as { status: string }).status !== "published") {
      return NextResponse.json({ error: "Support indisponible" }, { status: 404 });
    }

    // Sessions de l'apprenant
    const { data: learners } = await supabase
      .from("learners")
      .select("id")
      .eq("profile_id", user.id);
    const learnerIds = ((learners as Array<{ id: string }> | null) ?? []).map((l) => l.id);
    if (learnerIds.length === 0) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const { data: enr } = await supabase
      .from("enrollments")
      .select("session_id")
      .in("learner_id", learnerIds);
    const sessionIds = ((enr as Array<{ session_id: string }> | null) ?? []).map((e) => e.session_id);
    if (sessionIds.length === 0) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    // Lien support ↔ une de mes sessions ?
    const { data: link } = await supabase
      .from("trainer_course_sessions")
      .select("id")
      .eq("trainer_course_id", params.courseId)
      .in("session_id", sessionIds)
      .limit(1);
    if (!link || (link as Array<unknown>).length === 0) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const { data, error } = await supabase.storage
      .from("elearning-documents")
      .createSignedUrl(filePath, 3600);
    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: "Impossible de générer le lien" }, { status: 500 });
    }
    return NextResponse.json({ url: data.signedUrl });
  } catch (e) {
    return NextResponse.json(
      { error: sanitizeError(e, "learner/supports/[courseId]/file-url GET") },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Vérifier le typecheck + le test de permissions existant**

Run: `npx vitest run src/lib/auth/__tests__/permissions.test.ts && npx tsc --noEmit 2>&1 | grep "file-url/route\|permissions.ts" || echo "OK"`
Expected: tests PASS, puis `OK`

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth/permissions.ts src/app/api/learner/supports
git commit -m "feat(api): download apprenant des supports + restreint /api/learner"
```

---

## Task 5 : Compteur de partage dans le GET des cours formateur

**Files:**
- Modify: `src/app/api/trainer/courses/route.ts`

- [ ] **Step 1: Localiser le `return` du GET**

Dans `src/app/api/trainer/courses/route.ts`, le handler `GET` se termine par :

```ts
    if (error) return NextResponse.json({ error: sanitizeDbError(error, "trainer/courses GET") }, { status: 500 });

    return NextResponse.json({ data: courses || [] });
```

- [ ] **Step 2: Insérer le calcul du compteur et renvoyer `withCounts`**

Remplacer le bloc ci-dessus par :

```ts
    if (error) return NextResponse.json({ error: sanitizeDbError(error, "trainer/courses GET") }, { status: 500 });

    // Nombre de sessions auxquelles chaque support est partagé (badge UI).
    const courseRows = (courses as Array<{ id: string }> | null) ?? [];
    let sharedCounts: Record<string, number> = {};
    if (courseRows.length > 0) {
      const { data: links } = await supabase
        .from("trainer_course_sessions")
        .select("trainer_course_id")
        .in("trainer_course_id", courseRows.map((c) => c.id));
      sharedCounts = ((links as Array<{ trainer_course_id: string }> | null) ?? []).reduce(
        (acc, l) => {
          acc[l.trainer_course_id] = (acc[l.trainer_course_id] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );
    }
    const withCounts = courseRows.map((c) => ({
      ...c,
      shared_session_count: sharedCounts[c.id] ?? 0,
    }));

    return NextResponse.json({ data: withCounts });
```

- [ ] **Step 3: Vérifier le typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "trainer/courses/route" || echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/trainer/courses/route.ts
git commit -m "feat(api): shared_session_count par support formateur"
```

---

## Task 6 : Composant `ShareCourseDialog`

**Files:**
- Create: `src/components/trainer/ShareCourseDialog.tsx`

- [ ] **Step 1: Implémenter le dialog**

Créer `src/components/trainer/ShareCourseDialog.tsx` :

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, CalendarDays } from "lucide-react";

interface SessionRow {
  id: string;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  training: { title: string | null } | null;
  linked: boolean;
}

export function ShareCourseDialog({
  courseId,
  open,
  onClose,
  onChanged,
}: {
  courseId: string;
  open: boolean;
  onClose: () => void;
  onChanged?: (courseId: string, linkedCount: number) => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/trainer/courses/${courseId}/sessions`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setRows(json.data ?? []);
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Chargement impossible.",
        variant: "destructive",
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [courseId, toast]);

  useEffect(() => {
    if (open) fetchSessions();
  }, [open, fetchSessions]);

  const toggle = async (row: SessionRow) => {
    setBusyId(row.id);
    const willLink = !row.linked;
    try {
      const res = willLink
        ? await fetch(`/api/trainer/courses/${courseId}/sessions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: row.id }),
          })
        : await fetch(`/api/trainer/courses/${courseId}/sessions/${row.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      const next = rows.map((r) => (r.id === row.id ? { ...r, linked: willLink } : r));
      setRows(next);
      onChanged?.(courseId, next.filter((r) => r.linked).length);
      toast({ title: willLink ? "Partagé avec la session" : "Partage retiré" });
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Action impossible.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Partager avec mes sessions</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Aucune session ne vous est assignée pour le moment.
          </p>
        ) : (
          <div className="divide-y">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {row.training?.title || row.title || "Session"}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {row.start_date ? new Date(row.start_date).toLocaleDateString("fr-FR") : "?"}
                    {" → "}
                    {row.end_date ? new Date(row.end_date).toLocaleDateString("fr-FR") : "?"}
                  </p>
                </div>
                {busyId === row.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <Switch checked={row.linked} onCheckedChange={() => toggle(row)} />
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Vérifier que le composant `Switch` existe**

Run: `test -f src/components/ui/switch.tsx && echo "Switch OK" || echo "MANQUANT"`
Expected: `Switch OK`
(Si `MANQUANT` : remplacer le `<Switch checked={row.linked} onCheckedChange={() => toggle(row)} />` par un `<Button size="sm" variant={row.linked ? "default" : "outline"} onClick={() => toggle(row)}>{row.linked ? "Partagé" : "Partager"}</Button>` et importer `Button`.)

- [ ] **Step 3: Vérifier le typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "ShareCourseDialog" || echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add src/components/trainer/ShareCourseDialog.tsx
git commit -m "feat(ui): ShareCourseDialog (partage support↔sessions formateur)"
```

---

## Task 7 : Brancher le partage dans `CourseMaterialsTab`

**Files:**
- Modify: `src/components/trainer/CourseMaterialsTab.tsx`

- [ ] **Step 1: Étendre le type + l'état**

Dans `src/components/trainer/CourseMaterialsTab.tsx`, ajouter `shared_session_count` à l'interface `TrainerCourse` (après `files`) :

```ts
  files: UploadedFile[];
  shared_session_count?: number;
```

Ajouter l'import de l'icône `Share2` à la liste `lucide-react` existante (au côté de `FileText`) et l'import du dialog après les imports de composants :

```ts
import { ShareCourseDialog } from "./ShareCourseDialog";
```

Dans le composant `CourseMaterialsTab`, ajouter l'état du dialog près des autres `useState` :

```ts
  const [sharingCourse, setSharingCourse] = useState<TrainerCourse | null>(null);
```

- [ ] **Step 2: Ajouter le handler de mise à jour du compteur**

Toujours dans `CourseMaterialsTab`, après `handleSaved`, ajouter :

```ts
  const handleSharedChanged = (courseId: string, linkedCount: number) => {
    setCourses((prev) =>
      prev.map((c) => (c.id === courseId ? { ...c, shared_session_count: linkedCount } : c)),
    );
  };
```

- [ ] **Step 3: Ajouter le bouton « Partager » dans les actions de la carte**

Dans le bloc d'actions de la carte (le `div className="flex items-center gap-1 shrink-0"` qui contient le bouton « publier/brouillon » via `handleToggleStatus`), ajouter, juste avant le bouton d'édition (`Pencil`), ce bouton :

```tsx
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => setSharingCourse(course)}
                      disabled={course.status !== "published"}
                      title={course.status !== "published"
                        ? "Publiez le support pour le partager"
                        : "Partager avec mes sessions"}
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      {course.shared_session_count
                        ? `Partagé (${course.shared_session_count})`
                        : "Partager"}
                    </Button>
```

- [ ] **Step 4: Monter le dialog en fin de composant**

Juste avant la balise fermante finale du `return` (après le bloc liste / le `CourseDialog` existant), ajouter :

```tsx
      {sharingCourse && (
        <ShareCourseDialog
          courseId={sharingCourse.id}
          open={!!sharingCourse}
          onClose={() => setSharingCourse(null)}
          onChanged={handleSharedChanged}
        />
      )}
```

- [ ] **Step 5: Vérifier le typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "CourseMaterialsTab" || echo "OK"`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add src/components/trainer/CourseMaterialsTab.tsx
git commit -m "feat(ui): bouton Partager + badge dans la liste des supports formateur"
```

---

## Task 8 : Section supports côté apprenant

**Files:**
- Create: `src/components/learner/LearnerSupportsSection.tsx`
- Modify: `src/app/(dashboard)/learner/courses/page.tsx`

- [ ] **Step 1: Implémenter la section apprenant**

Créer `src/components/learner/LearnerSupportsSection.tsx` :

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Loader2, Download, BookOpen } from "lucide-react";
import { getSharedSupportsForLearner, type SharedSupport } from "@/lib/services/trainer-course-sharing";

export function LearnerSupportsSection() {
  const supabase = createClient();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [supports, setSupports] = useState<SharedSupport[]>([]);

  const fetchSupports = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSupports([]); return; }

      const { data: learners } = await supabase
        .from("learners")
        .select("id")
        .eq("profile_id", user.id);
      const learnerIds = (learners ?? []).map((l) => l.id);
      if (learnerIds.length === 0) { setSupports([]); return; }

      const { data: enr } = await supabase
        .from("enrollments")
        .select("session_id")
        .in("learner_id", learnerIds);
      const sessionIds = [...new Set((enr ?? []).map((e) => e.session_id))];

      setSupports(await getSharedSupportsForLearner(supabase, sessionIds));
    } catch {
      toast({ title: "Erreur de chargement des supports", variant: "destructive" });
      setSupports([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, toast]);

  useEffect(() => { fetchSupports(); }, [fetchSupports]);

  const download = async (courseId: string, path: string) => {
    try {
      const res = await fetch(
        `/api/learner/supports/${courseId}/file-url?path=${encodeURIComponent(path)}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Téléchargement impossible.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement des supports…
      </div>
    );
  }

  if (supports.length === 0) return null; // pas de bruit si rien partagé

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-primary" /> Supports de cours
      </h2>
      <div className="grid gap-3">
        {supports.map((s) => (
          <Card key={s.link_id}>
            <CardContent className="pt-5 space-y-2">
              <p className="font-medium text-sm">{s.course.title}</p>
              {s.course.description && (
                <p className="text-sm text-muted-foreground">{s.course.description}</p>
              )}
              <div className="flex flex-col gap-1.5">
                {s.course.files.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Aucun fichier.</p>
                ) : (
                  s.course.files.map((f) => (
                    <button
                      key={f.path}
                      onClick={() => download(s.course.id, f.path)}
                      className="flex items-center gap-2 text-sm text-primary hover:underline text-left"
                    >
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="truncate">{f.name}</span>
                      <Download className="h-3.5 w-3.5 shrink-0" />
                    </button>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Monter la section dans la page apprenant**

Dans `src/app/(dashboard)/learner/courses/page.tsx`, ajouter l'import en haut (après les imports existants) :

```ts
import { LearnerSupportsSection } from "@/components/learner/LearnerSupportsSection";
```

Puis, dans le `return` du composant page, insérer `<LearnerSupportsSection />` à un endroit visible (par exemple juste après le titre/en-tête de la page, avant la liste des cours e-learning). Exemple de placement :

```tsx
      {/* … en-tête existant … */}
      <LearnerSupportsSection />
      {/* … liste des cours e-learning existante … */}
```

- [ ] **Step 3: Vérifier le typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "LearnerSupportsSection\|learner/courses/page" || echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add src/components/learner/LearnerSupportsSection.tsx "src/app/(dashboard)/learner/courses/page.tsx"
git commit -m "feat(ui): section supports de cours côté apprenant"
```

---

## Task 9 : Vérification finale

- [ ] **Step 1: Suite de tests complète**

Run: `npx vitest run --silent 2>&1 | tail -5`
Expected: tous verts (les nouveaux tests `trainer-course-sharing` inclus).

- [ ] **Step 2: Typecheck global**

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v ".next/types" || echo "tsc clean"`
Expected: `tsc clean`

- [ ] **Step 3: Lint des fichiers touchés**

Run: `npx next lint --file src/components/trainer/ShareCourseDialog.tsx --file src/components/learner/LearnerSupportsSection.tsx 2>&1 | tail -10 || echo "lint done"`
Expected: aucune erreur bloquante.

- [ ] **Step 4: Rappel migration**

> ⚠️ Exécuter `supabase/migrations/add_trainer_course_sessions.sql` dans Supabase Dashboard (prod + dev) avant de tester la feature en environnement réel. Sans la table, les routes renverront une erreur Supabase (gérée par toast).

- [ ] **Step 5: Test manuel (parcours bout-en-bout)**

1. Formateur : `/trainer/courses` → créer un support, uploader un fichier, **publier**.
2. Cliquer **Partager** → activer le toggle sur une session assignée → toast « Partagé ».
3. Badge « Partagé (1) » visible sur la carte.
4. Apprenant inscrit à cette session : `/learner/courses` → section **Supports de cours** → le support apparaît → cliquer un fichier → téléchargement OK.
5. Apprenant NON inscrit : le support n'apparaît pas ; appel direct `/api/learner/supports/<id>/file-url?path=…` → 403.

---

## Self-review (couverture spec)

- Modèle de données (table liaison) → Task 1 ✅
- RLS (admin/formateur/apprenant) → Task 1 ✅
- API lier/délier/lister → Task 3 ✅
- API download apprenant + `/api/learner` permissions → Task 4 ✅
- Compteur partage (badge) → Task 5 + Task 7 ✅
- UI formateur (dialog + bouton + gate publié) → Task 6 + Task 7 ✅
- UI apprenant (section + download + état vide) → Task 8 ✅
- Service isolé + tests → Task 2 ✅
- Isolation `entity_id` / multi-fiche / garde applicative → Tasks 2–4 ✅
- Vérification finale + rappel migration → Task 9 ✅
