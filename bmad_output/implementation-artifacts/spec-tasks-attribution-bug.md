---
title: 'CRM Tasks — attribution filter empty results + dropdown counts mismatch'
type: 'bugfix'
created: '2026-05-19'
status: 'done'
baseline_commit: '7874a1cf21ce7c508441f4843f633e96cc104607'
context:
  - '{project-root}/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sur `/admin/crm/tasks`, sélectionner un commercial dans le dropdown "Toute l'équipe" produit une liste vide alors que le commercial a des tâches, ET les counts affichés à côté de chaque nom ne correspondent pas à ce que l'utilisateur voit après clic. Cause racine identifiée : (1) le main query `fetchTasks` ne se garde pas contre `entityId` null (race condition au mount) et n'a pas de `.limit()` explicite donc cap silencieux 1000 ; (2) les counts dropdown comptent uniquement les tâches `pending+in_progress` (scope "actives") mais le main display retourne TOUS les statuts → l'utilisateur compare "Camille (12)" du dropdown avec une liste filtrée par tab (Aujourd'hui / À venir / Terminées) qui peut être vide.

**Approach:** 3 corrections ciblées dans `tasks/page.tsx` : (a) bailout `entityId` null avant `fetchTasks`, (b) cap explicite `.limit(5000)` cohérent avec `activeData`, (c) aligner la sémantique counts ↔ display en affichant le **total de tâches actives** dans le dropdown ET filtrer le main query par `status IN ('pending','in_progress')` quand `assigneeFilter` est sélectionné (un commercial qu'on filtre, on veut voir ses tâches actives, pas son historique terminé).

## Boundaries & Constraints

**Always:**
- `entity_id` est toujours filtré sur les queries `crm_tasks` (CLAUDE.md règle 2).
- Le rendu existant (sections Aujourd'hui / À venir / En retard / Rappels / Kanban / Terminées) reste inchangé — on ne touche pas aux `tasks.filter()` côté UI.
- Le default `assigneeFilter` par rôle (commercial = "me", autres = "all") reste tel quel.
- Le bouton "Réinitialiser" doit continuer à fonctionner.

**Ask First:**
- Si l'analyse révèle que les tâches d'un commercial existent en DB avec `status = 'completed'` uniquement (cas Sellsy import sans `assigned_to` puis backfill manuel), proposer une option "Inclure les tâches terminées" plutôt que de cacher silencieusement.

**Never:**
- Pas de refactor de `fetchTasks` au-delà des 3 corrections (pas de découpe en sous-hooks, pas de migration vers React Query, pas de RPC SQL).
- Pas de changement sur la kanban view ou les sections "Aujourd'hui"/"À venir"/etc.
- Pas de modification du script d'import Sellsy (le bug `assigned_to = NULL` Sellsy est un defer séparé).
- Pas de modif de `assigneeCounts` (les counts SOURCE restent `pending+in_progress`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| User sélectionne un commercial dans le dropdown | `assigneeFilter = <uuid>` + entityId chargé | Liste affiche les tâches `pending+in_progress` du commercial pour l'entité courante | N/A |
| User mount la page avant que `entityId` soit chargé | `entityId = null/undefined` | `fetchTasks` bail out early, pas de query sans `entity_id` | console.warn éventuel |
| User sélectionne un commercial qui n'a aucune tâche active | `Camille (0)` dans dropdown | Liste vide + état vide explicite (cohérent avec count 0) | N/A |
| Entité avec >1000 tâches | `crm_tasks.entity_id = X` retourne 1500 rows | `.limit(5000)` retourne tout, pas de truncate silencieux | N/A |
| User reset filters | clic "Réinitialiser" | `assigneeFilter` retourne à `roleDefaultAssignee`, list refresh | N/A |
| User sélectionne "Toute l'équipe" | `assigneeFilter = "all"` | TOUS statuts (incl. completed) retournés — comportement actuel préservé | N/A |

</frozen-after-approval>

## Code Map

- `src/app/(dashboard)/admin/crm/tasks/page.tsx` -- fichier principal contenant `fetchTasks`, `assigneeCounts`, dropdown UI, et tous les `tasks.filter()` côté UI.
  - Lignes 254-345 : `fetchTasks` main query (à patcher pour bailout entityId + limit + status scope quand assigneeFilter)
  - Lignes 367-412 : `assigneeCounts` (intact, scope déjà active)
  - Lignes 695-731 : dropdown SelectGroup (intact)
- `bmad_output/implementation-artifacts/deferred-work.md` -- ajouter un item "Sellsy import assigned_to = NULL" (hors scope ici).

## Tasks & Acceptance

**Execution:**
- [x] `src/app/(dashboard)/admin/crm/tasks/page.tsx` -- ajouter `if (!entityId) { setLoading(false); return; }` en tête de `fetchTasks` -- évite la race condition au mount
- [x] `src/app/(dashboard)/admin/crm/tasks/page.tsx` -- ajouter `.limit(5000)` à la main query (line ~266 après `.order(...)`) -- évite le cap silencieux Supabase à 1000
- [x] `src/app/(dashboard)/admin/crm/tasks/page.tsx` -- aligner sémantique counts ↔ display : quand `assigneeFilter !== "all"` ET `statusFilter === "all"`, restreindre la main query à `.in("status", ["pending", "in_progress"])` -- cohérent avec le count affiché dans le dropdown
- [x] `bmad_output/implementation-artifacts/deferred-work.md` -- append : "Sellsy import : tâches importées ont `assigned_to = NULL` (script `import-sellsy-crm.py` ne mappe pas le colon Sellsy assignee → UUID profile). Counts dropdown invisible aux tâches Sellsy. Backfill SQL ou script v2 à faire."

**Acceptance Criteria:**
- Given un commercial "Camille" avec 12 tâches `pending+in_progress` + 50 tâches `completed`, when on sélectionne Camille dans le dropdown avec `statusFilter="all"`, then la liste affiche exactement les 12 tâches actives.
- Given le dropdown montre "Camille (12)", when on clique sur Camille, then le count visible dans l'UI principale (somme des sections Aujourd'hui+À venir+En retard) est cohérent avec 12.
- Given une entité avec 1500 tâches au total, when la page se charge, then aucune tâche n'est silencieusement tronquée par le cap Supabase 1000.
- Given `entityId` n'est pas encore chargé (1er render), when `fetchTasks` est appelé, then aucune query Supabase non-scopée par entity_id n'est envoyée.
- Given l'utilisateur sélectionne "Toute l'équipe" (assigneeFilter="all"), when la liste se charge, then les tâches `completed` apparaissent toujours dans la section "Terminées" (zéro régression).
- Given l'utilisateur force `statusFilter` à "completed", when la liste se charge, then la restriction status pending+in_progress du fix #3 ne s'applique PAS (le filtre user gagne).

## Spec Change Log

### 2026-05-19 — Code review patches (Blind + Edge Case + Acceptance Auditor)

3 reviewers en parallèle ont remonté 5 BLOCKERS/HIGH actionnables et ~10 defers. Patches appliqués :

- **Fix #3 étendu à `"unassigned"`** — Acceptance Auditor MEDIUM : la condition originale excluait `assigneeFilter !== "unassigned"`, cassait la cohérence count↔display pour "Non assigné" (badge dérivé d'`activeData`). Aligné sur la spec literal `assigneeFilter !== "all"`.
- **H5 (Edge) — Validation `?assignee=` URL** : un user pastant `?assignee=foobar` crashait Postgres avec "invalid input syntax for type uuid". Validation UUID + literals au state init.
- **H1 (Edge) — Toast warning si `.limit(5000)` atteint** : cohérent avec pattern P8 existant. Une entité avec 5000+ tâches sait que les résultats sont tronqués.
- **Blind H4 — `setTasks([])` sur bailout entityId** : éviter la fuite cross-entity stale si l'user switch d'entité.

KEEP : la logique d'auto-restrict status `pending+in_progress` quand `assigneeFilter !== "all" && statusFilter === "all"` est PAR DESIGN (alignement count↔display), même si Blind Hunter la pointe comme trade-off UX. La spec explicite le trade-off.

9 defers consignés dans `deferred-work.md` (race condition commercial default URL, back-button no sync, cancelled invisibility asymétrique, combined cross-ref URL overflow, completedThisWeek semantics, etc.).

## Design Notes

**Pourquoi restreindre par status quand assigneeFilter est actif ?**

Le dropdown affiche `assigneeCounts.get(uuid)` qui est dérivé de `activeData` (scope pending+in_progress, ligne 372). L'utilisateur lit "Camille (12)" et attend de voir 12 tâches. Si on retourne tous les statuts dans la main query, l'utilisateur voit potentiellement 50+ tâches → confusion ("pourquoi 12 dans le badge et 50 dans la liste ?").

La règle "user-friendly" : **le count que tu vois doit matcher ce que tu obtiens en cliquant**. Donc quand `assigneeFilter != "all"`, on s'aligne sur le scope `activeData`.

Exception : si `statusFilter` est explicitement set par l'user (ex: "completed"), son choix gagne. C'est pour ça que le fix #3 ne s'applique que `assigneeFilter !== "all" && statusFilter === "all"`.

```ts
// Pattern (fix #3) :
if (assigneeFilter !== "all" && statusFilter === "all") {
  query = query.in("status", ["pending", "in_progress"]);
}
```

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: 0 erreur
- `npx vitest run` -- expected: 396/396 verts (pas de tests modifiés)

**Manual checks (smoke prod par Wissam après deploy) :**
- `/admin/crm/tasks` → sélectionner un commercial dans le dropdown → liste se met à jour, count matche
- Sélectionner "Toute l'équipe" → liste complète revient (incl. Terminées dans le tab dédié)
- Cliquer "Réinitialiser" → revient au default rôle
- Si entité avec 1500+ tâches : vérifier que toutes les tâches actives sont accessibles via les tabs
