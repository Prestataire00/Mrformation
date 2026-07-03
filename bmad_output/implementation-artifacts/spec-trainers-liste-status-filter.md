---
title: 'Filtre Actif/Inactif sur la liste formateurs (/admin/trainers/liste)'
type: 'feature'
created: '2026-07-03'
status: 'done'
route: 'one-shot'
---

# Filtre Actif/Inactif sur la liste formateurs (/admin/trainers/liste)

## Intent

**Problem:** La sous-page paginée `/admin/trainers/liste` n'avait pas de filtre Actif/Inactif (recherche seule), contrairement à la page principale `/admin/trainers` qui l'a déjà. Loris ne pouvait pas restreindre la liste paginée aux formateurs actifs.

**Approach:** Ajouter un `Select` shadcn « Actifs / Inactifs / Tous » (défaut **Actifs**), appliqué **côté serveur** (la liste étant paginée, un filtre client ne filtrerait que la page courante). Sémantique alignée sur la page principale : « actif » = statut non « inactive » (null inclus). Changement de filtre → reset page 1 + refetch. Aucune migration (`trainers.status` existe déjà). Vérifié en prod : Actifs + Inactifs = Tous.

## Suggested Review Order

- État du filtre (défaut « active ») + reset pagination au changement
  [`liste/page.tsx:52`](../../src/app/(dashboard)/admin/trainers/liste/page.tsx#L52)
- Clause serveur : « actif » = non-inactif (null inclus), aligné sur la page principale
  [`liste/page.tsx:75`](../../src/app/(dashboard)/admin/trainers/liste/page.tsx#L75)
- UI : `Select` shadcn Actifs/Inactifs/Tous dans la barre de recherche
  [`liste/page.tsx:229`](../../src/app/(dashboard)/admin/trainers/liste/page.tsx#L229)
