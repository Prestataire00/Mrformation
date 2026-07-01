# Espace formateur — Lot D : Supports formateur visibles côté admin — Design

**Date :** 2026-07-01
**Statut :** Approuvé (design), en attente du plan
**Projet :** Co-création. Dernier lot (finition). Le formateur partage déjà des supports (visibles par l'apprenant) ; il manque juste leur **affichage côté admin**.

## Contexte

- Le formateur crée/publie des supports (`trainer_courses`) et les lie à ses sessions (`trainer_course_sessions`) → **déjà** vu par l'apprenant.
- Fonction existante réutilisable : `getSharedSupportsForLearner(supabase, sessionIds): Promise<SharedSupport[]>` (`src/lib/services/trainer-course-sharing.ts`) — **session-scoped** (nom trompeur), renvoie les supports **publiés** liés aux sessions.
- `TabDocsPartages.tsx` (onglet Documents partagés admin) affiche `formation_documents` par catégorie + une section lecture « Supports du programme ». **N'affiche pas** les supports formateur.

## Périmètre (une seule modif)

Dans `TabDocsPartages.tsx` : ajouter une section **lecture seule** « Supports partagés par le formateur » :
- Au chargement, appeler `getSharedSupportsForLearner(supabase, [formation.id])` → liste des supports publiés du formateur pour cette session.
- Rendre, par support : titre, description, et les fichiers (liens de téléchargement — même rendu que les autres documents).
- **Lecture seule** : l'admin ne modifie/supprime pas les supports formateur (ils sont gérés par le formateur). Section masquée si aucun support.

## Hors périmètre
- Pas de nouvelle table/service (réutilise l'existant). Pas de modification côté formateur ni apprenant. Pas de migration.
- Optionnel non retenu : renommer `getSharedSupportsForLearner` → on la réutilise telle quelle (un commentaire indique qu'elle est session-scoped).

## Règles projet
- Filtre entité implicite (session de l'entité admin). Lecture seule. Pas de type `any`. shadcn/ui. Barrières `tsc` + `vitest`. **Pas de migration.**

## Critères d'acceptation
- Un formateur partage un support publié sur une session → l'admin le voit (titre + fichiers) dans l'onglet Documents partagés, en lecture.
- Un support **non publié** (brouillon) n'apparaît pas.
- Aucun support → section non affichée.
- `tsc` + `vitest` verts.
