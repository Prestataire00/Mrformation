# Solidification du workflow e-learning — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sécuriser, fiabiliser et rendre cohérent le sous-système e-learning — sans nouvelle fonctionnalité produit.

**Architecture:** Approche hybride. Un **garde de sécurité partagé** (`elearning-access.ts`) centralise rôle + isolation `entity_id` + propriété ; des **RPC plpgsql** rendent atomiques le recalcul de progression et la publication ; un **helper « cours unifié »** réconcilie les 2 mondes e-learning. Les 22 routes `/api/elearning/*` et `TabElearning` sont recâblés dessus.

**Tech Stack:** Next.js 14 (App Router, route handlers), TypeScript strict, Supabase (PostgreSQL + fonctions plpgsql), Vitest (environnement `node`).

**Spec :** `docs/superpowers/specs/2026-05-22-solidification-workflow-elearning-design.md`
**Branche :** `feat/elearning-solidification`

**Rappels :** jamais de `any` ; `tsc --noEmit` et `vitest run` doivent rester verts ; RLS plateforme et conformité §6.4 hors périmètre.

---

## File Structure

- `supabase/migrations/elearning_solidification.sql` — **créé.** Colonne `course_source`, retrait FK, RPC `elearning_recompute_progress` + `elearning_publish_course`.
- `src/lib/auth/elearning-access.ts` — **créé.** Garde partagé : `requireElearningCourse`, `requireElearningEnrollment`.
- `src/lib/auth/__tests__/elearning-access.test.ts` — **créé.** Tests du garde.
- `src/lib/services/elearning-courses.ts` — **créé.** `getAssignableElearningCourses` (abstraction 2 mondes).
- `src/lib/services/__tests__/elearning-courses.test.ts` — **créé.** Tests du helper.
- `src/app/api/elearning/**/route.ts` (22 fichiers) — **modifiés.** Recâblés sur le garde ; écritures vérifiées ; RPC ; masquage des réponses ; audit.
- `src/app/(dashboard)/admin/formations/[id]/_components/TabElearning.tsx` — **modifié.** Helper unifié + `course_source` + progression réelle.

**Convention de test :** Vitest `node`, pas de React Testing Library — les composants ne sont pas testés unitairement ; le garde et le helper (logique pure / mockable) le sont. Vérification routes/composant = `npx tsc --noEmit` + suite verte.

---

## Task 1 : Migration SQL

**Files:**
- Create: `supabase/migrations/elearning_solidification.sql`

- [ ] **Step 1 : Écrire la migration**

Créer `supabase/migrations/elearning_solidification.sql` :

```sql
-- ============================================================
-- Solidification e-learning — 2026-05-22
-- 1. course_source sur la table-pont + retrait de la FK course_id
-- 2. RPC atomiques : recalcul de progression, publication gardée
-- A executer dans le Dashboard Supabase (SQL Editor).
-- ============================================================

-- 1. Table-pont : un cours attribué peut venir des 2 mondes
ALTER TABLE formation_elearning_assignments
  ADD COLUMN IF NOT EXISTS course_source TEXT NOT NULL DEFAULT 'ai'
  CHECK (course_source IN ('ai', 'program'));

-- course_id devient une reference polymorphe (ai → elearning_courses,
-- program → programs) : la FK mono-cible et son ON DELETE CASCADE sont retires.
ALTER TABLE formation_elearning_assignments
  DROP CONSTRAINT IF EXISTS formation_elearning_assignments_course_id_fkey;

-- 2a. Recalcul atomique et idempotent de la progression d'une inscription
CREATE OR REPLACE FUNCTION elearning_recompute_progress(p_enrollment_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_course_id UUID;
  v_total INT;
  v_done INT;
  v_rate INT;
  v_status TEXT;
BEGIN
  SELECT course_id INTO v_course_id
    FROM elearning_enrollments WHERE id = p_enrollment_id;
  IF v_course_id IS NULL THEN RETURN; END IF;

  SELECT count(*) INTO v_total
    FROM elearning_chapters WHERE course_id = v_course_id;
  SELECT count(*) INTO v_done
    FROM elearning_chapter_progress
    WHERE enrollment_id = p_enrollment_id AND is_completed = TRUE;

  v_rate := CASE WHEN v_total > 0 THEN round(100.0 * v_done / v_total) ELSE 0 END;
  v_status := CASE
    WHEN v_rate >= 100 THEN 'completed'
    WHEN v_rate > 0 THEN 'in_progress'
    ELSE 'enrolled' END;

  UPDATE elearning_enrollments SET
    completion_rate = v_rate,
    status = v_status,
    started_at = COALESCE(started_at,
      CASE WHEN v_status <> 'enrolled' THEN now() END),
    completed_at = CASE WHEN v_rate >= 100
      THEN COALESCE(completed_at, now()) ELSE NULL END
  WHERE id = p_enrollment_id;
END;
$$;

-- 2b. Bascule de publication atomique + garde avant publication
CREATE OR REPLACE FUNCTION elearning_publish_course(p_course_id UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_status TEXT;
  v_gen TEXT;
  v_chapters INT;
  v_new TEXT;
BEGIN
  SELECT status, generation_status INTO v_status, v_gen
    FROM elearning_courses WHERE id = p_course_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'course_not_found'; END IF;

  IF v_status = 'published' THEN
    v_new := 'draft';  -- depublication : toujours permise
  ELSE
    SELECT count(*) INTO v_chapters
      FROM elearning_chapters WHERE course_id = p_course_id;
    IF v_gen <> 'completed' THEN RAISE EXCEPTION 'generation_incomplete'; END IF;
    IF v_chapters = 0 THEN RAISE EXCEPTION 'no_chapters'; END IF;
    v_new := 'published';
  END IF;

  UPDATE elearning_courses SET status = v_new, updated_at = now()
    WHERE id = p_course_id;
  RETURN v_new;
END;
$$;
```

