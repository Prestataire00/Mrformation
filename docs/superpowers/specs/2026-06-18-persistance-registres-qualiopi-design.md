# Persistance des registres Qualiopi — Design

> Spec validée le 2026-06-18. Méthode BMAD. Source du besoin : audit admin
> (`bmad_output/planning-artifacts/2026-06-18-audit-quick-wins-admin.md`, points hors quick-win 1 & 2)
> et note client `2026-06-18-note-client-persistance-registres.md`.

## Contexte

Deux registres Qualiopi de l'espace admin **ne persistent rien** : tout ajout/modif/suppression
vit dans le state React et est perdu au rafraîchissement.
- `admin/reports/amelioration/page.tsx` — Amélioration continue (critère Qualiopi n°32)
- `admin/reports/incidents/page.tsx` — Incidents / réclamations qualité

Enjeu : ces registres sont attendus par Qualiopi ; des données volatiles = non-conformité.

## Objectif

Persister les deux registres en base (Supabase), par entité, sans changer l'UI existante.

## Modèle de données (sourcé du code des pages)

### Table `quality_improvements` (Amélioration continue)
| colonne | type | notes |
|---|---|---|
| id | UUID PK | `gen_random_uuid()` |
| entity_id | UUID NOT NULL | FK `entities(id)`, multi-tenant |
| date | DATE NOT NULL | date de l'entrée |
| description | TEXT NOT NULL | requis (validé déjà côté front) |
| action_taken | TEXT | action menée |
| result | TEXT | résultat observé |
| responsible | TEXT | responsable de l'action |
| created_at | TIMESTAMPTZ DEFAULT now() | |
| updated_at | TIMESTAMPTZ DEFAULT now() | |

### Table `quality_incidents` (Incidents / réclamations)
| colonne | type | notes |
|---|---|---|
| id | UUID PK | `gen_random_uuid()` |
| entity_id | UUID NOT NULL | FK `entities(id)` |
| date | DATE NOT NULL | |
| nom | TEXT | intitulé de l'incident |
| description | TEXT | |
| statut | TEXT | valeurs front : `Ouvert` / `Clos` |
| source | TEXT | `Entreprise` / `Apprenant` / `Formateur` |
| sujet | TEXT | `Pédagogique` / `Administratif` / `Technique` |
| gravite | TEXT | `Faible` / `Modéré` / `Grave` |
| formation | TEXT | formation concernée (libre) |
| action_menee | TEXT | |
| date_cloture | DATE | nullable |
| created_at | TIMESTAMPTZ DEFAULT now() | |
| updated_at | TIMESTAMPTZ DEFAULT now() | |

`statut/source/sujet/gravite` restent en **TEXT** (pas d'ENUM SQL) : les valeurs sont déjà
contraintes côté front et l'on garde de la souplesse (YAGNI).

## Composants

### 1. Migration `supabase/migrations/add_quality_registers.sql` (fichier séparé, règle #7)
- `CREATE TABLE IF NOT EXISTS` pour les 2 tables ci-dessus.
- Index `idx_quality_improvements_entity` et `idx_quality_incidents_entity` sur `entity_id`.
- **RLS activée** sur les 2 tables (`ENABLE ROW LEVEL SECURITY`). **Aucune policy `allow_all`.**
- Policy `entity_isolation` (FOR ALL TO authenticated) avec **USING ET WITH CHECK** :
  `entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid())`.
  (Le `WITH CHECK` — absent du précédent `certificateurs` — garantit aussi les INSERT/UPDATE.)
- Note d'exécution : à lancer dans le Dashboard Supabase (comme les migrations existantes).

### 2. Service `src/lib/services/quality-registers.ts`
Fonctions pures de data-access (colonnes explicites, jamais `*`, toujours filtrées `entity_id`) :
- `listImprovements(supabase, entityId)`, `createImprovement(supabase, entityId, input)`,
  `updateImprovement(supabase, entityId, id, input)`, `removeImprovement(supabase, entityId, id)`.
- `listIncidents(...)`, `createIncident(...)`, `updateIncident(...)`, `removeIncident(...)`.
- Types `QualityImprovement` / `QualityIncident` + types d'input (sans `id/entity_id/timestamps`).
- Chaque écriture renvoie `{ data, error }` ; `update` repositionne `updated_at = now()`.

### 3. Branchement des 2 pages (UI inchangée)
- `amelioration/page.tsx` & `incidents/page.tsx` : remplacer le state in-memory par :
  - `useEffect` au montage → `list*` filtré par `entityId` (via `useEntity()`), avec **loading**,
    **empty state** et **toast d'erreur** si échec.
  - `create/update/remove` → service, puis **refetch** + **toast** succès/erreur (les confirmations
    de suppression et certains toasts existent déjà).
- Le filtre de dates reste **client-side** (sur les données chargées).
- Conserver les libellés/critère Qualiopi affichés.

### 4. Tests (Vitest) `src/lib/services/__tests__/quality-registers.test.ts`
- Le `list*` filtre bien par `entity_id` (mock du query builder, vérifie `.eq("entity_id", …)`).
- `create*` injecte `entity_id` et les champs attendus.
- `update*` pose `updated_at`.
Pattern de mock identique aux tests de services existants.

## Gestion d'erreur
Chaque appel service renvoie l'`error` Supabase ; les pages affichent un toast destructif et
n'altèrent l'UI optimiste qu'en cas de succès (sinon refetch pour resync).

## Conformité / sécurité
- RLS stricte par entité (USING + WITH CHECK) — pas d'`allow_all`.
- `entity_id` obligatoire et filtré sur toutes les requêtes (règle projet).
- Données désormais durables et partagées entre admins de la même entité → registres exploitables
  pour l'audit Qualiopi.

## Hors périmètre
- Page `lieux` (localStorage) — sujet séparé.
- Aucune donnée à migrer (les registres étaient volatils → tables initialement vides).
- Pas d'export/import supplémentaire au-delà de l'export Excel déjà présent.
