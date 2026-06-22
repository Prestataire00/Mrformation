# Questionnaires créés/attribués par le formateur — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un formateur de créer des questionnaires pédagogiques et de les attribuer aux stagiaires de ses sessions (réutilise l'infra apprenant existante).

**Architecture:** Réutilise les tables `questionnaires` / `questions` / `questionnaire_sessions` (la découverte + le remplissage apprenant existent déjà). Ajout d'une colonne d'auteur `created_by_trainer_id`, de policies RLS formateur, d'un service métier isolé, de routes `/api/trainer/questionnaires/*` et d'une UI formateur (liste, builder, dialog d'attribution, résultats). Aucun changement côté apprenant.

**Tech Stack:** Next.js 14 (App Router), Supabase (Postgres + RLS), TypeScript strict, Vitest, TailwindCSS + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-06-22-questionnaires-formateur-authoring-design.md`

**Conventions clés du repo :**
- Routes formateur sous `/api/trainer/*` (déjà dans `API_PERMISSIONS`). Auth handler : `supabase.auth.getUser()` puis résolution `trainers` par `profile_id` (TOUTES les fiches, pas `.single()` — multi-entité).
- Erreurs API via `sanitizeError(e, "contexte")` de `@/lib/api-error`.
- Types de questions supportés par le builder formateur : `rating | text | multiple_choice | yes_no` (le `CHECK` SQL de `questions.type` n'autorise que ceux-là ; `program_objectives` est réservé à l'admin).
- Composant de rendu de question partagé : `@/components/questionnaires/QuestionField` (type `QuestionFieldData = { id, text, type, options: string[]|null, is_required }`).

---

## Fichiers touchés

| Fichier | Rôle |
|---|---|
| `supabase/migrations/add_trainer_authored_questionnaires.sql` (create) | Colonne `created_by_trainer_id` + RLS formateur |
| `src/lib/services/trainer-questionnaire.ts` (create) | Service : résolution fiches, ownership |
| `src/lib/services/__tests__/trainer-questionnaire.test.ts` (create) | Tests unitaires |
| `src/app/api/trainer/questionnaires/route.ts` (create) | GET liste · POST create |
| `src/app/api/trainer/questionnaires/[id]/route.ts` (create) | PUT update · DELETE |
| `src/app/api/trainer/questionnaires/[id]/sessions/route.ts` (create) | GET sessions+linked · POST lier |
| `src/app/api/trainer/questionnaires/[id]/sessions/[sessionId]/route.ts` (create) | DELETE délier |
| `src/app/api/trainer/questionnaires/[id]/results/route.ts` (create) | GET résultats |
| `src/components/trainer/TrainerQuestionnaireBuilder.tsx` (create) | Formulaire de création/édition |
| `src/app/(dashboard)/trainer/questionnaires/page.tsx` (create) | Liste « Mes questionnaires » + bibliothèque |
| `src/app/(dashboard)/trainer/questionnaires/create/page.tsx` (create) | Page création |
| `src/app/(dashboard)/trainer/questionnaires/[id]/edit/page.tsx` (create) | Page édition |
| `src/components/trainer/AssignQuestionnaireDialog.tsx` (create) | Dialog d'attribution aux sessions |
| `src/app/(dashboard)/trainer/questionnaires/[id]/results/page.tsx` (create) | Vue résultats |
| `src/components/layout/Sidebar.tsx` (modify) | Entrée nav « Questionnaires » formateur |
| `src/app/(dashboard)/admin/questionnaires/page.tsx` (modify) | Badge « Créé par formateur » |

---

## Task 1 : Migration colonne auteur + RLS

**Files:**
- Create: `supabase/migrations/add_trainer_authored_questionnaires.sql`

- [ ] **Step 1: Écrire la migration**

Créer `supabase/migrations/add_trainer_authored_questionnaires.sql` :

```sql
-- ============================================================
-- Migration: questionnaires créés par le formateur (demande 5)
-- Ajoute l'auteur formateur + RLS write borné à ses propres créations.
-- ⚠️ Helpers RLS en public.* (PAS auth.*) — cf. mémoire projet.
-- ============================================================

-- 1. Colonne auteur (null = questionnaire admin)
ALTER TABLE questionnaires
  ADD COLUMN IF NOT EXISTS created_by_trainer_id UUID REFERENCES trainers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_questionnaires_created_by_trainer
  ON questionnaires(created_by_trainer_id) WHERE created_by_trainer_id IS NOT NULL;

-- 2. RLS questionnaires : le formateur crée/édite/supprime SES propres questionnaires
DROP POLICY IF EXISTS "questionnaires_trainer_insert_own" ON questionnaires;
CREATE POLICY "questionnaires_trainer_insert_own" ON questionnaires
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_role() = 'trainer'
    AND entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid())
    AND created_by_trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
  );

DROP POLICY IF EXISTS "questionnaires_trainer_update_own" ON questionnaires;
CREATE POLICY "questionnaires_trainer_update_own" ON questionnaires
  FOR UPDATE TO authenticated
  USING (
    public.user_role() = 'trainer'
    AND created_by_trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
  )
  WITH CHECK (
    public.user_role() = 'trainer'
    AND created_by_trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
  );

DROP POLICY IF EXISTS "questionnaires_trainer_delete_own" ON questionnaires;
CREATE POLICY "questionnaires_trainer_delete_own" ON questionnaires
  FOR DELETE TO authenticated
  USING (
    public.user_role() = 'trainer'
    AND created_by_trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
  );

-- 3. RLS questions : le formateur gère les questions de SES questionnaires
DROP POLICY IF EXISTS "questions_trainer_manage_own" ON questions;
CREATE POLICY "questions_trainer_manage_own" ON questions
  FOR ALL TO authenticated
  USING (
    questionnaire_id IN (
      SELECT id FROM questionnaires
      WHERE created_by_trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
    )
  )
  WITH CHECK (
    questionnaire_id IN (
      SELECT id FROM questionnaires
      WHERE created_by_trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
    )
  );

-- 4. RLS questionnaire_sessions : le formateur lie un questionnaire de SON entité
--    à une session qui lui est assignée (réutilisation autorisée à toute l'entité).
DROP POLICY IF EXISTS "qsessions_trainer_manage" ON questionnaire_sessions;
CREATE POLICY "qsessions_trainer_manage" ON questionnaire_sessions
  FOR ALL TO authenticated
  USING (
    session_id IN (
      SELECT session_id FROM formation_trainers
      WHERE trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
    )
  )
  WITH CHECK (
    questionnaire_id IN (
      SELECT id FROM questionnaires
      WHERE entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid())
    )
    AND session_id IN (
      SELECT session_id FROM formation_trainers
      WHERE trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
    )
  );

-- Vérif : SELECT column_name FROM information_schema.columns
--   WHERE table_name='questionnaires' AND column_name='created_by_trainer_id';  -- 1 ligne
```

- [ ] **Step 2: Vérifier**

Run: `grep -c "CREATE POLICY" supabase/migrations/add_trainer_authored_questionnaires.sql`
Expected: `5`

> ⚠️ Migration à jouer manuellement dans Supabase Dashboard (prod + dev) avant déploiement.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/add_trainer_authored_questionnaires.sql
git commit -m "feat(db): created_by_trainer_id + RLS questionnaires formateur"
```

---

## Task 2 : Service `trainer-questionnaire.ts` (TDD)

**Files:**
- Create: `src/lib/services/trainer-questionnaire.ts`
- Test: `src/lib/services/__tests__/trainer-questionnaire.test.ts`

- [ ] **Step 1: Écrire les tests d'abord**

Créer `src/lib/services/__tests__/trainer-questionnaire.test.ts` :

```ts
import { describe, it, expect, vi } from "vitest";
import { resolveTrainerIds, getOwnedQuestionnaire } from "../trainer-questionnaire";

type AnyClient = Parameters<typeof resolveTrainerIds>[0];

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

describe("resolveTrainerIds", () => {
  it("retourne toutes les fiches du formateur", async () => {
    const client = makeClient({ trainers: { rows: [{ id: "t1" }, { id: "t2" }] } });
    expect(await resolveTrainerIds(client, "p1")).toEqual(["t1", "t2"]);
    expect(client.__calls.trainers.profile_id).toBe("p1");
  });

  it("retourne [] si aucune fiche", async () => {
    const client = makeClient({ trainers: { rows: [] } });
    expect(await resolveTrainerIds(client, "p1")).toEqual([]);
  });
});

describe("getOwnedQuestionnaire", () => {
  it("retourne le questionnaire si une fiche du formateur en est l'auteur", async () => {
    const client = makeClient({
      questionnaires: { single: { id: "q1", created_by_trainer_id: "t2", entity_id: "e1" } },
      trainers: { rows: [{ id: "t1" }, { id: "t2" }] },
    });
    expect(await getOwnedQuestionnaire(client, "p1", "q1")).toEqual({
      id: "q1", created_by_trainer_id: "t2", entity_id: "e1",
    });
  });

  it("retourne null si le questionnaire est d'un admin (created_by_trainer_id null)", async () => {
    const client = makeClient({
      questionnaires: { single: { id: "q1", created_by_trainer_id: null, entity_id: "e1" } },
      trainers: { rows: [{ id: "t1" }] },
    });
    expect(await getOwnedQuestionnaire(client, "p1", "q1")).toBeNull();
  });

  it("retourne null si un autre formateur en est l'auteur", async () => {
    const client = makeClient({
      questionnaires: { single: { id: "q1", created_by_trainer_id: "autre", entity_id: "e1" } },
      trainers: { rows: [{ id: "t1" }] },
    });
    expect(await getOwnedQuestionnaire(client, "p1", "q1")).toBeNull();
  });

  it("retourne null si introuvable", async () => {
    const client = makeClient({ questionnaires: { single: null }, trainers: { rows: [{ id: "t1" }] } });
    expect(await getOwnedQuestionnaire(client, "p1", "absent")).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer (échec attendu)**

Run: `npx vitest run src/lib/services/__tests__/trainer-questionnaire.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter le service**

Créer `src/lib/services/trainer-questionnaire.ts` :

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Logique des questionnaires créés par le formateur (demande 5).
 * Multi-entité : un profile_id peut avoir plusieurs fiches trainers → on résout
 * TOUTES les fiches (pas `.single()`), cohérent avec trainer-session-access.ts.
 */

export interface OwnedQuestionnaire {
  id: string;
  created_by_trainer_id: string | null;
  entity_id: string;
}

/** Ids de toutes les fiches formateur de `profileId`. */
export async function resolveTrainerIds(
  supabase: SupabaseClient,
  profileId: string,
): Promise<string[]> {
  const { data } = await supabase.from("trainers").select("id").eq("profile_id", profileId);
  return ((data as Array<{ id: string }> | null) ?? []).map((t) => t.id);
}

/** Le questionnaire si une fiche du formateur en est l'auteur, sinon null. */
export async function getOwnedQuestionnaire(
  supabase: SupabaseClient,
  profileId: string,
  questionnaireId: string,
): Promise<OwnedQuestionnaire | null> {
  const { data: q } = await supabase
    .from("questionnaires")
    .select("id, created_by_trainer_id, entity_id")
    .eq("id", questionnaireId)
    .maybeSingle();
  if (!q) return null;

  const trainerIds = await resolveTrainerIds(supabase, profileId);
  const qq = q as OwnedQuestionnaire;
  return qq.created_by_trainer_id && trainerIds.includes(qq.created_by_trainer_id) ? qq : null;
}
```

- [ ] **Step 4: Lancer (succès attendu)**

Run: `npx vitest run src/lib/services/__tests__/trainer-questionnaire.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/trainer-questionnaire.ts src/lib/services/__tests__/trainer-questionnaire.test.ts
git commit -m "feat(service): trainer-questionnaire (résolution fiches + ownership)"
```

---

## Task 3 : API liste + création

**Files:**
- Create: `src/app/api/trainer/questionnaires/route.ts`

- [ ] **Step 1: Implémenter GET + POST**

Créer `src/app/api/trainer/questionnaires/route.ts` :

```ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";
import { resolveTrainerIds } from "@/lib/services/trainer-questionnaire";

const ALLOWED_TYPES = ["rating", "text", "multiple_choice", "yes_no"] as const;

/** GET — questionnaires de l'entité (mes créations éditables + bibliothèque). */
export async function GET(_request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles").select("entity_id").eq("id", user.id).single();
    if (!profile?.entity_id) return NextResponse.json({ error: "Profil introuvable" }, { status: 403 });

    const trainerIds = await resolveTrainerIds(supabase, user.id);

    const { data: questionnaires, error } = await supabase
      .from("questionnaires")
      .select("id, title, description, type, is_active, quality_indicator_type, created_by_trainer_id")
      .eq("entity_id", profile.entity_id)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const data = ((questionnaires as Array<{ created_by_trainer_id: string | null }> | null) ?? []).map((q) => ({
      ...q,
      mine: q.created_by_trainer_id != null && trainerIds.includes(q.created_by_trainer_id),
    }));
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/questionnaires GET") }, { status: 500 });
  }
}

