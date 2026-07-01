# CRM — Pagination serveur de la table devis — Design

**Date :** 2026-07-01
**Statut :** Approuvé (design), en attente implémentation
**Origine :** Audit UX CRM — `quotes/page.tsx` `fetchQuotes` charge TOUS les devis (pas de `.range`/`.limit`) → risque de rame/plantage à l'échelle. Premier pas du chantier « Pagination ».

## Contexte (vérifié, `quotes/page.tsx`)
- `fetchQuotes` (l.138-183) : `from("crm_quotes").select("*, client:..., prospect:...").order("created_at", desc)` + filtres `entity_id`/`status`/`ilike reference`, puis `setQuotes(list)` — **sans pagination**.
- Une 2ᵉ requête (l.160) charge des colonnes légères (`status, amount, created_at`) pour les **stats agrégées** — la laisser telle quelle (les totaux ont besoin de toutes les lignes ; colonnes minimales).
- États : `quotes`, `search` (l.107), `statusFilter` (l.108). Effet de fetch dépend de `[entityId, search, statusFilter]`.

## Périmètre
1. **Pagination serveur** sur la requête liste :
   - `const PAGE_SIZE = 25;` + états `page` (0-indexé) et `totalCount`.
   - Ajouter `{ count: "exact" }` à la `.select(...)` de la requête LISTE et `.range(page*PAGE_SIZE, page*PAGE_SIZE + PAGE_SIZE - 1)`. Récupérer `count` → `setTotalCount`.
   - Ajouter `page` aux dépendances de `fetchQuotes` et de l'effet de fetch.
2. **Reset page sur changement de filtre** : `useEffect(() => setPage(0), [search, statusFilter])` (pour ne pas rester sur une page vide après filtrage).
3. **Contrôles de pagination** sous la table : « Précédent » / « Suivant » + « Page X / Y » (Y = `Math.max(1, Math.ceil(totalCount / PAGE_SIZE))`). Boutons désactivés aux bornes.
4. Ne PAS toucher la requête de stats (l.160) ni la logique métier des devis.

## Hors périmètre
- Pagination du Kanban prospects (chantier suivant, plus délicat). Pas de migration.

## Règles projet
- shadcn/ui (Button), pas de type `any`, filtre `entity_id` conservé. Barrières `tsc` + `vitest`.

## Risques / vigilance
1. **Reset page** : après changement de recherche/filtre, revenir page 0 (sinon page vide).
2. **Double fetch** évité/acceptable : setPage(0) sur filtre + fetch sur [search, statusFilter, page] — au pire un fetch de trop, sans bug.
3. **Count** : `{ count: "exact" }` sur la requête liste filtrée (pas la requête stats).

## Critères d'acceptation
- La table affiche 25 devis max ; « Suivant »/« Précédent » naviguent ; « Page X / Y » correct.
- Filtrer/rechercher revient page 1 et recompte.
- Stats inchangées.
- `tsc` + `vitest` verts.
