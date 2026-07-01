# Espace formateur — Lot C (Bilan formateur) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** L'admin désigne un « bilan formateur » ; le formateur le remplit ; l'admin voit sa réponse — en connectant des briques existantes.

**Architecture:** (1) un item `target:'trainer'` dans `TabQuestionnaires` crée une attribution `formation_satisfaction_assignments` ; (2) `resolveTrainerTasksStatus` dérive le statut du bilan (attribution + réponse `trainer_id`) et expose le `questionnaire_id` ; (3) la tâche bilan de `/trainer/formations/[id]` renvoie vers la page de remplissage existante ; (4) l'admin voit la réponse + libellé du dialog corrigé. **Pas de migration.**

**Tech Stack:** Next.js 14, Supabase, shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-01-trainer-bilan-questionnaire-design.md`

---

## Pré-requis vérifiés

- Existant réutilisé : `questionnaire_responses.trainer_id` (+RLS), page `/trainer/questionnaires/[id]/fill` (remplissage formateur → INSERT `trainer_id`), `/trainer/evaluations` (query `formation_satisfaction_assignments WHERE target_type='trainer'`), CHECK `satisfaction_type IN (...'quest_formateurs'...)` + `target_type IN (...'trainer'...)`.
- `resolveTrainerTasksStatus(supabase, sessionId)` (Lot A) : `bilanRequested=false` en dur → à brancher. `TrainerTasksStatus = { deroule, bilan, support }`.
- `TabQuestionnaires.tsx` : `ItemType.target: "learner" | "company"` (l.31) ; `STAGES` (l.34) ; `handleAssign` (l.377-390) fait `ins.satisfaction_type = item.type; ins.target_type = item.target || "learner"` → un item `target:'trainer'` crée directement la bonne attribution.
- `/trainer/formations/[id]/page.tsx` (Lot A) : tâche bilan avec bouton `disabled` quand `status.bilan === null`.
- Barrières : `npx tsc --noEmit` + `npx vitest run`. **Pas de migration.**

## File Structure

| Fichier | Action |
|---|---|
| `src/lib/services/trainer-tasks.ts` | Modifier : `resolveTrainerTasksStatus` branche le bilan + `TrainerTasksStatus.bilanQuestionnaireId`. |
| `src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx` | Modifier : `target` accepte `"trainer"` + item « Bilan formateur ». |
| `src/app/(dashboard)/trainer/formations/[id]/page.tsx` | Modifier : tâche bilan active → lien fill. |
| `src/components/questionnaires/LearnerResponsesDialog.tsx` | Modifier : libellé « formateur » si `trainer_id`. |

---

## Task 1 : Helper — brancher le statut du bilan

**Files:**
- Modify: `src/lib/services/trainer-tasks.ts`

- [ ] **Step 1 : étendre le type + brancher les queries**

Ajoute `bilanQuestionnaireId` à l'interface :

```ts
export interface TrainerTasksStatus {
  deroule: boolean;
  bilan: boolean | null;
  support: boolean;
  bilanQuestionnaireId: string | null;
}
```

Remplace le corps de `resolveTrainerTasksStatus` par :

```ts
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

  // Bilan formateur : attribution target_type='trainer' sur la session.
  const { data: bilanAssign } = await supabase
    .from("formation_satisfaction_assignments")
    .select("questionnaire_id")
    .eq("session_id", sessionId)
    .eq("target_type", "trainer")
    .limit(1)
    .maybeSingle();
  const bilanQuestionnaireId = (bilanAssign?.questionnaire_id as string | undefined) ?? null;

  let bilanAnswered = false;
  if (bilanQuestionnaireId) {
    const { count } = await supabase
      .from("questionnaire_responses")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("questionnaire_id", bilanQuestionnaireId)
      .not("trainer_id", "is", null);
    bilanAnswered = (count ?? 0) > 0;
  }

  const base = computeTrainerTasksStatus({
    slots: (slots ?? []) as SlotModuleFields[],
    supportCount: supportCount ?? 0,
    bilanRequested: bilanQuestionnaireId !== null,
    bilanAnswered,
  });
  return { ...base, bilanQuestionnaireId };
}
```

> Le cœur pur `computeTrainerTasksStatus` (déjà testé, Lot A) gère `bilanRequested/bilanAnswered`. Vérifie que `TrainerTasksIndicator` (admin) et la page formateur compilent avec le champ ajouté (champ additif, non-breaking).

- [ ] **Step 2 : tsc + vitest** — Run: `npx tsc --noEmit` → PASS ; `npx vitest run src/lib/services/__tests__/trainer-tasks.test.ts` → PASS (le cœur pur inchangé). 
- [ ] **Step 3 : commit** — `feat(formateur): resolveTrainerTasksStatus branche le bilan formateur (+questionnaire_id)`

---

## Task 2 : Admin — item « Bilan formateur »

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx`

- [ ] **Step 1 : élargir le type target** — l.31, passe `target` à `"learner" | "company" | "trainer"` :

```ts
interface ItemType { category: "evaluation" | "satisfaction"; type: string; label: string; icon: string; description: string; target: "learner" | "company" | "trainer"; }
```

- [ ] **Step 2 : ajouter l'item bilan formateur** — dans le STAGE de fin de formation (celui contenant `satisfaction_chaud`/`eval_postformation`, vers l.48-50), ajoute :