- [ ] **Step 2 : Commit**

```bash
git add supabase/migrations/elearning_solidification.sql
git commit -m "feat(elearning): migration — course_source + RPC progression/publication"
```

*Note d'exécution : ce fichier SQL est à jouer dans le Dashboard Supabase. Les Tasks 5 et 7 supposent les RPC et la colonne en place côté base de dev/test.*

---

## Task 2 : Garde de sécurité partagé `elearning-access.ts`

**Files:**
- Create: `src/lib/auth/elearning-access.ts`
- Create: `src/lib/auth/__tests__/elearning-access.test.ts`

- [ ] **Step 1 : Écrire les tests**

Créer `src/lib/auth/__tests__/elearning-access.test.ts` :

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
import { requireRole } from "@/lib/auth/require-role";
import { requireElearningCourse, requireElearningEnrollment } from "@/lib/auth/elearning-access";

// Mock minimal d'un client Supabase chainable renvoyant `result`.
function mockSupabase(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  return { from: vi.fn(() => chain) } as never;
}

const okAuth = (role: string, supabase: unknown) => ({
  error: null,
  user: { id: "user-1" },
  profile: { id: "user-1", role, entity_id: "ent-A" },
  supabase,
});

describe("requireElearningCourse", () => {
  beforeEach(() => vi.mocked(requireRole).mockReset());

  it("propage l'erreur de requireRole (rôle refusé)", async () => {
    const errResp = { status: 403 } as never;
    vi.mocked(requireRole).mockResolvedValue({ error: errResp, user: null, profile: null } as never);
    const res = await requireElearningCourse("c1", ["admin"]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe(errResp);
  });

  it("refuse (403) un cours d'une autre entité", async () => {
    const supabase = mockSupabase({ data: { id: "c1", entity_id: "ent-B" }, error: null });
    vi.mocked(requireRole).mockResolvedValue(okAuth("admin", supabase) as never);
    const res = await requireElearningCourse("c1", ["admin"]);
    expect(res.ok).toBe(false);
  });

  it("404 si le cours est introuvable", async () => {
    const supabase = mockSupabase({ data: null, error: null });
    vi.mocked(requireRole).mockResolvedValue(okAuth("admin", supabase) as never);
    const res = await requireElearningCourse("c1", ["admin"]);
    expect(res.ok).toBe(false);
  });

  it("succès : cours de la même entité", async () => {
    const supabase = mockSupabase({ data: { id: "c1", entity_id: "ent-A" }, error: null });
    vi.mocked(requireRole).mockResolvedValue(okAuth("admin", supabase) as never);
    const res = await requireElearningCourse("c1", ["admin"]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.course.id).toBe("c1");
  });
});

describe("requireElearningEnrollment", () => {
  beforeEach(() => vi.mocked(requireRole).mockReset());

  it("refuse (403) un learner sur une inscription qui n'est pas la sienne", async () => {
    const supabase = mockSupabase({
      data: {
        id: "e1", course_id: "c1", learner_id: "l1",
        elearning_courses: { entity_id: "ent-A" },
        learners: { profile_id: "autre-user" },
      },
      error: null,
    });
    vi.mocked(requireRole).mockResolvedValue(okAuth("learner", supabase) as never);
    const res = await requireElearningEnrollment("e1", ["admin", "learner"]);
    expect(res.ok).toBe(false);
  });

  it("succès : learner sur sa propre inscription", async () => {
    const supabase = mockSupabase({
      data: {
        id: "e1", course_id: "c1", learner_id: "l1",
        elearning_courses: { entity_id: "ent-A" },
        learners: { profile_id: "user-1" },
      },
      error: null,
    });
    vi.mocked(requireRole).mockResolvedValue(okAuth("learner", supabase) as never);
    const res = await requireElearningEnrollment("e1", ["admin", "learner"]);
    expect(res.ok).toBe(true);
  });

  it("succès : un admin n'est pas soumis au contrôle de propriété", async () => {
    const supabase = mockSupabase({
      data: {
        id: "e1", course_id: "c1", learner_id: "l1",
        elearning_courses: { entity_id: "ent-A" },
        learners: { profile_id: "autre-user" },
      },
      error: null,
    });
    vi.mocked(requireRole).mockResolvedValue(okAuth("admin", supabase) as never);
    const res = await requireElearningEnrollment("e1", ["admin", "learner"]);
    expect(res.ok).toBe(true);
  });
});
```

- [ ] **Step 2 : Lancer les tests → échec attendu**

Run: `npx vitest run src/lib/auth/__tests__/elearning-access.test.ts`
Expected: FAIL — `elearning-access` n'existe pas.

- [ ] **Step 3 : Écrire le garde**

Créer `src/lib/auth/elearning-access.ts` :

```ts
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/require-role";

/**
 * Garde de sécurité partagé du sous-système e-learning.
 * Centralise : rôle, isolation multi-tenant (entity_id), propriété apprenant.
 * Cf. spec docs/superpowers/specs/2026-05-22-solidification-workflow-elearning-design.md §3.
 */

type Profile = { id: string; role: string; entity_id: string };

interface CourseRow {
  id: string;
  entity_id: string;
  [k: string]: unknown;
}

export type ElearningCourseAccess =
  | { ok: true; supabase: SupabaseClient; profile: Profile; userId: string; course: CourseRow }
  | { ok: false; error: NextResponse };

export type ElearningEnrollmentAccess =
  | { ok: true; supabase: SupabaseClient; profile: Profile; userId: string; enrollment: { id: string; course_id: string; learner_id: string } }
  | { ok: false; error: NextResponse };

const forbidden = () =>
  NextResponse.json({ error: "Accès refusé" }, { status: 403 });
const notFound = (what: string) =>
  NextResponse.json({ error: `${what} introuvable` }, { status: 404 });

/**
 * Vérifie le rôle, charge le cours e-learning et contrôle l'isolation
 * multi-tenant (course.entity_id === profile.entity_id).
 */
export async function requireElearningCourse(
  courseId: string,
  allowedRoles: string[],
): Promise<ElearningCourseAccess> {
  const auth = await requireRole(allowedRoles);
  if (auth.error) return { ok: false, error: auth.error };

  const { data: course, error } = await auth.supabase
    .from("elearning_courses")
    .select("*")
    .eq("id", courseId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: NextResponse.json({ error: "Erreur de chargement du cours" }, { status: 500 }) };
  }
  if (!course) return { ok: false, error: notFound("Cours") };
  if (course.entity_id !== auth.profile.entity_id) {
    return { ok: false, error: forbidden() };
  }
  return { ok: true, supabase: auth.supabase, profile: auth.profile, userId: auth.user.id, course };
}

