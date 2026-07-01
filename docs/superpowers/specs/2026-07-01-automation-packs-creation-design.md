# Packs d'automatisation — Lot 3 : Sélecteur de pack à la création — Design

**Date :** 2026-07-01
**Statut :** Approuvé (design), en attente du plan d'implémentation
**Périmètre :** Lot 3 du projet packs d'automatisation. Rattache un pack à une formation **à sa création** et instancie le snapshot. S'appuie sur le Lot 1 (tables + `instantiatePackForSession`).

## Objectif

À la création d'une formation : **nom + dates + choix d'un pack d'automatisation en une fois**. Le pack choisi est copié en snapshot (`session_automation_steps`) pour cette formation via le service `instantiatePackForSession` (Lot 1). Le moteur (Lot 1) exécutera ensuite ce snapshot.

**Décisions validées :**
- Design global approuvé.
- **Option a** pour la sous-traitance : on **garde la checkbox `is_subcontracted` ET on ajoute le sélecteur de pack, découplés**. Choisir le pack « Sous-traitance » active le parcours ; la checkbox reste le flag technique existant (badge, filtre `condition_subcontracted`, panneau contrats). Pas de fusion dans ce lot.

## Périmètre détaillé

### 1. Migration — colonne de traçabilité
`sessions.automation_pack_id UUID NULL REFERENCES automation_packs(id) ON DELETE SET NULL` (migration SQL dédiée). Trace le pack choisi (utile au « réappliquer le pack » du Lot 4). Le snapshot réel vit dans `session_automation_steps` (Lot 1) ; cette colonne est la référence de haut niveau.

### 2. Formulaire de création (`src/app/(dashboard)/admin/trainings/page.tsx`)
- Ajouter un champ **« Parcours d'automatisation »** : un `Select` shadcn listant les `automation_packs` de l'entité active (nom + icône), avec une option **« Aucun »**.
- **Pré-sélection** : le pack marqué `is_default` de l'entité (Qualiopi standard) par défaut ; « Aucun » si aucun défaut.
- Chargement : fetch client des packs de l'entité (`automation_packs` filtré par `entity_id`) à l'ouverture du formulaire (comme les programmes sont déjà chargés).
- La **checkbox « Sous-traitance » reste inchangée** (option a).
- Ajouter `automation_pack_id` au `SessionFormData` et au payload POST.

### 3. Route de création (`src/app/api/sessions/route.ts`, POST)
- Accepter `automation_pack_id` (optionnel) dans le body.
- Écrire `automation_pack_id` sur la session créée.
- **Après** l'insert réussi de la session : si `automation_pack_id` est fourni → appeler `instantiatePackForSession(supabase, automation_pack_id, session.id)` (service Lot 1). En cas d'échec du snapshot, **ne pas** faire échouer la création de la session (la session existe ; le snapshot est secondaire) — logguer/retourner un avertissement non bloquant.
- Filtrage `entity_id` : le service vérifie déjà que pack et session sont de la même entité.

## Hors périmètre (autres lots)

Éditeur de packs (Lot 2), onglet formation timeline + « réappliquer le pack » (Lot 4), nouveau doc « contrat de sous-traitance » + assemblage parcours C3V (Lot 5). Pas de fusion checkbox↔pack (option b/c écartées pour ce lot).

## Règles projet

- Filtrage `entity_id` partout ; migration SQL dédiée ; pas de type `any` ; composants shadcn/ui ; logique Supabase via services. Barrières : `tsc --noEmit` + `vitest`.

## Risques / vigilance

1. **Snapshot non bloquant** : une erreur d'instanciation ne doit jamais empêcher la création de la formation.
2. **Entité** : n'afficher que les packs de l'entité active ; le service refuse un pack d'une autre entité.
3. **Rétro-compat** : une formation créée sans pack (« Aucun ») garde le comportement legacy (aucun `session_automation_steps` → moteur legacy). Aucune régression.

## Critères d'acceptation

- Migration appliquée : colonne `sessions.automation_pack_id` présente.
- Créer une formation en choisissant un pack → la session porte `automation_pack_id` ET `session_automation_steps` est peuplé (snapshot) ; le moteur pack-driven la prend en charge.
- Créer une formation avec « Aucun » → pas de snapshot, comportement legacy.
- `tsc --noEmit` vert, `vitest` vert.
