# Éditer la fiche stagiaire (type BPF) depuis la formation

**Date** : 2026-07-09
**Statut** : Design validé

## Problème / objectif

Sur la page formation, on peut éditer les fiches **client** et **formateur** (crayon → dialog), mais
**pas la fiche stagiaire** — impossible de corriger le **type de stagiaire (BPF)** une fois
l'apprenant inscrit (il n'est choisi qu'à l'inscription).

## Constat clé (data model)

Le « type de stagiaire » qui **pilote le BPF** est **`enrollments.bpf_trainee_type`** (par
inscription ; Cadre F-1 Cerfa 10443), PAS le champ global `learners.learner_type` (vestige non
utilisé par le calcul BPF). → On édite donc le champ **par inscription**, sur la formation.

## Décisions validées

- Cible : **`enrollments.bpf_trainee_type`** (par inscription). Pas de synchro du champ global.
- Dialog (crayon, comme client/formateur) : **type BPF + quelques champs apprenant** (prénom, nom,
  email).

## Architecture (réplique du pattern formateur)

### Validation — `src/lib/validations/formation-learner.ts`
- `editFormationLearnerSchema` : `first_name` (requis), `last_name` (requis), `email` (email ou
  vide), `bpf_trainee_type` (`z.enum(BPF_TRAINEE_TYPE_VALUES)`).

### Service — `src/lib/services/formation-learners.ts`
- `updateFormationLearnerSheet(supabase, { learnerId, enrollmentId, sessionId, entityId,
  learner:{first_name,last_name,email}, bpfTraineeType })` :
  - garde multi-tenant `assertSessionInEntity` (session ∈ entité) ;
  - update `learners` ciblé **`learners.id` + `entity_id`** (évite le piège `profile_id` non
    unique) ;
  - update `enrollments.bpf_trainee_type` (`id` + `session_id`).
  - `ServiceResult` (ok/erreur) comme `updateFormationTrainer`.

### Dialog — `EditFormationLearnerDialog.tsx` (sections/)
- `react-hook-form` + `zodResolver`, comme `EditFormationTrainerDialog`.
- Champs : Prénom, Nom, Email (Input) + **Type de stagiaire (BPF)** (`<Select>` via
  `BPF_TRAINEE_TYPE_LABELS`).
- Submit → `updateFormationLearnerSheet` → toast → `onClose()` + `await onRefresh()`.

### Câblage — `ResumeLearners.tsx`
- État `editingEnrollment` + bouton **crayon** sur chaque ligne apprenant (à côté de la corbeille).
- Rendu conditionnel `<EditFormationLearnerDialog … onRefresh={onRefresh} />`.
- Bonus DRY : les `<Select>` BPF d'ajout/création réutilisent `BPF_TRAINEE_TYPE_LABELS`
  (au lieu des libellés courts codés en dur).

### Chargement — `page.tsx`
- Ajouter `bpf_trainee_type` au select des enrollments (ligne ~89) pour afficher/pré-remplir la
  valeur courante.

## Backend / migration
- **Aucun** : colonnes `enrollments.bpf_trainee_type` et champs `learners` existants.

## Cas limites
- Email vide → stocké `null`.
- `bpf_trainee_type` absent (ancienne inscription) → défaut `salarie_prive` à l'ouverture.
- Multi-tenant : toutes les écritures gardées par `entity_id` / `assertSessionInEntity`.

## Tests
- Schéma Zod `editFormationLearnerSchema` (champs requis, email, enum BPF).
- Réutilise `BPF_TRAINEE_TYPE_LABELS`/`VALUES` (déjà stables). Câblage UI vérifié par tsc/build.

## Hors périmètre
- Édition du champ global `learners.learner_type` (non utilisé par le BPF).
- Édition complète de la fiche apprenant (déjà possible sur la page apprenant dédiée).