/**
 * Vérifie le rôle, charge l'inscription, contrôle l'isolation entité ET,
 * pour un rôle `learner`, la propriété (l'inscription est la sienne via
 * la chaîne learner_id → learners.profile_id = auth.uid()).
 */
export async function requireElearningEnrollment(
  enrollmentId: string,
  allowedRoles: string[],
): Promise<ElearningEnrollmentAccess> {
  const auth = await requireRole(allowedRoles);
  if (auth.error) return { ok: false, error: auth.error };

  const { data: enrollment, error } = await auth.supabase
    .from("elearning_enrollments")
    .select("id, course_id, learner_id, elearning_courses(entity_id), learners(profile_id)")
    .eq("id", enrollmentId)
    .maybeSingle();

  if (error || !enrollment) return { ok: false, error: notFound("Inscription") };

  const courseEntity = (enrollment.elearning_courses as { entity_id: string } | null)?.entity_id;
  if (courseEntity !== auth.profile.entity_id) {
    return { ok: false, error: forbidden() };
  }
  if (auth.profile.role === "learner") {
    const learnerProfileId = (enrollment.learners as { profile_id: string | null } | null)?.profile_id;
    if (learnerProfileId !== auth.user.id) {
      return { ok: false, error: forbidden() };
    }
  }
  return {
    ok: true,
    supabase: auth.supabase,
    profile: auth.profile,
    userId: auth.user.id,
    enrollment: {
      id: enrollment.id as string,
      course_id: enrollment.course_id as string,
      learner_id: enrollment.learner_id as string,
    },
  };
}
```

- [ ] **Step 4 : Lancer les tests → succès attendu**

Run: `npx vitest run src/lib/auth/__tests__/elearning-access.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5 : Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: aucune erreur.

