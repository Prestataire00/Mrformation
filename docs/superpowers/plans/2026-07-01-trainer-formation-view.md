# Espace formateur — Lot A (Vue formation + Tâches à faire) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner au formateur une vue unifiée d'une formation attribuée avec une section « Tâches à faire » (statuts dérivés), + un indicateur d'avancement côté admin.

**Architecture:** Un helper `resolveTrainerTasksStatus` (cœur pur testé + wrapper I/O) calcule l'état des 3 tâches d'une session. Une page cliente `/trainer/formations/[id]` (gardée par assignation) l'affiche ; l'admin réutilise le même helper dans `TabResume`.

**Tech Stack:** Next.js 14 (client components), Supabase, shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-01-trainer-formation-view-design.md`

---

## Pré-requis vérifiés

- Helpers `src/lib/auth/trainer-session-access.ts` : `isTrainerAssignedToSession(supabase, profileId, sessionId): Promise<boolean>`, `resolveTrainerSessionIds(supabase, profileId): Promise<string[]>`.
- `/trainer/sessions/page.tsx` : client component, `createClient()` client-side, `resolveTrainerSessionIds(supabase, user.id)`, cards avec `<Link href="/trainer/sessions/${id}/...">`. `Link` de `next/link` importé.
- Données tâches : déroulé = `formation_time_slots` (colonnes `module_title/module_objectives/module_themes/module_exercises`) ; support = `trainer_course_sessions` (lie un `trainer_courses` publié à une session).
- Admin formation détail : `src/app/(dashboard)/admin/formations/[id]/_components/sections/` (TabResume et sous-sections).
- Barrières : `npx tsc --noEmit` + `npx vitest run`.

## File Structure

| Fichier | Action |
|---|---|
| `src/lib/services/trainer-tasks.ts` | Créer : `computeTrainerTasksStatus` (pur) + `resolveTrainerTasksStatus` (I/O). |
| `src/lib/services/__tests__/trainer-tasks.test.ts` | Créer : tests du cœur pur (TDD). |
| `src/app/(dashboard)/trainer/formations/[id]/page.tsx` | Créer : vue formation formateur + Tâches à faire. |
| `src/app/(dashboard)/trainer/sessions/page.tsx` | Modifier : rendre chaque card cliquable vers `/trainer/formations/[id]`. |
| `src/app/(dashboard)/admin/formations/[id]/_components/sections/TrainerTasksIndicator.tsx` | Créer : petit indicateur d'avancement. |
| `src/app/(dashboard)/admin/formations/[id]/_components/TabResume.tsx` | Modifier : monter l'indicateur. |

---

## Task 1 : Helper `resolveTrainerTasksStatus` (TDD sur le cœur pur)

**Files:**
- Create: `src/lib/services/trainer-tasks.ts`
- Test: `src/lib/services/__tests__/trainer-tasks.test.ts`

- [ ] **Step 1 : test (échoue)**

```ts
import { describe, it, expect } from "vitest";
import { computeTrainerTasksStatus } from "../trainer-tasks";

