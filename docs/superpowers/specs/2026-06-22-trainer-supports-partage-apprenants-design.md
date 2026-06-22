# Design — Partage de supports formateur aux apprenants

**Date :** 2026-06-22 · **Statut :** validé (design) · **Branche :** `feat/trainer-supports-partage-apprenants`

## Contexte & problème

Remontée client (espace formateur) : « Une fois le cours créé, comment l'impacter à
une formation pour que les stagiaires aient accès ? »

Le formateur crée aujourd'hui des **supports de cours** (table `trainer_courses` :
`title`, `files` JSONB, `status` draft|published, scoping `trainer_id` + `entity_id`)
depuis `/trainer/courses`. Mais :

- `trainer_courses` n'a **aucun lien vers les sessions** ;
- les **apprenants ne peuvent pas** lire `trainer_courses` (RLS : admin entité +
  formateur propriétaire uniquement) ;
- le mécanisme d'attribution e-learning existant (`formation_elearning_assignments`,
  onglet E-Learning admin) ne gère **que** les cours IA (`elearning_courses`) et
  programmes (`programs`) — **pas** les `trainer_courses`.

Il manque donc un canal : **lier un support à une (des) session(s) du formateur** et
**l'exposer aux apprenants inscrits**.

## Décisions de cadrage (validées)

1. Le « cours » à partager = les **supports `trainer_courses`** (pas les cours IA/programmes).
2. **Approche A** : table de liaison many-to-many support ↔ session (support réutilisable
   sur plusieurs sessions). Rejet de la colonne `session_id` directe (1 support = 1
   session, mauvaise réutilisation) et du détournement de `formation_documents` (géré
   ailleurs que là où le formateur crée ses supports).
3. Partage **au niveau session** : tous les stagiaires inscrits (y compris ajoutés
   plus tard) y ont accès. Pas de granularité par stagiaire.
4. Seuls les supports au statut **`published`** sont visibles des apprenants.

## Hors périmètre (YAGNI)

- Granularité de partage par apprenant.
- Suivi de consultation / accusé de lecture / progression.
- Notifications email à l'apprenant lors d'un partage.
- Partage de cours IA/programmes par le formateur (reste admin).
- Édition du statut publié/brouillon (déjà géré dans `trainer_courses`).

## Architecture

### 1. Modèle de données

