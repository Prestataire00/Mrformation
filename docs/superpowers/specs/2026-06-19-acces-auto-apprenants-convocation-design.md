# Accès apprenants automatiques + identifiants sur la convocation — Design

> Spec validée le 2026-06-19. Source : demande client — « quand une formation est
> créée et des apprenants ajoutés, ça doit leur créer automatiquement des accès
> plateforme + se mettre à jour sur la convocation ».

## Contexte (sourcé du code)

- **Ajout d'un apprenant à une session** (`admin/formations/[id]/_components/sections/ResumeLearners.tsx`) :
  - Mode A « apprenant existant » → `enrollLearner` (insert `enrollments`, client-side).
  - Mode B « nouvel apprenant » → `createLearnerAndEnroll` (insert `learners` + `enrollments`, client-side).
  - Aucun des deux ne crée de **compte plateforme**. Seul le bulk-import Epic 2.5 le fait.
- **Création de compte apprenant** déjà disponible : `/api/admin/create-access` (unitaire, rôle
  learner) — crée le compte auth (email réel **sinon email synthétique** `@learner.<slug>.local`),
  persiste `learners.profile_id`, `temp_password`, `password_must_change=true`, `synthetic_email_used`.
  Le `username` est auto-généré par trigger PG à l'insert du learner. **Idempotent** : ne refait rien
  si `profile_id` existe déjà.
- **Convocation** (`src/lib/templates/convocation-apprenant.ts`) : bloc « Accès à votre espace
  formation » avec `[%URL de connexion%]`, `[%Email de l'apprenant%]` (identifiant), `[%Mot de passe
  apprenant%]`, `[%QR code connexion%]`. Le résolveur (`src/lib/utils/resolve-variables.ts`) remplit
  `{{mot_de_passe_apprenant}}` depuis `data.learnerCredentials?.tempPassword`, fallback littéral
  `[Mot de passe apprenant]` → c'est ce qui s'affiche quand l'apprenant n'a pas de compte/mot de passe.
- **Path de génération prod** : `TabConventionDocs` → `POST /api/documents/generate-from-template`,
  qui n'alimente `learnerCredentials` que si `doc_type === "convocation"` (+ via `ensureLearnerAccount`
  qui **renvoie null si pas d'email** → ne couvre pas les apprenants sans email).

## Décisions de cadrage

- **Déclenchement** : à l'**ajout** d'un apprenant à une session, pour **tous** (y compris sans email
  réel → email synthétique, connexion par identifiant + QR).
- **Identifiant affiché** : **toujours le `username`** (jamais l'email), pour homogénéité.

## Composants

### 1. Création auto des accès à l'ajout (`ResumeLearners.tsx`)
- Après succès de `enrollLearner` (mode A) **et** de `createLearnerAndEnroll` (mode B), appeler
  `POST /api/admin/create-access` avec `{ role: "learner", entity_type: "learner", entity_type_id: learnerId }`.
- **Idempotent** (skip si `profile_id` déjà présent) ; gère l'email synthétique pour les apprenants
  sans email. Persiste `username` (déjà via trigger) + `temp_password`.
- **Non bloquant** : l'inscription reste acquise même si la création d'accès échoue → toast
  d'avertissement (« inscrit, mais accès à créer manuellement »). Refetch de la liste après.
- Le bulk-import (Epic 2.5) crée déjà les accès → inchangé.

### 2. Identifiant `username` dans le résolveur (`resolve-variables.ts`)
- Ajouter la variable `{{identifiant_apprenant}}` = `data.learnerCredentials?.username`
  (fallback : email réel, sinon `[Identifiant apprenant]`).
- Ajouter l'alias `"Identifiant apprenant" → "{{identifiant_apprenant}}"`.
- Étendre le type `learnerCredentials` du `ResolveContext` pour porter `username` (en plus de
  `email`/`tempPassword`).

### 3. Convocation : utiliser le `username` comme identifiant (`convocation-apprenant.ts`)
- Remplacer, sur la ligne « Identifiant », `[%Email de l'apprenant%]` par `[%Identifiant apprenant%]`.
- `[%Mot de passe apprenant%]` et `[%QR code connexion%]` inchangés (le QR pré-remplit le `username`).

### 4. Fiabiliser l'alimentation des identifiants à la génération (`generate-from-template/route.ts`)
- Pour un doc de convocation, construire `learnerCredentials` à partir des champs **persistés** de
  l'apprenant : `username` + `temp_password` (+ URL de login + QR pré-rempli via
  `buildLoginQrCodeDataUrl(username, entitySlug)` de `credentials-qr.ts`).
- **Garde-fou legacy** : si l'apprenant n'a pas encore de compte (`profile_id` null ou `temp_password`
  vide), créer l'accès à la volée (même logique que `/api/admin/create-access`, gère l'email
  synthétique) **avant** de résoudre — ainsi la convocation n'affiche jamais le placeholder.
- Vérifier/aligner la condition sur le `doc_type` réel des convocations (corriger si la valeur en base
  est `convocation_apprenant` et non `convocation`).

### 5. Tests (Vitest)
- Résolveur : `{{identifiant_apprenant}}` rendu depuis `username` ; fallback si absent.
- `learnerCredentials` avec `username` → la convocation contient le username (pas le placeholder).
- Logique de garde-fou : un apprenant sans compte déclenche la création avant résolution
  (mock du service), avec email synthétique si pas d'email.

## Hors périmètre
- Pas de durcissement RGPD supplémentaire (le mot de passe initial imprimé + `password_must_change`
  est le comportement existant).
- Pas de refonte du flux d'inscription en route serveur dédiée (on garde les appels client +
  appel `/api/admin/create-access`, déjà sécurisé par `requireRole` admin).
- Pas de changement au bulk-import Epic 2.5 (crée déjà les accès).
- `entity_id` filtré sur toute requête (règle projet) — non détaillé ici.
