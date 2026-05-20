# Design — Mise en avant des tâches CRM sans prospect

**Date :** 2026-05-20
**Module :** CRM — page Tâches (`/admin/crm/tasks`)
**Fichier impacté :** `src/app/(dashboard)/admin/crm/tasks/page.tsx` (uniquement)

## Contexte & problème

Suite à l'import Sellsy, 52 tâches MR ne sont rattachées à aucun prospect
(`prospect_id IS NULL`). Aujourd'hui, une tâche sans prospect n'affiche
**aucun indicateur** dans la liste : l'emplacement du badge société reste
vide. Rien ne permet de les repérer ni de les filtrer.

## Objectif

Permettre de repérer et traiter les tâches sans prospect, directement
dans la page Tâches, de façon durable (pas seulement pour le lot actuel).

## Composant 1 — Filtre « Sans prospect » (interrupteur)

- Nouvel état booléen `noProspectFilter` dans `tasks/page.tsx`.
- Bouton-interrupteur dans la barre de filtres, près de Priorité /
  Propriétaire. Inactif = style neutre ; actif = style ambre.
- Filtrage **côté serveur** dans la requête `fetchTasks` :
  `query.is("prospect_id", null).is("client_id", null)`.
  S'applique donc aux 4 vues (Liste, Kanban, Calendrier, Focus du jour),
  puisqu'il filtre la donnée et non l'affichage.
- Ajouté à `hasActiveFilters` pour que la réinitialisation des filtres
  le prenne en compte.
- Compose avec les filtres existants. Note : le statut par défaut est
  « pending » — avec l'interrupteur actif, on voit les tâches sans
  prospect *en cours* ; basculer le statut sur « Tous » montre aussi les
  tâches anciennes/terminées.

## Composant 2 — Badge « Sans prospect » cliquable (vue Liste)

- Dans le composant de ligne de tâche (vue Liste), rangée de métadonnées :
  quand la tâche n'a **ni prospect ni client**, afficher un badge ambre
  `⚠ Sans prospect` à l'emplacement du badge société.
- Le badge est un `<button>` : au clic (`stopPropagation`), il appelle
  `onEdit()` → ouvre le formulaire d'édition inline de la tâche, qui
  contient déjà le `Select` Prospect.
- Palette ambre cohérente avec le badge « Sellsy » existant, mais icône
  `AlertTriangle` (lucide) pour les distinguer visuellement.
- L'indicateur n'apparaît **que dans la vue Liste** (choix produit).

## Décision — tâches liées à un client

« Sans prospect » signifie **ni prospect ni client** : une tâche liée à
un client est considérée comme attribuée. Évite qu'une tâche affiche à la
fois le badge client et « Sans prospect ». Sans effet pratique sur les
données actuelles (0 tâche MR n'a de client).

## Périmètre

- **Inclus :** filtre interrupteur (4 vues), badge cliquable (vue Liste).
- **Exclus :** indicateur dans Kanban / Calendrier / Focus du jour ;
  aucune migration SQL ; aucun fichier nouveau.

## Vérification

Feature UI — vérification manuelle : activer l'interrupteur doit ne
laisser que les tâches sans prospect ; le badge ambre doit apparaître sur
ces tâches en vue Liste ; cliquer le badge doit ouvrir l'édition inline.
