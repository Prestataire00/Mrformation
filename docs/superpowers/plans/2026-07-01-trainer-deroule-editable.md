# Espace formateur — Lot B (Déroulé éditable + visibilité apprenant) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le formateur édite le déroulé pédagogique par créneau (remonté chez l'admin) ; l'apprenant voit le déroulé réalisé de ses créneaux passés.

**Architecture:** Une route `PATCH /api/trainer/time-slots/[id]` gardée par assignation (serveur) qui n'écrit que les 4 champs `module_*`. Un éditeur formateur (dialog) dans `/trainer/formations/[id]`. Une section lecture « Déroulé » dans l'espace apprenant, limitée aux créneaux passés. Cœurs purs testés (whitelist + filtre passé).

**Tech Stack:** Next.js 14, Supabase, RHF+Zod, shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-01-trainer-deroule-editable-design.md`

---

## Pré-requis vérifiés

- Route trainer pattern : `createClient()` serveur → `supabase.auth.getUser()` → `isTrainerAssignedToSession(supabase, user.id, sessionId): Promise<boolean>`. Réf `src/app/api/trainer/questionnaires/route.ts`.
- Déroulé = `formation_time_slots.module_title/module_objectives/module_themes/module_exercises`. Params `[id]` synchrones `{ params: { id: string } }`.
- Lot A : `/trainer/formations/[id]/page.tsx` (fetch créneaux + tâche déroulé), helper `resolveTrainerTasksStatus`.
- Espace apprenant : `learner/my-trainings/page.tsx`, `learner/sessions/page.tsx` (isolation par enrollments déjà en place).
- Barrières : `npx tsc --noEmit` + `npx vitest run`. **Pas de migration.**

## File Structure

| Fichier | Action |
|---|---|
| `src/lib/services/deroule.ts` | Créer : `pickDerouleFields` (whitelist, pur) + `filterPastSlotsWithContent` (pur). |
| `src/lib/services/__tests__/deroule.test.ts` | Créer : tests des 2 cœurs purs (TDD). |
| `src/app/api/trainer/time-slots/[id]/route.ts` | Créer : PATCH (assignation + whitelist). |
| `src/app/(dashboard)/trainer/formations/[id]/_components/DerouleEditDialog.tsx` | Créer : dialog d'édition du déroulé d'un créneau. |
| `src/app/(dashboard)/trainer/formations/[id]/page.tsx` | Modifier : ouvrir le dialog par créneau + depuis la tâche déroulé. |
| `src/app/(dashboard)/learner/sessions/page.tsx` | Modifier : section « Déroulé de la formation » (créneaux passés). |

---

## Task 1 : Cœurs purs (whitelist + filtre passé) — TDD

**Files:**
- Create: `src/lib/services/deroule.ts`
- Test: `src/lib/services/__tests__/deroule.test.ts`

- [ ] **Step 1 : test (échoue)**

```ts
import { describe, it, expect } from "vitest";
import { pickDerouleFields, filterPastSlotsWithContent } from "../deroule";

describe("pickDerouleFields", () => {
  it("ne garde que les 4 champs module_* (rejette horaires/couleur)", () => {
    const out = pickDerouleFields({
      module_title: "M1", module_objectives: "Obj", module_themes: "Th", module_exercises: "Ex",
      start_time: "x", end_time: "y", color: "#fff", title: "hack", slot_order: 3, foo: "bar",
    });
    expect(out).toEqual({ module_title: "M1", module_objectives: "Obj", module_themes: "Th", module_exercises: "Ex" });
  });
  it("normalise les absents à null", () => {
    expect(pickDerouleFields({ module_title: "M1" })).toEqual({
      module_title: "M1", module_objectives: null, module_themes: null, module_exercises: null,
    });
  });
});

describe("filterPastSlotsWithContent", () => {
  const now = new Date("2026-07-20T12:00:00Z");
  it("garde les créneaux passés AVEC contenu, exclut futurs et vides", () => {
    const slots = [
      { id: "a", end_time: "2026-07-20T10:00:00Z", module_themes: "fait" },      // passé + contenu ✓
      { id: "b", end_time: "2026-07-20T18:00:00Z", module_themes: "futur" },      // futur ✗
      { id: "c", end_time: "2026-07-19T10:00:00Z", module_themes: "  " },          // passé mais vide ✗
    ];
    const out = filterPastSlotsWithContent(slots, now);
    expect(out.map((s) => s.id)).toEqual(["a"]);
  });
});
```

- [ ] **Step 2 : run → FAIL** — Run: `npx vitest run src/lib/services/__tests__/deroule.test.ts` → FAIL.

- [ ] **Step 3 : implémenter**

```ts
export interface DerouleFields {
  module_title: string | null;
  module_objectives: string | null;
  module_themes: string | null;
  module_exercises: string | null;
}

