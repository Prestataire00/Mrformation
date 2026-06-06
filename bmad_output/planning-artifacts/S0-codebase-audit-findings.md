---
date: 2026-06-06
sprint: S0
type: codebase-audit
status: complete
auditCount: 7
adversarialReview: ship-it (0 blocker, 0 major, 3 nits intégrés)
prerequisiteFor: [Epic 1, Epic 2, Epic 3]
relatedDocs:
  - bmad_output/planning-artifacts/prd.md
  - bmad_output/planning-artifacts/epics-stories.md
---

# Sprint S0 — Findings audit codebase (LMS UX/articulation)

## Vue d'ensemble

| Audit | Bloque | Verdict |
|-------|--------|---------|
| A1 — CourseType source-of-truth | E1-S01 | clear (décision actionnable) |
| A2 — Validations BPF trainings + crm_quotes | E1-S02, E1-S03 | clear (absence confirmée, à créer) |
| A3 — formations vs sessions | E1-S06, E1-S07 | clear (stories déjà livrées) |
| A4 — Schéma questionnaires (scoring rétroactif) | E1-S10 | clear (architecture actionnable) |
| A5 — Bulk start route et BG function | E2-S03, E2-S04 | clear (stub identifié) |
| A6 — UI bulk-import path | E2-S05 | clear (lignes à modifier identifiées) |
| A7 — Pagination hubs | E3-S01, E3-S02, E3-S03 | clear (helper à créer) |

7 audits clear. 0 blocker. 2 OQ résiduelles (vacances scolaires, mapping BPF prospects).

---

## A1 — CourseType source-of-truth

### Constat
Désalignement entre validation Zod (4 valeurs) et DB+UI (3 valeurs).

### État Zod
`src/lib/validations/elearning.ts:69-74`
```typescript
export const elearningCourseTypeEnum = z.enum([
  "presentation_quiz",
  "presentation_quiz_flashcard",
  "quiz",
  "flashcards",
]);
```
**4 valeurs hallucinées vs 3 valeurs DB.**

### État UI
`src/app/(dashboard)/admin/elearning/create/page.tsx:36`
```typescript
type CourseType = "presentation" | "quiz" | "complete";
```
Usages : lignes 143 (state), 200 (condition gammaThemes), 344 (POST API), 632/959 (selection handlers), 706/735/1033/1062/1184/1187 (conditional rendering).

### État DB
Vérifié 06/06 sur Supabase prod : 3 valeurs canoniques `['presentation', 'quiz', 'complete']`.

### État types/
- `src/lib/types/elearning.ts` : existe (fichier de types e-learning, ≥ 30 types exportés) mais **ne contient pas** `CourseType`.
- `src/lib/types/bpf.ts` : **n'existe pas** (à créer en E1-S02).

### Décision E1-S01
**Source de vérité : DB** (3 valeurs : `presentation`, `quiz`, `complete`).

Actions :
1. **Supprimer** `elearningCourseTypeEnum` (validations/elearning.ts:69-74) et le remplacer par un enum à 3 valeurs alignées DB.
2. **Créer** `export type CourseType = "presentation" | "quiz" | "complete";` dans `src/lib/types/elearning.ts`.
3. **Importer** `CourseType` depuis `types/elearning` dans `create/page.tsx` (remplacer déclaration inline ligne 36).
4. **Propager** l'import dans tous les composants conditionnant le rendu sur `courseType`.

---

## A2 — Validations BPF trainings + crm_quotes

### Inventaire `src/lib/validations/`
- `index.ts` — schemas génériques (clients, trainers, trainings, sessions, users, prospects, quotes)
- `program.ts` — BPF présent
- `crm-suivi.ts`, `crm-tasks.ts`, `trainer.ts`, `elearning.ts` — aucun BPF

### Présence `bpf_funding_type`
- **program.ts:116-131** présent (enum 9 valeurs : opco, entreprise, particulier, pole_emploi, cpf, region, etat, fne, autre)
- **trainings** : absent (validations/index.ts:85-96 `createTrainingSchema` minimaliste)
- **crm_quotes** : absent (validations/index.ts:144-154 `createQuoteSchema` minimaliste)

