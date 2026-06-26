---
title: 'Auto-attribution des questionnaires Qualiopi (positionnement / auto-éval / satisfaction) par défaut MR+C3V'
type: 'feature'
created: '2026-06-26'
status: 'done'
baseline_commit: 'f37d8b30493f0249ea46c1d2b685eae8e19d1c51'
context: ['{project-root}/CLAUDE.md', '{project-root}/bmad_output/specs/spec-questionnaires-auto-eval/SPEC.md']
---

> **Goal A** d'un découpage en 2 (voir `deferred-work.md`). Le **Goal B** (visualisation progression objectifs) est traité dans `spec-questionnaires-progression-viz.md`, en parallèle. Les deux partagent le **Contrat gelé** ci-dessous — ne le modifier que de concert.

## Contrat gelé (partagé A ↔ B)

- Positionnement (AVANT) = questionnaire `type='evaluation'`, `quality_indicator_type='auto_eval_pre'`, 1 question `type='program_objectives'`. Assignment : `formation_evaluation_assignments.evaluation_type='auto_eval_pre'`.
- Auto-évaluation (APRÈS) = questionnaire `type='evaluation'`, `quality_indicator_type='auto_eval_post'`, 1 question `program_objectives`. Assignment : `evaluation_type='auto_eval_post'`.
- Satisfaction à chaud = existant, `formation_satisfaction_assignments.satisfaction_type='satisfaction_chaud'`.
- Réponses `program_objectives` (existant) : clés `{question_id}::obj_{i}` valeur rating 1-5 + clé `_objectives_snapshot` = `{question_id: ["Objectif 1", …]}`. Cf. `src/lib/expand-objectives-question.ts`.

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Aucun questionnaire de positionnement n'existe et aucune règle d'auto-attribution n'est seedée en base (C3V=0 règle ; MR=5 règles docs/emails). `resolveQuestionnaireIdForRule` exige un assignment pré-existant pour la session, sinon rien n'est envoyé → aujourd'hui rien n'est auto-attribué et l'admin doit tout attribuer manuellement à chaque session.

**Approach:** Seeder par entité (MR + C3V) les 2 questionnaires `program_objectives` manquants (positionnement pré + auto-éval post) et les règles d'auto-attribution ; étendre l'infra `execute-rule` existante pour qu'elle résolve et crée l'assignment du questionnaire default de l'entité au déclenchement du trigger — positionnement = `on_enrollment`, auto-éval post + satisfaction chaud = `on_session_completion`. Aucun nouveau moteur ni canal.

## Boundaries & Constraints

**Always:** Tout scopé `entity_id` (MR + C3V). Réutiliser `execute-rule`, `default-packs`, les tables d'assignment, le type `program_objectives`. Seed/backfill **idempotents**. Traçabilité Qualiopi (assignment + email : qui, quand, quel questionnaire). Envoi via le token public existant uniquement.

**Ask First:** Suppression/modification d'un questionnaire existant. Toute migration touchant des données prod au-delà du seed idempotent décrit.

**Never:** Pas de nouveau moteur d'automatisation ni de nouveau canal/token. Pas de nouveau type de question. Ne pas toucher satisfaction client J+7 ni à froid J+30. Pas de travail de visualisation (= Goal B).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Inscription apprenant sur session (MR ou C3V) | Aucune action manuelle | Assignment positionnement (`auto_eval_pre`) créé en base si absent ; email positionnement envoyé à l'apprenant | Pas de questionnaire `auto_eval_pre` pour l'entité → skip + log, aucun crash |
| Fin de session | `on_session_completion` | Assignments `auto_eval_post` + `satisfaction_chaud` créés si absents ; emails envoyés | Idem skip + log si questionnaire default absent |
| Re-seed | Migration relancée | Aucun questionnaire / règle dupliqué | Conflit clé unique → skip (`ON CONFLICT`/`WHERE NOT EXISTS`) |
| Trigger ré-exécuté pour le même apprenant | Assignment déjà présent | Pas de doublon d'assignment ; anti-doublon email existant respecté | `(session, type, learner)` unique |

