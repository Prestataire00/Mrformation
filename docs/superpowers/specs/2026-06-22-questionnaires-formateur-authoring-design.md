# Design — Le formateur crée et attribue des questionnaires (demande 5)

**Date :** 2026-06-22 · **Statut :** validé (design) · **Branche :** `feat/questionnaires-formateur-authoring`

## Contexte & problème

Remontée client : « Ce serait bien que les formateurs puissent **créer** des évaluations/
questionnaires depuis leur espace et **les attribuer aux stagiaires**. »

Aujourd'hui (vérifié) :
- L'authoring de questionnaires est **admin-only** (`/admin/questionnaires`, tables
  `questionnaires` + `questions`). `questionnaires` n'a **pas** de colonne d'auteur ;
  RLS write = admin uniquement.
- L'attribution aux apprenants passe côté admin par `formation_evaluation_assignments`
  / `formation_satisfaction_assignments` (typées Qualiopi).
- **MAIS** la découverte côté apprenant (`/learner/questionnaires`) lit la table
  **`questionnaire_sessions`** (`questionnaire_id, session_id`) pour les sessions où
  l'apprenant est inscrit, puis liste les questionnaires `is_active`. Le remplissage
  apprenant (route + `questionnaire_responses.learner_id`) existe déjà.

Distinct de **EF-3.4** (déjà livré, commit `6511173`) où le formateur *remplit* ses
propres questionnaires. Ici le formateur est **auteur**.

## Décisions de cadrage (validées)

