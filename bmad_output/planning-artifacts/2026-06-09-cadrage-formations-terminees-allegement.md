# Cadrage — Allègement des formations terminées (Hub Formations)

**Auteur :** Mary (Business Analyst, BMad)
**Date :** 2026-06-09
**Statut :** Cadrage validé — v1.0 (design approuvé par le demandeur)
**Demandeur :** Ismael / Wissam (au nom de Loris, gérant OF)
**Branche analysée :** `fix/ux-p2-confirm-dialogs-shadcn`
**Fichier cible :** `src/app/(dashboard)/admin/trainings/page.tsx`

---

## 0. Résumé exécutif

Le Hub Formations (vue cartes) affiche **toutes les sessions au même niveau visuel**, sans
hiérarchie : les formations terminées — majoritaires avec le temps — occupent autant de place
que les formations actives. Résultat constaté par le demandeur : *« ça fait un peu bazar »*.
Les formations sur lesquelles l'admin doit agir (à venir, en cours) sont noyées dans les
archives.

**Décision validée** : en mode d'affichage par défaut, **regrouper les sessions actives en
haut** (grandes cartes) et **replier les sessions closes** (terminées, puis annulées) dans des
sections dépliables d'un clic. Rien n'est masqué définitivement : tout reste accessible sur la
même page.

**Nature du changement** : pur regroupement d'affichage **côté client**. Aucune nouvelle
requête Supabase, aucun changement de schéma, aucun impact sécurité/RLS.

**Effort estimé** : ~0,5 jour-homme (1 story).

---

## 1. Problème

### 1.1 Constat utilisateur
> « Je souhaiterais qu'on réfléchisse à la manière dont les formations terminées peuvent
> s'afficher afin qu'elles ne soient pas trop lourdes dans la page formations mais qu'elles
> restent quand même accessibles, là ça fait un peu bazar. »

### 1.2 Cause technique
- La vue cartes (`viewMode === "grid"`) mappe directement le tableau `filtered` en une grille
  unique, sans distinction de statut (`trainings/page.tsx`, vue cards ~l.635-730).
- Le statut est calculé côté client depuis les dates : `upcoming` / `in_progress` /
  `completed`, sauf `cancelled` qui reste explicite (`trainings/page.tsx:201`).
- Le tri par défaut est `start_date` descendant (`trainings/page.tsx:190`) : les sessions les
  plus récentes (souvent terminées) remontent en tête.
- Un filtre par statut existe déjà (`all` / `upcoming` / `in_progress` / `completed` /
  `cancelled`), mais son défaut est `all` → tout est mélangé.

### 1.3 Périmètre
- **Inclus** : vue **cartes** uniquement.
- **Exclu** : vue **Kanban** — elle sépare déjà par colonnes (À venir / En cours / Terminées),
  le besoin n'y existe pas. Inchangée.

---

## 2. Décisions de cadrage (validées avec le demandeur)

| # | Question | Décision |
|---|----------|----------|
| D1 | Comportement par défaut des terminées | **Section repliée en bas** : actives en haut, closes dans un pli dépliable. |
| D2 | Interaction avec filtre/recherche | **Regroupement uniquement en mode « Tous les statuts » ET recherche vide.** Sinon → grille plate actuelle. |
| D3 | Sessions annulées | **Rangées avec les closes**, dans un **pli distinct « Annulées (N) »** sous le pli « Terminées (N) ». |
| D4 | État initial du pli | **Replié par défaut** à chaque visite. Pas de persistance localStorage. |

---

## 3. Solution retenue

### 3.1 Modèle d'affichage

**Mode regroupé** (actif si `statusFilter === "all"` **et** `debouncedSearch` vide) :

```
┌─ Actives ───────────────────────────────┐
│ [carte] [carte] [carte]                  │   ← upcoming + in_progress
│ [carte] [carte]                          │     grandes cartes, tri start_date desc
└──────────────────────────────────────────┘

▸ Terminées (24)            [replié par défaut]
▸ Annulées (3)              [replié par défaut]
```

**Mode plat** (dès qu'un filtre de statut est choisi OU qu'une recherche est saisie) :
grille unique identique au comportement actuel → **zéro régression** sur les usages de
recherche/filtrage ciblé.

### 3.2 Partitionnement (mode regroupé)

À partir du tableau `filtered` déjà calculé :
- **Actives** = `status ∈ { upcoming, in_progress }`
- **Terminées** = `status === completed`
- **Annulées** = `status === cancelled`

Un groupe vide n'affiche pas sa section (pas de pli « Terminées (0) »).

### 3.3 Composants

| Composant | Rôle | Statut |
|-----------|------|--------|
| `SessionGridCard` | Carte de session extraite du JSX inline actuel (~l.643-730), réutilisée pour Actives et pour le contenu des plis. | À extraire |
| `CollapsibleSection` | En-tête cliquable `▸ {titre} ({N})` + grille du contenu. Local à la page. | À créer |
| `ui/collapsible.tsx` | Wrapper shadcn du primitive Radix. **`@radix-ui/react-collapsible@^1.1.12` est déjà en dépendance** mais le wrapper `src/components/ui/collapsible.tsx` n'existe pas encore. | À créer (wrapper shadcn standard) |

État d'ouverture des plis : `useState` local (ex. `showCompleted`, `showCancelled`),
initialisés à `false`.

### 3.4 Conformité CLAUDE.md
- ✅ Composants shadcn/ui (Collapsible, Card, Badge) — pas de HTML natif.
- ✅ Aucun appel Supabase ajouté ; filtre `entity_id` inchangé.
- ✅ Pas de `any` : `SessionCard` est déjà typé.
- ✅ Pas de modif schema.sql.

---

## 4. Hors-périmètre (YAGNI)

- Persistance de l'état du pli (localStorage) — écarté en D4.
- Regroupement en mode recherche/filtré — écarté en D2.
- Pagination des terminées — non nécessaire (les plis suffisent à alléger ; à reconsidérer si
  un OF dépasse ~100 sessions terminées).
- Vue Kanban — inchangée.
- Vue compacte en liste pour les terminées — écartée au profit du pli (cartes conservées).

---

## 5. Critères d'acceptation

1. En arrivant sur le Hub (filtre « Tous », pas de recherche), seules les sessions **À venir**
   et **En cours** s'affichent en grandes cartes ; les **Terminées** et **Annulées** sont
   repliées.
2. Cliquer sur « ▸ Terminées (N) » déplie/replie la grille des sessions terminées.
3. Les compteurs (N) reflètent le nombre réel par groupe.
4. Choisir un filtre de statut explicite (ex. « Terminées ») **ou** saisir une recherche
   bascule en grille plate sans pli.
5. Un groupe vide n'affiche pas sa section.
6. La vue Kanban est inchangée.
7. Aucune régression : ouverture d'une carte → `/admin/formations/{id}`, menu `…`, export CSV,
   création de session fonctionnent comme avant.

---

## 6. Suite (workflow BMAD)

Cadrage → **Plan d'implémentation** (story unique). Le présent document sert d'entrée au plan.
