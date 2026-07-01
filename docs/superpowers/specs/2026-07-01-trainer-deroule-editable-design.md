# Espace formateur — Lot B : Déroulé pédagogique éditable + visibilité apprenant — Design

**Date :** 2026-07-01
**Statut :** Approuvé (design), en attente du plan d'implémentation
**Projet :** Co-création. Ce Lot B rend le **déroulé pédagogique réalisé** éditable par le formateur (par créneau), remonté chez l'admin (même donnée) et **visible par l'apprenant pour les créneaux passés**.

## Contexte (exploration faite)

- Déroulé = colonnes `module_title / module_objectives / module_themes / module_exercises` de `formation_time_slots` (une ligne = un créneau).
- Aujourd'hui : seul l'admin édite (via `SlotEditDialog` / service `updateTimeSlot` gardé par **entité**). Le formateur voit son planning en **lecture seule**.
- `formation_time_slots` : RLS entité + `allow_all` en prod → la barrière réelle pour un formateur doit être **applicative** (vérifier l'assignation), pas la RLS.
- Helpers : `isTrainerAssignedToSession(supabase, profileId, sessionId)`, `resolveTrainerSessionIds`.
- Lot A : la vue `/trainer/formations/[id]` + la tâche « Renseigner le déroulé » existent (pointent aujourd'hui vers `/trainer/planning`).

**Décision validée (visibilité apprenant) :** le déroulé réalisé est **visible par l'apprenant en lecture, uniquement pour les créneaux PASSÉS** (dont `end_time < maintenant`), pour ne pas exposer les brouillons des créneaux futurs.

## Périmètre

### 1. API — édition du déroulé par le formateur
`PATCH /api/trainer/time-slots/[id]` (nouveau) :
- `requireRole(["super_admin","admin","trainer"])`.
- Récupère le créneau (`session_id`), puis **vérifie l'assignation** : `isTrainerAssignedToSession(supabase, user.id, slot.session_id)` (les admins passent aussi). Sinon 403.
- Met à jour **UNIQUEMENT** les champs du déroulé pédagogique : `module_title, module_objectives, module_themes, module_exercises`. **Interdit** de modifier `start_time/end_time/title/color/slot_order` (réservés à l'admin) — on ignore/rejette ces champs.
- Retourne le créneau mis à jour.

> La donnée étant partagée, l'édition formateur remonte **automatiquement** dans l'onglet admin Planning (même table). Rien à faire côté admin.

### 2. UI formateur — éditer le déroulé
Dans `/trainer/formations/[id]` : chaque créneau devient éditable via un **dialog** (formulaire compact React Hook Form + Zod) limité aux 4 champs de déroulé. Bouton « Renseigner le déroulé » de la section « Tâches à faire » ouvre cet éditeur (au lieu de renvoyer vers `/trainer/planning`). Après sauvegarde : toast + refetch + le statut de la tâche passe à « fait » (helper Lot A). try/catch, état loading, pas de type `any`.

### 3. Espace apprenant — voir le déroulé réalisé (créneaux passés)
Dans la vue formation/session de l'apprenant (`src/app/(dashboard)/learner/my-trainings` ou `/sessions`), ajouter une section **« Déroulé de la formation »** : pour chaque créneau **passé** (`end_time < now`) ayant du contenu module, afficher (lecture) date + horaires + le contenu (`module_title / thèmes / objectifs / exercices`). Les créneaux futurs ne sont pas affichés (anti-brouillon). Filtrage strict : l'apprenant ne voit que SES sessions (isolation portail apprenant déjà en place).

## Hors périmètre
- Lot C (bilan formateur), Lot D (affichage supports admin). Pas de refonte de `SlotEditDialog` admin (on crée un éditeur formateur dédié, focalisé sur le déroulé).

## Règles projet
- Garde d'assignation **serveur** (route API), jamais uniquement client (RLS allow_all en prod). Filtre entité/portail apprenant respecté. React Hook Form + Zod. shadcn/ui. Pas de type `any`. Barrières `tsc` + `vitest`. **Pas de migration** (colonnes déjà présentes ; sécurité applicative).

## Risques / vigilance
1. **Périmètre des champs éditables** : la route doit whitelister les 4 champs de déroulé et ignorer tout le reste (un formateur ne doit PAS pouvoir changer les horaires/couleur/titre du créneau).
2. **Assignation serveur** : le check `isTrainerAssignedToSession` est la vraie barrière (RLS insuffisante en prod).
3. **Anti-brouillon apprenant** : filtre `end_time < now` strict côté résolution des créneaux visibles apprenant.
4. **Isolation apprenant** : réutiliser les helpers d'isolation portail client/apprenant (l'apprenant ne voit que ses sessions).

## Critères d'acceptation
- Un formateur assigné édite le déroulé d'un créneau depuis `/trainer/formations/[id]` → persiste ; l'admin le voit dans l'onglet Planning ; la tâche passe « fait ».
- Un formateur NON assigné (ou un champ hors déroulé) → refusé/ignoré.
- Un apprenant voit le déroulé réalisé de SES créneaux **passés** uniquement ; pas les futurs.
- `tsc` + `vitest` verts.