Migration **séparée** `supabase/migrations/add_trainer_course_sessions.sql` (règle #7) :

```sql
CREATE TABLE IF NOT EXISTS trainer_course_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_course_id UUID NOT NULL REFERENCES trainer_courses(id) ON DELETE CASCADE,
  session_id        UUID NOT NULL REFERENCES sessions(id)        ON DELETE CASCADE,
  entity_id         UUID NOT NULL REFERENCES entities(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trainer_course_id, session_id)
);
CREATE INDEX IF NOT EXISTS idx_tcs_session ON trainer_course_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_tcs_course  ON trainer_course_sessions(trainer_course_id);
```

`entity_id` est dénormalisé (copié depuis le support/la session à l'insert) pour
l'isolation multi-tenant et la simplicité des policies.

### 2. RLS

Helpers en schéma **`public`** (cf. mémoire projet : `public.user_role()`, pas `auth.*`).
Policies (la barrière **réelle** reste l'API — l'état RLS prod est fragile, défense en
profondeur applicative) :

- **Formateur** — `INSERT`/`DELETE` autorisé si le support lui appartient
  (`trainer_courses.trainer_id` ∈ ses fiches via `profile_id = auth.uid()`) **et** la
  session lui est assignée (`formation_trainers`). `SELECT` de ses liens.
- **Apprenant** — `SELECT` d'un lien si inscrit (`enrollments.learner_id` ∈ ses fiches)
  à `session_id`.
- **Admin / super_admin** — accès complet dans l'entité (`entity_id`).

### 3. API

Routes formateur sous `/api/trainer/*` (déjà couvert par `API_PERMISSIONS`
`["/api/trainer", ["super_admin","admin","trainer"]]`). Autorisation par route :
résolution `trainers.id` depuis `profile_id` (toutes fiches, pas `.single()` —
cf. `trainer-session-access.ts`), vérif ownership support + assignation session.

| Méthode | Route | Rôle | Comportement |
|---|---|---|---|
| `GET`    | `/api/trainer/courses/[id]/sessions` | trainer | Liste **mes sessions** (`resolveTrainerSessionIds`) avec `linked: boolean` pour ce support. |
| `POST`   | `/api/trainer/courses/[id]/sessions` | trainer | Body `{ sessionId }`. Valide : support m'appartient, `status='published'`, session assignée, même `entity_id`. Idempotent (upsert sur la contrainte unique). |
| `DELETE` | `/api/trainer/courses/[id]/sessions/[sessionId]` | trainer | Supprime le lien (vérifs ownership identiques). |
| `GET`    | `/api/learner/supports/[courseId]/file-url?path=` | learner | URL signée (bucket `elearning-documents`) **si** l'apprenant est inscrit à une session liée d'un support **publié**. Nécessaire car `/api/trainer/*` est interdit au rôle `learner`. |

> **`API_PERMISSIONS`** : le middleware fait du *default-allow* sur une route `/api`
> non listée (cf. `findMatchingRoles` → `null` = pas de blocage). On **ajoute** donc
> `["/api/learner", ["super_admin","admin","learner"]]` dans `src/lib/auth/permissions.ts`
> pour restreindre le préfixe au rôle ; la garde **réelle** reste la vérification
> d'inscription (`enrollments`) dans le handler.

Toutes les réponses : gestion `if (error)`, statut HTTP explicite, `entity_id` filtré.

### 4. UI formateur — `CourseMaterialsTab` (`/trainer/courses`)

Par carte de support : bouton **« Partager avec mes sessions »**.

- Ouvre un dialog listant les sessions du formateur (titre + dates) avec un **toggle**
  lié/non-lié par session, alimenté par `GET …/sessions`.
- Toggle → `POST` (lier) / `DELETE` (délier), avec état loading, toast succès/erreur,
  refetch.
- Bouton **désactivé** si `status !== 'published'` → hint « Publiez le support pour le
  partager ».
- Badge sur la carte : « Partagé à N session(s) ».

### 5. UI apprenant — section « Supports de cours » dans `/learner/courses`

- Pour chaque session inscrite de l'apprenant, liste des supports **publiés** liés
  (via `trainer_course_sessions` → `trainer_courses`), groupés par session.
- Chaque support affiche ses fichiers (depuis `files` JSONB) avec lien de
  téléchargement (URL signée via `GET /api/learner/supports/[courseId]/file-url`).
- État vide explicite si aucun support partagé ; état loading pendant le fetch.

### 6. Sécurité / isolation

- `entity_id` filtré sur **chaque** requête Supabase.
- Formateur strictement limité à **ses** supports et **ses** sessions assignées.
- Apprenant strictement limité à **ses** inscriptions (résolution `learner.profile_id`
  → `enrollments`), supports `published` uniquement.

## Découpage en unités

- `src/lib/services/trainer-course-sharing.ts` — logique métier réutilisable :
  - `resolveTrainerCourseIds(supabase, profileId)` (fiches support du formateur),
  - `assertTrainerOwnsCourse` / `assertTrainerAssignedToSession`,
  - `getSharedSupportsForLearner(supabase, learnerSessionIds)` (résolveur vue apprenant).
- Routes API fines déléguant à ce service.
- Composants UI isolés : `ShareCourseDialog` (formateur), `LearnerSupportsSection`
  (apprenant).

## Stratégie de tests

- Unitaires (Vitest, FR) :
  - autorisation : ownership support + assignation session (cas refus/accès) ;
  - `getSharedSupportsForLearner` : ne renvoie que les supports `published` des sessions
    de l'apprenant, isolation `entity_id` ;
  - idempotence du lien (POST deux fois = 1 lien).
- Mocks Supabase suivant le pattern existant (`trainer-session-access.test.ts`).

## Risques & points d'attention

- **État RLS prod fragile** : ne pas se reposer sur la RLS seule → l'API valide tout.
- **Bucket des fichiers** : `trainer_courses.files` est stocké dans `elearning-documents`
  (URL signées). La route learner doit signer sans exposer d'autres chemins.
- **Multi-fiches formateur** : utiliser la résolution « toutes fiches » (pas `.single()`),
  cohérent avec le correctif récent de `resolveTrainerSessionIds`.