- [ ] **Step 6 : Commit**

```bash
git add src/lib/auth/elearning-access.ts src/lib/auth/__tests__/elearning-access.test.ts
git commit -m "feat(elearning): garde de securite partage requireElearningCourse/Enrollment"
```

---

## Task 3 : Helper « cours unifié » `elearning-courses.ts`

**Files:**
- Create: `src/lib/services/elearning-courses.ts`
- Create: `src/lib/services/__tests__/elearning-courses.test.ts`

- [ ] **Step 1 : Écrire les tests**

Créer `src/lib/services/__tests__/elearning-courses.test.ts` :

```ts
import { describe, it, expect, vi } from "vitest";
import { mergeAssignableCourses, type AssignableCourse } from "@/lib/services/elearning-courses";

describe("mergeAssignableCourses", () => {
  it("fusionne les cours IA publiés et les cours programme publiés", () => {
    const ai = [
      { id: "ai-1", title: "Cours IA", status: "published", estimated_duration_minutes: 60 },
    ];
    const programs = [
      { id: "pr-1", content: { type: "elearning", status: "published", title: "Cours prog", duration: 30 } },
      { id: "pr-2", content: { type: "elearning", status: "draft", title: "Brouillon" } },
      { id: "pr-3", content: { type: "training", status: "published" } },
    ];
    const res: AssignableCourse[] = mergeAssignableCourses(ai, programs);
    expect(res).toHaveLength(2); // ai-1 + pr-1 (pr-2 draft, pr-3 pas elearning)
    expect(res.find((c) => c.id === "ai-1")?.source).toBe("ai");
    expect(res.find((c) => c.id === "pr-1")?.source).toBe("program");
  });

  it("ignore les programmes sans content.type=elearning ou non publiés", () => {
    const res = mergeAssignableCourses([], [
      { id: "x", content: { type: "elearning", status: "draft" } },
      { id: "y", content: null },
    ]);
    expect(res).toHaveLength(0);
  });
});

describe("getAssignableElearningCourses", () => {
  it("interroge les 2 tables filtrées par entity_id", async () => {
    const aiChain = { select: vi.fn(() => aiChain), eq: vi.fn(() => aiChain), order: vi.fn(() => Promise.resolve({ data: [], error: null })) };
    const prChain = { select: vi.fn(() => prChain), eq: vi.fn(() => Promise.resolve({ data: [], error: null })) };
    const supabase = { from: vi.fn((t: string) => (t === "elearning_courses" ? aiChain : prChain)) } as never;
    const { getAssignableElearningCourses } = await import("@/lib/services/elearning-courses");
    const res = await getAssignableElearningCourses(supabase, "ent-A");
    expect(res).toEqual([]);
    expect(aiChain.eq).toHaveBeenCalledWith("entity_id", "ent-A");
    expect(prChain.eq).toHaveBeenCalledWith("entity_id", "ent-A");
  });
});
```

- [ ] **Step 2 : Lancer les tests → échec attendu**

Run: `npx vitest run src/lib/services/__tests__/elearning-courses.test.ts`
Expected: FAIL — `elearning-courses` n'existe pas.

