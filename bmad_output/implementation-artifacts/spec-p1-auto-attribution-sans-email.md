---
title: "Auto-attribution des questionnaires sans email : flag send_email + visibilité in-app garantie"
type: 'feature'
created: '2026-06-27'
status: 'done'
baseline_commit: '4e1d2bcb7355bc93ef179a8773f9c1b89e9537a7'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/supabase/migrations/seed_questionnaires_auto_attribution.sql'
  - '{project-root}/supabase/migrations/sync_assignments_to_questionnaire_sessions.sql'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'auto-attribution Qualiopi (mergée récemment) crée l'assignment ET envoie un email avec lien token, couplés dans `executeRuleForSession`. Le client veut que les 3 questionnaires (positionnement, auto-éval, satisfaction chaud) s'attribuent automatiquement et restent **répondables dans l'espace apprenant, sans aucun email**. La réponse in-app existe déjà sans token (`/learner/questionnaires/[id]` insère direct), mais la liste apprenant découvre via `questionnaire_sessions` (table miroir, déploiement trigger incertain — cf. P3).

**Approach:** Découpler email et attribution via un flag **`send_email`** (défaut true) sur `formation_automation_rules`, mis à `false` sur les 3 règles questionnaires via seed. Quand `send_email=false` pour une règle questionnaire : créer l'assignment (et garantir le miroir `questionnaire_sessions` pour la visibilité in-app, sans dépendre du trigger) **sans** générer de token ni d'email. Déclencheurs inchangés (positionnement `on_enrollment`, auto-éval/satisfaction `on_session_completion`). Les autres règles (convocation, satisfaction froid J+30) gardent l'email.

## Boundaries & Constraints

**Always:** Scoper `entity_id` (MR + C3V). L'assignment DOIT toujours être créé quand `send_email=false` (sinon plus d'attribution). Garantir la visibilité in-app via upsert `questionnaire_sessions` (idempotent, `onConflict`), indépendant du trigger miroir. Migration + seed idempotents. Traçabilité Qualiopi : l'assignment (qui/quel questionnaire) + la réponse restent la preuve. Pas de `any`.

**Ask First:** Étendre `send_email=false` à d'autres règles que les 3 questionnaires actifs. Tout changement des déclencheurs/`quality_indicator_type` (Contrat gelé de l'auto-attribution). Toute modification de la page de réponse apprenant.

**Never:** Ne pas couper l'email des règles non-questionnaires (convocation…) ni de la satisfaction à froid J+30. Ne pas supprimer la génération de token quand `send_email=true` (pas de régression). Ne pas modifier les calculs d'agrégats. Pas de nouveau canal. Ne pas changer le timing d'attribution.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Inscription apprenant, règle positionnement `send_email=false` | `on_enrollment` déclenché | Assignment `auto_eval_pre` créé + ligne `questionnaire_sessions` upsertée ; AUCUN token, AUCUN email | assignment best-effort (log si échec), pas de crash |
| Fin de session, auto-éval/satisfaction `send_email=false` | `on_session_completion` | Assignments créés + miroir ; aucun email | idem |
| Apprenant ouvre son espace | questionnaires attribués (sans email reçu) | Les questionnaires apparaissent dans `/learner/questionnaires` et sont répondables in-app | N/A |
| Règle convocation `send_email=true` (défaut) | déclencheur | Email envoyé comme avant (aucune régression) | comportement existant |
| Règle questionnaire `send_email=true` | déclencheur | Token + email comme avant | comportement existant |
| Re-exécution (idempotence) | règle déjà exécutée | Assignment/miroir non dupliqués (index unique + onConflict) | duplicate 23505 bénin |

</frozen-after-approval>

## Code Map

