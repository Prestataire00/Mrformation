# Design — Refonte du tableau de bord admin (allègement + fixes)

**Date :** 2026-06-17
**Statut :** Design validé (brainstorming)
**Page cible :** `src/app/(dashboard)/admin/page.tsx` (+ composants `_components/Admin*`)

---

## 0. Problème

Le tableau de bord admin est **lourd visuellement** (hero massif + 6 KPI + actions requises + liste tâches en doublon + sessions + activité + calendrier + accès rapides, avec redondances) et a **3 features mal branchées** (vérifiées dans le code/données).

## 1. Décisions de cadrage (validées)

| # | Décision |
|---|----------|
| D1 | Orientation : **équilibré mais allégé** (couper les redondances, garder un peu des deux). |
| D2 | Allègements retenus : **les 4** (hero slim, suppression doublon tâches, repli calendrier+activité, 6 KPI → 4). |
| D3 | Source du CA : **factures** (`formation_invoices`). Réalisé = payées ; Prévisionnel = émises non payées. |

## 2. Fixes — features mal branchées (vérifiées)

### F1. CA Réalisé / Prévisionnel ← factures (au lieu des notes CRM)
- **Constat** : `page.tsx` calcule le CA depuis `crm_prospects` en **parsant le champ `notes`** (« Montant HT depuis notes ») et il y a **0 prospect `won`** → CA = 0 €. Double erreur (mauvaise source + mauvaise colonne).
- **Décision** : calculer depuis `formation_invoices` (colonnes vérifiées : `amount DECIMAL`, `status ∈ {pending,sent,paid,late,cancelled}`, `due_date`, `paid_at`, `entity_id`).
  - **Réalisé (année courante)** = Σ `amount` des factures `status='paid'`, datées par `paid_at` (repli `created_at` si `paid_at` NULL) sur l'année.
  - **Prévisionnel (année courante)** = Σ `amount` des factures non payées (`status ∈ {pending,sent,late}`), datées par `created_at` sur l'année.
- **Implémentation** : extraire une **fonction pure** `computeRevenueFromInvoices(invoices, year)` → `{ realise, previsionnel }` (testable TDD). La page charge les factures filtrées `entity_id` et l'appelle. Supprimer le code de parsing des notes + la projection N-1/N-2 (YAGNI, basée sur des prospects inexistants).

### F2. « Sessions à venir » vide → inclure `planned`
- **Constat** : filtre `status ∈ {upcoming, in_progress}` + `start_date ≥ now`, mais **les 30 sessions futures sont `planned`** → 0 résultat.
- **Décision** : filtre `status ∈ {planned, upcoming, in_progress}` (`page.tsx`, requête `upcoming`). Aucun autre changement.

### F3. « Factures en retard » codé en dur à 0 → vrai compte
- **Constat** : carte « Actions requises » → `{ label: "Factures en retard", count: 0 }` (en dur).
- **Décision** : compter les factures `status='late'` (entity-scopé) = **9 aujourd'hui**. Le lien `/admin/reports/factures?status=late` existe déjà. Charger ce compte avec les autres alertes.

## 3. Allègement visuel

### A1. Hero slim (`AdminHero`)
Bandeau compact : salutation + **1 ligne** de résumé (« X formations en cours · Y éléments à traiter ») + bouton « Voir ce qui demande votre attention ». Supprime le gros bloc rouge pleine hauteur (≈ −40 % de hauteur en haut de page). Garder la couleur de marque mais en bandeau fin.

### A2. Supprimer le doublon « tâches en retard »
« Tâches en retard » apparaît 2× : dans le bandeau **Actions requises** (carte compacte cliquable) ET en **liste détaillée** (`AdminOverdueTasks`) en dessous. → **Retirer le rendu de la liste détaillée** de la page ; garder le bandeau compact. (Le composant `AdminOverdueTasks` reste dans le repo, juste non monté par défaut.)

### A3. Replier calendrier + activité récente
`AdminSessionCalendar` et `AdminRecentActivity` = secondaires. → **repliés par défaut** (déjà gérés par le système de visibilité `AdminDashboardSettings` / `isWidgetVisible`) : passer leur visibilité par défaut à `false`. Réactivables via « Personnaliser ». (Si la valeur par défaut est dans `constants.ts`, l'ajuster là.)

### A4. 6 KPI → 4 (`AdminKPICards`)
Garder 4 cartes pleines : **Clients actifs · Apprenants inscrits · CA réalisé · CA prévisionnel**. Les deux « Formations en cours / terminées » → **ligne compacte secondaire** (petits chiffres inline sous les KPI, pas des cartes pleine taille).

## 4. Architecture

- Changements localisés aux composants existants : `AdminHero` (variante slim), `AdminKPICards` (4 + ligne compacte), `page.tsx` (CA depuis factures, filtre sessions, compte factures, retrait liste tâches, défauts de visibilité), `_components/constants.ts` (défauts de widgets).
- **Fonction pure** `src/app/(dashboard)/admin/_components/revenue.ts` (ou `src/lib/...`) : `computeRevenueFromInvoices` + tests Vitest.
- **Isolation `entity_id`** : toutes les requêtes (factures, sessions, alertes) filtrées par l'entité résolue (`resolveActiveEntityId` pour super_admin) — conserver le pattern existant de la page.
- Le mécanisme « Personnaliser » reste intact (on ne change que des valeurs par défaut).

## 5. États & robustesse
- CA : si aucune facture sur l'année → 0 € (légitime, pas une erreur). Gestion d'erreur de fetch silencieuse (le dashboard ne doit pas planter sur une requête).
- Sessions à venir : empty state existant conservé.
- `entity_id` : aucune fuite cross-entité.

## 6. Tests
- TDD sur `computeRevenueFromInvoices` : réalisé = somme des `paid` de l'année (par `paid_at`/`created_at`) ; prévisionnel = somme des `pending|sent|late` de l'année ; factures hors année exclues ; `amount` NULL → 0 ; année vide → {0,0}.
- Vérif manuelle (post-déploiement) : CA affiche les sommes réelles, « Factures en retard » = 9, « Sessions à venir » peuplé.

## 7. Hors périmètre (YAGNI)
- CRM / prospects (plus utilisés pour le CA).
- Mécanisme « Personnaliser » (inchangé, on ajuste juste des défauts).
- Autres pages, et la refonte des composants non cités.

## 8. Suite
Design → **writing-plans** (tâches TDD, fix CA d'abord car testable) → exécution → PR sur `main`.
