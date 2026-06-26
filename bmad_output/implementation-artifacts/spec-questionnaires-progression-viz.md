---
title: 'Visualisation : % satisfaction + progression de niveau par objectif (avant → après) sur la fiche formation'
type: 'feature'
created: '2026-06-26'
status: 'done'
context: ['{project-root}/CLAUDE.md', '{project-root}/bmad_output/specs/spec-questionnaires-auto-eval/SPEC.md']
---

> **Revue 2026-06-26 (loop 1, patch) :** 3 hunters adversariaux convergent sur un **P0** — `loadObjectivesProgression` n'utilisait qu'un seul `snapshotQuestionId` global, alors que les questionnaires avant/après sont DISTINCTS (question_id différents) ⇒ delta toujours `null` en prod, bug masqué par un test réutilisant le même `question_id`. **Corrigé** : agrégation par **libellé d'objectif**, snapshot lu **par réponse** (robuste aussi au réordonnancement des objectifs — P2). Test refait avec question_id distincts + cas réordonnancement. Vérif : vitest 8/8, tsc 0, build OK.

> **Goal B** d'un découpage en 2. Le **Goal A** (auto-attribution backend) est dans `spec-questionnaires-auto-attribution.md`, développé en parallèle. Les deux partagent le **Contrat gelé** ci-dessous — ne le modifier que de concert. B peut être développé et testé sur des réponses fixtures **sans attendre que A soit mergé** : il consomme le contrat, pas le code de A.
>
> **À lancer dans une autre session, sur sa propre branche** (ex. `feat/questionnaires-progression-viz`) pour éviter tout conflit git avec A.

## Contrat gelé (partagé A ↔ B)

- Positionnement (AVANT) = questionnaire `type='evaluation'`, `quality_indicator_type='auto_eval_pre'`, 1 question `type='program_objectives'`.
- Auto-évaluation (APRÈS) = questionnaire `type='evaluation'`, `quality_indicator_type='auto_eval_post'`, 1 question `program_objectives`.
- Satisfaction = `satisfactionRate` déjà calculé par `loadQualiopiIndicators` (`src/lib/services/load-session-aggregates.ts`).
- Réponses `program_objectives` : clés `{question_id}::obj_{i}` valeur rating 1-5 + clé `_objectives_snapshot` = `{question_id: ["Objectif 1", …]}`. Helpers : `src/lib/expand-objectives-question.ts`.

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'admin/formateur n'a aucune lecture directe du % de satisfaction ni du niveau atteint par objectif : il doit lire les réponses une par une. Un concurrent (Digiforma) affiche ces % d'emblée.

**Approach:** Sur l'onglet questionnaires de la fiche formation, afficher une jauge de % satisfaction (réutilise `satisfactionRate`) et, par objectif du programme, le niveau moyen **avant** (positionnement) et **après** (auto-évaluation) avec leur écart, via un nouveau calcul `loadObjectivesProgression` et un composant dédié.

## Boundaries & Constraints

**Always:** Lecture scopée `entity_id` (via la session). Réutiliser `loadQualiopiIndicators`/`satisfactionRate`, le format de réponses `program_objectives` et `expand-objectives-question.ts`, les composants shadcn (`Progress`, `Card`, `Badge`). Comparaison avant/après par objectif via `_objectives_snapshot`.

**Ask First:** Ajout d'une dépendance de charting nouvelle (préférer `Progress` shadcn / Recharts déjà présents).

**Never:** Pas de modification du backend d'auto-attribution (= Goal A). Pas de nouveau type de question ni de canal de réponse. Pas d'export/PDF (lecture écran). Ne pas toucher les calculs satisfaction client J+7 / froid J+30.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Avant ET après remplis | Réponses `program_objectives` des 2 questionnaires de la session | Par objectif : moyenne avant, après, écart (Δ) ; + jauge % satisfaction globale | Objectifs vides → section masquée |
| Un seul des deux rempli | Réponses partielles | Affiche le côté disponible ; Δ = « — » | N/A |
| Programme sans objectifs | `_objectives_snapshot` vide / `program.objectives` vide | Carte progression masquée (mais jauge satisfaction reste) | Aucune erreur |
| Aucune réponse | 0 réponse | Carte progression masquée | Aucune erreur |
| Réponses d'une autre entité | session entité A | Seules les réponses de la session A comptées | Scope par `session_id` (entity via session) |