- [ ] **Step 3 : Écrire le helper**

Créer `src/lib/services/elearning-courses.ts` :

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Abstraction « cours e-learning assignable » — réconcilie les 2 mondes :
 * cours IA (table elearning_courses) et cours « programme » (table programs,
 * content.type === "elearning"). Cf. spec §5.
 */

export interface AssignableCourse {
  id: string;
  source: "ai" | "program";
  title: string;
  duration_minutes: number;
}

interface AiCourseRow {
  id: string;
  title: string;
  status: string;
  estimated_duration_minutes: number | null;
}

interface ProgramRow {
  id: string;
  content: Record<string, unknown> | null;
}

/** Fusionne deux jeux de lignes brutes en une liste normalisée. Fonction pure. */
export function mergeAssignableCourses(
  aiCourses: AiCourseRow[],
  programs: ProgramRow[],
): AssignableCourse[] {
  const ai: AssignableCourse[] = aiCourses
    .filter((c) => c.status === "published")
    .map((c) => ({
      id: c.id,
      source: "ai",
      title: c.title,
      duration_minutes: c.estimated_duration_minutes ?? 0,
    }));

  const prog: AssignableCourse[] = programs
    .filter((p) => {
      const c = p.content;
      return !!c && c.type === "elearning" && c.status === "published";
    })
    .map((p) => ({
      id: p.id,
      source: "program",
      title: String((p.content as Record<string, unknown>).title ?? "Cours"),
      duration_minutes: Number((p.content as Record<string, unknown>).duration) || 0,
    }));

  return [...ai, ...prog];
}

/**
 * Liste les cours e-learning publiés assignables d'une entité, depuis les
 * 2 mondes. Toujours filtré par entity_id.
 */
export async function getAssignableElearningCourses(
  supabase: SupabaseClient,
  entityId: string,
): Promise<AssignableCourse[]> {
  const { data: aiCourses } = await supabase
    .from("elearning_courses")
    .select("id, title, status, estimated_duration_minutes")
    .eq("entity_id", entityId)
    .eq("status", "published")
    .order("title");

  const { data: programs } = await supabase
    .from("programs")
    .select("id, content")
    .eq("entity_id", entityId);

  return mergeAssignableCourses(
    (aiCourses ?? []) as AiCourseRow[],
    (programs ?? []) as ProgramRow[],
  );
}
```

- [ ] **Step 4 : Lancer les tests → succès attendu**

Run: `npx vitest run src/lib/services/__tests__/elearning-courses.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5 : Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` → aucune erreur.

- [ ] **Step 6 : Commit**

```bash
git add src/lib/services/elearning-courses.ts src/lib/services/__tests__/elearning-courses.test.ts
git commit -m "feat(elearning): helper getAssignableElearningCourses (2 mondes)"
```

---

## Task 4 : Recâbler les routes — cycle de vie des cours

**Files:**
- Modify: `src/app/api/elearning/route.ts`
- Modify: `src/app/api/elearning/[courseId]/route.ts`
- Modify: `src/app/api/elearning/[courseId]/publish/route.ts`
- Modify: `src/app/api/elearning/[courseId]/chapters/[chapterId]/route.ts`

**Pattern de recâblage (canonique).** Une route à `courseId` remplace son contrôle d'auth ad hoc par le garde :

```ts
// AVANT — lookup profiles manuel + check rôle
const { data: { user } } = await supabase.auth.getUser();
// ... select profiles ... if (!["admin","super_admin"].includes(profile.role)) ...

// APRÈS
import { requireElearningCourse } from "@/lib/auth/elearning-access";

