# Packs d'automatisation — Lot 2 : Éditeur de packs — Design

**Date :** 2026-07-01
**Statut :** Approuvé (design), en attente du plan d'implémentation
**Périmètre :** Lot 2 du projet packs d'automatisation. UI + API pour **créer/éditer/dupliquer/supprimer** des packs et leurs étapes (timeline), afin de composer des parcours en autonomie (dont le parcours C3V). S'appuie sur le Lot 1 (tables `automation_packs` / `automation_pack_steps`).

## Objectif

Aujourd'hui les packs vivent en base (Lot 1) mais ne sont pas éditables via l'UI : le composant `QuickStartPacks` propose encore les packs **figés en code** (`default-packs.ts`) et les « explose » en règles d'entité. Ce lot fournit un vrai **CRUD des packs en base**, pour que l'admin gère ses parcours.

**Décisions validées :** éditeur en **page dédiée** `/admin/automation/packs/[id]` (plus d'espace pour la timeline d'étapes).

## Périmètre détaillé

### 1. Routes API (service_role via server client, rôle admin, filtre `entity_id`)
Nouveau dossier `src/app/api/automation-packs/` :
- `GET /api/automation-packs` → liste les packs de l'entité active (+ nb d'étapes).
- `POST /api/automation-packs` → crée un pack (name, description, icon, color, is_default) → retourne l'id.
- `GET /api/automation-packs/[id]` → un pack + ses étapes (ordonnées).
- `PATCH /api/automation-packs/[id]` → maj métadonnées du pack (+ gestion `is_default` : un seul défaut par entité → si on met true, on retire le flag des autres packs de l'entité).
- `DELETE /api/automation-packs/[id]` → supprime le pack (CASCADE sur ses étapes). **Garde** : refuser si des sessions le référencent en `sessions.automation_pack_id` (retour explicite « pack utilisé par N formations »).
- `POST /api/automation-packs/[id]/duplicate` → clone le pack + ses étapes (nom « … (copie) », `is_default=false`).
- `PUT /api/automation-packs/[id]/steps` → **remplace l'ensemble des étapes** du pack (payload = tableau ordonné). Simplicité : on réécrit toutes les étapes (delete + insert) à chaque sauvegarde de la timeline, comme le fait déjà la route règles existante.

Toutes filtrent par `entity_id` (le pack doit appartenir à l'entité active — `resolveActiveEntityId`) et exigent le rôle admin/super_admin.

### 2. Page liste (`/admin/automation`, section « Mes parcours »)
- Cards des packs de l'entité (nom + icône + couleur + nb d'étapes + badge « défaut »), bouton **« Nouveau pack »** (crée un pack vierge puis redirige vers l'éditeur).
- Par card : **Éditer** (→ page dédiée), **Dupliquer**, **Définir par défaut**, **Supprimer** (confirmation ; message si utilisé par des formations).
- Le composant `QuickStartPacks` (packs code figés) est **retiré de cette page** au profit de la liste en base. `default-packs.ts` reste seulement la source du seed (déjà appliqué au Lot 1) — plus référencé par l'UII.

### 3. Page éditeur dédiée (`/admin/automation/packs/[id]/page.tsx`)
- **Métadonnées** : nom, description, icône (petit picker d'émoji simple ou champ texte), couleur, `is_default`.
- **Timeline d'étapes** : liste ordonnée, chaque étape éditable via un formulaire compact (React Hook Form + Zod) :
  - `trigger_type` (Select : J-x avant début / J+x après fin / à l'inscription / à la clôture / …),
  - `days_offset` (number, masqué si trigger événementiel),
  - `recipient_type` (learners / trainers / companies / all),
  - `document_type` (Select des `ConventionDocType` pertinents) **ou** un email template,
  - `condition_subcontracted` (Tous / Sous-traitée / Non),
  - `name`, `description`.
  - Actions : **ajouter une étape**, **supprimer**, **monter/descendre** (réordonnancement via `order_index`).
- **Enregistrer** : `PATCH` métadonnées + `PUT …/steps` (remplacement complet). Toasts + retour à la liste.

## Hors périmètre (autres lots)
- Onglet formation timeline + « réappliquer le pack » (Lot 4). Pas de refonte du moteur (Lot 1). On ne supprime pas `formation_automation_rules` (legacy toujours en cohabitation).

## Règles projet
- Chaque requête filtre `entity_id` ; RLS déjà en place (Lot 1) ; rôle vérifié côté route. Formulaires React Hook Form + Zod. Pas de type `any`. Composants shadcn/ui. Logique Supabase via services/routes (pas d'appel inline non trivial dans les composants). Barrières : `tsc` + `vitest`.

## Risques / vigilance
1. **`is_default` unique par entité** : la route PATCH doit retirer le flag des autres packs quand on en promeut un.
2. **Suppression d'un pack utilisé** : garde sur `sessions.automation_pack_id` (les snapshots des formations existantes ne doivent pas se retrouver orphelins de façon surprenante — on refuse et on informe).
3. **Remplacement des étapes** (PUT delete+insert) : ne touche QUE `automation_pack_steps` du pack (le gabarit) — **pas** les `session_automation_steps` déjà instanciés (snapshots figés, Lot 1). Cohérent avec la décision « snapshot à la création ».
4. **Zod** : valider `trigger_type` dans l'énumération connue, `days_offset >= 0`, au moins un `document_type` ou `template_id` par étape.

## Critères d'acceptation
- Créer un pack, lui ajouter/réordonner/supprimer des étapes, enregistrer → persisté en base ; réouvrir l'éditeur montre l'état sauvegardé.
- Dupliquer un pack copie ses étapes ; définir par défaut retire le flag des autres.
- Supprimer un pack utilisé par une formation est refusé avec message ; un pack non utilisé se supprime.
- Éditer un pack **n'altère pas** les snapshots des formations déjà créées.
- `tsc` + `vitest` verts.
