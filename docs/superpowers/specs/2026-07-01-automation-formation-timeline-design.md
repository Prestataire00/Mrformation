# Packs d'automatisation — Lot 4 : Timeline formation + réappliquer — Design

**Date :** 2026-07-01
**Statut :** Approuvé (design), en attente du plan d'implémentation
**Périmètre :** Dernier lot du projet. L'onglet Automatisation d'une formation reflète son **snapshot** (`session_automation_steps`), permet d'activer/désactiver ses étapes et de (ré)appliquer / changer de pack. S'appuie sur Lot 1 (tables + `instantiatePackForSession`) et Lot 2 (packs éditables).

## Objectif

Aujourd'hui `TabAutomation` affiche les règles d'entité + overrides. Avec le modèle packs, une formation « pack-driven » possède son propre snapshot d'étapes. Ce lot le rend visible et pilotable **au niveau de la formation**.

**Décision validée : option (a) minimale** — voir la timeline, **activer/désactiver** des étapes, **réappliquer** / **changer** / **appliquer** un pack. PAS d'ajout/suppression/réordonnancement d'étapes par formation (pour ça on édite le pack, Lot 2).

## Périmètre détaillé

### 1. API — `src/app/api/formations/[id]/automation-steps/`
Le `[id]` de cette route = `session_id` (une formation = une session, convention du module). Rôle admin, filtre entité via la session.
- **`GET`** → les `session_automation_steps` de la session (ordonnées `order_index`) + le `sessions.automation_pack_id` courant. (Optionnel : joindre les derniers `session_automation_logs` pour le statut d'exécution.)
- **`PATCH`** body `{ step_id, is_enabled }` → toggle `is_enabled` d'UNE étape de cette session (garde : l'étape appartient bien à une session de l'entité active).
- **`POST …/apply-pack`** body `{ pack_id }` → vérifie que le pack appartient à l'entité de la session, met à jour `sessions.automation_pack_id = pack_id`, puis appelle `instantiatePackForSession(supabase, pack_id, sessionId)` (remplace le snapshot). Sert à **appliquer** (formation sans pack), **réappliquer** (même pack, remet à jour) et **changer** (autre pack).

### 2. UI — `TabAutomation.tsx`
- **Si la formation a un snapshot** (`session_automation_steps` non vide) : afficher la **timeline de la formation** :
  - par étape : nom, déclencheur + **date calculée** (J-x avant début / J+x après fin — réutiliser le calcul d'offset existant côté affichage, ex. `compute-events`), destinataire, document, et un **Switch `is_enabled`** (PATCH par étape).
  - **badge de statut** d'exécution si un log existe (via `session_automation_logs`).
- **Barre d'actions** en tête :
  - **Sélecteur de pack** (packs de l'entité, via `GET /api/automation-packs`) + bouton **« Appliquer »** → `POST apply-pack`. Le libellé s'adapte : « Appliquer un pack » (sans snapshot), « Réappliquer / Changer » (avec snapshot).
  - **Réappliquer** avec confirmation : « Ceci remplace la timeline actuelle par le pack à jour (les activations/désactivations locales sont perdues). »
- **Si pas de snapshot** (formation legacy/Aucun) : conserver l'affichage actuel (règles d'entité) + proposer « Appliquer un pack » pour basculer sur le nouveau modèle. **Aucune régression** sur les formations existantes.

### 3. Réutilisation
- Le sélecteur de pack réutilise `GET /api/automation-packs` (Lot 2). L'application réutilise `instantiatePackForSession` (Lot 1). Le calcul de date d'affichage réutilise la logique existante (`src/lib/automation/compute-events.ts` / l'affichage timeline actuel de `TabAutomation`).

## Hors périmètre
- Ajout/suppression/réordonnancement d'étapes par formation (option b, écartée). Refonte du moteur (Lot 1, inchangé). Suppression du système règles-d'entité legacy (cohabitation maintenue).

## Règles projet
- Filtre `entity_id` (via la session) + rôle admin sur les routes. RLS déjà en place (Lot 1). Pas de type `any`. shadcn/ui. try/catch + toast + refetch. Barrières `tsc` + `vitest`.

## Risques / vigilance
1. **Réappliquer efface les toggles locaux** : `instantiatePackForSession` fait delete+insert du snapshot → confirmation obligatoire.
2. **Cohérence `automation_pack_id`** : apply-pack met à jour la colonne (Lot 3) ET le snapshot ensemble.
3. **PATCH is_enabled** : ne touche qu'une ligne `session_automation_steps` de la session ciblée (double filtre step_id + appartenance session/entité).
4. **Pas de double affichage** : une formation avec snapshot montre la timeline pack ; sans snapshot, l'affichage legacy — pas les deux.

## Critères d'acceptation
- Formation sans pack → « Appliquer un pack » crée le snapshot ; la timeline apparaît.
- Toggle d'une étape → `is_enabled` persiste ; le cron (Lot 1) l'ignore si désactivée.
- « Réappliquer » (confirmation) → snapshot régénéré depuis le pack à jour.
- « Changer de pack » → `automation_pack_id` + snapshot mis à jour.
- Formation legacy sans snapshot → comportement inchangé.
- `tsc` + `vitest` verts.