interface QuestionInput {
  text: string;
  type: string;
  options: string[] | null;
  is_required: boolean;
}

/** POST — crée un questionnaire { title, description, type, questions[] }. */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles").select("entity_id").eq("id", user.id).single();
    if (!profile?.entity_id) return NextResponse.json({ error: "Profil introuvable" }, { status: 403 });

    const trainerIds = await resolveTrainerIds(supabase, user.id);
    if (trainerIds.length === 0) return NextResponse.json({ error: "Fiche formateur introuvable" }, { status: 403 });

    const body = (await request.json()) as {
      title?: string; description?: string; type?: string; questions?: QuestionInput[];
    };
    if (!body.title?.trim()) return NextResponse.json({ error: "Titre requis" }, { status: 400 });
    const qType = ["satisfaction", "evaluation", "survey"].includes(body.type ?? "")
      ? body.type : "evaluation";

    const { data: created, error: insErr } = await supabase
      .from("questionnaires")
      .insert({
        title: body.title.trim(),
        description: body.description?.trim() || null,
        type: qType,
        is_active: true,
        entity_id: profile.entity_id,
        created_by_trainer_id: trainerIds[0],
      })
      .select("id")
      .single();
    if (insErr || !created) {
      return NextResponse.json({ error: insErr?.message ?? "Création échouée" }, { status: 500 });
    }

    const questions = (body.questions ?? []).filter((q) => q.text?.trim());
    if (questions.length > 0) {
      const rows = questions.map((q, i) => ({
        questionnaire_id: created.id,
        text: q.text.trim(),
        type: ALLOWED_TYPES.includes(q.type as typeof ALLOWED_TYPES[number]) ? q.type : "text",
        options: q.type === "multiple_choice" ? (q.options ?? []).filter((o) => o.trim()) : null,
        is_required: q.is_required !== false,
        order_index: i + 1,
      }));
      const { error: qErr } = await supabase.from("questions").insert(rows);
      if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
    }

    return NextResponse.json({ data: { id: created.id } });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/questionnaires POST") }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "trainer/questionnaires/route" || echo "OK"`
