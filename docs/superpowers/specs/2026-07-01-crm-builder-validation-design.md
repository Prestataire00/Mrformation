# CRM — Garde des builders (segments & séquences) — Design

**Date :** 2026-07-01
**Statut :** Approuvé (design), en attente implémentation
**Origine :** Audit UX CRM — les builders acceptent du vide : critères de segment sans valeur (campagnes) et étapes de séquence sans contenu → données inutiles/cassées. Chantier C, volet 2.

## Objectif
Bloquer/avertir **avant enregistrement** quand un critère de segment est vide ou une étape de séquence est sans contenu.

## Cœurs purs (testables) — `src/lib/crm/builder-validation.ts`

### `isCriterionEmpty(c: SegmentCriterion): boolean`
Un critère est **vide** selon son `type` (union discriminée `@/lib/types`) :
- `SelectCriterion` (`prospect_status`/`prospect_source`/`client_status`) : `values.length === 0`.
- `TextCriterion` (`client_sector`/`client_city`) : `!value?.trim()`.
- `RangeCriterion` (`prospect_score`) : `min == null && max == null`.
- `DateRangeCriterion` (`prospect_created_at`/`client_created_at`) : `!dateFrom && !dateTo`.
- `TagsCriterion` (`tags`) : `tagIds.length === 0`.
- `TrainingCriterion` (`prospect_training`/`training_participation`) : `trainingIds.length === 0`.

### `findEmptyCriteria(criteria: SegmentCriterion[]): SegmentCriterion[]`
Renvoie les critères vides (via `isCriterionEmpty`).

### `validateSequenceSteps(steps): { ok: true } | { ok: false; index: number; message: string }`
Pour chaque étape (`action_type`) :
- `"email"` : requiert `email_subject?.trim()` OU `email_body?.trim()` non vide → sinon invalide (« Étape N : l'email doit avoir un objet ou un corps »).
- `"task"` : requiert `task_title?.trim()` → sinon invalide (« Étape N : la tâche doit avoir un intitulé »).
- `"wait"` : toujours valide (délai seul).
Renvoie la 1ʳᵉ étape invalide (index 1-based dans le message).

## Câblage

### Campagnes (`campaigns/page.tsx`, `handleCreate`/`handleUpdate`)
Quand `target_type === "segment"` : si `findEmptyCriteria(formData.segment_criteria.criteria).length > 0` → **toast d'erreur** (« Un ou plusieurs critères de segment sont sans valeur — complétez-les ou supprimez-les. ») et **abort** (avant l'INSERT/UPDATE). `validateForm()` existant conservé.

### Séquences (`sequences/page.tsx`, `handleSave`)
Avant l'INSERT des steps : `const v = validateSequenceSteps(steps); if (!v.ok) { toast(v.message); return; }` (abort).

## Hors périmètre
- Volet 1 (Zod sur formulaires prospect/devis) — chantier suivant. Pas de migration. Pas de refonte des builders (juste la garde au save).

## Règles projet
- Pas de type `any` (types depuis `@/lib/types`). Cœurs purs testés (Vitest, TDD). Toasts shadcn. Barrières `tsc` + `vitest`.

## Risques / vigilance
1. **Union discriminée** : `isCriterionEmpty` doit switcher sur `type` sans cast `any` (utiliser le narrowing du type).
2. **Ne pas bloquer les cas valides** : `wait` OK sans contenu ; un critère avec valeur OK.
3. **Message clair** : indiquer quoi corriger (critère vide / étape N).

## Critères d'acceptation
- Enregistrer une campagne segment avec un critère sans valeur → refusé + message ; avec critères remplis → OK.
- Enregistrer une séquence avec une étape email sans objet ni corps (ou tâche sans titre) → refusé + message ; étapes remplies → OK.
- `tsc` + `vitest` verts (dont les tests des cœurs purs).
