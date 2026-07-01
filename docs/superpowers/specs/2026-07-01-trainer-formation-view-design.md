# Espace formateur — Lot A : Vue formation unifiée + « Tâches à faire » — Design

**Date :** 2026-07-01
**Statut :** Approuvé (design), en attente du plan d'implémentation
**Projet :** Co-création formateur→admin→apprenant. Le formateur renseigne 3 choses sur ses formations attribuées ; l'admin (et parfois l'apprenant) les voient. Ce Lot A pose le **socle UX** : une vue formation unifiée côté formateur avec une section « Tâches à faire ».

## Contexte (exploration faite)

Aujourd'hui le formateur voit ses formations via des **pages séparées** (`/trainer/sessions`, `/trainer/planning`, `/trainer/questionnaires`, `/trainer/courses`), sans **vue détail unifiée** par formation. Isolation via `formation_trainers` + helpers `src/lib/auth/trainer-session-access.ts` (`isTrainerAssignedToSession`, `resolveTrainerSessionIds`, `pickTrainerRecord`).

**Décisions validées :** vue unifiée `/trainer/formations/[id]` ; statut des tâches **dérivé des données** (pas de table de suivi) ; le questionnaire « bilan formateur » sera **défini par l'admin** (Lot C).

## Périmètre du Lot A

### 1. Page `/trainer/formations/[id]` (nouvelle)
- `[id]` = `session_id`. **Garde d'accès** : le formateur DOIT être assigné (`isTrainerAssignedToSession(supabase, auth.uid(), sessionId)`) → sinon 403/redirection.
- **En-tête** : titre de la formation, dates, lieu/mode, programme, nb d'apprenants. Lecture seule.
- **Zone lecture** (réutilise les données déjà accessibles au formateur) : planning (créneaux, lecture), liste des apprenants (lecture). **Masqué** : finances, conventions, Qualiopi, automatisation, e-learning admin.
- Depuis `/trainer/sessions` et `/trainer/planning`, chaque formation devient **cliquable** vers cette vue.

### 2. Section « Tâches à faire » (cœur du lot)
Bandeau en tête de la vue, 3 tâches avec **statut dérivé** (`à faire` / `fait`) et un **point d'entrée** vers l'action :

| Tâche | Statut dérivé (donnée) | Action (Lot A) |
|---|---|---|
| **Déroulé pédagogique réalisé** | `fait` si ≥1 `formation_time_slots` de la session a un `module_title`/`module_themes`/`module_objectives`/`module_exercises` non vide | Lien vers la vue planning de la formation (édition réelle = Lot B) |
| **Bilan de fin de formation** | `à faire` par défaut ; deviendra dérivé de la réponse formateur (Lot C). En Lot A : afficher « aucun bilan demandé » tant que l'admin n'en a pas paramétré un | Placeholder (câblage réel = Lot C) |
| **Support pédagogique** | `fait` si ≥1 `trainer_course_sessions` lie un support publié à la session | Lien vers `/trainer/courses` (fonctionnalité existante) |

Le statut se calcule dans un **helper** `resolveTrainerTasksStatus(supabase, sessionId, trainerProfileId)` (testable, retourne `{ deroule: boolean; bilan: boolean|null; support: boolean }`), réutilisé par la vue formateur ET l'indicateur admin.

### 3. Indicateur d'avancement côté admin
Dans la vue admin de la formation (`admin/formations/[id]`), afficher un **petit indicateur** de l'avancement des tâches formateur (ex. « Formateur : déroulé ✓ · bilan — · support ✓ ») — réutilise le même helper. Emplacement : section Résumé (`TabResume`) ou en-tête. Objectif co-création : l'admin voit ce qui est déjà rempli.

## Hors périmètre (lots suivants)
- **Lot B** : rendre le déroulé **éditable** par le formateur (RLS `formation_time_slots` + UI).
- **Lot C** : questionnaire « bilan formateur » (admin le définit, formateur y répond, réponses visibles admin).
- **Lot D** : afficher les supports formateur dans l'onglet admin Documents partagés.
- Visibilité **apprenant** du déroulé réalisé : décision ouverte, traitée au Lot B.

## Règles projet
- Rôle `trainer` gaté (middleware + garde d'assignation). Filtre entité implicite (sessions du formateur). Pas de type `any`. shadcn/ui. Helper métier testé (Vitest). Barrières `tsc` + `vitest`. Pas de migration (Lot A = lecture + agrégation).

## Risques / vigilance
1. **Garde d'accès stricte** : un formateur ne doit voir QUE ses formations assignées (réutiliser `isTrainerAssignedToSession`, ne pas se fier à `sessions.trainer_id`).
2. **Multi-entité** : un profil formateur a plusieurs fiches `trainers` (une par entité) → utiliser `resolveTrainerIds`/`pickTrainerRecord`, jamais `.single()` sur `trainers.profile_id`.
3. **Statut « bilan »** : `null` tant qu'aucun bilan n'est paramétré (évite un « à faire » trompeur avant le Lot C).

## Critères d'acceptation
- Un formateur ouvre `/trainer/formations/<sa session>` → voit l'en-tête + planning/apprenants en lecture + la section « Tâches à faire » avec les 3 statuts corrects (support = fait s'il en a partagé un, déroulé = fait si créneaux renseignés).
- Un formateur NON assigné à la session est refusé.
- L'admin voit l'indicateur d'avancement des tâches formateur sur la fiche formation.
- `tsc` + `vitest` verts (dont le helper `resolveTrainerTasksStatus`).
