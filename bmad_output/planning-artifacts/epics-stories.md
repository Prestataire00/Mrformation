---
date: 2026-06-06
status: draft
prdSource: bmad_output/planning-artifacts/prd.md
prdCommit: 799155a
totalStories: 29
reviewsAdversariales:
  completeness:
    verdict: minor-tweaks
    issuesMajor: 5
    issuesMinor: 4
    issuesNit: 2
  antiHallucination:
    verdict: major-rework
    issuesBlocker: 4
    issuesMajor: 6
    issuesMinor: 2
    rootCause: PRD non validé contre codebase réel — enum, tables, fichiers, lignes inventés ou désalignés
epics:
  - Epic 1: 10 stories, ~3 sem
  - Epic 2: 13 stories, ~3-4 sem
  - Epic 3: 6 stories, ~1-2 sem
---

# Epics & Stories — Résolution zones d'ombre UX/articulation LMS (FINAL post-reviews)

Ce document opérationnalise le PRD (`bmad_output/planning-artifacts/prd.md`, commit 799155a) en 29 stories atomiques réparties sur 3 epics, couvrant les 3 archétypes du diagnostic :
- **Archétype A — Signaux de fin** : opérations sans feedback (Epic 2)
- **Archétype B — Limites silencieuses** : tableaux/batch sans pagination ou confirmation (Epic 3)
- **Archétype C — Promesses cassées** : boutons sans handlers, enums désalignés, mutations sans refetch (Epic 1)

**Statut post-reviews adversariales** : 4 blockers anti-hallucination identifiés ont été convertis en **audits S0 obligatoires** (placeholders explicites). 6 issues majors reportées en pre-conditions explicites. Voir section "Reviews adversariales" en fin de document.