- `supabase/migrations/seed_questionnaires_auto_attribution.sql` -- réf. : crée les 3 règles (document_type `questionnaire_positionnement`/`_autoevaluation`/`_satisfaction`).
- `src/lib/automation/execute-rule.ts:48` -- `RuleInfo` ; y ajouter `send_email`.
- `src/lib/automation/execute-rule.ts:186-201` -- `resolveQuestionnaireIdForRule` crée l'assignment ; y ajouter l'upsert `questionnaire_sessions`.
- `src/lib/automation/execute-rule.ts:497-520` -- bloc token/email dans `executeRuleForSession` ; brancher le flag (créer l'assignment sans email si `send_email=false`).
- `src/app/api/formations/automation-rules/run-cron/route.ts:218,264` -- charge les règles `select("*")` et passe le row brut → `send_email` propagé automatiquement (aucun changement).
- `src/app/(dashboard)/learner/questionnaires/page.tsx:106` -- réf. : la liste apprenant lit `questionnaire_sessions` (d'où la garantie du miroir).

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/add_automation_rules_send_email_flag.sql` -- `ALTER TABLE formation_automation_rules ADD COLUMN IF NOT EXISTS send_email BOOLEAN DEFAULT true` ; `UPDATE ... SET send_email=false WHERE document_type IN ('questionnaire_positionnement','questionnaire_autoevaluation','questionnaire_satisfaction')` (toutes entités). Idempotent. -- flag DB + désactivation email des 3.
- [x] `src/lib/automation/execute-rule.ts` (RuleInfo) -- ajouter `send_email?: boolean | null`. -- typage, pas de `any`.
- [x] `src/lib/automation/execute-rule.ts` (`resolveQuestionnaireIdForRule`) -- après l'insert assignment, `upsert` dans `questionnaire_sessions` `{questionnaire_id, session_id}` `onConflict: "questionnaire_id,session_id"` (visibilité in-app drift-proof). -- garantit l'affichage apprenant.
- [x] `src/lib/automation/execute-rule.ts` (`executeRuleForSession`) -- si `isQuestionnaireRule(rule) && rule.send_email === false` : appeler `resolveQuestionnaireIdForRule` (crée assignment + miroir) puis retourner `{enqueued:0, skipped:recipients.length, failed:0}` SANS token ni email ; sinon comportement inchangé. -- découplage email/attribution.
- [x] `src/lib/__tests__/auto-attribution-no-email.test.ts` -- tester : `resolveQuestionnaireIdForRule` upserte `questionnaire_sessions` ; règle questionnaire `send_email=false` → assignment créé, `enqueueEmail` NON appelé ; `send_email` true/undefined → email comme avant ; garde-fous migration (colonne, 3 rules false, idempotence). -- couvre la matrice.

**Acceptance Criteria:**
- Given une règle questionnaire avec `send_email=false`, when `on_enrollment` se déclenche, then l'assignment et la ligne `questionnaire_sessions` sont créés et aucun email n'est mis en file.
- Given un apprenant inscrit, when il ouvre son espace questionnaires, then les questionnaires auto-attribués apparaissent et sont répondables in-app sans avoir reçu d'email.
- Given une règle non-questionnaire (convocation) ou `send_email` true/non défini, when elle se déclenche, then l'email est envoyé comme avant (aucune régression).
- Given une ré-exécution de la même règle, when elle tourne, then l'assignment et le miroir ne sont pas dupliqués.

## Design Notes

`resolveQuestionnaireIdForRule` est aujourd'hui appelé DANS le bloc email → couper l'email naïvement supprimerait l'attribution. D'où la branche dédiée `send_email===false` qui crée l'assignment puis retourne. Le miroir `questionnaire_sessions` est upserté explicitement (et non via le seul trigger SQL) car la liste apprenant en dépend et le trigger peut ne pas être déployé en prod (leçon P3). `send_email` undefined (règles existantes) ⇒ traité comme true ⇒ zéro régression.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: 0 erreur
- `npx vitest run src/lib/__tests__/auto-attribution-no-email.test.ts src/lib/__tests__/questionnaires-auto-attribution.test.ts` -- expected: verts (nouveau + non-régression)

**Manual checks:**
- Appliquer la migration ; inscrire un apprenant sur une session d'une entité ayant les 3 questionnaires ; vérifier en base l'assignment + la ligne `questionnaire_sessions`, l'absence d'email en file (`email_history`), et que le questionnaire est visible/répondable dans l'espace apprenant.

## Suggested Review Order

**Schéma & flag**

- Migration : colonne send_email (défaut true) + off sur les 3 questionnaires actifs (idempotent)
  [`add_automation_rules_send_email_flag.sql:20`](../../supabase/migrations/add_automation_rules_send_email_flag.sql#L20)

- Type RuleInfo : champ send_email (undefined/true ⇒ email historique)
  [`execute-rule.ts:59`](../../src/lib/automation/execute-rule.ts#L59)

**Découplage (le cœur)**

- Branche in-app : si questionnaire + send_email=false → créer l'assignment puis sortir SANS email (resolveQuestionnaireIdForRule est sinon dans le bloc email)
  [`execute-rule.ts:482`](../../src/lib/automation/execute-rule.ts#L482)

- Miroir questionnaire_sessions garanti (visibilité in-app drift-proof, onConflict sur la PK)
  [`execute-rule.ts:210`](../../src/lib/automation/execute-rule.ts#L210)

**Tests**

- Miroir + onConflict ; in-app sans email ; régressions (règle email + questionnaire send_email=true) ; garde-fous migration
  [`auto-attribution-no-email.test.ts:65`](../../src/lib/__tests__/auto-attribution-no-email.test.ts#L65)