1. **Pédagogiques, séparés du Qualiopi.** Les questionnaires formateur sont des
   évaluations/quiz pour ses stagiaires. Ils **n'alimentent pas** les indicateurs
   Qualiopi/BPF (pilotés par l'admin via les types `eval_*`/`satisfaction_*`).
2. **Bibliothèque partagée d'entité.** Un questionnaire formateur est visible de toute
   l'entité (admin + autres formateurs peuvent le **réutiliser/attribuer**).
3. **Édition/suppression = créateur + admin.** Tous peuvent réutiliser/attribuer un
   questionnaire actif de l'entité, mais seul son créateur (ou un admin) peut
   l'**éditer/supprimer**. Protège les questionnaires Qualiopi de l'admin.
4. **Attribution via `questionnaire_sessions`.** Le formateur lie son questionnaire à
   une de ses sessions → les apprenants inscrits le voient/remplissent via l'infra
   **existante**. **Aucun changement côté apprenant.**

## Hors périmètre (YAGNI)

- Intégration Qualiopi/BPF des questionnaires formateur.
- Modifications de l'espace apprenant (découverte + remplissage déjà fonctionnels).
- Notifications email à l'attribution.
- Notation/correction automatique, bonnes réponses, scoring de quiz.
- Banque de modèles/templates de questionnaires.
- Extraction/refactor du gros composant admin `/admin/questionnaires` (on garde un
  builder formateur dédié et focalisé ; cf. §Découpage).

## Architecture

### 1. Modèle de données

Réutilise `questionnaires`, `questions`, `questionnaire_sessions`, `questionnaire_responses`.
Migration **séparée** `supabase/migrations/add_trainer_authored_questionnaires.sql` :

```sql
ALTER TABLE questionnaires
  ADD COLUMN IF NOT EXISTS created_by_trainer_id UUID REFERENCES trainers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_questionnaires_created_by_trainer
  ON questionnaires(created_by_trainer_id) WHERE created_by_trainer_id IS NOT NULL;
```

`created_by_trainer_id` : null = questionnaire admin ; renseigné = créé par ce formateur
(attribution + périmètre d'édition). Pas de nouvelle table d'attribution.

### 2. RLS (helpers `public.*` ; la garde réelle reste l'API)

Sur `questionnaires` :
- **trainer INSERT** : `public.user_role() = 'trainer'` ET `entity_id` = entité du profil
  ET `created_by_trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())`.
- **trainer UPDATE/DELETE** : idem, restreint à `created_by_trainer_id` = sa fiche
  (ne touche jamais un questionnaire admin / `created_by_trainer_id IS NULL`).
- SELECT entité formateur : déjà couvert (`questionnaires_trainer_read`).

Sur `questions` :
- **trainer ALL** sur les questions dont le `questionnaire_id` appartient à un
  questionnaire `created_by_trainer_id` = sa fiche.

Sur `questionnaire_sessions` :
- **trainer INSERT/DELETE** si le `questionnaire_id` est de l'entité (réutilisation
  autorisée) ET le `session_id` lui est assigné (`formation_trainers`). SELECT entité.

### 3. Service `src/lib/services/trainer-questionnaire.ts`

Logique métier isolée + testable (mocks Supabase comme `trainer-course-sharing.ts`) :
- `resolveTrainerId(supabase, profileId)` → fiche(s) formateur (toutes, pas `.single()`).
- `getOwnedQuestionnaire(supabase, profileId, qId)` → le questionnaire si `created_by_trainer_id`
  ∈ ses fiches, sinon null (gate édition/suppression/attribution-écriture).
- `getResultsForQuestionnaire(supabase, qId, sessionId)` → réponses + agrégats (réutilise
  les helpers de scoring existants `questionnaire-scoring.ts`).

### 4. API (sous `/api/trainer/*`, déjà dans `API_PERMISSIONS`)

| Méthode | Route | Comportement |
|---|---|---|
| `GET`  | `/api/trainer/questionnaires` | Mes questionnaires + bibliothèque d'entité (pour réutiliser). |
| `POST` | `/api/trainer/questionnaires` | Crée `{title, description, type, questions[]}` avec `created_by_trainer_id` = ma fiche et `is_active = true` (requis pour être visible des apprenants une fois attribué). |
| `PUT`  | `/api/trainer/questionnaires/[id]` | Édite (titre/desc/questions) — **créateur uniquement** (`getOwnedQuestionnaire`). |
| `DELETE` | `/api/trainer/questionnaires/[id]` | Supprime — créateur uniquement. |
| `GET`  | `/api/trainer/questionnaires/[id]/sessions` | Mes sessions + `linked`. |
| `POST` | `/api/trainer/questionnaires/[id]/sessions` | Lie (`questionnaire_sessions`) — questionnaire actif de l'entité + session assignée. Idempotent. |
| `DELETE` | `/api/trainer/questionnaires/[id]/sessions/[sessionId]` | Délie. |
| `GET`  | `/api/trainer/questionnaires/[id]/results?session_id=` | Réponses/agrégats. |

Autorisation par route : résolution `trainers.id` depuis `profile_id` (toutes fiches),
`getOwnedQuestionnaire` pour les écritures de contenu, `isTrainerAssignedToSession` pour
l'attribution. `entity_id` filtré partout.

### 5. UI formateur (espace `/trainer`)

- **Liste** `/trainer/questionnaires` : « Mes questionnaires » (éditables) + section
  « Bibliothèque d'entité » (réutilisables, attribuables, non éditables). Badge
  « Qualiopi » sur ceux à `quality_indicator_type` non nul (lecture seule).
- **Builder** `/trainer/questionnaires/create` et `/[id]/edit` : composant focalisé
  `TrainerQuestionnaireBuilder` (titre, description, type, liste de questions des types
  existants rating/text/multiple_choice/yes_no/program_objectives). Réutilise le
  composant de rendu `QuestionField` pour la prévisualisation. Écrit via l'API.
- **Attribuer** : dialog `AssignQuestionnaireDialog` listant les sessions du formateur
  avec toggle lié/non-lié (même pattern que `ShareCourseDialog`) → `questionnaire_sessions`.
- **Résultats** `/trainer/questionnaires/[id]/results` : réponses par session + agrégats
  (réutilise `questionnaire-scoring.ts`). Lecture seule.
- **Nav** : entrée « Questionnaires » dans la sidebar formateur.

### 6. Admin

`/admin/questionnaires` : badge « Créé par formateur » sur les lignes à
`created_by_trainer_id` non nul (attribution lisible). Sélection de colonne ajoutée.
Aucune autre modification.

### 7. Apprenant

**Aucun changement.** Découverte (`questionnaire_sessions`) + remplissage existants.

## Découpage en unités

- Migration (data) — isolée.
- Service `trainer-questionnaire.ts` (+ tests) — logique pure testable.
- Routes API fines déléguant au service.
- Composants UI isolés : `TrainerQuestionnaireBuilder`, `AssignQuestionnaireDialog`,
  page liste, page résultats.
- On **ne touche pas** au gros composant admin `/admin/questionnaires` (hors badge).

## Stratégie de tests

- Unitaires (Vitest, FR) :
  - `getOwnedQuestionnaire` : créateur ↔ accès, non-créateur/admin-questionnaire ↔ null,
    multi-fiches formateur.
  - résolveur attribution (sessions liées/non liées), idempotence.
  - isolation `entity_id`.
- Mocks Supabase suivant le pattern `trainer-course-sharing.test.ts`.

## Risques & points d'attention

- **RLS prod fragile** → l'API valide tout (ownership, entité, assignation session).
- **Protection Qualiopi** : les écritures formateur sont strictement bornées à
  `created_by_trainer_id` = sa fiche ; jamais un questionnaire admin.
- **Multi-fiches formateur** : résolution « toutes fiches » (pas `.single()`),
  cohérent avec `trainer-session-access.ts`.
- **Migration ops** : `add_trainer_authored_questionnaires.sql` à jouer dans Supabase
  Dashboard (prod + dev) **avant** déploiement du code.