Expected: `OK` (ignorer erreurs préexistantes hors fichier).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/trainer/questionnaires/route.ts
git commit -m "feat(api): liste + création de questionnaires formateur"
```

---

## Task 4 : API édition + suppression

**Files:**
- Create: `src/app/api/trainer/questionnaires/[id]/route.ts`

- [ ] **Step 1: Implémenter PUT + DELETE**

Créer `src/app/api/trainer/questionnaires/[id]/route.ts` :

```ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";
import { getOwnedQuestionnaire } from "@/lib/services/trainer-questionnaire";

const ALLOWED_TYPES = ["rating", "text", "multiple_choice", "yes_no"] as const;

interface QuestionInput {
  text: string;
  type: string;
  options: string[] | null;
  is_required: boolean;
}

/** PUT — édite titre/description/type + remplace les questions (créateur uniquement). */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const owned = await getOwnedQuestionnaire(supabase, user.id, params.id);
    if (!owned) return NextResponse.json({ error: "Questionnaire introuvable ou non autorisé" }, { status: 404 });

    const body = (await request.json()) as {
      title?: string; description?: string; type?: string; questions?: QuestionInput[];
    };
    if (!body.title?.trim()) return NextResponse.json({ error: "Titre requis" }, { status: 400 });
    const qType = ["satisfaction", "evaluation", "survey"].includes(body.type ?? "")
      ? body.type : "evaluation";

    const { error: upErr } = await supabase
      .from("questionnaires")
      .update({ title: body.title.trim(), description: body.description?.trim() || null, type: qType })
      .eq("id", params.id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    // Remplace les questions (delete + re-insert) — simple et correct pour un builder.
    await supabase.from("questions").delete().eq("questionnaire_id", params.id);
    const questions = (body.questions ?? []).filter((q) => q.text?.trim());
    if (questions.length > 0) {
      const rows = questions.map((q, i) => ({
        questionnaire_id: params.id,
        text: q.text.trim(),
        type: ALLOWED_TYPES.includes(q.type as typeof ALLOWED_TYPES[number]) ? q.type : "text",
        options: q.type === "multiple_choice" ? (q.options ?? []).filter((o) => o.trim()) : null,
        is_required: q.is_required !== false,
        order_index: i + 1,
      }));
      const { error: qErr } = await supabase.from("questions").insert(rows);
      if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/questionnaires/[id] PUT") }, { status: 500 });
  }
}