const access = await requireElearningCourse(params.courseId, ["admin", "super_admin"]);
if (!access.ok) return access.error;
const { supabase, profile, course } = access;   // entité déjà vérifiée
```

`logAudit` suit le pattern déjà utilisé dans `src/app/api/elearning/route.ts` (POST).

- [ ] **Step 1 : `elearning/route.ts` (collection)**

Pas de `courseId` → garde non applicable. Normaliser sur `requireRole(["admin","super_admin"])` (le helper existant) si ce n'est pas déjà le cas ; conserver le filtre `.eq("entity_id", profile.entity_id)` sur le GET et l'injection `entity_id` sur le POST. Aucune autre modification.

- [ ] **Step 2 : `[courseId]/route.ts`**

- `GET` → `requireElearningCourse(params.courseId, ["admin","super_admin","learner"])`. **Masquage des réponses** : si `profile.role === "learner"`, retirer `is_correct` de chaque option des `elearning_quiz_questions` embarqués avant de renvoyer la réponse :

```ts
if (profile.role === "learner") {
  for (const ch of course.elearning_chapters ?? []) {
    for (const q of ch.elearning_quizzes?.[0]?.elearning_quiz_questions ?? []) {
      q.options = (q.options ?? []).map((o: { text: string }) => ({ text: o.text }));
    }
  }
}
```

- `PATCH` / `DELETE` → `requireElearningCourse(params.courseId, ["admin","super_admin"])`. Ajouter `logAudit` (`action: "update"` / `"delete"`, `resourceType: "elearning_course"`, `resourceId: courseId`).

- [ ] **Step 3 : `[courseId]/publish/route.ts`**

`PATCH` → `requireElearningCourse(params.courseId, ["admin","super_admin"])`, puis remplacer le lire-puis-écrire du statut par l'appel RPC :

```ts
const { data: newStatus, error } = await supabase.rpc("elearning_publish_course", {
  p_course_id: params.courseId,
});
if (error) {
  const msg = error.message.includes("generation_incomplete")
    ? "Le cours doit être généré (generation_status = completed) avant publication."
    : error.message.includes("no_chapters")
    ? "Le cours doit comporter au moins un chapitre avant publication."
    : "Erreur de publication";
  return NextResponse.json({ error: msg }, { status: 409 });
}
// logAudit action "update", details { status: newStatus }
return NextResponse.json({ data: { status: newStatus } });
```

- [ ] **Step 4 : `[courseId]/chapters/[chapterId]/route.ts`**

`PATCH` / `DELETE` → `requireElearningCourse(params.courseId, ["admin","super_admin"])` — **`learner` retiré** (correctif d'escalade de privilège). Conserver le filtre `.eq("id", chapterId).eq("course_id", courseId)`. Ajouter `logAudit` (`resourceType: "elearning_chapter"`).

- [ ] **Step 5 : Typecheck + tests**

Run: `npx tsc --noEmit -p tsconfig.json` → aucune erreur.
Run: `npx vitest run` → suite verte.

- [ ] **Step 6 : Commit**

```bash
git add "src/app/api/elearning/route.ts" "src/app/api/elearning/[courseId]/route.ts" "src/app/api/elearning/[courseId]/publish/route.ts" "src/app/api/elearning/[courseId]/chapters/[chapterId]/route.ts"
git commit -m "feat(elearning): recablage routes cycle de vie sur le garde + RPC publish + audit"
```

---

## Task 5 : Recâbler les routes — parcours apprenant (runtime)

**Files:**
- Modify: `src/app/api/elearning/[courseId]/enroll/route.ts`
- Modify: `src/app/api/elearning/progress/route.ts`
- Modify: `src/app/api/elearning/quiz/[chapterId]/submit/route.ts`
- Modify: `src/app/api/elearning/final-exam/[courseId]/route.ts`
- Modify: `src/app/api/elearning/final-exam/[courseId]/submit/route.ts`
- Modify: `src/app/api/elearning/scores/route.ts`

- [ ] **Step 1 : `enroll/route.ts`**

`POST` → `requireElearningCourse(params.courseId, ["admin","super_admin"])` — **`learner` retiré** (l'inscription d'apprenants est une action admin). Ajouter `logAudit` (`resourceType: "elearning_enrollment"`, details `{ count }`).

- [ ] **Step 2 : `progress/route.ts`**

`POST` → `requireElearningEnrollment(body.enrollment_id, ["admin","super_admin","learner"])` (propriété apprenant vérifiée par le garde). Conserver l'upsert de `elearning_chapter_progress` mais **vérifier son erreur** (plus de fire-and-forget). Remplacer le recalcul manuel de `completion_rate`/`status` par l'appel RPC :

```ts
const { error: rpcErr } = await supabase.rpc("elearning_recompute_progress", {
  p_enrollment_id: body.enrollment_id,
});
if (rpcErr) return NextResponse.json({ error: "Erreur de recalcul de progression" }, { status: 500 });
```

- [ ] **Step 3 : `quiz/[chapterId]/submit/route.ts`**

Résoudre d'abord le `course_id` du chapitre, puis `requireElearningEnrollment(body.enrollment_id, ["admin","super_admin","learner"])`. **Compteur de tentatives atomique** : l'upsert de `elearning_chapter_progress` écrit `quiz_attempts` via une expression d'incrément plutôt que lecture-puis-+1 — soit un upsert dédié, soit un `update ... set quiz_attempts = quiz_attempts + 1` suivi de l'upsert des autres champs. **Vérifier l'erreur** de l'upsert.

- [ ] **Step 4 : `final-exam/[courseId]/route.ts`**

`GET` → `requireElearningCourse(params.courseId, ["admin","super_admin","learner"])`. **Masquage par défaut** : supprimer le paramètre opt-in `strip_answers`. Si `profile.role === "learner"`, renvoyer toujours les questions sans `correct_answer`, sans `explanation`, et options réduites à `{ text }`. Si rôle admin/super_admin, renvoyer la version complète.

- [ ] **Step 5 : `final-exam/[courseId]/submit/route.ts`**

`POST` → `requireElearningEnrollment(body.enrollment_id, ["admin","super_admin","learner"])`. Compteur `attempts` atomique (cf. Step 3). **Vérifier l'erreur** de l'upsert de `elearning_final_exam_progress` ET de l'`update` de `elearning_enrollments` (passage à `completed`) — plus de fire-and-forget : si l'écriture échoue, renvoyer 500.

- [ ] **Step 6 : `scores/route.ts`**

`GET` / `POST` → ajouter `requireRole(["admin","super_admin","learner"])` en tête (la route est aujourd'hui authentifiée sans contrôle de rôle ; `user_id` reste forcé à `user.id`). Compteur `attempts` atomique (cf. Step 3).

- [ ] **Step 7 : Typecheck + tests**

Run: `npx tsc --noEmit -p tsconfig.json` → aucune erreur.
Run: `npx vitest run` → suite verte.

- [ ] **Step 8 : Commit**

```bash
git add "src/app/api/elearning/[courseId]/enroll/route.ts" "src/app/api/elearning/progress/route.ts" "src/app/api/elearning/quiz/[chapterId]/submit/route.ts" "src/app/api/elearning/final-exam/[courseId]/route.ts" "src/app/api/elearning/final-exam/[courseId]/submit/route.ts" "src/app/api/elearning/scores/route.ts"
git commit -m "feat(elearning): recablage routes runtime — garde propriete, RPC, ecritures verifiees, masquage reponses"
```

---

## Task 6 : Recâbler les routes — génération IA, exports, live

**Files:**
- Modify: `src/app/api/elearning/[courseId]/generate/route.ts`, `extract/route.ts`, `source-url/route.ts`, `slides/route.ts`, `gamma/route.ts`, `global-flashcards/route.ts`, `download-pdf/route.ts`, `download-pptx/route.ts`, `export-pptx/route.ts`, `live-session/route.ts`
- Modify: `src/app/api/elearning/extract-url/route.ts`, `gamma-themes/route.ts`

- [ ] **Step 1 : Routes à `courseId`**

Pour chaque route comportant un `params.courseId` (`generate`, `extract`, `source-url`, `slides`, `gamma`, `global-flashcards`, `download-pdf`, `download-pptx`, `export-pptx`, `live-session`) : remplacer le contrôle d'auth ad hoc par `requireElearningCourse(params.courseId, ["admin","super_admin"])` — ce qui ajoute l'**isolation `entity_id`** aujourd'hui absente. Cas particuliers :
- `generate` : conserver la branche jeton cron (`verifyCronAuth`) — si jeton cron valide, court-circuiter le garde ; sinon `requireElearningCourse(...)`.
- `source-url` : aujourd'hui ouverte à tout utilisateur connecté → la passer sous `requireElearningCourse(params.courseId, ["admin","super_admin","learner"])` (un apprenant peut avoir besoin du document source).
- `live-session` POST/PATCH : ajouter `logAudit` (`resourceType: "elearning_live_session"`).

- [ ] **Step 2 : Routes sans `courseId`**

`extract-url` et `gamma-themes` n'ont pas de `courseId` → normaliser sur `requireRole(["admin","super_admin"])` (le helper existant). Aucune autre modification.

- [ ] **Step 3 : Typecheck + tests**

Run: `npx tsc --noEmit -p tsconfig.json` → aucune erreur.
Run: `npx vitest run` → suite verte.

- [ ] **Step 4 : Commit**

```bash
git add "src/app/api/elearning"
git commit -m "feat(elearning): recablage routes generation/export/live sur le garde + isolation entity_id"
```

---

## Task 7 : `TabElearning` — 2 mondes & progression réelle

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabElearning.tsx`

