# Espace formateur — Lot C : Bilan formateur (questionnaire rempli par le formateur) — Design

**Date :** 2026-07-01
**Statut :** Approuvé (design), en attente du plan d'implémentation
**Projet :** Co-création. L'admin **désigne** un questionnaire « bilan de fin de formation », le **formateur le remplit**, et l'admin **voit ses réponses**. Ce lot **connecte des briques déjà existantes** — pas de migration.

## Contexte : ce qui existe DÉJÀ (à réutiliser)

- **Stockage** : `questionnaire_responses.trainer_id` (migration `add_trainer_id_questionnaire_responses.sql`) + contrainte « pas learner_id ET trainer_id » + RLS (le formateur n'écrit/lit que ses réponses). ✅
- **Remplissage formateur** : page `/trainer/questionnaires/[id]/fill/page.tsx` — le formateur répond POUR LUI-MÊME (INSERT avec `trainer_id`, jamais `learner_id`), détecte une réponse déjà faite (read-only). ✅
- **Découverte formateur** : `/trainer/evaluations/page.tsx` liste « Mes questionnaires à remplir » via `formation_satisfaction_assignments WHERE target_type='trainer'`. ✅
- **Attribution (schéma)** : `formation_satisfaction_assignments` supporte `satisfaction_type='quest_formateurs'` + `target_type='trainer'` (+ `target_id` NULL = tous formateurs). ✅
- **Affichage réponses (dialog)** : `LearnerResponsesDialog` lit `questionnaire_responses` par `id` → marche avec `trainer_id` (juste **mal libellé** « Réponses de {apprenant} »). ⚠️

## Ce qui MANQUE (= périmètre du Lot C)

### 1. Admin — désigner un « bilan formateur » pour la session
Dans `TabQuestionnaires.tsx` (onglet Questionnaires admin), ajouter un **item « Bilan formateur »** (catégorie satisfaction, `satisfaction_type='quest_formateurs'`, `target='trainer'`) dans une étape (ex. « Fin de formation »). L'admin y **attribue un questionnaire** (choisi dans la liste des questionnaires de l'entité) → crée une ligne `formation_satisfaction_assignments { session_id, questionnaire_id, satisfaction_type:'quest_formateurs', target_type:'trainer', target_id:null }`. Réutilise le mécanisme d'attribution existant (`handleAssign` de l'ItemDetail).

### 2. Statut de la tâche « bilan » (helper Lot A)
`resolveTrainerTasksStatus(supabase, sessionId)` (aujourd'hui `bilanRequested=false` en dur) doit :
- `bilanRequested` = il existe une attribution `formation_satisfaction_assignments` de la session avec `target_type='trainer'`.
- `bilanAnswered` = il existe une `questionnaire_responses` de ce questionnaire pour la session avec un `trainer_id` renseigné (réponse du formateur).
- (Le cœur pur `computeTrainerTasksStatus` gère déjà `bilanRequested/bilanAnswered` — Lot A.)

### 3. Vue formateur — activer la tâche « bilan »
Dans `/trainer/formations/[id]`, quand `status.bilan !== null` (bilan demandé), le bouton « Remplir le bilan de fin de formation » devient **actif** et renvoie vers `/trainer/questionnaires/${questionnaireId}/fill?session_id=${sessionId}` (page existante). Il faut donc que le helper (ou un fetch de la page) expose le `questionnaire_id` du bilan attribué. Statut visuel : « fait » si répondu.

### 4. Admin — voir la réponse du formateur
Afficher la réponse du bilan formateur dans `TabQuestionnaires` : une **entrée « Bilan formateur »** montrant l'état (répondu / en attente) et un accès au dialog des réponses. Corriger le libellé du dialog pour indiquer **« Réponses du formateur {nom} »** quand la réponse porte un `trainer_id` (au lieu de « Réponses de {apprenant} »).

## Hors périmètre
- Lot D (affichage supports admin). Pas de refonte du builder de questionnaires (l'admin crée le questionnaire « bilan » avec l'outil existant). `target_id` ciblé sur un formateur précis = non requis (on cible tous les formateurs de la session via `target_id=null`).

## Règles projet
- Filtre entité + rôle. RLS existante réutilisée (le formateur ne voit/écrit que ses réponses). Pas de type `any`. shadcn/ui. Cœur pur du statut déjà testé (Lot A) ; ajouter un test si nouvelle logique pure. Barrières `tsc` + `vitest`. **Pas de migration.**

## Risques / vigilance
1. **Réutiliser l'attribution existante** : ne pas dupliquer un système d'attribution — brancher sur `formation_satisfaction_assignments` + le `handleAssign` de `TabQuestionnaires`.
2. **Libellé dialog** : la correction « formateur vs apprenant » doit se baser sur `trainer_id !== null` de la réponse.
3. **Multi-entité formateur** : le remplissage résout la fiche via `pickTrainerRecord` (déjà en place) — ne pas casser.
4. **Statut cohérent** : `bilanRequested` false s'il n'y a pas d'attribution → la tâche reste « aucun bilan demandé » (pas « à faire »).

## Critères d'acceptation
- L'admin attribue un « bilan formateur » à une session (onglet Questionnaires).
- Le formateur voit la tâche « bilan » **active** dans `/trainer/formations/[id]`, la remplit (page fill existante) → statut « fait ».
- L'admin voit que le bilan est répondu + accède aux réponses (dialog libellé « formateur »).
- Sans attribution, la tâche « bilan » reste « aucun bilan demandé ».
- `tsc` + `vitest` verts.