### Présence `bpf_objective`
- **program.ts:99-115** présent (enum 10 valeurs : professionnalisation, qualification, validation_acquis, bilan_competences, creation_entreprise, perfectionnement, actualisation, adaptation_poste, remise_a_niveau, decouverte)
- **trainings** : absent
- **crm_quotes** : absent

### Routes API actuelles
- `src/app/api/trainings/route.ts:131` — POST utilise `createTrainingSchema` (générique, sans BPF)
- `src/app/api/crm/quotes/route.ts:151` — POST utilise `createQuoteSchema` (générique, sans BPF)

### Décision E1-S02 / E1-S03
**Absence critique confirmée**. Aucun fichier dédié `trainings.ts` ou `quote.ts` en `src/lib/validations/`. Les deux routes utilisent des validations génériques sans BPF.

Actions :
1. **E1-S02** : créer `src/lib/validations/trainings.ts` aligné sur les enums DB (à confirmer 18/11 valeurs DB vs 9/10 actuelles dans program.ts → OQ-8).
2. **E1-S03** : créer `src/lib/validations/crm-quotes.ts` (pattern crm-tasks.ts).
3. **Brancher** ces validations dans `api/trainings/route.ts` et `api/crm/quotes/route.ts`.
4. **Pattern** : garder `index.ts` pour génériques (clients, users, prospects, sessions), scinder métier vers fichiers dédiés.

---

## A3 — formations vs sessions (table targeting)

### Schéma DB
- Table `formations` : **n'existe pas**.
- Table `sessions` : existe (`supabase/schema.sql:183`).

### Usage côté app
- `src/app/(dashboard)/admin/formations/` utilise `.from('sessions')` partout.
- Confirmé `formations/[id]/page.tsx:79` et `:166`.
- "formation" est un alias UI pour une ligne de la table `sessions`.

### Services existants
- `src/lib/services/formations.ts` : **absent**.
- `src/lib/services/sessions.ts` : existe, expose :
  - `duplicateSession(supabase, sessionId, entityId)` ligne 221
  - `deleteSession(supabase, sessionId, entityId)` ligne 266
  - `updateSessionField(supabase, sessionId, entityId, fields)` utilisé par `ResumeActions.tsx:43-45`

### État UI (déjà intégrée)
- `formations/[id]/_components/sections/ResumeActions.tsx` — bouton "Dupliquer" branché.
- `formations/[id]/_components/sections/ResumeDangerZone.tsx` — bouton "Supprimer" branché.

### Décision E1-S06 / E1-S07
**Stories déjà livrées dans le code existant.** Helpers `duplicateSession()` et `deleteSession()` présents, UI branchée, table cible `sessions`.

Action E1-S06 / E1-S07 : **vérifier la livraison réelle** (smoke test admin) puis basculer les stories en "done" sans développement supplémentaire. Mettre à jour epics-stories.md pour refléter le statut livré.

---

## A4 — Schéma questionnaires (scoring rétroactif)

### Tables DB
**questionnaires** (`schema.sql:243-251`) : id, entity_id, title, description, type CHECK('satisfaction','evaluation','survey'), is_active, created_at.

**questions** (`schema.sql:256-264` initial 4 types : `rating`, `text`, `multiple_choice`, `yes_no` ; étendu à 5 types via migration `add_program_objectives_question_type.sql` qui ajoute `program_objectives`) : id, questionnaire_id, text, type, **options JSONB** (contient `{correct_answer, choices[], options[]}`), order_index, is_required.

**questionnaire_responses** (`schema.sql:280-287` + `add_admin_questionnaire_fill.sql`) : id, questionnaire_id, session_id, learner_id, **responses JSONB** (flat dict `{ question_id: answer_value }`), submitted_at, filled_by_admin, filled_by_admin_at, fill_mode, admin_notes.
**Absence** : pas de colonnes `score`, `is_finalized`, `rescored_at`.

**questionnaire_sessions** (`schema.sql:269-275`) : questionnaire_id, session_id (composite PK), auto_send_on_completion.

### Route rescore
**Absente.** Routes existantes :
- POST `/api/admin/questionnaires/fill-for-learner` — insert/update par admin
- POST `/api/questionnaire/public-submit` — submit via token public
- POST `/api/questionnaires/auto-send` — relance

### Audit log
`activity_log` (`schema.sql:458-467`) — structure idéale pour traçabilité scoring : `action='questionnaire_rescore'`, `resource_type='questionnaire_response'`, `details JSONB={ old_score, new_score, rescored_by, rescored_at }`.