- [ ] **Step 1 : Lister les cours des 2 mondes**

Remplacer le `fetchCourses` actuel (qui ne lit que `elearning_courses`) par un appel à `getAssignableElearningCourses(supabase, profile.entity_id)`. Le type local `ElearningCourse` du composant devient `AssignableCourse` (importé de `@/lib/services/elearning-courses`) — le `Select` de cours affiche désormais les 2 mondes ; pour distinguer visuellement, suffixer le libellé d'un cours `program` (p. ex. « (programme) »).

- [ ] **Step 2 : Renseigner `course_source` à l'attribution**

Dans `handleAssign`, le `Select` fournit désormais un `AssignableCourse` (avec `source`). L'`insert` dans `formation_elearning_assignments` ajoute `course_source: selected.source`. L'`upsert` dans `elearning_enrollments` n'est fait **que si `source === "ai"`** (les cours `program` n'ont pas de runtime d'inscription) ; `elearning_enrollment_id` reste `null` pour un cours `program`.

- [ ] **Step 3 : Afficher la progression réelle (cours IA)**

Pour les attributions `course_source === "ai"` ayant un `elearning_enrollment_id`, charger la progression réelle depuis `elearning_enrollments` (`completion_rate`, `status`) — une requête `select` sur les `elearning_enrollment_id` des attributions de la formation. Afficher cette progression comme signal principal de la ligne apprenant (p. ex. « 60 % — en cours »). Le badge issu du toggle manuel `is_completed` est **conservé** mais présenté comme une « validation admin » distincte, affichée à côté — et reste le seul signal pour les attributions `course_source === "program"`.

