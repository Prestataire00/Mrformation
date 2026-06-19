# Accès formateur — liaison & création de compte plateforme — Design

> Spec validée le 2026-06-19. Méthode BMAD. Source du besoin : demande client
> (« depuis la page formateur, les relier à un compte sur la plateforme et
> laisser la possibilité de leur créer des accès facilement »).

## Contexte

L'espace admin gère des fiches formateurs (`trainers`) et permet déjà de **créer en
masse** les accès des formateurs sans compte, via un bouton sur le hub
(`admin/trainers/page.tsx` → `TrainerCredentialsAction` → `POST /api/trainers/batch-create-credentials`).
La colonne `trainers.profile_id` (nullable, FK `profiles(id)`) matérialise le lien
fiche → compte plateforme.

Trois manques par rapport au besoin :
1. **Aucun moyen de relier une fiche à un compte existant** : le flux ne sait que *créer*
   un nouveau compte auth. Si un compte formateur existe déjà sans être relié (lien cassé,
   fiche recréée, doublon), on ne peut pas le rattacher.
2. **Pas de création d'accès à l'unité** : la fiche détail `admin/trainers/[id]` n'a ni
   bouton individuel « créer l'accès », ni indicateur « a un compte / pas de compte ».
   (Le bouton unitaire `CreateAccessButton` et la route `create-access` ne gèrent que les
   apprenants : username, `temp_password`, `password_must_change`, table `learners`.)
3. **Pas de réinitialisation simple** du mot de passe pour un formateur déjà relié.

## Objectif

Depuis l'espace admin (fiche détail et cards du hub), pouvoir par formateur :
**créer l'accès**, **relier à un compte existant**, **réinitialiser le mot de passe**,
**délier** — facilement et par entité.

## Contraintes connues (sourcées du code)

- **Le mot de passe formateur n'est jamais persisté** (pas de colonne `temp_password` sur
  `trainers`, cf. `batch-create-credentials`). Donc « renvoyer les identifiants » =
  **réinitialiser** (générer un nouveau mot de passe affiché une seule fois). On ne peut pas
  réafficher l'ancien.
- **Un seul rôle par profil.** Décision de cadrage : pour « relier à un compte existant »,
  on ne rattache **que des comptes formateur orphelins** — profils `role = 'trainer'`, de la
  même entité, non encore reliés à une fiche. Aucun changement de rôle, aucun risque de
  casser l'accès d'un apprenant/admin.