```ts
      { category: "satisfaction", type: "quest_formateurs", label: "Bilan formateur", icon: "🧑‍🏫", description: "Le formateur remplit un bilan de fin de formation", target: "trainer" },
```

- [ ] **Step 3 : vérifier le filtrage & l'attribution** — le filtre des attributions par item (l.138 `satisAssignments.filter(a => a.satisfaction_type === item.type)`) et `handleAssign` (l.385 `ins.satisfaction_type = item.type; ins.target_type = item.target || "learner"`) fonctionnent tels quels pour `type:'quest_formateurs'`/`target:'trainer'`. Si un `switch`/affichage suppose `target` ∈ {learner, company} et casse à la compilation, ajoute le cas `trainer` (libellé « Formateur »). NE change pas la logique existante des autres items.

- [ ] **Step 4 : tsc + vitest** → PASS. **Step 5 : commit** — `feat(admin): item « Bilan formateur » (attribution d'un questionnaire au formateur)`

---

## Task 3 : Formateur — tâche bilan active

**Files:**
- Modify: `src/app/(dashboard)/trainer/formations/[id]/page.tsx`

- [ ] **Step 1 : activer la tâche** — là où la tâche « Remplir le bilan de fin de formation » est rendue (bouton `disabled` quand `status.bilan === null`) :
  - Si `status.bilan === null` : garder « Aucun bilan demandé pour l'instant » (désactivé).
  - Sinon : bouton **actif** « Accéder » → navigue vers `/trainer/questionnaires/${status.bilanQuestionnaireId}/fill?session_id=${id}` (via `Link`/`router.push`). Icône de statut : `CheckCircle` vert si `status.bilan === true`, sinon `Clock`/`Circle` gris (à faire).
  - Utilise `status.bilanQuestionnaireId` (ajouté en Task 1) — garde-fou : n'active le lien que si non-null.

- [ ] **Step 2 : tsc** → PASS. **Step 3 : commit** — `feat(formateur): tâche bilan active → page de remplissage`

---

## Task 4 : Admin — voir la réponse formateur + libellé dialog

**Files:**
- Modify: `src/components/questionnaires/LearnerResponsesDialog.tsx`
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx`

- [ ] **Step 1 : libellé dialog (formateur vs apprenant)** — dans `LearnerResponsesDialog`, quand la réponse chargée a un `trainer_id` non-null (fetch le `trainer_id` + join `trainers(first_name,last_name)` en plus du `learner`), afficher le titre « Réponses du formateur {prénom nom} » au lieu de « Réponses de {apprenant} ». Sinon comportement inchangé. Vérifie la query actuelle du dialog et ajoute `trainer_id, trainer:trainers(first_name, last_name)` au select ; choisis le nom selon lequel des deux est renseigné.

- [ ] **Step 2 : afficher l'état du bilan côté admin** — dans l'`ItemDetail` de `TabQuestionnaires`, pour l'item `target:'trainer'` (bilan formateur) : après attribution, afficher un état **« Bilan : répondu / en attente »** en interrogeant `questionnaire_responses` de ce questionnaire+session avec `trainer_id` non-null, + un bouton « Voir les réponses » ouvrant `LearnerResponsesDialog` sur la réponse trouvée. (Réutilise le state/fetch déjà présent dans le composant ; ne construis PAS un grid apprenant pour cet item.)

- [ ] **Step 3 : tsc + vitest** → PASS. **Step 4 : commit** — `feat(admin): réponse du bilan formateur visible (état + dialog libellé formateur)`

---

## Task 5 : Vérification globale

- [ ] **Step 1 : tsc** — `npx tsc --noEmit` → PASS.
- [ ] **Step 2 : vitest** — `npx vitest run` → PASS.
- [ ] **Step 3 : test manuel** :
  - [ ] Admin : onglet Questionnaires → étape fin de formation → item « Bilan formateur » → attribuer un questionnaire → attribution créée.
  - [ ] Formateur : `/trainer/formations/[id]` → tâche « bilan » **active** → remplir (page fill existante) → réponse enregistrée (`trainer_id`) → tâche « fait ».
  - [ ] Admin : voit « Bilan : répondu » + « Voir les réponses » → dialog « Réponses du formateur {nom} ».
  - [ ] Session SANS attribution bilan → tâche « aucun bilan demandé ».
- [ ] **Step 4 : pas de commit** (validation).

---

## Self-Review (effectué)

- **Couverture spec :** admin désigne (T2) ; statut branché + questionnaire_id (T1) ; tâche formateur active → fill existant (T3) ; admin voit la réponse + libellé (T4) ; sans attribution → « aucun bilan demandé » (T1 `bilanRequested=false`). Pas de migration. ✅
- **Placeholders :** T1 code complet ; T2/T3/T4 spécifiées par edits précis + points de vérification (switch sur `target`, query du dialog). Consigne : réutiliser `handleAssign`/l'attribution existante, ne pas dupliquer.
- **Cohérence des types :** `TrainerTasksStatus.bilanQuestionnaireId` (T1) consommé par la page formateur (T3) ; `target:'trainer'` (T2) cohérent avec `handleAssign` (satisfaction_type/target_type) et la query du helper (T1, `target_type='trainer'`).
