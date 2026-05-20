# Design — Alléger les tâches terminées dans la vue Tâches générale

**Date :** 2026-05-20
**Module :** CRM — page Tâches (`/admin/crm/tasks`)
**Fichiers impactés :** `tasks/page.tsx`, `_components/TaskKanbanCard.tsx`

## Contexte & problème

Dans la vue Tâches générale, les tâches terminées alourdissent
visuellement la liste : la section « Terminées » affiche jusqu'à 100
lignes en pleine taille sous les tâches actives. Côté prospect
(`ProspectTasksSection`), voir les tâches terminées reste important — ce
composant est séparé et n'est pas concerné.

## Objectif

Alléger l'affichage des tâches terminées dans la vue générale (Liste +
Kanban), sans toucher ni au portail prospect ni aux tâches actives.

## Composant 1 — Mode `compact`

Ajouter un prop `compact?: boolean` à `TaskRow` (vue Liste) et
`TaskKanbanCard` (vue Kanban). Quand `compact` vaut `true`, le rendu est
allégé :
- conservé : case à cocher, pastille de priorité, titre (barré), date
  d'échéance, badge label éventuel ;
- masqué : assigné, email de contact, rappel, description inline,
  badges société/« Sans prospect » ;
- padding réduit.

Les handlers (clic sur la ligne, case à cocher, ouverture de l'édition)
restent strictement identiques — seul l'affichage change.

## Composant 2 — Vue Liste : section « Terminées » repliable

La section « Terminées (N) » de la vue Liste devient repliable :
- en-tête transformé en bouton avec chevron ;
- **repliée par défaut** ;
- exception : si le filtre de statut est `completed` (onglet
  « Terminées »), la section est **dépliée d'office** — sinon l'onglet
  afficherait du vide ;
- une fois dépliée, les `TaskRow` des tâches terminées sont rendus avec
  `compact` à `true`.

État de pliage : `useState` local au composant (repli réinitialisé à
chaque montage de la page — pas de persistance, YAGNI).

## Composant 3 — Vue Kanban : colonne « Terminées »

Les cartes de la colonne « Terminées » sont rendues avec
`TaskKanbanCard` en mode `compact`. La colonne ne se replie pas (une
colonne Kanban se replie mal) ; seules les cartes deviennent fines.

## Hors périmètre

- **Vue Calendrier** : aucun changement — les tâches terminées y sont
  déjà exclues (`CalendarView.tsx`, filtre `status === "completed"`).
- **`ProspectTasksSection`** (portail prospect) : inchangé, garde
  l'affichage complet des tâches terminées.
- **Tâches actives** (pending / in_progress) : aucun changement.

## Garanties anti-régression

- `compact` est un prop optionnel par défaut `false` → tous les appels
  existants de `TaskRow` / `TaskKanbanCard` (tâches actives, Kanban
  actives, ProspectTasksSection) sont inchangés.
- Aucune logique métier modifiée — uniquement du rendu conditionnel.

## Vérification

- `tsc --noEmit` : OK.
- Suite de tests : 400 tests restent verts (changement purement UI).
- Vérification manuelle : onglet « Toutes » → section Terminées repliée ;
  la déplier → lignes compactes ; onglet « Terminées » → section dépliée
  d'office ; Kanban → colonne Terminées en cartes fines ; tâches actives
  et portail prospect inchangés.