### Service scoring existant
`src/lib/services/questionnaire-scoring.ts` (~82 lignes) — `isCorrect()`, `normalize()`. Supporte multiple_choice (label/index), yes_no, text, rating. Fixes P0-4 (guard null/undefined, bug `Boolean("non")==Boolean("oui")`). Test unitaire coverage complet.

### Décision E1-S10
Architecture :
1. **JSONB responses** conservé (pas de table junction).
2. **Créer** `src/lib/services/questionnaire-rescore.ts` : `computeScore(responses, questions) → { correct_count, total_scorable, score_percent }`.
3. **Créer route** POST `/api/admin/questionnaires/[response_id]/rescore` :
   - Charger `questionnaire_responses` + `questions` associées
   - Appliquer `isCorrect()` à chaque réponse
   - Émettre `activity_log` audit
4. **Migration optionnelle** : ajouter colonnes `score`, `is_finalized`, `rescored_at` à `questionnaire_responses` si historisation demandée → décision à prendre dans story.
5. **Audit log obligatoire** via `activity_log` à chaque rescore.

Réutilisation : `isCorrect()` existant directement, pas de réécriture.

---

## A5 — Bulk start route et BG function état

### route.ts (`src/app/api/sessions/[id]/learners/bulk/start/route.ts`)
- **INLINE_THRESHOLD = 20** (ligne 83)
- **BG_NOT_READY_V1 = true** (ligne 84)
- **Flow** (lignes 246-274) :
  - `> 20` ET `BG_NOT_READY_V1 = true` → marque job `failed` + 400 client avec code `bulk_too_large_v1`
  - `> 20` ET `BG_NOT_READY_V1 = false` → dispatchToBackground (ligne 273, non exécuté actuellement)
  - `≤ 20` → inline loop : createLearnerWithCredentials + enrollments + PDF generation/upload

Note de cohérence interne : le commentaire ligne 276 mentionne "Inline (≤ 50 apprenants)" désaligné de la constante `INLINE_THRESHOLD=20`. À ré-aligner lors de E2-S03 (lever le seuil + corriger commentaire).