</frozen-after-approval>

## Code Map

- `src/lib/services/load-session-aggregates.ts` -- ajout `loadObjectivesProgression(supabase, sessionId)` (à côté de `loadQualiopiIndicators`)
- `src/lib/expand-objectives-question.ts` -- helpers parsing `program_objectives` + `_objectives_snapshot` (réutiliser)
- `src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/ObjectivesProgressionCard.tsx` -- NOUVEAU composant (jauge % + barres avant→après par objectif)
- `src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx` -- fetch + rendu de la carte sous `QuestionnaireOverview` (Promise.all existant ~L89)
- `src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/QuestionnaireOverview.tsx` -- réf. (pattern jauge `satisfactionRate`/`getQualiopiStatus`)
- `src/components/ui/progress.tsx` -- `Progress` shadcn (barres)
- `src/lib/__tests__/objectives-progression.test.ts` -- NOUVEAU tests (fixtures réponses)

## Tasks & Acceptance

**Execution:**
- [ ] `src/lib/services/load-session-aggregates.ts` -- Ajouter `loadObjectivesProgression(supabase, sessionId)` : charge les `questionnaire_responses` de la session pour les questionnaires `auto_eval_pre` (avant) et `auto_eval_post` (après) ; reconstruit la liste d'objectifs via `_objectives_snapshot` ; pour chaque objectif calcule moyenne avant, moyenne après (rating 1-5) et écart ; retourne `[]` si aucun objectif. Type de retour exporté.
- [ ] `src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/ObjectivesProgressionCard.tsx` -- Composant : jauge % satisfaction (prop `satisfactionRate`, même seuil 70% que `getQualiopiStatus`) + 1 ligne/objectif (libellé, barres `Progress` avant & après, badge Δ vert/rouge/neutre). Gère états vide / partiel / masqué.
- [ ] `src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx` -- Ajouter `loadObjectivesProgression` au `Promise.all` de chargement et rendre `ObjectivesProgressionCard` sous `QuestionnaireOverview` (masqué si pas de données).
- [ ] `src/lib/__tests__/objectives-progression.test.ts` -- Tests FR sur fixtures : avant/après/écart corrects ; objectifs vides → `[]` ; un seul questionnaire rempli → côté partiel ; isolation par session.

**Acceptance Criteria:**
- Given une session dont positionnement (avant) et auto-éval (après) sont remplis, when l'admin ouvre l'onglet questionnaires, then il voit une jauge % satisfaction et, par objectif, le niveau avant→après + l'écart, sans calcul manuel.
- Given un seul des deux questionnaires rempli, when l'admin ouvre l'onglet, then le côté disponible s'affiche et l'écart vaut « — ».
- Given un programme sans objectifs (ou aucune réponse), when l'admin ouvre l'onglet, then la carte progression est masquée et aucune erreur n'est levée.
- Given une session de l'entité A, when on calcule sa progression, then aucune réponse d'une autre session/entité n'est comptée.

## Design Notes

- Les 2 questionnaires portent sur le **même** jeu d'objectifs → comparabilité par index/texte d'objectif via `_objectives_snapshot` (robuste si le programme évolue après réponse).
- Réutiliser le pattern visuel de `QuestionnaireOverview` (bandeau + seuil 70%) et `Progress` shadcn pour rester cohérent. Pas de nouvelle lib.

## Verification

**Commands:**
- `npx vitest run src/lib/__tests__/objectives-progression.test.ts` -- expected: vert
- `npx tsc --noEmit` -- expected: 0 erreur, aucun `any`
- `npm run build` -- expected: succès

**Manual checks (if no CLI):**
- Sur une session avec réponses positionnement + auto-éval : ouvrir l'onglet questionnaires → jauge % satisfaction + barres de progression par objectif visibles ; objectifs vides → carte absente, pas d'erreur.