- `trainers.profile_id` existe déjà → **aucune migration SQL nécessaire**. La policy RLS
  `trainers_admin_all` couvre déjà les écritures admin ; les opérations sensibles passent en
  `service_role` (comme l'existant).

## Approche

Routes dédiées `/api/trainers/[id]/access` + un service partagé `trainer-account.ts`,
plutôt que d'étendre `/api/admin/create-access` (codé en dur pour les apprenants).

Bénéfice secondaire : la route batch ré-inline aujourd'hui la création de compte. Cette
logique est **extraite dans le service partagé** et réutilisée par la batch route → un seul
endroit crée un compte formateur, moins de duplication.

## Composants

### 1. Service `src/lib/services/trainer-account.ts`
Data-access en **service_role** (miroir de `learner-account.ts`, réutilise son
`generateTempPassword`). Chaque fonction renvoie un résultat explicite (succès/erreur).

- `ensureTrainerAccount(admin, { entityId, entitySlug, trainerId })`
  Crée le compte auth (email réel si valide & non-doublon, sinon synthétique
  `<slug>.<id8>@trainer.<entitySlug>.local`), upsert `profiles { id, role:'trainer', entity_id, is_active:true }`,
  set `trainers.profile_id` + `trainers.email`. **Idempotent** : si déjà relié, ne recrée pas.
  Renvoie `{ email, password, created, syntheticEmailUsed }`.
- `resetTrainerPassword(admin, trainerId)`
  Régénère un mot de passe via `auth.admin.updateUserById(profile_id, { password })`.
  Renvoie `{ email, password }`. Erreur si la fiche n'a pas de `profile_id`.
- `listOrphanTrainerAccounts(admin, entityId)`
  Profils `role = 'trainer'` de l'entité **non présents** dans `trainers.profile_id`.
  Renvoie `{ id, email, first_name, last_name }[]`.
- `linkTrainerToProfile(admin, { entityId, trainerId, profileId })`
  Valide que `profileId` est bien un orphelin trainer **de la même entité** (réutilise
  `listOrphanTrainerAccounts`), puis set `trainers.profile_id`. Refuse sinon.
- `unlinkTrainerProfile(admin, trainerId)`
  `trainers.profile_id = NULL`. **Ne supprime pas** le compte auth → il redevient orphelin,
  ré-liable. Réversible.

### 2. Endpoints `/api/trainers/[id]/access/`
Tous : `requireRole(['super_admin','admin'])` + garde cross-entité (la fiche doit appartenir
à l'entité de l'admin ; super_admin bypass). `[id]` = `trainers.id`.

- `POST /api/trainers/[id]/access`
  Si pas de `profile_id` → **créer** (`ensureTrainerAccount`). Sinon → **réinitialiser**
  (`resetTrainerPassword`). Réponse : `{ ok, email, password, action: 'created'|'reset', synthetic_email_used }`.
- `PATCH /api/trainers/[id]/access` body `{ profile_id }` → **relier** (`linkTrainerToProfile`).
- `DELETE /api/trainers/[id]/access` → **délier** (`unlinkTrainerProfile`).
- `GET /api/trainers/[id]/access/candidates` → `listOrphanTrainerAccounts` (pour le dialog de liaison).

Audit : log `trainer_access_created|reset|linked|unlinked` (cohérent avec `logAudit` existant
sur les routes trainers).

### 3. UI

**Fiche détail** `admin/trainers/[id]/page.tsx` — nouvelle carte **« Accès plateforme »** :
- *Pas de compte* (`profile_id` null) → boutons **« Créer l'accès »** et
  **« Relier à un compte existant »** (ouvre `LinkExistingAccountDialog`).
- *Compte actif* → badge + email de connexion affiché + boutons
  **« Réinitialiser le mot de passe »** et **« Délier »** (confirmation).
- Après création/reset : dialog de résultat affichant email + mot de passe **une seule fois**
  (bouton copier), avec l'avertissement synthétique/RGPD déjà utilisé pour les apprenants.
- Chaque action : loading, try/catch + toast erreur, toast succès, refetch de la fiche.

**Hub cards** `admin/trainers/page.tsx` : petit badge **« Compte ✓ / Pas de compte »** par
card (donnée `profile_id` déjà chargée dans le fetch existant — pas de requête en plus).

**Composants** (sous `src/app/(dashboard)/admin/trainers/_components/`) :
- `TrainerAccessCard` — la carte de la fiche détail (états + actions + dialog résultat).
- `LinkExistingAccountDialog` — charge `…/access/candidates`, recherche par email/nom,
  sélection → `PATCH`.

### 4. Refactor ciblé
`src/app/api/trainers/batch-create-credentials/route.ts` réutilise `ensureTrainerAccount`
au lieu de sa logique inline. Comportement identique (email réel/synthétique, skip si déjà
relié) → les tests batch existants doivent rester verts.

### 5. Tests Vitest `src/lib/services/__tests__/trainer-account.test.ts`
- `listOrphanTrainerAccounts` filtre bien par `entity_id` et exclut les profils déjà reliés.
- `linkTrainerToProfile` **refuse** un profil non-orphelin ou d'une autre entité.
- `ensureTrainerAccount` est idempotent (déjà relié → pas de recréation).
- `resetTrainerPassword` appelle `auth.admin.updateUserById` et échoue sans `profile_id`.
- Pattern de mock identique aux tests de services existants.

## Gestion d'erreur / sécurité
- `requireRole(['super_admin','admin'])` + garde cross-entité sur chaque endpoint.
- Mot de passe affiché une seule fois, jamais persisté (cohérent avec l'existant formateur).
- Liaison restreinte aux orphelins de la même entité (validation serveur, pas seulement UI).
- Délier ≠ supprimer : opération réversible, aucune perte de compte auth.

## Hors périmètre
- Liaison à un compte non-formateur / promotion de rôle (apprenant → formateur) : exclu par
  cadrage (un seul rôle par profil).
- Envoi automatique des identifiants par email au formateur : conserve le comportement actuel
  (affichage + copie manuelle, pas d'auto-email).
- Suppression du compte auth lors du délien.
- Modification du flux apprenant (`create-access`, `learner-account`) : inchangé.
- Aucune migration SQL (`trainers.profile_id` existe déjà).
