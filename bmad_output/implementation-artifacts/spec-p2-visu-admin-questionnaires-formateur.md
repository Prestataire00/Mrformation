---
title: "Visibilité admin des questionnaires attribués par un formateur (hors parcours Qualiopi)"
type: 'bugfix'
created: '2026-06-26'
status: 'done'
baseline_commit: 'c00bcaaf2a36267e2ec6ff4ad6e04cd736643a4a'
context:
  - '{project-root}/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un formateur peut attribuer un questionnaire à sa session, mais l'admin ne le voit pas. Asymétrie de données : le formateur écrit dans `questionnaire_sessions` (route `/api/trainer/questionnaires/[id]/sessions`), alors que l'onglet questionnaires admin (`TabQuestionnaires`) n'affiche QUE les attributions de `formation_evaluation_assignments` / `formation_satisfaction_assignments`, organisées en étapes Qualiopi typées. Aucun pont formateur→assignments → le test du formateur reste invisible (et ses réponses inaccessibles) côté admin. (La *création* est déjà visible : la liste globale admin charge par `entity_id`.)

**Approach:** Afficher dans `TabQuestionnaires` une section dédiée listant les questionnaires liés à la session via `questionnaire_sessions` **non couverts** par les assignments Qualiopi (= ceux du formateur, ou toute attribution hors parcours). Pour chaque, parité complète : titre, type, badge « Formateur », statut de réponse par apprenant, et consultation des réponses en réutilisant le `LearnerResponsesDialog` existant (cell construite).

## Boundaries & Constraints

**Always:** Filtrer par `session_id`. Exclure les questionnaires déjà présents dans `formation_*_assignments` (pas de doublon avec les étapes). Réutiliser `LearnerResponsesDialog` (pas de nouveau visualiseur) et le format `LearnerStatusCell`. Logique de sélection dans une fonction pure testable. Pas de `any` nouveau (le fichier existant en contient déjà via casts — ne pas en ajouter). shadcn/ui, try/catch + toast sur les fetch.

**Ask First:** Tout changement du modèle d'étapes Qualiopi existant. Toute écriture inverse (assignments→questionnaire_sessions) ou modification du trigger SQL. Toute modification de la route formateur.

**Never:** Ne pas modifier la route `/api/trainer/...` ni les tables. Ne pas écrire dans `formation_*_assignments` pour les questionnaires formateur (ils n'ont pas de type d'étape). Ne pas toucher au calcul des agrégats / étapes existantes. Pas de nouvelle table ni migration.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Formateur a attribué 1 questionnaire | `questionnaire_sessions` a la ligne, absente de `formation_*_assignments` | Section « Questionnaires du formateur » liste le questionnaire (titre, type, badge Formateur) | fetch KO → toast, section vide |
| Admin a attribué via une étape | questionnaire présent dans `formation_*_assignments` (+ mirroir `questionnaire_sessions`) | NON listé dans la section (déjà visible dans son étape) | N/A |
| Apprenant a répondu | réponse dans `questionnaire_responses` (session+questionnaire) | Cellule « répondu » cliquable → `LearnerResponsesDialog` affiche ses réponses | N/A |
| Apprenant n'a pas répondu | aucune réponse | Cellule « en attente », non cliquable | N/A |
| Aucun questionnaire formateur | rien hors assignments | Section masquée (pas de carte vide) | N/A |
| Attribution legacy sans `created_by_trainer_id` | lien hors assignments mais pas créé par formateur | Listé quand même (sans badge Formateur) — visibilité utile | N/A |

</frozen-after-approval>

## Code Map