Effort total estimé : **~8.5-9 semaines solo dev** séquentiel (révisé +1 semaine vs draft pour intégrer buffer S0 d'audit codebase + buffer PR review/regression).

---

## Vue d'ensemble

| Epic | Archétype | FR couverts | Stories | Effort | Pre-conditions globales |
|------|-----------|-------------|---------|--------|--------------------------|
| **Epic 1 — Promesses cassées** | C | FR-C-01 → FR-C-05 | 10 (E1-S01 → E1-S10) dont **2 déjà livrées** (E1-S06, E1-S07) post-S0 | ~2-2.5 sem (révisé depuis ~3 sem post-S0) | S0 ✅ complet, OQ-7/8/9 ⏳ |
| **Epic 2 — Signaux de fin** | A | FR-A-01, FR-A-03 → FR-A-07 | 13 (E2-S01 → E2-S13) | ~3-4 sem | Epic 1 partiel mergé (E1-S01 pour E2-S10) |
| **Epic 3 — Limites silencieuses** | B | FR-B-01, FR-B-02, FR-B-03 | 6 (E3-S01 → E3-S06) | ~1-2 sem | Epic 1 mergé + main stable 24h, OQ-2/6 |

**Total** : 29 stories sur ~8-8.5 semaines (révisé post-S0 — E1-S06/S07 livrées hors-sprint).

> **Mise à jour post-S0 (2026-06-06)** :
> - Sprint S0 audit codebase : ✅ **complet** (7 audits clear, 0 blocker, livrable `S0-codebase-audit-findings.md` commit `09a58e4`)
> - 2 stories Epic 1 déjà livrées dans le code existant : **E1-S06** (Dupliquer formation) + **E1-S07** (Supprimer formation). Audit A3 a découvert que helpers `duplicateSession()` + `deleteSession()` existent déjà dans `src/lib/services/sessions.ts` et UI branchée dans `ResumeActions.tsx` + `ResumeDangerZone.tsx`. → Smoke test admin requis (10 min total) pour confirmer livraison.
> - Effort Epic 1 réduit : ~3 sem → ~2-2.5 sem
> - Reste à trancher avant kickoff Epic 1 : OQ-7 (vacances) + OQ-8 (mapping BPF — informé par A2 qui confirme aucun fichier Zod BPF existant pour trainings/crm_quotes, à créer)

---

## Sprint S0 — Audit codebase obligatoire (NOUVEAU, post-review anti-hallu)

Avant kickoff Epic 1, **4 audits bloquants** doivent être complétés (~2-3 jours dev). Sans ces audits, plusieurs stories Epic 1 ont des claims inventés (cf. review anti-hallu).

### Audit A1 — CourseType enum source-of-truth
- Lire `src/lib/validations/elearning.ts` lignes ~60-80 : noter EXACTEMENT les valeurs de `elearningCourseTypeEnum`.
- Lire `src/app/(dashboard)/admin/elearning/create/page.tsx:36` : noter le type local `CourseType`.
- Lire DB : `SELECT DISTINCT course_type FROM elearning_courses;` + `SELECT con FROM pg_constraint WHERE conname LIKE '%course_type%';`
- **Livrable** : tableau 3 colonnes (Zod | UI | DB) + décision produit : quelles valeurs finales ? (3 ? 4 ? lesquelles ?)
- **Owner** : Wissam + dev

### Audit A2 — Existence fichiers validations training.ts / crm-quote*.ts
- `find src/lib/validations/ -type f -name "*.ts"` : lister exhaustivement.
- Pour chaque fichier listé, grep `bpf_funding_type` et `bpf_objective`.
- **Livrable** : confirmer/infirmer existence training.ts et crm-quote*.ts ; si absents → AC #3 de E1-S02 et E1-S03 retirées (déjà fait dans cette version finale).
- **Owner** : dev

### Audit A3 — Service formations vs sessions
- `find src/lib/services/ -type f -name "*.ts"` : lister.
- Lire schema.sql : confirmer si `formations` est une table OU si l'entité formation = ligne `sessions`.
- Grep `from('formations')` et `from('sessions')` dans `src/app/(dashboard)/admin/formations/` pour identifier la table consommée.
- **Livrable** : décision claire — E1-S06/S07 ciblent quel fichier service et quelle table ?
- **Owner** : dev

### Audit A4 — Schéma questionnaires (scoring rétroactif)
- Lire `supabase/schema.sql` : extraire DDL des tables `questionnaires`, `questionnaire_responses`, `questionnaire_questions` (si existe), `questionnaire_answers` (si existe).
- Lister exhaustivement les colonnes JSONB nested (ex. `questionnaire_responses.answers JSONB[]` ?).
- Grep `/api/questionnaires/[id]/correct/` : confirmer existence route.
- Vérifier existence table `audit_logs` ou équivalent.
- **Livrable** : schéma réel documenté ; décision : E1-S10 attaque JSONB nested OU table junction ?
- **Owner** : dev

### Audit A5 — Route /start bulk thresholds actuels
- Lire `src/app/api/sessions/[id]/learners/bulk/start/route.ts` intégralement.
- Lire `netlify/functions/learners-bulk-create-background.mts` intégralement.
- Lister : flags utilisés (`BG_NOT_READY_V1` etc.), seuils actuels (50 ? 20 ? 100 ?), lignes de la "stub V1".
- **Livrable** : tableau état actuel vs cible E2-S03 ; OQ-1 (volume max) prise en compte.
- **Owner** : dev

### Audit A6 — UI bulk-import path
- `find src/app/\(dashboard\)/admin/sessions -name "*bulk*"` et `find src/app -name "*bulk-import*"`.
- **Livrable** : confirmer path UI (page standalone OU section dans `sessions/[id]/page.tsx`).
- **Owner** : dev

### Audit A7 — Lignes pagination hubs E-Learning et Programs
- Lire `src/app/(dashboard)/admin/elearning/page.tsx` : localiser exact `.slice(` pagination client.
- Idem `src/app/(dashboard)/admin/programs/page.tsx`.
- **Livrable** : numéros de lignes confirmés pour E3-S02 et E3-S03.
- **Owner** : dev

**Sortie S0** : doc `bmad_output/planning-artifacts/S0-codebase-audit-findings.md` (non commité dans code, artifact planning) consolidant les 7 audits. Sans ce doc, S1 ne démarre pas.

---

## Epic 1 — Promesses cassées (archétype C)

**Objectif** : Restaurer la cohérence des contrats UI/Zod/DB et brancher les actions promises (boutons, mutations, scoring) qui restent muettes.

### E1-S01 — CourseType enum unification (Zod ↔ UI ↔ DB)

- **FR mapping** : FR-C-01
- **Persona** : admin
- **User story** : En tant qu'admin, je veux créer un cours E-Learning avec un enum CourseType cohérent entre UI, Zod et DB afin que l'insert réussisse sans validation error et que le type soit la source unique de vérité.
- **Pre-conditions** : **Audit A1 (S0) complété** — valeurs source-of-truth tranchées par Wissam + produit.
- **Acceptance criteria** :
  1. **À CONFIRMER POST-AUDIT A1** : `elearningCourseTypeEnum` dans `src/lib/validations/elearning.ts` contient exactement N valeurs (N et liste à fixer par audit A1).
  2. Nouveau fichier `src/lib/types/elearning.ts` exporte `type CourseType = z.infer<typeof elearningCourseTypeEnum>` + `COURSE_TYPE_OPTIONS` (labels FR).
  3. `src/app/(dashboard)/admin/elearning/create/page.tsx:36` importe `CourseType` depuis `@/lib/types/elearning` (suppression du type local divergent).
  4. Grep `type CourseType =` retourne uniquement `src/lib/types/elearning.ts`.
  5. Round-trip create/edit course : chaque valeur persiste sans transformation.
  6. **Migration data** : si décalage Zod↔DB révélé par A1, migration data ou contrainte DB documentée séparément (hors scope story).
- **Files affected** :
  - `src/lib/validations/elearning.ts` (modify selon A1)
  - `src/lib/types/elearning.ts` (nouveau fichier)
  - `src/app/(dashboard)/admin/elearning/create/page.tsx:36` (modify)
- **Effort** : S (1-2j) — **Risk** : Bas (post-A1)
- **Tests** : `src/lib/__tests__/enums-consistency.test.ts` (créé en E1-S05) ; integration create/fetch course.
- **DoD** : tsc clean, vitest pass, build OK, valeurs alignées Zod/UI/DB.

### E1-S02 — BpfFundingType enum unification (valeurs DB)

- **FR mapping** : FR-C-02
- **Persona** : admin
- **User story** : En tant qu'admin, je veux sélectionner n'importe quel type de financement BPF (toutes les valeurs DB) et que l'insert réussisse sans CHECK constraint error.
- **Pre-conditions** : Audit A2 complété (training.ts/crm-quote*.ts existence confirmée/infirmée) ; OQ-8 (mapping Zod legacy → DB + labels FR) résolue.
- **Acceptance criteria** :
  1. Nouveau fichier `src/lib/types/bpf.ts` exporte `BpfFundingType` tuple `as const` avec les **valeurs DB exactes** (liste à figer post-OQ-8). Valeurs documentées : `entreprise_privee, apprentissage, professionnalisation, reconversion_alternance, conge_transition, cpf, dispositif_chomeurs, non_salaries, plan_developpement, pouvoir_public_agents, instances_europeennes, etat, conseil_regional, pole_emploi, autres_publics, individuel, organisme_formation, autre` (18 valeurs — **à vérifier en début sprint** via `SELECT con FROM pg_constraint WHERE conname LIKE '%bpf_funding%'`).
  2. `src/lib/validations/program.ts` `bpf_funding_type` `z.enum` remplace valeurs Zod legacy par valeurs DB.
  3. **À CONFIRMER POST-AUDIT A2** : si fichiers `training.ts` / `crm-quote*.ts` confirmés existants → alignement identique ; sinon AC retiré.
  4. `SELECT DISTINCT bpf_funding_type FROM programs` confirme UNIQUEMENT des valeurs DB (0 résidu legacy).
- **Files affected** :
  - `src/lib/types/bpf.ts` (nouveau fichier)
  - `src/lib/validations/program.ts` (modify)
  - autres fichiers validations (conditionnel post-A2)
- **Effort** : L (4-5j, +2j buffer si audit révèle complexité) — **Risk** : Moyen
- **Splitting potentiel** : si A2 révèle 3e table, split en E1-S02a (programs) + E1-S02b (autres).
- **Tests** : enums-consistency snapshot 18 valeurs ; integration program create/fetch.
- **DoD** : tsc clean, vitest pass, query DB legacy = 0.

### E1-S03 — BpfObjective enum unification (valeurs DB)

- **FR mapping** : FR-C-02
- **Persona** : admin
- **User story** : En tant qu'admin, je veux sélectionner n'importe quel objectif BPF (toutes les valeurs DB) et que l'insert réussisse sans CHECK constraint error.
- **Pre-conditions** : E1-S02 mergée (types/bpf.ts) ; OQ-8 et A2 résolues.
- **Acceptance criteria** :
  1. `src/lib/types/bpf.ts` étendu avec `BpfObjective` tuple `as const`. Valeurs documentées : `rncp_6_8, rncp_5, rncp_4, rncp_3, rncp_2, rncp_cqp, certification_rs, cqp_non_enregistre, autre_pro, bilan_competences, vae` (11 valeurs — **à vérifier en début sprint** via pg_constraint).
  2. `src/lib/validations/program.ts` `bpf_objective` `z.enum` remplace valeurs Zod legacy par valeurs DB.
  3. **À CONFIRMER POST-AUDIT A2** : alignement training.ts si confirmé existant.
  4. `SELECT DISTINCT bpf_objective FROM programs` = sous-ensemble des 11 valeurs DB.
- **Files affected** :
  - `src/lib/types/bpf.ts` (extend)
  - `src/lib/validations/program.ts` (modify)
- **Effort** : M (3-4j) — **Risk** : Moyen
- **Tests** : enums-consistency snapshot 11 valeurs ; integration.
- **DoD** : tsc clean, vitest pass.

### E1-S04 — Labels FR BPF + UI SelectItem alignment

- **FR mapping** : FR-C-02
- **Persona** : admin
- **User story** : En tant qu'admin, je veux lire des libellés FR clairs pour chaque type/objectif BPF (ex. "Apprentissage", "RNCP Niveau 6-8") plutôt que des identifiants techniques.
- **Pre-conditions** : E1-S02 + E1-S03 mergées ; OQ-8 (labels FR validés produit).
- **Acceptance criteria** :
  1. Nouveau fichier `src/lib/utils/bpf-labels.ts` exporte :
     - `BPF_FUNDING_TYPE_LABELS: Record<BpfFundingType, string>` (1 label FR par valeur, validé produit).
     - `BPF_OBJECTIVE_LABELS: Record<BpfObjective, string>` (1 label FR par valeur, validé produit).
  2. Toutes les `<SelectItem>` consommant `bpf_funding_type` ou `bpf_objective` utilisent ces constantes (zéro littéral hardcodé).
  3. Grep `funding\|objective` dans UI ne retourne que des références aux constantes.
- **Files affected** :
  - `src/lib/utils/bpf-labels.ts` (nouveau fichier)
  - Pages `programs/`, `trainings/`, `crm/` consommatrices (modify selon audit)
- **Effort** : S (1-2j) — **Risk** : Bas
- **Tests** : unit test : chaque clé enum a un label non-vide.
- **DoD** : labels validés produit, grep clean.

### E1-S05 — Test suite enums-consistency (CI gate)

- **FR mapping** : FR-C-01 + FR-C-02
- **Persona** : CI/dev
- **User story** : En tant qu'auto-test CI, je veux vérifier qu'aucune enum applicative ne diverge entre Zod, TS et DB CHECK afin de prévenir les mismatches avant merge.
- **Pre-conditions** : E1-S01 → E1-S04 mergées.
- **Acceptance criteria** :
  1. Nouveau fichier `src/lib/__tests__/enums-consistency.test.ts` couvre :
     - `CourseType` : N valeurs ordonnées alphabétiquement (N figé par A1).
     - `BpfFundingType` : 18 valeurs snapshot (post-A2).
     - `BpfObjective` : 11 valeurs snapshot (post-A2).
  2. Test vérifie : chaque enum value a un label FR correspondant dans `bpf-labels.ts`.
  3. Snapshot lock → toute modification déclenche revue PR explicite.
  4. Test intégré au pipeline CI (vitest pre-merge).
- **Files affected** : `src/lib/__tests__/enums-consistency.test.ts` (nouveau fichier)
- **Effort** : S (1j) — **Risk** : Bas
- **DoD** : vitest pass, snapshot stable, CI gate effectif.

### E1-S06 — Formation Duplicate helper + UI dropdown — ✅ DÉJÀ LIVRÉE (S0 audit A3)

> **Mise à jour post-S0 (2026-06-06)** : audit A3 a confirmé que cette story est **déjà livrée dans le code existant**. Aucun dev requis, seulement un smoke test admin.

- **FR mapping** : FR-C-03
- **Persona** : admin
- **Statut** : ✅ **DONE** (livrée pré-audit, à confirmer par smoke test)
- **État vérifié post-S0** :
  - Helper `duplicateSession(supabase, sessionId, entityId)` existe : `src/lib/services/sessions.ts:221`
  - UI bouton "Dupliquer" branché : `src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeActions.tsx`
  - Table cible : `sessions` ("formation" = alias UI pour ligne de sessions, confirmé par A3 — pas de table `formations` distincte)
  - **Note** : le dropdown ligne 318-324 du `page.tsx` cité dans l'audit initial ÉTAIT inerte, mais la fonctionnalité Dupliquer est déjà accessible via le tab Résumé (ResumeActions). Décider en smoke test si on veut AUSSI brancher le dropdown ou le retirer.
- **Action restante** : smoke test admin (5 min)
  1. Ouvrir une formation existante dans `/admin/formations/[id]`
  2. Cliquer "Dupliquer" depuis le tab Résumé (ResumeActions)
  3. Vérifier qu'une nouvelle formation est créée avec suffixe `(Copie)` et que la redirection fonctionne
  4. Décider : retirer le dropdown inerte OU le brancher sur le même handler (1h dev)
- **Effort restant** : 0j (déjà livré) ou 1h optionnel (cleanup dropdown)
- **Tests existants** : à vérifier dans `src/lib/services/__tests__/sessions.test.ts`

### E1-S07 — Formation Delete helper + confirmation dialog — ✅ DÉJÀ LIVRÉE (S0 audit A3)

> **Mise à jour post-S0 (2026-06-06)** : audit A3 a confirmé que cette story est **déjà livrée dans le code existant**.

- **FR mapping** : FR-C-03
- **Persona** : admin
- **Statut** : ✅ **DONE** (livrée pré-audit, à confirmer par smoke test)
- **État vérifié post-S0** :
  - Helper `deleteSession(supabase, sessionId, entityId)` existe : `src/lib/services/sessions.ts:266`
  - UI bouton "Supprimer" branché : `src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeDangerZone.tsx`
  - Confirmation dialog probablement intégrée à `ResumeDangerZone` (à vérifier en smoke test)
- **Action restante** : smoke test admin (5 min)
  1. Ouvrir une formation TEST dans `/admin/formations/[id]`
  2. Cliquer "Supprimer" depuis le tab Résumé > zone Danger
  3. Vérifier confirmation + delete + redirect `/admin/formations`
  4. Vérifier que la cascade FK fonctionne (apprenants, documents, émargements supprimés ou orphelinés selon ON DELETE)
  5. Décider : retirer le dropdown inerte OU le brancher (1h dev)
- **Effort restant** : 0j (déjà livré) ou 1h optionnel (cleanup dropdown)
- **Risk résiduel** : valider que le smoke test couvre les FK cascade comme prévu dans le PRD ; si gaps → créer une story patch dédiée.

### E1-S08 — TabAbsences refetch + error logging (INSERT + UPDATE)

- **FR mapping** : FR-C-04
- **Persona** : admin / trainer
- **User story** : En tant qu'admin, je veux valider ou modifier une absence et voir la table se mettre à jour immédiatement sans reload.
- **Pre-conditions** : Audit pré-impl localise mutations exactes (S0 mini-audit local).
- **Acceptance criteria** :
  1. **Mutation INSERT** (`src/app/(dashboard)/admin/formations/[id]/_components/TabAbsences.tsx` ~ligne 72) : suivie de `await refetch()`.
  2. **Mutation UPDATE** (`handleUpdateStatus` ~lignes 141-150) : suivie de `await refetch()`.
  3. Pour les 2 mutations : pattern obligatoire `console.error("[TabAbsences] <action> failed:", error)` + toast destructive + return ; aucun catch vide résiduel (grep).
  4. Toast succès distinct : "Absence créée" pour INSERT, "Absence mise à jour" pour UPDATE.
- **Files affected** : `src/app/(dashboard)/admin/formations/[id]/_components/TabAbsences.tsx` (modify)
- **Effort** : S (1j) — **Risk** : Bas
- **Tests** : unit mutation INSERT + refetch ; unit UPDATE + refetch ; integration insert + verify row visible.
- **DoD** : tsc clean, vitest pass, refresh observable sur les 2 actions.

### E1-S09 — TabDocsPartages refetch + error logging

- **FR mapping** : FR-C-04
- **Persona** : admin / trainer
- **User story** : En tant qu'admin, je veux partager un document et voir la table se mettre à jour sans reload.
- **Pre-conditions** : Audit pré-impl.
- **Acceptance criteria** :
  1. `src/app/(dashboard)/admin/formations/[id]/_components/TabDocsPartages.tsx` (lignes 109, 145 à confirmer) : mutation suivie de `await refetch()`.
  2. Même pattern erreur que E1-S08 (`console.error`+toast+return).
  3. Toast succès "Document partagé".
- **Files affected** : `src/app/(dashboard)/admin/formations/[id]/_components/TabDocsPartages.tsx` (modify)
- **Effort** : S (1j) — **Risk** : Bas
- **Tests** : unit + integration.
- **DoD** : tsc clean, vitest pass.

### E1-S10 — Historical scoring rétroactif (correction questionnaire transactionnelle)

- **FR mapping** : FR-C-05
- **Persona** : admin
- **User story** : En tant qu'admin, je veux corriger le scoring d'une question et que le score des répondants historiques soit recalculé automatiquement.
- **Pre-conditions** : **Audit A4 (S0) complété** — schéma réel questionnaires confirmé (table junction vs JSONB nested), existence route `/api/questionnaires/[id]/correct/` confirmée, existence table `audit_logs` confirmée (sinon escalade création infra).
- **Acceptance criteria** :
  1. **À CONFIRMER POST-AUDIT A4** : `src/lib/services/questionnaire-scoring.ts` (créer ou étendre) expose `recalculateAnswersOnQuestionScoreChange(questionnaireId, questionId, newScoring): Promise<{answersAffectedCount}>`.
  2. **À CONFIRMER POST-AUDIT A4** : modèle de données — soit recalcul sur table junction `questionnaire_answers`, soit recalcul sur JSONB nested dans `questionnaire_responses.answers`. Implémentation tranchée par A4.
  3. Recalcul transactionnel `SELECT ... FOR UPDATE` (sur questionnaire OU response selon A4) pour prévenir race.
  4. Update parent `questionnaire_responses.total_score` post-recalcul.
  5. **À CONFIRMER POST-AUDIT A4** : route API exacte. Si absente → story bloque + escalade création route.
  6. **À CONFIRMER POST-AUDIT A4** : audit log persisté `{questionnaire_id, corrector_id, timestamp, answers_affected_count, old_scoring, new_scoring}` dans table `audit_logs` (si absente → escalade création table dans story séparée).
  7. Learner dashboard reflète nouveau score (refetch ou subscription).
- **Files affected** :
  - `src/lib/services/questionnaire-scoring.ts` (create or extend)
  - route correction (path tranché par A4)
  - `src/lib/__tests__/questionnaire-scoring.test.ts` (create)
- **Effort** : M (3-4j, +1-2j buffer si A4 révèle infra manquante) — **Risk** : Moyen
- **Tests** : unit recalcul ; integration scoring change → total_score updated ; concurrency 2 corrections simultanées (no race).
- **DoD** : tsc clean, vitest pass, audit log présent, learner refresh observable.

---

## Epic 2 — Signaux de fin (archétype A)

**Objectif** : Donner un signal de fin à chaque opération asynchrone — bulk import, auto-fill, dialogs, reader, wizard, questionnaire learner.

### E2-S01 — BG function foundation (boucle learner creation)

- **FR mapping** : FR-A-01 (cœur BG)
- **Persona** : admin
- **User story** : En tant qu'admin, je veux que l'import en masse d'apprenants s'exécute en background avec idempotence et résultats persistés.
- **Pre-conditions** : **Audit A5 (S0) complété** — stub V1 actuel localisé exactement, flags actuels documentés, seuils actuels tranchés (20 ou 50, post-OQ-1). Migration `learner_bulk_import_jobs` en prod (vérifiée 06/06). Helpers `public.user_role()`, `public.user_entity_id()` existants.
- **Acceptance criteria** :
  1. **À CONFIRMER POST-AUDIT A5** : `netlify/functions/learners-bulk-create-background.mts` — remplacer stub V1 (lignes exactes confirmées par A5, draft mentionne lignes 11-15 mais review anti-hallu indique 113-136) par boucle réelle sur `jobPayload.learners`.
  2. **Sub-task E2-S01a — Idempotence** : check `learner_bulk_import_jobs.status` ; si `completed|failed` → return résultats existants ; si `running` → defer ; si `queued` → UPDATE running. Contrainte UNIQUE `(entity_id, idempotency_key)` exploitée.
  3. **Sub-task E2-S01b — Création learners** : pour chaque learner, appel helper `createLearnerWithCredentials` (E2-S02) ; cumul `created_count`, `error_count`, `results.learners[]`.
  4. **Sub-task E2-S01c — PDF credentials** : génération PDF → upload bucket `learner-credentials` → URL signée 24h stockée dans `learner_bulk_import_jobs.pdf_signed_url`.
  5. Mots de passe : RAM uniquement, JAMAIS persistés en DB/logs/results.
  6. Auth Bearer `CRON_SECRET` ; 401 si absent/invalide.
  7. Logs JSON structurés (timestamp, job_id, step, duration_ms).
  8. Timeout ≤ 15 min pour 100 learners (mesure dans logs).
- **Files affected** : `netlify/functions/learners-bulk-create-background.mts` (modify selon A5)
- **Effort** : L (4-5j, +2j buffer si debugging race conditions ou PDF timeout) — **Risk** : Haut
- **Tests** : import 10 inline ; relance same jobId → 0 doublon ; import 50 BG → results persistés.
- **DoD** : idempotence vérifiée, PDF signé, logs JSON, timeout respecté, 3 sub-tasks (a/b/c) cochées.

### E2-S02 — Helper `createLearnerWithCredentials` (service layer)

- **FR mapping** : FR-A-01 (support)
- **Persona** : dev
- **User story** : En tant que dev, je veux un helper partagé inline/BG pour créer un learner unique avec account Supabase et credentials.
- **Pre-conditions** : Aucune.
- **Design Notes** : Idempotence est gérée au niveau JOB (E2-S01), PAS au niveau helper. Helper suppose input frais ; idempotence check (via `idempotency_key` UNIQUE) est responsabilité du caller (route /start). Cette séparation permet à la BG function de retry whole job sans risque de doublons.
- **Acceptance criteria** :
  1. Nouveau fichier `src/lib/services/learner-bulk-create-backend.ts` exporte `createLearnerWithCredentials(admin, args): Promise<{success: boolean, learnerData?: LearnerRecord, errorMessage?: string}>`.
  2. Logique : valider email → générer password aléatoire (RAM) → INSERT `learners` avec `password_must_change=true` → INSERT `enrollments` status='pending'.
  3. Gestion erreurs : email duplicate → catch + errorMessage explicite ; FK invalides → errorMessage "Session invalide".
  4. Return JAMAIS le password (uniquement learnerData).
  5. Helper est consommé par E2-S03 (/start refactor) et E2-S01 (BG) ; orphelin jusqu'à intégration en E2-S03 (acceptable, livraison séquentielle).
- **Files affected** : `src/lib/services/learner-bulk-create-backend.ts` (nouveau fichier)
- **Effort** : M (2-3j) — **Risk** : Moyen
- **Tests** : 3+ cas unit (success, duplicate email, FK error).
- **DoD** : signature typée, password jamais retourné, tests passent.

### E2-S03 — Route `/start` refactor (seuils + BG dispatch + flag removal)

- **FR mapping** : FR-A-01 (route)
- **Persona** : admin
- **User story** : En tant qu'admin, je veux que la route `/start` route les imports ≤seuil en synchrone et seuil-100 vers la BG function automatiquement.
- **Pre-conditions** : **Audit A5 (S0) complété** — seuil décidé (20 ou 50 post-OQ-1) + flags identifiés. E2-S01 et E2-S02 mergées. `CRON_SECRET` en env Netlify.
- **Acceptance criteria** :
  1. `src/app/api/sessions/[id]/learners/bulk/start/route.ts` :
     - `INLINE_THRESHOLD` et `BG_MAX = 100` (valeurs explicites — `INLINE_THRESHOLD` à figer post-A5/OQ-1).
     - **À CONFIRMER POST-AUDIT A5** : tout flag legacy (`BG_NOT_READY_V1` ou équivalent) supprimé (grep = 0).
     - **À CONFIRMER POST-AUDIT A5** : toute référence numérique legacy (50 si l'on passe à 20, etc.) supprimée (grep = 0).
  2. Logique : auth admin → Zod → entity guard → replay protection (`idempotencyKey`) → INSERT job queued → routage :
     - N ≤ INLINE_THRESHOLD : inline (await helper en boucle) → PDF gen → status completed → 200 avec results + pdfSignedUrl.
     - INLINE_THRESHOLD < N ≤ 100 : `fetch('/.netlify/functions/learners-bulk-create-background', Authorization: Bearer CRON_SECRET)` → 200 avec jobId + pollUrl.
     - N > 100 : 400 "Volume > 100, contacter support".
  3. Fetch BG fail (5xx) → job reste 'queued', 200 avec error "BG dispatch failed".
- **Files affected** : `src/app/api/sessions/[id]/learners/bulk/start/route.ts` (modify)
- **Effort** : M (2-3j) — **Risk** : Moyen
- **Tests** : N=15 inline ; N=50 BG (ou inline selon seuil) ; N=150 → 400 ; missing CRON_SECRET → 500.
- **DoD** : grep legacy flags = 0, tests passent.

### E2-S04 — Route `/status` polling endpoint

- **FR mapping** : FR-A-01 (polling backend)
- **Persona** : admin
- **User story** : En tant qu'admin, je veux poller l'état d'un job d'import pour suivre la progression.
- **Pre-conditions** : Migration jobs en prod.
- **Acceptance criteria** :
  1. Nouveau fichier `src/app/api/sessions/[id]/learners/bulk/status/route.ts` (GET).
  2. Query : `SELECT * FROM learner_bulk_import_jobs WHERE id=jobId AND entity_id=activeEntityId`.
  3. Return : `{ok, job: {id, status, payload_count, results, pdf_signed_url, pdf_signed_url_expires_at, error_message, created_at, updated_at}}`.
  4. RLS application-level + DB.
- **Files affected** : `src/app/api/sessions/[id]/learners/bulk/status/route.ts` (nouveau fichier)
- **Effort** : S (1j) — **Risk** : Bas
- **Tests** : job found, job completed, cross-entity → 403.
- **DoD** : route accessible, RLS testée.

### E2-S05 — (Réservé / fusionné dans E2-S06)

*Note : numérotation conservée du draft Epic 2 pour traçabilité ; pas de story autonome.*

### E2-S06 — UI bulk-import polling page

- **FR mapping** : FR-A-01 (UI)
- **Persona** : admin
- **User story** : En tant qu'admin, je veux voir la progression et les résultats de l'import en masse depuis l'UI sans rafraîchir la page.
- **Pre-conditions** : **Audit A6 (S0) complété** — path UI confirmé (standalone vs intégré). E2-S03 + E2-S04 mergées.
- **Acceptance criteria** :
  1. **À CONFIRMER POST-AUDIT A6** : UI à path `src/app/(dashboard)/admin/sessions/[id]/bulk-import-learners/page.tsx` (standalone) OU section dans `sessions/[id]/page.tsx`. Form upload CSV/paste → POST `/start` → reçoit jobId.
  2. Polling `/status` toutes les 2s (useEffect + clearInterval at completed|failed).
  3. États UI : idle → submitted → queued → running → completed|failed.
  4. queued > 10s → bouton "Retenter" visible.
  5. Tableau résultats : Email, Username, ✓/✗, Error message.
  6. Lien PDF credentials (24h TTL).
  7. Toasts erreurs.
  8. **NFR-6 DoR (AC explicite)** : PR inclut visual diff screenshots 3 viewports (375px, 768px, 1440px) + state machine walkthrough + regression checklist 5 imports (10, 19, 20, 50, 100 learners).
  9. `aria-live="polite"` sur status text.
- **Files affected** : path tranché par A6 (modify ou create)
- **Effort** : M (2-3j) — **Risk** : Moyen
- **Tests** : inline 10 (<5s) ; BG 50 (<2min) ; timeout 10s ; PDF clickable.
- **DoD** : screenshots PR, aria-live OK, NFR-6 explicite.

### E2-S07 — TabPlanning auto-fill loading state

- **FR mapping** : FR-A-03
- **Persona** : admin
- **User story** : En tant qu'admin, je veux voir un spinner pendant l'auto-fill du planning afin d'éviter les doubles clics.
- **Pre-conditions** : Aucune.
- **Acceptance criteria** :
  1. `src/app/(dashboard)/admin/formations/[id]/_components/TabPlanning.tsx:325-376` (handleAutoFillModules) : state `autoFillLoading`.
  2. Try/catch + toast destructive + console.error structuré.
  3. Button disabled + `<Loader2 className="animate-spin" />` pendant async.
  4. `await refetchPlanning()` post-success.
- **Files affected** : `src/app/(dashboard)/admin/formations/[id]/_components/TabPlanning.tsx` (modify)
- **Effort** : S (1j) — **Risk** : Bas
- **DoD** : spinner observable <200ms, button disabled, table updated.

### E2-S08 — TabFinances dialogs setTimeout removal (state-driven)

- **FR mapping** : FR-A-04
- **Persona** : admin
- **User story** : En tant qu'admin, je veux que les dialogs Type:Société → Picker → Invoice s'enchaînent de façon déterministe sans timing fragile.
- **Pre-conditions** : Audit pré-impl complet du flow.
- **Acceptance criteria** :
  1. `src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx:170,389` : `setTimeout` supprimés (grep = 0).
  2. Orchestration via useEffect + dépendance `selectedClientId` → ouvre invoice dialog.
  3. Cancel picker → invoice dialog NE s'ouvre PAS.
  4. **Test manuel quantifié** : exécuter séquence dialog (Type Société → Company Picker → Invoice Dialog) 10 fois consécutives ; 0 erreur console, 0 délai >2s entre ouvertures de dialogs, 0 chevauchement de dialogs. Les 10 itérations passent sans assertion échouée.
  5. Screenshots avant/après dans PR.
- **Files affected** : `src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx` (modify)
- **Effort** : M (2-3j) — **Risk** : Moyen
- **DoD** : grep setTimeout = 0, screenshots PR, 10/10 itérations OK.

### E2-S09 — E-Learning reader loading skeleton (changement chapitre)

- **FR mapping** : FR-A-05
- **Persona** : learner
- **User story** : En tant qu'apprenant, je veux voir un skeleton lors du changement de chapitre afin d'avoir un feedback immédiat.
- **Pre-conditions** : Aucune.
- **Acceptance criteria** :
  1. `src/app/(dashboard)/learner/courses/[courseId]/page.tsx` (~1523 LOC) : state `isLoadingChapter`.
  2. **Skeleton timing clarifié** : sur clic navigation chapitre, skeleton Shadcn affiché dans les **<100ms** (time-to-visual feedback). Skeleton reste visible jusqu'à réception réponse fetch + render contenu. Si fetch <200ms, skeleton peut apparaître/disparaître rapidement mais transition d'état est observable (pas de "flash" invisible).
  3. Try/catch + toast + bouton "Recharger" en cas d'erreur fetch.
  4. **NFR-6 DoR (AC explicite)** : PR inclut visual diff 3 viewports + state machine documentée + regression checklist 5 chapitres.
  5. `aria-live="polite"` sur zone de contenu.
- **Files affected** : `src/app/(dashboard)/learner/courses/[courseId]/page.tsx` (modify)
- **Effort** : M (2-3j) — **Risk** : Moyen (composant >1000 LOC)
- **DoD** : skeleton observable, screenshots 3 viewports PR, aria-live polite.

### E2-S10 — E-Learning wizard step indicator (7 étapes)

- **FR mapping** : FR-A-06
- **Persona** : admin
- **User story** : En tant qu'admin, je veux voir un indicateur d'étapes (3/7) dans le wizard de création E-Learning afin de me repérer.
- **Pre-conditions** : **E1-S01 PR mergée à main + regression Lighthouse <2% delta perf**. Dépendance hard pour cohérence enum CourseType utilisé dans le wizard.
- **Acceptance criteria** :
  1. `src/app/(dashboard)/admin/elearning/create/page.tsx` (~1284 LOC) : `WIZARD_STEPS` (7 étapes nommées) + state `currentStep`.
  2. Step indicator visible avec étape courante highlightée + "Step X/7".
  3. Boutons Précédent/Suivant avec validation Zod par étape (toast erreur si invalide).
  4. Dernière étape : bouton "Publier".
  5. **NFR-6 DoR (AC explicite)** : PR inclut visual diff 3 viewports + state walkthrough + checklist 7 étapes.
  6. `aria-current="step"` sur étape courante.
- **Files affected** : `src/app/(dashboard)/admin/elearning/create/page.tsx` (modify)
- **Effort** : S-M (2-3j) — **Risk** : Moyen
- **DoD** : indicateur visible 7 étapes, navigation validée, screenshots PR.

### E2-S11 — Questionnaire learner draft auto-save (localStorage)

- **FR mapping** : FR-A-07
- **Persona** : learner
- **User story** : En tant qu'apprenant, je veux que mes réponses partielles soient auto-sauvegardées afin de ne pas tout perdre en cas de fermeture accidentelle.
- **Pre-conditions** : Aucune.
- **Acceptance criteria** :
  1. `src/app/(dashboard)/learner/questionnaires/[id]/page.tsx` : clé `questionnaire_${id}_draft_${profileId}` + debounce 500ms.
  2. Restauration au mount avec toast "Brouillon restauré".
  3. Cross-tab : si déjà soumis (check API) → clear draft + toast "Réponse soumise via un autre onglet".
  4. `beforeunload` warning si dirty && !submitted.
  5. Cleanup localStorage post-submit.
  6. JAMAIS de mots de passe ou données sensibles persistés.
- **Files affected** : `src/app/(dashboard)/learner/questionnaires/[id]/page.tsx` (modify)
- **Effort** : M (2-3j) — **Risk** : Bas
- **Tests** : (a) fill+close+reopen → restored ; (b) submit → cleared ; (c) 2 tabs cross-detect ; (d) beforeunload warning.
- **DoD** : 4 scénarios passent, pas de password en storage.

### E2-S12 — Questionnaire public draft auto-save (variant anonyme)

- **FR mapping** : FR-A-07 (variant)
- **Persona** : learner public (non-loggé)
- **User story** : En tant qu'utilisateur public répondant à un questionnaire via token, je veux que mes réponses soient auto-sauvegardées.
- **Pre-conditions** : E2-S11 mergée.
- **Acceptance criteria** :
  1. `src/app/questionnaire/[token]/page.tsx` : clé `questionnaire_${id}_draft_anonymous`.
  2. Restauration localStorage sans API check.
  3. beforeunload + cleanup post-submit identiques à E2-S11.
- **Files affected** : `src/app/questionnaire/[token]/page.tsx` (modify)
- **Effort** : S (1j) — **Risk** : Bas
- **DoD** : restore observable, beforeunload OK.

### E2-S13 — Tests E2E intégration Epic 2

- **FR mapping** : FR-A-01 + FR-A-03 → FR-A-07
- **Persona** : CI / QA
- **User story** : En tant que CI, je veux valider end-to-end les 6 scénarios FR-A afin de prévenir les régressions.
- **Pre-conditions** : E2-S01 → E2-S12 mergées.
- **Acceptance criteria** :
  1. Nouveau fichier `e2e/epic-2-integration.spec.ts` (Playwright) couvre 6 scénarios :
     - Bulk import 20 learners + polling + PDF.
     - Auto-fill planning + spinner.
     - TabFinances dialogs séquence déterministe.
     - Reader chapter navigation + skeleton.
     - Questionnaire draft auto-save + restore + beforeunload.
     - Wizard 7 étapes + publish.
  2. No console errors, no unhandled rejections.
  3. **Performance assertions quantifiées** :
     - polling `/status` complète <2000ms (cold network)
     - skeleton rendu <200ms (time-to-visual)
     - localStorage debounce déclenche dans 450-550ms (±50ms tolerance pour React batching)
     - E2E assertions log timings réels pour regression tracking.
- **Files affected** : `e2e/epic-2-integration.spec.ts` (nouveau fichier)
- **Effort** : M (2-3j) — **Risk** : Bas
- **DoD** : 6 scénarios verts, intégré au pipeline.

---

## Epic 3 — Limites silencieuses (archétype B)

**Objectif** : Remplacer pagination client par pagination serveur + introduire confirmation explicite sur batch ops.

### E3-S01 — Helper pagination serveur partagé

- **FR mapping** : FR-B-01 + FR-B-02
- **Persona** : dev
- **User story** : En tant que dev, je veux un helper réutilisable pour paginer côté serveur sur Supabase avec filters et count exact.
- **Pre-conditions** : Aucune.
- **Acceptance criteria** :
  1. Nouveau fichier `src/lib/services/pagination.ts` exporte `fetchPaginatedData<T>(client, tableName, {filters, pageSize, offset, countExact})`.
  2. Return `{ data: T[], totalCount: number, hasMore: boolean }`.
  3. Respecte RLS + filtre `entity_id` systématique.
  4. Support filters : `ilike` search, enum (status, course_type), date range.
  5. `count: 'exact'` (option `'estimated'` si volume >10k).
  6. JSDoc + 3+ tests unit (0 résultat, 1 page, multipage).
  7. Generic-typé pour fonctionner sur `elearning_courses` et `programs` (validé en E3-S02/S03).
- **Files affected** : `src/lib/services/pagination.ts` (nouveau fichier)
- **Effort** : S (1-2j) — **Risk** : Bas
- **DoD** : tests passent, typage générique OK.

### E3-S02 — Hub E-Learning pagination serveur

- **FR mapping** : FR-B-01
- **Persona** : admin
- **User story** : En tant qu'admin, je veux que le hub E-Learning soit paginé serveur pour éviter le freeze UX >100 cours.
- **Pre-conditions** : **Tous PRs Epic 1 mergés à main + main stable 24h**. **Audit A7 (S0) complété** — lignes exactes `.slice(` confirmées. OQ-2 (volumes) et OQ-6 (indexes DB) résolues.
- **Acceptance criteria** :
  1. `src/app/(dashboard)/admin/elearning/page.tsx` : remplace pagination client (`.slice()` aux lignes confirmées par A7) par `fetchPaginatedData`.
  2. 50 cours/page, filters serveur : `search` (ilike), `status`, `course_type` (depuis FR-C-01 / E1-S01).
  3. Navigation Prev/Next sans page reload ; URL params reflètent état (`?page=2&search=...`).
  4. Lighthouse Performance ≥80, TTI <2s sur seed 200 courses.
  5. `EXPLAIN ANALYZE` confirme usage index (pas de seq scan).
  6. Grep `.slice(` sur la page = 0.
  7. **NFR-6 DoR (AC explicite)** : PR inclut visual diff 3 viewports + state machine pagination + regression checklist.
- **Files affected** : `src/app/(dashboard)/admin/elearning/page.tsx` (modify), `src/lib/services/pagination.ts` (consume)
- **Effort** : M (2-3j) — **Risk** : Moyen
- **DoD** : tests e2e seed 200, Lighthouse ≥80, EXPLAIN ANALYZE OK, NFR-6 explicite.

### E3-S03 — Hub Programmes pagination serveur

- **FR mapping** : FR-B-02
- **Persona** : admin
- **User story** : En tant qu'admin, je veux que le hub Programmes soit paginé serveur pour navigation fluide >100 programmes.
- **Pre-conditions** : **Tous PRs Epic 1 mergés à main + main stable 24h**. Audit A7 complété. OQ-2/OQ-6 résolues.
- **Acceptance criteria** :
  1. `src/app/(dashboard)/admin/programs/page.tsx` : pattern identique E3-S02.
  2. Filters : search, status, optionnel `bpf_funding_type` (depuis FR-C-02 / E1-S02).
  3. Grep `.slice(` sur la page = 0.
  4. Lighthouse ≥80, TTI <2s sur seed 200.
- **Files affected** : `src/app/(dashboard)/admin/programs/page.tsx` (modify)
- **Effort** : M (2j) — **Risk** : Bas (pattern réutilisé)
- **DoD** : idem E3-S02.

### E3-S04 — TabConventionDocs batch ops audit d'état

- **FR mapping** : FR-B-03 (préparation)
- **Persona** : dev
- **User story** : En tant que dev, je veux auditer les batch operations existantes pour spécifier précisément les scopes et preconditions avant d'ajouter les dialogs.
- **Pre-conditions** : Aucune.
- **Acceptance criteria** :
  1. Lecture intégrale `src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx` (~2219 LOC).
  2. Document `bmad_output/planning-artifacts/E3-S04-batch-ops-audit.md` (artifact planning hors code git, convention `bmad_output/` confirmée par projet) liste 3+ batch ops : génération PDF en masse, envoi email en masse, lancement signature en masse.
  3. Pour chaque : lignes de code, déclencheur, preconditions, scope (count documents/formations/learners), mode d'échec (atomic vs partial), refetch présent ou non.
  4. Open Questions listées (ex. cancel en vol ?).
- **Files affected** : `bmad_output/planning-artifacts/E3-S04-batch-ops-audit.md` (nouveau, non commité dans code)
- **Effort** : S (1j) — **Risk** : Bas
- **DoD** : document complet, 3+ batch ops cartographiées.

### E3-S05 — Batch ops confirmation dialog (UI)

- **FR mapping** : FR-B-03 (UI)
- **Persona** : admin
- **User story** : En tant qu'admin, je veux confirmer explicitement le scope d'une batch operation avant exécution.
- **Pre-conditions** : E3-S04 mergée.
- **Acceptance criteria** :
  1. Nouveau composant `src/app/(dashboard)/admin/formations/[id]/_components/BatchOpsConfirmDialog.tsx` (réutilisable).
  2. Affiche : titre opération, count documents/formations impactées, mode d'échec, boutons Confirmer/Annuler.
  3. Intégré aux 3+ batch ops identifiées en E3-S04.
  4. Cancel → ferme sans side effect.
  5. Toast post-action avec counts succès/échec.
- **Files affected** :
  - `src/app/(dashboard)/admin/formations/[id]/_components/BatchOpsConfirmDialog.tsx` (nouveau fichier)
  - `src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx` (modify)
- **Effort** : M (2j) — **Risk** : Bas
- **DoD** : dialog réutilisable, intégration 3+ points.

### E3-S06 — Batch ops handlers + refetch

- **FR mapping** : FR-B-03 (handlers)
- **Persona** : admin
- **User story** : En tant qu'admin, je veux que les résultats des batch operations se reflètent immédiatement dans l'UI sans reload.
- **Pre-conditions** : E3-S04 + E3-S05 mergées.
- **Acceptance criteria** :
  1. Service formations étendu avec helpers batch (`batchGenerateConventionPDFs`, `batchSendEmails`, `batchLaunchSignatures` selon audit E3-S04).
  2. Chaque handler suit le pattern : loading state → try/catch → toast résumé (X succès, Y erreurs) → `await refetch()` (preserve filters) → console.error structuré sur erreur.
  3. Erreurs partielles : log détaillé par item.
  4. **Test intégration quantifié** : batch op déclenchée sur 10 documents, polling /status retourne count mis à jour. Table refetch observable **<2000ms** post-completion backend, avec indicateur visuel (toast + row highlight fade-out). Count succès/échec matche audit log backend.
- **Files affected** :
  - `src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx` (modify)
  - service formation (extend)
- **Effort** : M-L (3-4j) — **Risk** : Moyen
- **DoD** : 3+ handlers actifs, refetch <2000ms confirmé, toasts informatifs.

---

## Dépendances inter-stories

| Story | Bloquée par | Bloque |
|-------|-------------|--------|
| **S0 audits** | OQ-7, OQ-8 | toutes stories E1 + E2-S01/S03/S06 + E3-S02/S03 |
| E1-S01 | A1 (S0) | E1-S05, E2-S10, E3-S02 |
| E1-S02 | A2, OQ-8 | E1-S03, E1-S04, E1-S05, E3-S03 |
| E1-S03 | E1-S02 | E1-S04, E1-S05 |
| E1-S04 | E1-S02, E1-S03 | E1-S05 |
| E1-S05 | E1-S01 → E1-S04 | — |
| E1-S06 | A3 (S0) | E1-S07 |
| E1-S07 | E1-S06 | — |
| E1-S08 | — | — |
| E1-S09 | — | — |
| E1-S10 | A4 (S0) | — |
| E2-S01 | A5 (S0), Migration jobs prod | E2-S03 |
| E2-S02 | — | E2-S03 |
| E2-S03 | E2-S01, E2-S02, A5 | E2-S06 |
| E2-S04 | — | E2-S06 |
| E2-S06 | E2-S03, E2-S04, A6 (S0) | E2-S13 |
| E2-S07 | — | E2-S13 |
| E2-S08 | — | E2-S13 |
| E2-S09 | — | E2-S13 |
| E2-S10 | **E1-S01 mergé main + Lighthouse <2% delta** | E2-S13 |
| E2-S11 | — | E2-S12, E2-S13 |
| E2-S12 | E2-S11 | E2-S13 |
| E2-S13 | E2-S01 → E2-S12 | — |
| E3-S01 | — | E3-S02, E3-S03 |
| E3-S02 | **Epic 1 entièrement mergé + main stable 24h**, A7, E3-S01, OQ-2, OQ-6 | — |
| E3-S03 | **Epic 1 entièrement mergé + main stable 24h**, A7, E3-S01, OQ-2, OQ-6 | — |
| E3-S04 | — | E3-S05, E3-S06 |
| E3-S05 | E3-S04 | E3-S06 |
| E3-S06 | E3-S04, E3-S05 | — |

---

## Sprint planning (timeline indicative, 1 dev solo, séquentiel)

| Sprint | Semaine | Stories | Objectif principal | Effort |
|--------|---------|---------|-------------------|--------|
| **S0** | Semaine 0 (0.5 sem) | 7 audits A1-A7 + résolution OQ-7/8/9 | Codebase audit + OQ → débloque Epic 1 | 2-3j |
| **S1** | Semaine 1 | E1-S01, E1-S02 (démarrage), E1-S08, E1-S09 | Enums CourseType + BPF funding (kickoff) + mutations refetch indépendantes | S+L+S+S |
| **S2** | Semaine 2 | E1-S02 (suite), E1-S03, E1-S04, E1-S05 | BPF funding (fin) + objective + labels FR + tests CI | L+M+S+S |
| **S3** | Semaine 3 | ~~E1-S06, E1-S07~~ (livrées hors-sprint, smoke test seul) + E1-S10 | Scoring rétroactif uniquement + buffer | M (+ smoke test 10 min Dupliquer/Supprimer) |
| **Buffer A** | Semaine 3.5 | (PR reviews + regression tests Epic 1) | Main stabilisé pré-Epic 2 | 2-3j |
| **S4** | Semaine 4 | E2-S02, E2-S01, E2-S04 | Helper + BG function (3 sub-tasks a/b/c) + status endpoint | M+L+S |
| **S5** | Semaine 5 | E2-S03, E2-S06 | Route /start refactor + UI polling | M+M |
| **S6** | Semaine 6 | E2-S07, E2-S08, E2-S10, E2-S11 | Spinner planning + setTimeout finances + wizard + draft questionnaire | S+M+S-M+M |
| **S7** | Semaine 7 | E2-S09, E2-S12, E2-S13, E3-S01, E3-S04 | Reader skeleton + questionnaire public + E2E + helper pagination + audit batch | M+S+M+S+S |
| **Buffer B** | Semaine 7.5 | (PR reviews + integration audit Epic 2) | Main stabilisé pré-Epic 3 | 2j |
| **S8** | Semaine 8 | E3-S02, E3-S03, E3-S05, E3-S06 | Hubs paginés + batch ops dialogs/handlers | M+M+M+M-L |
| **S9** | Semaine 9 | (Tests finaux + hotfixes éventuels) | Validation produit complète | buffer |

**Notes** :
- S0 obligatoire : 7 audits codebase + 3 OQ. Sans cela, plusieurs stories Epic 1 référencent des fichiers/tables/lignes inventés (cf. review anti-hallu).
- Buffer A (semaine 3.5) et Buffer B (semaine 7.5) : intégration des recommandations review completeness — 1-2j PR review + regression.
- Cross-epic gates explicites : E2-S10 ne démarre QUE si E1-S01 mergé sur main + Lighthouse <2% delta. E3-S02/S03 ne démarrent QUE si tous PRs Epic 1 mergés + main stable 24h minimum.

---

## Open Questions à résoudre avant kickoff

| OQ | Sujet | Deadline | Owner | Escalation |
|----|-------|----------|-------|-----------|
| **OQ-7** | Dates vacances Wissam (impact sequencing sprints) | **immédiat (fin journée)** | Wissam | Si vacance >1 sem en S0-S2 : HANDOFF.md préparé, resequencing E1-S08/S09 d'abord (indépendantes), E1-S02/S03 différés post-vacance |
| **OQ-8** | Mapping Zod legacy → DB pour BPF funding_type et bpf_objective ; labels FR validés produit | pré-S1 | Wissam + produit | Si délai >5j : split E1-S02/S03 sur 2 sprints |
| **OQ-9** | Fusionné dans audit A2 (S0) — voir Sprint S0 ci-dessus | S0 | dev | — |
| **OQ-1** | Volume max bulk import en prod (impact INLINE_THRESHOLD final 20 ou 50) | **pré-S4** (mesure préliminaire) puis post-Epic 2 pour ajustement | Wissam | Default 20 si pas de données ; ajustable post-déploiement |
| **OQ-2** | Volumes pagination réels (profils/entity, cours/entity, programmes/entity) | pré-S8 | Wissam | Default seed 200 si pas mesuré |
| **OQ-3** | Timing RLS V2/V3 (helpers `public.user_role()` à migrer vers `auth.*`) | avant fin Epic 1 (S3) | dev | Non-bloquant Epic 1-3 |
| **OQ-6** | Index DB `(entity_id, status, created_at DESC)` sur `elearning_courses` et `programs` | pré-S8 | dev | Migration créée fin Epic 2 si pas avant |

---

## Reviews adversariales

### Synthèse verdicts

| Review | Verdict | Issues identifiées |
|--------|---------|--------------------|
| Review 1 — Completeness & Executability | **minor-tweaks** | 5 major + 4 minor + 2 nit |
| Review 2 — Anti-hallucination | **major-rework** | 4 blockers + 6 major + 2 minor |

### Items résolus dans cette version finale

**Anti-hallucination (4 blockers → résolus via S0 audits)** :
- **CourseType mismatch (E1-S01)** : AC #1 réécrite "à confirmer post-audit A1" ; ajout pre-condition explicite "Audit A1 complété".
- **Phantom files training.ts/crm-quote*.ts (E1-S02/S03)** : AC #3 marquée conditionnelle "À CONFIRMER POST-AUDIT A2" ; si A2 confirme absence → AC retirée.
- **Service formations.ts inexistant (E1-S06/S07)** : AC réécrite "service cible tranché par A3" — peut être nouveau fichier OU extension `sessions.ts`.
- **Tables questionnaire_answers inexistantes (E1-S10)** : AC #1/#2/#5/#6 réécrites "À CONFIRMER POST-AUDIT A4" — modèle JSONB nested vs junction table tranché par A4.

**Anti-hallucination (6 majors → résolus)** :
- **BG function stub depth (E2-S01)** : ligne exacte du stub "à confirmer post-A5" ; sub-tasks E2-S01a/b/c ajoutées pour structurer l'effort.
- **Helper orphelin (E2-S02)** : Design Notes ajoutées clarifiant que le helper est consommé en E2-S03/S01, orphelin temporaire acceptable.
- **Threshold 20 vs 50 (E2-S03)** : décision déplacée en audit A5 + OQ-1 ; valeurs "à confirmer post-audit".
- **UI bulk-import path (E2-S06)** : audit A6 dédié ; path final tranché par audit.
- **Pagination line refs (E3-S02/S03)** : lignes exactes "à confirmer post-audit A7".
- **TabAbsences mutations (E1-S08)** : split clarifié INSERT (l.72) + UPDATE (l.141-150) avec refetch pour les 2.

**Completeness (5 majors → résolus)** :
- **E1-S02 effort risk** : split potentiel E1-S02a/S02b mentionné si A2 révèle 3e table ; buffer +2j ajouté.
- **E2-S01 effort optimism** : sub-tasks E2-S01a/b/c décomposées ; buffer +2j ajouté.
- **NFR-6 DoR ambiguity** : NFR-6 promu en AC explicite pour E2-S06, E2-S09, E2-S10, E3-S02 (Option A retenue : traçabilité par story).
- **Cross-epic merge gates** : gates explicites ajoutés dans tableau dépendances (E2-S10 blocked until E1-S01 mergé main + Lighthouse <2% ; E3-S02/S03 blocked until Epic 1 mergé + main stable 24h).
- **OQ-7 escalation** : deadline avancée à "immédiat" ; contingency plan documenté (HANDOFF.md + resequencing).

**Completeness (4 minors → résolus)** :
- **E1-S07 return type** : type `FormationCascadeImpact` explicitement défini en AC #1.
- **E2-S08 flakiness threshold** : AC #4 réécrite "10 itérations sans erreur console, 0 délai >2s, 0 chevauchement".
- **E2-S09 skeleton timing** : AC #2 clarifiée — skeleton visible <100ms time-to-feedback ; reste visible jusqu'à fetch complete.
- **E2-S13 performance tolerance** : AC #3 réécrite avec ±50ms tolerance debounce ; assertions logged.
- **E3-S06 "observable" threshold** : AC #4 réécrite "table refetch <2000ms post-completion + indicateur visuel".

**Completeness (2 nits → résolus)** :
- **E2-S02 negative AC** : converti en Design Notes positifs (responsabilité idempotence au job-level).
- **Timeline buffer** : passé de 7-8 sem à 8.5-9 sem avec Buffers A (S3.5) et B (S7.5) explicites + S9 buffer final.

### Items reportés à OQ ou audit S0

| Item original | Reporté vers | Rationale |
|---------------|--------------|-----------|
| CourseType 3 ou 4 valeurs | Audit A1 | Décision Wissam + produit nécessaire |
| Existence training.ts/crm-quote*.ts | Audit A2 | Grep simple à exécuter dev |
| Service formations vs sessions | Audit A3 | Architecture clarification |
| Schéma questionnaire_answers | Audit A4 | DB schema dump nécessaire |
| Stub BG lignes exactes | Audit A5 | Read fichier nécessaire |
| Path UI bulk-import | Audit A6 | Find filesystem |
| Lignes pagination .slice() | Audit A7 | Read fichiers nécessaire |
| INLINE_THRESHOLD final | OQ-1 + A5 | Décision produit + audit |
| Labels FR BPF | OQ-8 | Décision produit |
| Index DB | OQ-6 | Migration séparée |

### Verdict final post-corrections

**Ship-ready avec S0 obligatoire** : les 4 blockers anti-hallu sont neutralisés par transformation en audits S0 + AC conditionnelles "à confirmer post-audit". Les majors completeness sont intégrées (NFR-6 AC explicites, gates merge cross-epic, sub-tasks E2-S01, buffers timeline). Document désormais exécutable sous réserve de Sprint S0 réalisé.

---