/** DELETE — supprime le questionnaire (créateur uniquement). Cascade questions + liens. */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const owned = await getOwnedQuestionnaire(supabase, user.id, params.id);
    if (!owned) return NextResponse.json({ error: "Questionnaire introuvable ou non autorisé" }, { status: 404 });

    const { error } = await supabase.from("questionnaires").delete().eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/questionnaires/[id] DELETE") }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "questionnaires/\[id\]/route" || echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/trainer/questionnaires/[id]/route.ts"
git commit -m "feat(api): édition/suppression questionnaire formateur (créateur only)"
```

---

## Task 5 : API attribution aux sessions

**Files:**
- Create: `src/app/api/trainer/questionnaires/[id]/sessions/route.ts`
- Create: `src/app/api/trainer/questionnaires/[id]/sessions/[sessionId]/route.ts`

- [ ] **Step 1: GET (mes sessions + linked) + POST (lier)**

Créer `src/app/api/trainer/questionnaires/[id]/sessions/route.ts` :

```ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";
import { resolveTrainerSessionIds, isTrainerAssignedToSession } from "@/lib/auth/trainer-session-access";

const NIL = "00000000-0000-0000-0000-000000000000";

/** GET — sessions du formateur + `linked` pour ce questionnaire. */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const sessionIds = await resolveTrainerSessionIds(supabase, user.id);
    const { data: sessions, error: sErr } = await supabase
      .from("sessions")
      .select("id, title, start_date, end_date, training:trainings(title)")
      .in("id", sessionIds.length ? sessionIds : [NIL])
      .order("start_date", { ascending: false });
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

    const { data: links } = await supabase
      .from("questionnaire_sessions")
      .select("session_id")
      .eq("questionnaire_id", params.id);
    const linked = new Set(((links as Array<{ session_id: string }> | null) ?? []).map((l) => l.session_id));

    const data = ((sessions as Array<{ id: string }> | null) ?? []).map((s) => ({ ...s, linked: linked.has(s.id) }));
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/questionnaires/[id]/sessions GET") }, { status: 500 });
  }
}

/** POST — lie le questionnaire à une session (idempotent). */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const body = (await request.json()) as { sessionId?: string };
    if (!body.sessionId) return NextResponse.json({ error: "sessionId requis" }, { status: 400 });

    const assigned = await isTrainerAssignedToSession(supabase, user.id, body.sessionId);
    if (!assigned) return NextResponse.json({ error: "Vous n'êtes pas assigné à cette session" }, { status: 403 });

    const { error } = await supabase
      .from("questionnaire_sessions")
      .upsert(
        { questionnaire_id: params.id, session_id: body.sessionId },
        { onConflict: "questionnaire_id,session_id", ignoreDuplicates: true },
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/questionnaires/[id]/sessions POST") }, { status: 500 });
  }
}
```

- [ ] **Step 2: DELETE (délier)**

Créer `src/app/api/trainer/questionnaires/[id]/sessions/[sessionId]/route.ts` :

```ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";
import { isTrainerAssignedToSession } from "@/lib/auth/trainer-session-access";