describe("computeTrainerTasksStatus", () => {
  it("déroulé = fait si un créneau a du contenu module", () => {
    const r = computeTrainerTasksStatus({
      slots: [{ module_title: null, module_objectives: null, module_themes: "Sécurité", module_exercises: null }],
      supportCount: 0,
      bilanRequested: false,
      bilanAnswered: false,
    });
    expect(r.deroule).toBe(true);
    expect(r.support).toBe(false);
    expect(r.bilan).toBeNull(); // aucun bilan demandé → null (pas "à faire")
  });
  it("déroulé = à faire si aucun contenu module", () => {
    const r = computeTrainerTasksStatus({
      slots: [{ module_title: "", module_objectives: null, module_themes: "  ", module_exercises: null }],
      supportCount: 2, bilanRequested: true, bilanAnswered: false,
    });
    expect(r.deroule).toBe(false);
    expect(r.support).toBe(true);
    expect(r.bilan).toBe(false); // bilan demandé mais non répondu
  });
  it("bilan = true si demandé et répondu", () => {
    const r = computeTrainerTasksStatus({ slots: [], supportCount: 0, bilanRequested: true, bilanAnswered: true });
    expect(r.bilan).toBe(true);
  });
});
```

- [ ] **Step 2 : run → FAIL** — Run: `npx vitest run src/lib/services/__tests__/trainer-tasks.test.ts` → FAIL.

- [ ] **Step 3 : implémenter**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface TrainerTasksStatus {
  deroule: boolean;
  bilan: boolean | null; // null = aucun bilan demandé (avant Lot C)
  support: boolean;
}

interface SlotModuleFields {
  module_title?: string | null;
  module_objectives?: string | null;
  module_themes?: string | null;
  module_exercises?: string | null;
}

interface ComputeInput {
  slots: SlotModuleFields[];
  supportCount: number;
  bilanRequested: boolean;
  bilanAnswered: boolean;
}

const hasText = (v: string | null | undefined) => typeof v === "string" && v.trim().length > 0;

/** Cœur pur : dérive le statut des 3 tâches depuis les données agrégées. */
export function computeTrainerTasksStatus(input: ComputeInput): TrainerTasksStatus {
  const deroule = input.slots.some(
    (s) => hasText(s.module_title) || hasText(s.module_objectives) || hasText(s.module_themes) || hasText(s.module_exercises),
  );
  return {
    deroule,
    support: input.supportCount > 0,
    bilan: input.bilanRequested ? input.bilanAnswered : null,
  };
}

/**
 * Résout le statut des tâches pour une session (formateur↔admin).
 * Lot A : `bilanRequested=false` (aucun bilan formateur avant le Lot C).
 */
export async function resolveTrainerTasksStatus(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<TrainerTasksStatus> {
  const { data: slots } = await supabase
    .from("formation_time_slots")
    .select("module_title, module_objectives, module_themes, module_exercises")
    .eq("session_id", sessionId);

  const { count: supportCount } = await supabase
    .from("trainer_course_sessions")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);

  return computeTrainerTasksStatus({
    slots: (slots ?? []) as SlotModuleFields[],
    supportCount: supportCount ?? 0,
    bilanRequested: false,
    bilanAnswered: false,
  });
}
```

> Vérifie le nom réel de la colonne FK dans `trainer_course_sessions` (`session_id` attendu) et l'export `SupabaseClient` (`@supabase/supabase-js`, déjà utilisé dans `src/lib/services/*`).

- [ ] **Step 4 : run → PASS** — Run: `npx vitest run src/lib/services/__tests__/trainer-tasks.test.ts` → PASS.
- [ ] **Step 5 : commit** — `git add src/lib/services/trainer-tasks.ts src/lib/services/__tests__/trainer-tasks.test.ts && git commit -m "feat(formateur): helper resolveTrainerTasksStatus (statut des 3 tâches)"`

---

## Task 2 : Page `/trainer/formations/[id]`

**Files:**
- Create: `src/app/(dashboard)/trainer/formations/[id]/page.tsx`

- [ ] **Step 1 : page cliente** — structure (clone le style/patterns de `/trainer/sessions/page.tsx`) :
  - `"use client"`, `useParams()` pour `id`, `createClient()`, `useEffect` de chargement.
  - **Garde d'accès** : `const ids = await resolveTrainerSessionIds(supabase, user.id); if (!ids.includes(id)) → afficher un état « Accès non autorisé » (pas de fetch des données).`
  - **Fetch session** : `supabase.from("sessions").select("id, title, start_date, end_date, location, mode, program:programs(title), formation_time_slots(*), enrollments(count)").eq("id", id).single()` (adapte les relations aux noms réels ; sinon fetch séparés). Récupère aussi le nb d'apprenants.
  - **Statut tâches** : `const status = await resolveTrainerTasksStatus(supabase, id);`.
  - **Rendu** :
    - En-tête : titre, dates (`formatDate`), lieu/mode, programme, nb apprenants.
    - **Section « Tâches à faire »** (Card en tête) : 3 lignes, chacune avec une icône statut (`CheckCircle` vert si fait / `Circle` gris si à faire / `—` si bilan null) + libellé + un bouton/lien d'entrée :
      1. « Renseigner le déroulé pédagogique réalisé » → `Link` vers `/trainer/planning` (édition réelle = Lot B ; en Lot A c'est l'entrée).
      2. « Remplir le bilan de fin de formation » → si `status.bilan === null` : texte « Aucun bilan demandé pour l'instant » (désactivé) ; sinon bouton (câblage réel = Lot C).
      3. « Ajouter un support pédagogique » → `Link` vers `/trainer/courses`.
    - Zone lecture : liste des créneaux (planning, lecture seule) + liste des apprenants (noms, lecture). PAS de finances/conventions.
  - États : loading (spinner), empty/error. try/catch + toast. Pas de type `any`.