- [ ] **Step 4 : Typecheck + tests**

Run: `npx tsc --noEmit -p tsconfig.json` → aucune erreur.
Run: `npx vitest run` → suite verte.

- [ ] **Step 5 : Commit**

```bash
git add "src/app/(dashboard)/admin/formations/[id]/_components/TabElearning.tsx"
git commit -m "feat(elearning): TabElearning — 2 mondes assignables + progression reelle"
```

---

## Task 8 : Vérification finale

**Files:** aucun (vérification uniquement).

- [ ] **Step 1 : Typecheck global** — Run: `npx tsc --noEmit -p tsconfig.json`. Expected: aucune erreur.
- [ ] **Step 2 : Suite complète** — Run: `npx vitest run`. Expected: toute la suite verte (dont les ~10 nouveaux tests des Tasks 2-3).
- [ ] **Step 3 : Recherche de résidus** — Run: `grep -rn "strip_answers" src/app/api/elearning/`. Expected: 0 résultat (le paramètre opt-in a été supprimé). Run: `grep -rln "auth.getUser()" src/app/api/elearning/` — vérifier qu'il ne reste pas de contrôle d'auth ad hoc hors `requireElearningCourse`/`requireElearningEnrollment`/`requireRole`/`verifyCronAuth`.
- [ ] **Step 4 : Revue manuelle — critères de succès du spec §10 :**
  - Une route avec un `courseId` d'une autre entité renvoie 403.
  - Un `learner` ne peut plus `PATCH`/`DELETE` un chapitre, ni `enroll`, ni agir sur une inscription qui n'est pas la sienne.
  - `GET /final-exam/[courseId]` en tant que `learner` ne renvoie jamais `correct_answer`/`explanation`/`is_correct`.
  - Publier un cours `generation_status != completed` ou sans chapitre → 409.
  - `TabElearning` liste et attribue les cours des 2 mondes ; les cours IA affichent une progression réelle.
  - Les mutations e-learning (publish, chapitre, cours, enroll, live) apparaissent dans le journal d'audit.

---

## Vérification manuelle (après déploiement)

- Exécuter `supabase/migrations/elearning_solidification.sql` dans le Dashboard Supabase **avant** de tester les Tasks 5 et 7 (RPC + colonne `course_source`).
- Tester un parcours apprenant complet (inscription → chapitres → quiz → examen) et vérifier que la progression remonte dans `TabElearning`.
- Tester l'attribution d'un cours « programme » depuis `TabElearning`.