/** DELETE — délie le questionnaire de la session. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; sessionId: string } },
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const assigned = await isTrainerAssignedToSession(supabase, user.id, params.sessionId);
    if (!assigned) return NextResponse.json({ error: "Vous n'êtes pas assigné à cette session" }, { status: 403 });

    const { error } = await supabase
      .from("questionnaire_sessions")
      .delete()
      .eq("questionnaire_id", params.id)
      .eq("session_id", params.sessionId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/questionnaires/[id]/sessions/[sessionId] DELETE") }, { status: 500 });
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "questionnaires/\[id\]/sessions" || echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/trainer/questionnaires/[id]/sessions"
git commit -m "feat(api): attribution questionnaire formateur ↔ sessions"
```

---

## Task 6 : API résultats

**Files:**
- Create: `src/app/api/trainer/questionnaires/[id]/results/route.ts`

- [ ] **Step 1: Implémenter GET**

Créer `src/app/api/trainer/questionnaires/[id]/results/route.ts` :

```ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";
import { resolveTrainerSessionIds } from "@/lib/auth/trainer-session-access";

/**
 * GET /api/trainer/questionnaires/[id]/results
 *
 * Réponses au questionnaire pour les sessions du formateur (isolation par
 * `resolveTrainerSessionIds`). Retourne les questions + réponses brutes ; le
 * calcul d'agrégats est fait côté page (rating → moyenne, etc.).
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const sessionIds = await resolveTrainerSessionIds(supabase, user.id);
    if (sessionIds.length === 0) return NextResponse.json({ data: { questions: [], responses: [] } });

    const { data: questions } = await supabase
      .from("questions")
      .select("id, text, type, options, order_index")
      .eq("questionnaire_id", params.id)
      .order("order_index", { ascending: true });

    const { data: responses } = await supabase
      .from("questionnaire_responses")
      .select("id, session_id, responses, submitted_at")
      .eq("questionnaire_id", params.id)
      .in("session_id", sessionIds);

    return NextResponse.json({
      data: { questions: questions ?? [], responses: responses ?? [] },
    });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/questionnaires/[id]/results GET") }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "results/route" || echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/trainer/questionnaires/[id]/results/route.ts"
git commit -m "feat(api): résultats des questionnaires formateur"
```

---

## Task 7 : Composant `TrainerQuestionnaireBuilder`

**Files:**
- Create: `src/components/trainer/TrainerQuestionnaireBuilder.tsx`

- [ ] **Step 1: Implémenter le builder**

Créer `src/components/trainer/TrainerQuestionnaireBuilder.tsx` :

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, Loader2, GripVertical } from "lucide-react";

export type BuilderQuestionType = "rating" | "text" | "multiple_choice" | "yes_no";

export interface BuilderQuestion {
  text: string;
  type: BuilderQuestionType;
  options: string[];
  is_required: boolean;
}

export interface BuilderInitial {
  title: string;
  description: string;
  type: string;
  questions: BuilderQuestion[];
}

const QUESTION_TYPE_LABELS: Record<BuilderQuestionType, string> = {
  rating: "Note (1-5)",
  text: "Texte libre",
  multiple_choice: "Choix multiple",
  yes_no: "Oui / Non",
};

export function TrainerQuestionnaireBuilder({
  questionnaireId,
  initial,
}: {
  questionnaireId?: string;
  initial?: BuilderInitial;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [type, setType] = useState(initial?.type ?? "evaluation");
  const [questions, setQuestions] = useState<BuilderQuestion[]>(initial?.questions ?? []);
  const [saving, setSaving] = useState(false);

  const addQuestion = () =>
    setQuestions((p) => [...p, { text: "", type: "rating", options: [], is_required: true }]);
  const removeQuestion = (i: number) => setQuestions((p) => p.filter((_, idx) => idx !== i));
  const updateQuestion = (i: number, patch: Partial<BuilderQuestion>) =>
    setQuestions((p) => p.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "Titre requis", variant: "destructive" });
      return;
    }
    if (questions.some((q) => !q.text.trim())) {
      toast({ title: "Chaque question doit avoir un libellé", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const url = questionnaireId
        ? `/api/trainer/questionnaires/${questionnaireId}`
        : "/api/trainer/questionnaires";
      const res = await fetch(url, {
        method: questionnaireId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, type, questions }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      toast({ title: questionnaireId ? "Questionnaire mis à jour" : "Questionnaire créé" });
      router.push("/trainer/questionnaires");
      router.refresh();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Enregistrement impossible.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="space-y-3">
        <div>
          <Label htmlFor="q-title">Titre</Label>
          <Input id="q-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex : Évaluation des acquis" />
        </div>
        <div>
          <Label htmlFor="q-desc">Description (optionnel)</Label>
          <Textarea id="q-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <Label>Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="evaluation">Évaluation</SelectItem>
              <SelectItem value="satisfaction">Satisfaction</SelectItem>
              <SelectItem value="survey">Enquête</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Questions ({questions.length})</h3>
          <Button size="sm" variant="outline" onClick={addQuestion} className="gap-1.5">
            <Plus className="h-4 w-4" /> Ajouter
          </Button>
        </div>

        {questions.length === 0 && (
          <p className="text-sm text-muted-foreground italic">Aucune question. Cliquez « Ajouter ».</p>
        )}

        {questions.map((q, i) => (
          <div key={i} className="border rounded-lg p-3 space-y-2 bg-muted/30">
            <div className="flex items-start gap-2">
              <GripVertical className="h-4 w-4 text-muted-foreground mt-2.5 shrink-0" />
              <Input
                value={q.text}
                onChange={(e) => updateQuestion(i, { text: e.target.value })}
                placeholder={`Question ${i + 1}`}
                className="flex-1"
              />
              <Button size="sm" variant="ghost" className="text-red-600" onClick={() => removeQuestion(i)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-3 pl-6">
              <Select value={q.type} onValueChange={(v) => updateQuestion(i, { type: v as BuilderQuestionType })}>
                <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(QUESTION_TYPE_LABELS) as BuilderQuestionType[]).map((t) => (
                    <SelectItem key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={q.is_required}
                  onChange={(e) => updateQuestion(i, { is_required: e.target.checked })}
                />
                Obligatoire
              </label>
            </div>
            {q.type === "multiple_choice" && (
              <div className="pl-6">
                <Input
                  value={q.options.join(", ")}
                  onChange={(e) => updateQuestion(i, { options: e.target.value.split(",").map((o) => o.trim()) })}
                  placeholder="Options séparées par des virgules"
                  className="h-8 text-xs"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push("/trainer/questionnaires")} disabled={saving}>
          Annuler
        </Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {questionnaireId ? "Enregistrer" : "Créer"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "TrainerQuestionnaireBuilder" || echo "OK"`
Expected: `OK`. (Si `@/components/ui/select` ou `textarea`/`label` n'existent pas, vérifier le nom réel dans `src/components/ui/` — ils sont utilisés dans `CourseMaterialsTab.tsx` / `ResumeTrainers.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/trainer/TrainerQuestionnaireBuilder.tsx
git commit -m "feat(ui): TrainerQuestionnaireBuilder (création/édition questionnaire)"
```

---

## Task 8 : Pages création + édition

**Files:**
- Create: `src/app/(dashboard)/trainer/questionnaires/create/page.tsx`
- Create: `src/app/(dashboard)/trainer/questionnaires/[id]/edit/page.tsx`

- [ ] **Step 1: Page création**

Créer `src/app/(dashboard)/trainer/questionnaires/create/page.tsx` :

```tsx
"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TrainerQuestionnaireBuilder } from "@/components/trainer/TrainerQuestionnaireBuilder";

export default function CreateTrainerQuestionnairePage() {
  return (
    <div className="space-y-6">
      <Link href="/trainer/questionnaires" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour
      </Link>
      <h1 className="text-xl font-bold">Nouveau questionnaire</h1>
      <TrainerQuestionnaireBuilder />
    </div>
  );
}
```

- [ ] **Step 2: Page édition (charge le questionnaire + questions)**

Créer `src/app/(dashboard)/trainer/questionnaires/[id]/edit/page.tsx` :

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  TrainerQuestionnaireBuilder, type BuilderInitial, type BuilderQuestion, type BuilderQuestionType,
} from "@/components/trainer/TrainerQuestionnaireBuilder";

export default function EditTrainerQuestionnairePage() {
  const params = useParams();
  const id = params.id as string;
  const supabase = createClient();
  const [initial, setInitial] = useState<BuilderInitial | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: q } = await supabase
        .from("questionnaires")
        .select("title, description, type")
        .eq("id", id)
        .maybeSingle();
      const { data: questions } = await supabase
        .from("questions")
        .select("text, type, options, is_required, order_index")
        .eq("questionnaire_id", id)
        .order("order_index", { ascending: true });
      if (q) {
        setInitial({
          title: q.title ?? "",
          description: q.description ?? "",
          type: q.type ?? "evaluation",
          questions: ((questions as Array<{ text: string; type: string; options: string[] | null; is_required: boolean }> | null) ?? []).map((qq) => ({
            text: qq.text,
            type: (["rating", "text", "multiple_choice", "yes_no"].includes(qq.type) ? qq.type : "text") as BuilderQuestionType,
            options: qq.options ?? [],
            is_required: qq.is_required,
          } as BuilderQuestion)),
        });
      }
      setLoading(false);
    })();
  }, [id, supabase]);

  return (
    <div className="space-y-6">
      <Link href="/trainer/questionnaires" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour
      </Link>
      <h1 className="text-xl font-bold">Modifier le questionnaire</h1>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : initial ? (
        <TrainerQuestionnaireBuilder questionnaireId={id} initial={initial} />
      ) : (
        <p className="text-sm text-muted-foreground">Questionnaire introuvable.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "questionnaires/create|questionnaires/\[id\]/edit" || echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/trainer/questionnaires/create" "src/app/(dashboard)/trainer/questionnaires/[id]/edit"
git commit -m "feat(ui): pages création/édition questionnaire formateur"
```

---

## Task 9 : Page liste « Mes questionnaires »

**Files:**
- Create: `src/app/(dashboard)/trainer/questionnaires/page.tsx`

- [ ] **Step 1: Implémenter la liste**

Créer `src/app/(dashboard)/trainer/questionnaires/page.tsx` :

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Pencil, Trash2, Share2, BarChart3, Loader2, ClipboardList } from "lucide-react";
import { AssignQuestionnaireDialog } from "@/components/trainer/AssignQuestionnaireDialog";

interface TrainerQuestionnaire {
  id: string;
  title: string;
  description: string | null;
  type: string;
  is_active: boolean;
  quality_indicator_type: string | null;
  created_by_trainer_id: string | null;
  mine: boolean;
}

export default function TrainerQuestionnairesPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<TrainerQuestionnaire[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<TrainerQuestionnaire | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/trainer/questionnaires");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setItems(json.data ?? []);
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Chargement impossible.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce questionnaire ? Action irréversible.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/trainer/questionnaires/${id}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? "Erreur"); }
      setItems((p) => p.filter((q) => q.id !== id));
      toast({ title: "Questionnaire supprimé" });
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Suppression impossible.", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const mine = items.filter((q) => q.mine);
  const library = items.filter((q) => !q.mine);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const renderCard = (q: TrainerQuestionnaire) => (
    <Card key={q.id}>
      <CardContent className="pt-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm">{q.title}</p>
            {q.quality_indicator_type && <Badge variant="outline" className="text-[10px]">Qualiopi</Badge>}
            {!q.mine && !q.quality_indicator_type && <Badge variant="secondary" className="text-[10px]">Bibliothèque</Badge>}
          </div>
          {q.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{q.description}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setAssigning(q)}>
            <Share2 className="h-3.5 w-3.5" /> Attribuer
          </Button>
          <Link href={`/trainer/questionnaires/${q.id}/results`}>
            <Button size="sm" variant="ghost" className="h-8"><BarChart3 className="h-4 w-4" /></Button>
          </Link>
          {q.mine && (
            <>
              <Link href={`/trainer/questionnaires/${q.id}/edit`}>
                <Button size="sm" variant="ghost" className="h-8"><Pencil className="h-4 w-4" /></Button>
              </Link>
              <Button size="sm" variant="ghost" className="h-8 text-red-600" disabled={deletingId === q.id} onClick={() => handleDelete(q.id)}>
                {deletingId === q.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><ClipboardList className="h-5 w-5" /> Questionnaires</h1>
          <p className="text-sm text-muted-foreground">Créez vos questionnaires et attribuez-les à vos sessions.</p>
        </div>
        <Link href="/trainer/questionnaires/create">
          <Button className="gap-2"><Plus className="h-4 w-4" /> Nouveau</Button>
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mes questionnaires ({mine.length})</h2>
        {mine.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Aucun questionnaire créé.</p>
        ) : (
          <div className="grid gap-3">{mine.map(renderCard)}</div>
        )}
      </section>

      {library.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bibliothèque d'entité ({library.length})</h2>
          <div className="grid gap-3">{library.map(renderCard)}</div>
        </section>
      )}

      {assigning && (
        <AssignQuestionnaireDialog
          questionnaireId={assigning.id}
          open={!!assigning}
          onClose={() => setAssigning(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck** (échouera tant que Task 10 n'a pas créé le dialog — c'est attendu ; commit quand même après Task 10. Pour l'instant vérifier seulement la page liste isolément.)

Run: `npx tsc --noEmit 2>&1 | grep "questionnaires/page" | grep -v "AssignQuestionnaireDialog" || echo "OK (hors dépendance dialog)"`
Expected: `OK (hors dépendance dialog)`

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/trainer/questionnaires/page.tsx"
git commit -m "feat(ui): page liste des questionnaires formateur"
```

---

## Task 10 : Dialog d'attribution + typecheck liste

**Files:**
- Create: `src/components/trainer/AssignQuestionnaireDialog.tsx`

- [ ] **Step 1: Implémenter le dialog** (calque sur `ShareCourseDialog`, endpoints questionnaires)

Créer `src/components/trainer/AssignQuestionnaireDialog.tsx` :

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

export function AssignQuestionnaireDialog({
  questionnaireId,
  open,
  onClose,
}: {
  questionnaireId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/trainer/questionnaires/${questionnaireId}/sessions`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setRows(json.data ?? []);
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Chargement impossible.", variant: "destructive" });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [questionnaireId, toast]);

  useEffect(() => { if (open) fetchSessions(); }, [open, fetchSessions]);

  const toggle = async (row: SessionRow) => {
    setBusyId(row.id);
    const willLink = !row.linked;
    try {
      const res = willLink
        ? await fetch(`/api/trainer/questionnaires/${questionnaireId}/sessions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: row.id }),
          })
        : await fetch(`/api/trainer/questionnaires/${questionnaireId}/sessions/${row.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setRows((p) => p.map((r) => (r.id === row.id ? { ...r, linked: willLink } : r)));
      toast({ title: willLink ? "Attribué à la session" : "Attribution retirée" });
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Action impossible.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Attribuer à mes sessions</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Aucune session ne vous est assignée.</p>
        ) : (
          <div className="divide-y">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{row.training?.title || row.title || "Session"}</p>
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

- [ ] **Step 2: Typecheck (liste + dialog ensemble)**

Run: `npx tsc --noEmit 2>&1 | grep -E "AssignQuestionnaireDialog|questionnaires/page" || echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/components/trainer/AssignQuestionnaireDialog.tsx
git commit -m "feat(ui): AssignQuestionnaireDialog (attribution aux sessions)"
```

---

## Task 11 : Page résultats

**Files:**
- Create: `src/app/(dashboard)/trainer/questionnaires/[id]/results/page.tsx`

- [ ] **Step 1: Implémenter la page résultats**

Créer `src/app/(dashboard)/trainer/questionnaires/[id]/results/page.tsx` :

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Loader2, Users } from "lucide-react";

interface QResult {
  id: string;
  text: string;
  type: string;
  options: string[] | null;
  order_index: number;
}
interface RResponse {
  id: string;
  session_id: string;
  responses: Record<string, string | number>;
  submitted_at: string;
}

export default function TrainerQuestionnaireResultsPage() {
  const params = useParams();
  const id = params.id as string;
  const [questions, setQuestions] = useState<QResult[]>([]);
  const [responses, setResponses] = useState<RResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/trainer/questionnaires/${id}/results`);
        const json = await res.json();
        if (res.ok) {
          setQuestions(json.data.questions ?? []);
          setResponses(json.data.responses ?? []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  function summary(q: QResult): string {
    const vals = responses.map((r) => r.responses?.[q.id]).filter((v) => v !== undefined && v !== "");
    if (vals.length === 0) return "Aucune réponse";
    if (q.type === "rating") {
      const nums = vals.map((v) => Number(v)).filter((n) => !isNaN(n));
      if (nums.length === 0) return "—";
      const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
      return `Moyenne ${avg.toFixed(1)}/5 (${nums.length} réponses)`;
    }
    if (q.type === "yes_no") {
      const yes = vals.filter((v) => String(v).toLowerCase() === "oui" || v === "yes" || v === true).length;
      return `${yes} oui / ${vals.length - yes} non`;
    }
    return `${vals.length} réponse(s)`;
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <Link href="/trainer/questionnaires" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour
      </Link>
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold">Résultats</h1>
        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <Users className="h-4 w-4" /> {responses.length} répondant(s)
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : responses.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Aucune réponse pour le moment.</p>
      ) : (
        <div className="grid gap-3">
          {questions.map((q) => (
            <Card key={q.id}>
              <CardContent className="pt-5">
                <p className="font-medium text-sm">{q.text}</p>
                <p className="text-sm text-muted-foreground mt-1">{summary(q)}</p>
                {(q.type === "text") && (
                  <ul className="mt-2 space-y-1 list-disc pl-5">
                    {responses
                      .map((r) => r.responses?.[q.id])
                      .filter((v) => v !== undefined && v !== "")
                      .map((v, i) => <li key={i} className="text-xs text-muted-foreground">{String(v)}</li>)}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "results/page" || echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/trainer/questionnaires/[id]/results/page.tsx"
git commit -m "feat(ui): page résultats des questionnaires formateur"
```

---

## Task 12 : Nav sidebar + badge admin

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/app/(dashboard)/admin/questionnaires/page.tsx`

- [ ] **Step 1: Ajouter l'entrée nav formateur**

Dans `src/components/layout/Sidebar.tsx`, dans `trainerNavSections` (~ligne 187), repérer l'item « Évaluations » :
```ts
      { label: "Évaluations", href: "/trainer/evaluations", icon: Star },
```
Ajouter juste après (réutiliser une icône déjà importée ; `ClipboardList` est courant — si absente de l'import `lucide-react`, l'ajouter à la liste d'import) :
```ts
      { label: "Questionnaires", href: "/trainer/questionnaires", icon: ClipboardList },
```
Vérifier que `ClipboardList` est bien importé depuis `lucide-react` en haut du fichier ; sinon l'ajouter à l'import existant.

- [ ] **Step 2: Badge « Créé par formateur » côté admin**

Dans `src/app/(dashboard)/admin/questionnaires/page.tsx` : ajouter `created_by_trainer_id` au `.select(...)` de la requête qui liste les questionnaires (repérer le `from("questionnaires").select(`). Puis, dans le rendu d'une ligne/carte de questionnaire (à côté du titre), ajouter un badge conditionnel :
```tsx
{q.created_by_trainer_id && (
  <Badge variant="secondary" className="text-[10px]">Créé par formateur</Badge>
)}
```
(Le composant `Badge` est déjà importé dans cette page ; sinon `import { Badge } from "@/components/ui/badge";`.) Adapter `q` au nom de variable réel de l'itération. Vérifier que le type local du questionnaire inclut `created_by_trainer_id?: string | null`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "Sidebar|admin/questionnaires/page" || echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx "src/app/(dashboard)/admin/questionnaires/page.tsx"
git commit -m "feat(ui): nav Questionnaires formateur + badge admin"
```

---

## Task 13 : Vérification finale

- [ ] **Step 1: Suite complète**

Run: `npx vitest run --silent 2>&1 | tail -5`
Expected: tous verts (dont `trainer-questionnaire`).

- [ ] **Step 2: Typecheck global**

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v ".next/types" || echo "tsc clean"`
Expected: `tsc clean`

- [ ] **Step 3: Rappel migration**

> ⚠️ Jouer `supabase/migrations/add_trainer_authored_questionnaires.sql` dans Supabase (prod + dev) avant test réel. Sans la colonne, les routes échouent (toast).

- [ ] **Step 4: Test manuel bout-en-bout**

1. Formateur → `/trainer/questionnaires` → **Nouveau** → titre + 2 questions (rating + text) → Créer.
2. Le questionnaire apparaît dans « Mes questionnaires ».
3. **Attribuer** → toggle une session assignée → toast « Attribué ».
4. Apprenant inscrit à cette session → `/learner/questionnaires` → le questionnaire apparaît → le remplir.
5. Formateur → icône résultats → voit « 1 répondant » + moyenne/réponses.
6. Édition réservée au créateur ; un autre formateur voit le questionnaire en « Bibliothèque » (Attribuer possible, pas Éditer/Supprimer).

---

## Self-review (couverture spec)

- Migration `created_by_trainer_id` + RLS (5 policies) → Task 1 ✅
- Service ownership + résolution multi-fiches + tests → Task 2 ✅
- API liste/création → Task 3 ✅ · édition/suppression (créateur only) → Task 4 ✅
- API attribution via `questionnaire_sessions` → Task 5 ✅ · résultats → Task 6 ✅
- Builder dédié (4 types) → Task 7 ✅ · pages create/edit → Task 8 ✅
- Liste (mine + bibliothèque, badge Qualiopi) → Task 9 ✅ · dialog attribution → Task 10 ✅
- Résultats (agrégats inline) → Task 11 ✅
- Nav formateur + badge admin → Task 12 ✅
- Apprenant inchangé (réutilise `questionnaire_sessions`) → par conception ✅
- Vérif finale + rappel migration → Task 13 ✅