### BG function (`netlify/functions/learners-bulk-create-background.mts`)
- **Stub V1** lignes 114-124 (commentaire d'en-tête 11-20).
- Charge le job, valide Bearer `CRON_SECRET` (lignes 66-68 → 401 si invalide), marque "completed" sans créer aucun learner (résultats vides lignes 132-135).

### Helpers réutilisables (exportés)
- `createLearnerWithCredentials` — `src/lib/services/learner-account.ts:175`
- `generateLearnerCredentialsPDF` — `src/lib/services/learner-credentials-pdf.ts:321`
- `uploadLearnerCredentialsPDF` — `src/lib/services/learner-credentials-storage.ts:47`

### Décision E2-S03 / E2-S04
1. **route.ts** : retirer flag `BG_NOT_READY_V1` (ligne 84), lever `INLINE_THRESHOLD` de 20 à 50 (ligne 83), aligner commentaire ligne 276 → débloque `dispatchToBackground`.
2. **BG function** : implémenter la boucle complète (copier la logique des lignes 292-396 de route.ts) — `createLearnerWithCredentials` + enrollments + PDF + upload via les 3 helpers existants.
3. **Validation Bearer** : déjà présente, conserver.

---

## A6 — UI bulk-import path

### Fichier principal
- `src/app/(dashboard)/admin/sessions/[id]/bulk-import-learners/page.tsx` — page autonome (export default `BulkImportLearnersPage` lignes 87-247).
- Pas de section intégrée dans `sessions/[id]/page.tsx`.
- Route standalone `/admin/sessions/[id]/bulk-import-learners`.

### Route API consommée
- POST `/api/sessions/[id]/learners/bulk/start` (page.tsx:194-209)
- Body : `learners[], idempotencyKey, entitySlug` (lignes 199-207)
- Type réponse : `JobResponse | Partial<JobResponse> & { error?, code?, maxLearners?, attempted? }` (lignes 210-215)

### Affichage erreur "bulk_too_large_v1"
**Frontend (toast bloquant)** — `page.tsx:217-222` :
- Condition : `if (data.code === "bulk_too_large_v1")`
- Toast titre : `Trop d'apprenants (${data.attempted})`
- Description : `Pour cette V1, max ${data.maxLearners} apprenants...`
- Variante : `destructive`

**Backend (code 400)** — `route.ts:252-271` :
- Ligne 265 : `code: "bulk_too_large_v1"`
- Ligne 266-267 : `maxLearners = 20`, `attempted = body.learners.length`
- Status HTTP : 400 (ligne 270)

### Route polling status existante
GET `/api/sessions/[id]/learners/bulk/status?jobId=<uuid>` (`bulk/status/route.ts:36-100`)
Réponse : `{ ok, jobId, status, payloadCount, results, pdfSignedUrl, pdfSignedUrlExpiresAt, errorMessage, createdAt, updatedAt }`

### Décision E2-S05 (UI polling)
1. **Retirer toast bloquant** lignes 217-222 (supprimer la condition d'erreur `bulk_too_large_v1` qui retourne immédiatement).
2. **Ajouter logique polling** :
   - Stocker `jobId` retourné dans state
   - Déclencher polling GET `/api/sessions/[id]/learners/bulk/status?jobId=<jobId>` (interval 2-3s)
   - Maintenir UI en `"running"` jusqu'à `status === "completed"` ou `"failed"`
   - Afficher résultats finaux (`created_count`, `enrolled_count`, `error_count`) une fois complété
3. **Compatibilité V1.1** : Une fois BG Function complète (E2-S04), le flag `BG_NOT_READY_V1` retiré côté route auto-active le mode async >20.

---

## A7 — Pagination hubs (lignes exactes)

### Hub E-Learning `src/app/(dashboard)/admin/elearning/page.tsx`
- Fetch courses : ligne 223 (`fetchCourses`)
- useState pagination client : lignes 205-206 (`pageProgram`, `pageAi`)
- Calculs pagination : lignes 361-366
- `.slice()` pagination client : lignes 365-366 (`pagedProgram`, `pagedAi`)
- PAGE_SIZE : ligne 204 (12 items)
- Reset pages au changement de filtre : lignes 356-359
- Boutons précédent/suivant : lignes 943, 947, 1086, 1090

### Hub Programmes `src/app/(dashboard)/admin/programs/page.tsx`
- Fetch programs : ligne 179 (`fetchPrograms`)
- useState pagination client : ligne 160 (`currentPage`)
- Calculs pagination : lignes 225-227
- `.slice()` pagination client : ligne 227 (`pagedFiltered`)
- PAGE_SIZE : ligne 159 (12 items)
- Reset page au changement de filtre : lignes 228-230
- Boutons précédent/suivant : lignes 726, 737

### Pattern existant dans le codebase
Hubs avec pagination **serveur** (RANGE / LIMIT-OFFSET) :
- `admin/activity/page.tsx` — PAGE_SIZE=50 (.range())
- `admin/clients/page.tsx` — PAGE_SIZE=10 (LIMIT/OFFSET)
- `admin/notifications/page.tsx` — PAGE_SIZE=50

Helper partagé : **absent** (`src/lib/services/pagination.ts` n'existe pas, dossier `src/lib/hooks/` inexistant).

### État actuel : anti-pattern
- **elearning** : 2 listes (programmes manuels + IA) avec states séparés → duplication
- **programs** : 1 liste avec state centralisé mais isolé
- Aucune réutilisabilité entre hubs

### Décision E3-S01 / E3-S02 / E3-S03
**Créer helper partagé** : `src/lib/hooks/usePagination.ts` (custom hook React, le dossier `hooks/` est à créer).

API proposée :
```typescript
const { page, setPage, totalPages, safePage, paged } = usePagination(items, pageSize, [search, statusFilter]);
```

Avantages : réutilisable (elearning, programs, sessions, learners…), gère states, reset auto au changement de filtres, retourne slice() pré-calculé.

Modifications :
- **elearning** : remplacer lignes 204-366 (12 lignes → 2 hooks)
- **programs** : remplacer lignes 159-230 (8 lignes → 1 hook)

---

## Open Questions résiduelles après S0

| OQ | Source audit | Action requise | Owner |
|----|---|---|---|
| OQ-7 | hors audits (issue produit) | Confirmer politique vacances scolaires pour planning sessions | Wissam |
| OQ-8 | A2 | Confirmer enums DB BPF (`bpf_funding_type` : 9 vs 18 ? `bpf_objective` : 10 vs 11 ?) — aligner program.ts/trainings.ts/crm-quotes.ts sur valeurs DB authoritative | Wissam + DB check |
| OQ-9 | A4 | Décider : ajouter colonnes `score`, `is_finalized`, `rescored_at` à `questionnaire_responses` ou laisser scoring lazy (calcul à la volée) ? | Wissam |
| OQ-10 | A3 | Confirmer livraison effective des boutons Duplicate/Delete formation via smoke test avant fermeture E1-S06/S07 | Wissam |

---

## Impact sur les stories

| Story | Audit source | Modification à apporter dans `epics-stories.md` |
|---|---|---|
| E1-S01 | A1 | Préciser : source de vérité DB (3 valeurs). Tasks : supprimer `elearningCourseTypeEnum`, créer `CourseType` dans `types/elearning.ts`, propager imports. |
| E1-S02 | A2 | Préciser : créer `src/lib/validations/trainings.ts` (absent). Pré-requis : résoudre OQ-8 (enums DB authoritative). |
| E1-S03 | A2 | Préciser : créer `src/lib/validations/crm-quotes.ts` (absent). Brancher dans `api/crm/quotes/route.ts:151`. |
| E1-S06 | A3 | Marquer **done** : helper `duplicateSession()` + UI `ResumeActions.tsx` livrés. Tâche restante : smoke test (OQ-10). |
| E1-S07 | A3 | Marquer **done** : helper `deleteSession()` + UI `ResumeDangerZone.tsx` livrés. Tâche restante : smoke test (OQ-10). |
| E1-S10 | A4 | Préciser : créer `src/lib/services/questionnaire-rescore.ts` + route POST `/api/admin/questionnaires/[response_id]/rescore`. Audit log via `activity_log`. Réutiliser `isCorrect()` existant. Migration DB optionnelle selon OQ-9. |
| E2-S03 | A5 | Préciser : `route.ts:83` lever `INLINE_THRESHOLD` 20→50 ; `route.ts:84` retirer `BG_NOT_READY_V1` ; aligner commentaire `route.ts:276`. |
| E2-S04 | A5 | Préciser : implémenter BG function `learners-bulk-create-background.mts:114-124` (remplacer stub). Réutiliser 3 helpers (`learner-account.ts:175`, `learner-credentials-pdf.ts:321`, `learner-credentials-storage.ts:47`). Copier logique route.ts:292-396. |
| E2-S05 | A6 | Préciser : modifier `bulk-import-learners/page.tsx:217-222` (retirer toast bloquant) + ajouter polling sur `/api/sessions/[id]/learners/bulk/status?jobId=<jobId>`. |
| E3-S01 | A7 | Préciser : créer `src/lib/hooks/usePagination.ts` (helper partagé, absent ; dossier `hooks/` à créer). |
| E3-S02 | A7 | Préciser : refactor `elearning/page.tsx:204-366` → `usePagination()`. |
| E3-S03 | A7 | Préciser : refactor `programs/page.tsx:159-230` → `usePagination()`. |

---

## Décisions verrouillées (input direct stories)

### Décision D1 (A1) — CourseType
- Source de vérité : **DB** (3 valeurs : `presentation`, `quiz`, `complete`).
- Type canonique exporté depuis `src/lib/types/elearning.ts`.
- Zod enum à 3 valeurs alignées.

### Décision D2 (A2) — Validations BPF dédiées
- Pattern : un fichier de validation par domaine métier (`program.ts`, `trainings.ts`, `crm-quotes.ts`).
- `index.ts` conservé pour génériques (clients, users, prospects, sessions).

### Décision D3 (A3) — Table cible "formation"
- "formation" UI = ligne dans table `sessions` (pas de table `formations`).
- Helpers existants `duplicateSession()` / `deleteSession()` dans `sessions.ts`.
- Stories E1-S06 / E1-S07 livrées.

### Décision D4 (A4) — Architecture rescoring
- Pas de table junction. `responses JSONB` conservé.
- Service helper `questionnaire-rescore.ts` + route POST dédiée + audit `activity_log` obligatoire.
- Réutilisation `isCorrect()` existant.

### Décision D5 (A5) — Seuil bulk async
- `INLINE_THRESHOLD = 50` (au lieu de 20).
- `BG_NOT_READY_V1` retiré.
- BG function implémente la même logique inline en réutilisant les 3 helpers exportés.

### Décision D6 (A6) — UI polling
- Retirer toast bloquant `bulk_too_large_v1`.
- Polling GET status, UI "running" jusqu'à completed/failed.
- Affichage final : `created_count`, `enrolled_count`, `error_count`.

### Décision D7 (A7) — Hook pagination partagé
- Créer `src/lib/hooks/usePagination.ts` (custom hook, dossier `hooks/` à initialiser).
- Signature : `usePagination(items, pageSize, deps[]) → { page, setPage, totalPages, safePage, paged }`.
- Refactor immédiat des 2 hubs cibles (elearning, programs).
- Hubs avec pagination serveur (activity, clients, notifications) hors scope S0.

---

## Reste à décider par Wissam pré-Epic 1

- **OQ-7 — vacances scolaires** : politique blocage planning sessions sur périodes vacances (zone A/B/C ? toutes ? aucune ?).
- **OQ-8 — mapping BPF** : confirmer enums DB authoritative (`bpf_funding_type` 9 vs 18, `bpf_objective` 10 vs 11). Bloque démarrage E1-S02 / E1-S03.
- **OQ-9 — historisation scoring** : ajouter colonnes `score`, `is_finalized`, `rescored_at` à `questionnaire_responses` ou laisser scoring calculé à la volée ? Impacte E1-S10 (migration ou pas).
- **OQ-10 — smoke test formations** : valider en environnement admin que les boutons Dupliquer/Supprimer fonctionnent end-to-end avant clôture E1-S06 / E1-S07.

Toute nouvelle OQ surgie pendant Epic 1 sera tracée dans un fichier dédié `epic-1-runtime-questions.md`.

---

## Review adversariale

### Verdict
**ship-it** — Document validé comme input direct des stories Epic 1/2/3.

### Méthode
44 items audités par lecture directe du code (paths, lignes, exports, signatures, codes d'erreur, noms de colonnes DB, migrations). Cross-check entre assertions du doc et codebase réel.

### Items résolus (intégrés au final)
- **A1 §types/elearning.ts** — Reformulé "fichier de types e-learning, ≥ 30 types exportés" (chiffre exact "336 lignes" non vérifiable rapidement, retiré).
- **A4 §questionnaire-scoring.ts** — Reformulé "~82 lignes" (réel 82, doc disait 83).
- **A4 §questions table** — Précisé : `schema.sql:256-264` initial 4 types + migration `add_program_objectives_question_type.sql` qui étend à 5 (auparavant la note attribuait directement 5 types à la ligne 260).
- **A5 §INLINE_THRESHOLD** — Ajout d'une note sur l'incohérence commentaire ligne 276 ("≤ 50 apprenants") vs constante `INLINE_THRESHOLD=20`, à corriger en E2-S03.

### Items reportés (hors S0)
- **Cohérence commentaire/constante route.ts:276** — Reporté en E2-S03 (story E2-S03 amendée pour inclure ce nettoyage).
- **Dossier `src/lib/hooks/`** — N'existe pas. Création explicite mentionnée dans E3-S01 (le mkdir fait partie de la story).

### Anti-hallucination check
- **0 fabrication détectée** sur 44 items vérifiés.
- **Toutes les références** fichier:ligne, exports, signatures, codes d'erreur, colonnes DB, migrations correspondent au code réel.
- **Toutes les absences** documentées (à créer) confirmées comme effectivement absentes du codebase.

### Items à créer (validés comme absents)
- `src/lib/types/bpf.ts` (E1-S02)
- `src/lib/validations/trainings.ts` (E1-S02)
- `src/lib/validations/crm-quotes.ts` (E1-S03)
- `src/lib/services/questionnaire-rescore.ts` (E1-S10)
- Route POST `/api/admin/questionnaires/[response_id]/rescore` (E1-S10)
- `src/lib/hooks/usePagination.ts` + dossier `hooks/` (E3-S01)
- Type `CourseType` dans `src/lib/types/elearning.ts` (E1-S01)

### Sortie
Document prêt à servir d'input direct aux stories. Aucun blocker. 2 OQ produit (OQ-7 vacances, OQ-8 BPF) restent à trancher avant démarrage Epic 1.