</frozen-after-approval>

## Code Map

- `supabase/migrations/seed_questionnaires_auto_attribution.sql` -- NOUVEAU : seed idempotent questionnaires (`auto_eval_pre`/`auto_eval_post` + question `program_objectives`) + règles `formation_automation_rules`, par entité
- `src/lib/automation/default-packs.ts` -- pack `qualiopi-standard` : positionnement → `on_enrollment` + nouvelle règle « Auto-évaluation post »
- `src/lib/automation/execute-rule.ts` -- `QUESTIONNAIRE_TYPE_TO_ASSIGNMENT` + `resolveQuestionnaireIdForRule` (lazy-resolve questionnaire default d'entité + création assignment)
- `src/app/api/formations/automation-rules/route.ts` -- réf. GET/PUT règles DB (vérifier cohérence du seed)
- `src/lib/__tests__/questionnaires-auto-attribution.test.ts` -- NOUVEAU tests

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/seed_questionnaires_auto_attribution.sql` -- Pour CHAQUE entité (MR + C3V) : créer si absent le questionnaire positionnement (`auto_eval_pre`) et auto-éval (`auto_eval_post`), chacun avec 1 question `program_objectives` ; insérer les règles questionnaire manquantes dans `formation_automation_rules` (positionnement `on_enrollment` ; auto-éval post + satisfaction chaud `on_session_completion`) sans dupliquer l'existant MR -- idempotent via `WHERE NOT EXISTS` sur `(entity_id, quality_indicator_type)` et `(entity_id, trigger_type, document_type)`.
- [x] `src/lib/automation/default-packs.ts` -- `qualiopi-standard` : positionnement `trigger_type:'on_enrollment'` (au lieu de J-3) ; ajouter règle « Auto-évaluation post » (`document_type:'questionnaire_autoevaluation'`, `on_session_completion`, `recipient_type:'learners'`).
- [x] `src/lib/automation/execute-rule.ts` -- Ajouter `questionnaire_autoevaluation` → `formation_evaluation_assignments`/`evaluation_type:'auto_eval_post'` ; aligner `questionnaire_positionnement` sur `auto_eval_pre` ; étendre `resolveQuestionnaireIdForRule` : à défaut d'assignment, résoudre le questionnaire actif de l'entité par `quality_indicator_type` et créer l'assignment (lazy, traçable) avant envoi. Ne rien envoyer (skip+log) si aucun questionnaire default.
- [x] `src/lib/__tests__/questionnaires-auto-attribution.test.ts` -- Tests FR : mapping document_type→assignment ; lazy-resolve crée l'assignment quand absent et le réutilise sinon ; skip propre si pas de questionnaire default ; isolation `entity_id`.

**Acceptance Criteria:**
- Given une session MR ou C3V et un apprenant qui s'inscrit, when le trigger `on_enrollment` s'exécute, then un assignment `auto_eval_pre` existe en base et l'email positionnement est envoyé, sans action manuelle.
- Given une session terminée, when `on_session_completion` s'exécute, then les assignments `auto_eval_post` et `satisfaction_chaud` existent et les emails partent.
- Given le seed ré-exécuté, when relancé, then aucun questionnaire ni règle dupliqué.
- Given une entité sans questionnaire default d'un type, when le trigger s'exécute, then l'envoi est skippé proprement (log) sans erreur.
- Given une session de l'entité A, when le trigger s'exécute, then seuls les questionnaires/règles de l'entité A sont utilisés.

## Spec Change Log

- **2026-06-26 — Review loop 1 (patches, pas de re-dérivation).**
  - *Finding P1 (Blind + Edge Hunter, convergent)* : la création lazy d'assignment masse (`learner_id`/`target_id` NULL) n'était pas idempotente — en Postgres `NULL ≠ NULL` dans une contrainte UNIQUE, donc sous concurrence des doublons s'accumulaient et le garde `includes("duplicate")` était mort. *Amendé* : migration enrichie d'un dédoublonnage + index uniques partiels (`WHERE learner_id IS NULL` / `WHERE target_id IS NULL`) ; garde code durcie sur SQLSTATE `23505`. *État évité* : empilement de lignes d'assignment masse et traçabilité Qualiopi faussée.
  - *Finding P3 (Edge Hunter)* : dépendance à l'ordre d'application de `add_program_objectives_question_type.sql`. *Amendé* : réaffirmation idempotente du CHECK `questions_type_check` en tête de seed (auto-suffisant).
  - *KEEP* : lazy-resolve + création d'assignment au déclenchement du trigger (pas de hook à la création de session) ; skip propre + log si pas de questionnaire default ; isolation `entity_id`.
  - *Déféré (décision produit)* : la règle `questionnaire_satisfaction` ne s'auto-résout que si l'entité a un questionnaire actif tagué `quality_indicator_type='satisfaction_chaud'`. Sinon → skip propre (warn), pas d'email satisfaction. Voir `deferred-work.md`. AC2 (positionnement + auto-éval) pleinement couvert ; la branche satisfaction dégrade proprement.

## Design Notes

- `resolveQuestionnaireIdForRule` en lazy-resolve + création d'assignment satisfait CAP-1 (« assignments en base ») et la traçabilité Qualiopi **sans** ajouter de hook à la création de session : l'assignment naît au déclenchement du trigger.
- Ne créer que ce qui **manque** : satisfaction à chaud existe déjà (C3V/MR) ; seuls positionnement pré + auto-éval post sont à seeder.

## Verification

**Commands:**
- `npx vitest run src/lib/__tests__/questionnaires-auto-attribution.test.ts` -- expected: vert
- `npx tsc --noEmit` -- expected: 0 erreur, aucun `any`

**Manual checks (if no CLI):**
- Compte admin C3V : inscrire un apprenant sur une session de test → vérifier en base la ligne `formation_evaluation_assignments` (`auto_eval_pre`) créée et l'email en file/historique, sans action manuelle.

## Suggested Review Order

**Cœur — résolution & auto-création d'assignment**

- Point d'entrée : la fonction qui résout le questionnaire et crée l'assignment au déclenchement du trigger.
  [`execute-rule.ts:147`](../../src/lib/automation/execute-rule.ts#L147)

- Étape 2 — fallback auto-attribution scopé `entity_id` (isolation multi-tenant).
  [`execute-rule.ts:166`](../../src/lib/automation/execute-rule.ts#L166)

- Étape 3 — création lazy idempotente (garde 23505 durcie après review).
  [`execute-rule.ts:186`](../../src/lib/automation/execute-rule.ts#L186)

- Call-site : passage de `session.entity_id` (active l'auto-attribution).
  [`execute-rule.ts:499`](../../src/lib/automation/execute-rule.ts#L499)

**Seed & idempotence (migration)**

- Boucle par entité MR + C3V : questionnaires `auto_eval_pre`/`auto_eval_post` + 3 règles.
  [`seed_questionnaires_auto_attribution.sql:37`](../../supabase/migrations/seed_questionnaires_auto_attribution.sql#L37)

- Index uniques partiels (cas masse) — fix idempotence post-review (NULL ≠ NULL).
  [`seed_questionnaires_auto_attribution.sql:148`](../../supabase/migrations/seed_questionnaires_auto_attribution.sql#L148)

- Auto-suffisance : réaffirmation du CHECK `program_objectives`.
  [`seed_questionnaires_auto_attribution.sql:27`](../../supabase/migrations/seed_questionnaires_auto_attribution.sql#L27)

**Pack & tests (périphérie)**

- Pack Qualiopi aligné : positionnement `on_enrollment` + nouvelle règle auto-éval.
  [`default-packs.ts:38`](../../src/lib/automation/default-packs.ts#L38)

- Tests : mapping, lazy-resolve, garde 23505, isolation, idempotence SQL.
  [`questionnaires-auto-attribution.test.ts:1`](../../src/lib/__tests__/questionnaires-auto-attribution.test.ts#L1)