- `src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx:92` -- `fetchData` (Promise.all) ; y ajouter le chargement `questionnaire_sessions`.
- `.../TabQuestionnaires.tsx:259` -- zone de rendu (grille apprenants + `LearnerResponsesDialog` déjà monté l.268) où insérer la section.
- `.../questionnaires/LearnerResponsesDialog.tsx:30` -- visualiseur réutilisé tel quel (cell `{questionnaireId, responseId, learnerName, questionnaireTitle, status}`).
- `src/lib/utils/questionnaire-stats.ts:110` -- type `LearnerStatusCell` ; y ajouter la fonction pure de sélection + construction des cells.
- `src/app/api/trainer/questionnaires/[id]/sessions/route.ts:49` -- réf. : ce que le formateur écrit (`questionnaire_sessions`), NON modifié.
- `supabase/schema.sql` (questionnaires) -- colonne `created_by_trainer_id` pour le badge.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/utils/questionnaire-stats.ts` -- Ajouter `selectTrainerQuestionnaires(sessionLinks, evalAssignments, satisAssignments)` (pure) qui renvoie les questionnaires de `questionnaire_sessions` dont le `questionnaire_id` n'est dans aucun assignment, dédupliqués ; + un helper `buildTrainerLearnerCells(questionnaireId, title, enrollments, responses)` produisant des `LearnerStatusCell[]` (status `answered` si réponse trouvée, avec `responseId`). -- logique pure testable.
- [x] `src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx` -- Charger `questionnaire_sessions` (join `questionnaires!inner(id, title, type, created_by_trainer_id)`) dans `fetchData` ; calculer la liste via `selectTrainerQuestionnaires` ; rendre une section conditionnelle (masquée si vide) listant chaque questionnaire (titre, badge type, badge « Formateur » si `created_by_trainer_id`) avec la grille de statut par apprenant ; clic « répondu » → `setResponseDialogCell(cell)` (réutilise le dialog existant). -- visibilité + parité.
- [x] `src/lib/__tests__/trainer-questionnaires-visibility.test.ts` -- Tester `selectTrainerQuestionnaires` (exclusion des assignés, dédup, lien-seul listé) et `buildTrainerLearnerCells` (répondu/en attente, responseId correct) sur les cas de la matrice I/O. -- règle tests.

**Acceptance Criteria:**
- Given un formateur a attribué un questionnaire à sa session (présent dans `questionnaire_sessions`, absent des assignments), when l'admin ouvre l'onglet questionnaires de la session, then le questionnaire apparaît dans la section « Questionnaires du formateur » avec un badge Formateur.
- Given un questionnaire attribué par l'admin via une étape, when l'admin ouvre l'onglet, then ce questionnaire n'est PAS dupliqué dans la section formateur.
- Given un apprenant a répondu à un questionnaire formateur, when l'admin clique sur sa cellule, then ses réponses s'affichent via le dialog existant.
- Given aucun questionnaire hors parcours, when l'admin ouvre l'onglet, then aucune section vide n'est affichée.

## Design Notes

Réutilisation : `LearnerResponsesDialog` (déjà monté l.268) ne dépend que de `cell.questionnaireId` + `cell.responseId` → on construit une `LearnerStatusCell` par (apprenant, questionnaire formateur). Exclusion = `questionnaire_id ∉ (evalAssignments ∪ satisAssignments).questionnaire_id`. Le mirroir admin→`questionnaire_sessions` (trigger) n'introduit pas de doublon : les attributions admin SONT dans les assignments donc exclues.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: 0 erreur
- `npx vitest run src/lib/__tests__/trainer-questionnaires-visibility.test.ts` -- expected: tous verts

**Manual checks:**
- Sur une session, attribuer un questionnaire via l'espace formateur, puis ouvrir l'onglet questionnaires admin → vérifier l'apparition dans la section, le badge Formateur, et la consultation des réponses d'un apprenant ayant répondu.

## Suggested Review Order

**Logique pure (sélection + statuts)**

- Entrée : sélection des questionnaires liés à la session non couverts par les assignments (exclusion + dédup + filtre is_active)
  [`questionnaire-stats.ts:163`](../../src/lib/utils/questionnaire-stats.ts#L163)

- Construction des cellules par apprenant (dédup par learner_id — issu de la revue ; statut answered/sent/expired)
  [`questionnaire-stats.ts:196`](../../src/lib/utils/questionnaire-stats.ts#L196)

**Chargement & garde-fou (admin)**

- Nouvelle requête `questionnaire_sessions` (embedding questionnaires) ajoutée au Promise.all
  [`TabQuestionnaires.tsx:104`](../../src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx#L104)

- Garde-fou anti-faux-doublon (revue Q2) : section alimentée seulement si les assignments ont chargé ; erreurs loguées
  [`TabQuestionnaires.tsx:117`](../../src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx#L117)

**Rendu & réutilisation**

- Calcul de la liste affichée
  [`TabQuestionnaires.tsx:171`](../../src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx#L171)

- Section « Questionnaires du formateur » (badge Formateur, grille apprenants, clic → LearnerResponsesDialog existant)
  [`TabQuestionnaires.tsx:293`](../../src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx#L293)

**Tests**

- Sélection (exclusion/dédup/inactif) + cellules (statuts, dédup apprenant)
  [`trainer-questionnaires-visibility.test.ts:23`](../../src/lib/__tests__/trainer-questionnaires-visibility.test.ts#L23)
