---
story_id: 2-2-tri-sessions-recent-en-haut
epic: epic-2
title: "Trier les sessions « plus récent en haut » dans toutes les vues"
status: done
branch: feat/2-2-tri-sessions-recent-en-haut
created: 2026-06-27
completed: 2026-06-27
---

# Story 2-2 : Tri sessions « plus récent en haut »

## Résumé

Garantir le tri `start_date DESC` (plus récent en haut) dans le hub formations, en vue grid
ET en vue Kanban. Les sessions sans `start_date` sont reléguées en fin de liste sans erreur.

## Acceptance Criteria — Couverture

| AC | Statut |
|----|--------|
| Grid : sessions ordonnées par start_date décroissante | ✅ |
| Kanban : ordre start_date DESC préservé dans chaque colonne | ✅ |
| Sessions sans start_date reléguées en fin sans erreur | ✅ |

## Changements

### `src/app/(dashboard)/admin/trainings/page.tsx`

1. **Query Supabase** : ajout `nullsFirst: false` à `.order("start_date", { ascending: false })`
   pour que PostgreSQL relègue les NULL en fin de tri DESC (au lieu de les mettre en premier).

2. **Status computation null-safe** : les sessions sans `start_date` ou `end_date` ne passent
   plus par `new Date(null)` (qui crée un `Invalid Date`). Le statut DB est préservé tel quel,
   avec fallback `"upcoming"` si vide.

### `src/lib/__tests__/session-sort-nulls.test.ts` (nouveau)

6 tests unitaires couvrant :
- Tri start_date DESC avec nulls en fin
- Préservation de l'ordre dans `partitionSessions` (vue grid groupée)
- Préservation de l'ordre dans `.filter()` (vue Kanban)
- Null-safety de la computation de statut
- Fallback "upcoming" pour statut vide + date null
- Sessions cancelled non re-computées même sans date

## Analyse d'impact

- `partitionSessions` (session-grouping.ts) : itère en ordre avec `for...of` + `push` →
  préserve l'ordre d'entrée. Aucune modification nécessaire.
- Vue Kanban : utilise `.filter()` sur le tableau déjà trié → ordre préservé.
- Vue grid groupée : utilise `partitionSessions` → ordre préservé.
- Vue grid plate (filtres actifs) : utilise `filtered.map()` → ordre préservé.