const asNull = (v: unknown): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v : (typeof v === "string" ? v : null);

/** Whitelist stricte : seuls les 4 champs de déroulé pédagogique sont conservés. */
export function pickDerouleFields(body: Record<string, unknown>): DerouleFields {
  return {
    module_title: (body.module_title as string) ?? null,
    module_objectives: (body.module_objectives as string) ?? null,
    module_themes: (body.module_themes as string) ?? null,
    module_exercises: (body.module_exercises as string) ?? null,
  };
}

const hasText = (v: string | null | undefined) => typeof v === "string" && v.trim().length > 0;

/** Créneaux PASSÉS (end_time < now) ET ayant du contenu module (anti-brouillon apprenant). */
export function filterPastSlotsWithContent<
  T extends { end_time: string; module_title?: string | null; module_objectives?: string | null; module_themes?: string | null; module_exercises?: string | null },
>(slots: T[], now: Date): T[] {
  return slots.filter(
    (s) =>
      new Date(s.end_time).getTime() < now.getTime() &&
      (hasText(s.module_title) || hasText(s.module_objectives) || hasText(s.module_themes) || hasText(s.module_exercises)),
  );
}
```

> Note : `asNull` n'est pas utilisé ici (le whitelist garde les valeurs telles quelles, y compris vides, pour permettre d'effacer un champ) — le retire si inutile pour éviter un warning. Le test « normalise les absents à null » passe car `?? null` gère l'absence.

- [ ] **Step 4 : run → PASS** — Run: `npx vitest run src/lib/services/__tests__/deroule.test.ts` → PASS.
- [ ] **Step 5 : commit** — `git add src/lib/services/deroule.ts src/lib/services/__tests__/deroule.test.ts && git commit -m "feat(formateur): cœurs purs déroulé (whitelist champs + filtre créneaux passés)"`

---

## Task 2 : API `PATCH /api/trainer/time-slots/[id]`

**Files:**
- Create: `src/app/api/trainer/time-slots/[id]/route.ts`

- [ ] **Step 1 : implémenter**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTrainerAssignedToSession } from "@/lib/auth/trainer-session-access";
import { pickDerouleFields } from "@/lib/services/deroule";

type Ctx = { params: { id: string } };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    // Rôle
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    const role = profile?.role;
    if (!role || !["super_admin", "admin", "trainer"].includes(role)) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    // Le créneau + sa session
    const { data: slot } = await supabase
      .from("formation_time_slots").select("id, session_id").eq("id", params.id).maybeSingle();
    if (!slot) return NextResponse.json({ error: "Créneau introuvable" }, { status: 404 });

    // Garde d'assignation (serveur) — pour trainer ; admins passent.
    if (role === "trainer") {
      const assigned = await isTrainerAssignedToSession(supabase, user.id, slot.session_id);
      if (!assigned) return NextResponse.json({ error: "Vous n'êtes pas assigné à cette formation." }, { status: 403 });
    }

    // Whitelist stricte : seuls les 4 champs de déroulé.
    const fields = pickDerouleFields(await request.json());

    const { data, error } = await supabase
      .from("formation_time_slots")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", params.id)
      .select("id, module_title, module_objectives, module_themes, module_exercises")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ slot: data });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
```

> Vérifie le chemin réel du client serveur (`@/lib/supabase/server` — confirme via un autre route handler du repo) et la forme des params `[id]` (synchrone confirmé).

- [ ] **Step 2 : tsc** → PASS. **Step 3 : commit** — `feat(formateur): API PATCH déroulé d'un créneau (assignation + whitelist)`

---

## Task 3 : Éditeur formateur (dialog par créneau)

**Files:**
- Create: `src/app/(dashboard)/trainer/formations/[id]/_components/DerouleEditDialog.tsx`
- Modify: `src/app/(dashboard)/trainer/formations/[id]/page.tsx`