- [ ] **Step 2 : tsc + vitest** → PASS. **Step 3 : commit** — `feat(formateur): page /trainer/formations/[id] (vue + Tâches à faire)`

---

## Task 3 : Rendre les formations cliquables depuis `/trainer/sessions`

**Files:**
- Modify: `src/app/(dashboard)/trainer/sessions/page.tsx`

- [ ] **Step 1 : ajouter le lien** — dans le `filtered.map((session) => ...)` qui rend chaque card, rendre le titre/card cliquable vers la vue détail. Ajoute un `Link` (bouton « Gérer la formation ») :

```tsx
                  <Link
                    href={`/trainer/formations/${session.id}`}
                    className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                  >
                    Gérer la formation
                  </Link>
```

à placer à côté des liens existants (`/sign`, `/emargement-live`). Ne casse pas les liens existants.

- [ ] **Step 2 : tsc** → PASS. **Step 3 : commit** — `feat(formateur): accès à la vue formation depuis Mes sessions`

---

## Task 4 : Indicateur d'avancement côté admin

**Files:**
- Create: `src/app/(dashboard)/admin/formations/[id]/_components/sections/TrainerTasksIndicator.tsx`
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabResume.tsx`

- [ ] **Step 1 : composant indicateur** — client component, props `{ sessionId: string }` :
  - `useEffect` → `resolveTrainerTasksStatus(supabase, sessionId)` → `status`.
  - Rendu compact : « Tâches formateur : Déroulé [✓/—] · Bilan [✓/—/—] · Support [✓/—] » avec des `Badge` colorés (vert = fait, gris = à faire, neutre = null/non demandé).
  - Pas de type `any`.

- [ ] **Step 2 : monter dans `TabResume`** — importer et rendre `<TrainerTasksIndicator sessionId={formation.id} />` dans une carte de la vue Résumé (près des infos formateur). Repère le nom réel de la prop session dans `TabResume` (probablement `formation`/`session`) et utilise son `.id`.

- [ ] **Step 3 : tsc + vitest** → PASS. **Step 4 : commit** — `feat(formateur): indicateur admin d'avancement des tâches formateur`

---

## Task 5 : Vérification globale

- [ ] **Step 1 : tsc** — `npx tsc --noEmit` → PASS.
- [ ] **Step 2 : vitest** — `npx vitest run` → PASS (dont `trainer-tasks.test.ts`).
- [ ] **Step 3 : test manuel** (`npm run dev`) :
  - [ ] Se logger en formateur (compte de test formateur), ouvrir `/trainer/sessions` → « Gérer la formation » → `/trainer/formations/[id]` : en-tête + créneaux + apprenants en lecture, section « Tâches à faire » avec statuts corrects (support = fait s'il en a partagé un ; déroulé = fait si créneaux renseignés ; bilan = « aucun bilan demandé »).
  - [ ] Un formateur NON assigné à une session `/trainer/formations/<autre>` → « Accès non autorisé ».
  - [ ] Côté admin, la fiche formation (Résumé) montre l'indicateur d'avancement des tâches formateur, cohérent.
- [ ] **Step 4 : pas de commit** (validation).

---

## Self-Review (effectué)

- **Couverture spec :** helper dérivé + testé (T1) ; page formateur gardée + en-tête + lecture + Tâches à faire (T2) ; accès depuis Mes sessions (T3) ; indicateur admin réutilisant le même helper (T4) ; critères → T5. Pas de migration (conforme). ✅
- **Placeholders :** code complet pour le helper (T1) ; pages/indicateur spécifiés par structure/état/handlers/JSX-clés + patterns de clone (`/trainer/sessions`, TabResume). Consignes de vérification (colonne `trainer_course_sessions.session_id`, relations `sessions` select, prop de TabResume) explicites.
- **Cohérence des types :** `TrainerTasksStatus { deroule, bilan, support }` (T1) consommé par la page (T2) et l'indicateur (T4) ; `bilan: null` géré partout (avant Lot C). `resolveTrainerTasksStatus(supabase, sessionId)` réutilisé côté formateur ET admin.