- [ ] **Step 1 : `DerouleEditDialog`** — client component, props `{ slot: { id; title?; start_time; end_time; module_title; module_objectives; module_themes; module_exercises }; open; onOpenChange; onSaved }` :
  - RHF + Zod (schéma : 4 champs texte optionnels, `.max()` raisonnable).
  - `Dialog` shadcn : titre = « Déroulé — {libellé créneau + horaires} », 4 `Textarea` (Titre du module, Objectifs, Thèmes, Exercices).
  - **Enregistrer** → `PATCH /api/trainer/time-slots/${slot.id}` avec les 4 champs → toast + `onSaved()` (refetch parent). try/catch, loading. Pas de `any`.

- [ ] **Step 2 : brancher dans la page** — dans `/trainer/formations/[id]/page.tsx` :
  - state `editingSlot: Slot | null`.
  - Chaque créneau de la zone lecture reçoit un bouton **« Renseigner le déroulé »** → `setEditingSlot(slot)`.
  - Le bouton de la **tâche 1** (« Renseigner le déroulé pédagogique réalisé ») ouvre le dialog sur le **premier créneau sans contenu** (ou le premier créneau) au lieu de renvoyer vers `/trainer/planning`.
  - Monter `<DerouleEditDialog slot={editingSlot} open={editingSlot!==null} onOpenChange={(o)=>!o && setEditingSlot(null)} onSaved={refetch} />`.
  - `onSaved` refait le fetch des créneaux + le statut des tâches (helper Lot A) → la tâche passe « fait ».

- [ ] **Step 3 : tsc + vitest** → PASS. **Step 4 : commit** — `feat(formateur): éditeur du déroulé par créneau dans la vue formation`

---

## Task 4 : Espace apprenant — section « Déroulé de la formation »

**Files:**
- Modify: `src/app/(dashboard)/learner/sessions/page.tsx`

- [ ] **Step 1 : ajouter la section** — dans la vue apprenant qui liste ses sessions, pour chaque session, charger ses `formation_time_slots` (id, start_time, end_time, module_*) puis appliquer `filterPastSlotsWithContent(slots, new Date())` (import de `@/lib/services/deroule`). Rendre une section repliable **« Déroulé de la formation »** :
  - par créneau passé avec contenu : date + horaires (Paris) + `module_title` (gras) + thèmes/objectifs/exercices (lecture).
  - si aucun créneau passé avec contenu : ne pas afficher la section (ou « Le déroulé sera disponible au fur et à mesure »).
  - Isolation : ne charger que les sessions de l'apprenant (déjà le cas dans cette page — réutilise sa résolution existante des sessions).

- [ ] **Step 2 : tsc + vitest** → PASS. **Step 3 : commit** — `feat(apprenant): déroulé réalisé visible pour les créneaux passés`

---

## Task 5 : Vérification globale

- [ ] **Step 1 : tsc** — `npx tsc --noEmit` → PASS.
- [ ] **Step 2 : vitest** — `npx vitest run` → PASS (dont `deroule.test.ts`).
- [ ] **Step 3 : test manuel** :
  - [ ] Formateur assigné : `/trainer/formations/[id]` → « Renseigner le déroulé » d'un créneau → saisir → save → visible côté admin (onglet Planning) + tâche « fait ».
  - [ ] Formateur NON assigné → `PATCH` refusé (403). Un champ hors déroulé (ex. `start_time`) envoyé → ignoré (non modifié).
  - [ ] Apprenant : voit le déroulé de ses créneaux **passés** avec contenu ; PAS les futurs.
- [ ] **Step 4 : pas de commit** (validation).

---

## Self-Review (effectué)

- **Couverture spec :** whitelist + assignation serveur (T1+T2) ; éditeur formateur par créneau + tâche qui l'ouvre (T3) ; visibilité apprenant créneaux passés (T1 filtre + T4) ; remontée admin automatique (même table, rien à faire) ; pas de migration. ✅
- **Placeholders :** cœurs purs + route entièrement écrits ; UI (dialog, page, apprenant) spécifiées par props/état/handlers + clones. Consignes de vérif (chemin `@/lib/supabase/server`, params `[id]`) explicites.
- **Cohérence des types :** `DerouleFields` (T1) écrit par la route (T2) et l'éditeur (T3) ; `filterPastSlotsWithContent` (T1) consommé par l'apprenant (T4) ; `pickDerouleFields` retourne exactement les 4 clés attendues par l'update.
