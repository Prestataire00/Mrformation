# CRM — Barres d'onglets de navigation (Prospects + Prospection) — Design

**Date :** 2026-07-01
**Statut :** Approuvé (design), en attente du plan
**Origine :** Audit UX CRM — deux confusions d'IA majeures : (a) 3 vues prospects sans navigation cohérente entre elles (Liste orpheline), (b) 3 modules d'envoi (campagnes/séquences/automatisations) qui se recoupent sans qu'on sache lequel choisir.

## Objectif
Rendre la navigation homogène et lever l'ambiguïté par **deux barres d'onglets partagées** + une **ligne descriptive** par module de prospection.

## Périmètre

### 1. `ProspectsViewTabs` (composant partagé)
Barre d'onglets segmentée affichée **en tête des 3 pages prospects** :
- Onglets : **Kanban** → `/admin/crm/prospects`, **Liste** → `/admin/crm/prospects/liste`, **Portefeuille** → `/admin/crm/prospects/portfolio`.
- Onglet actif surligné (déterminé par `usePathname()` — pattern déjà utilisé dans `src/components/layout/*`).
- Remplace les liens/fil d'Ariane ad hoc actuels (fil d'Ariane du Portefeuille, lien Kanban→Portefeuille) pour éviter les doublons.
- Fichier : `src/components/crm/ProspectsViewTabs.tsx`. Monté dans `prospects/page.tsx`, `prospects/liste/page.tsx`, `prospects/portfolio/page.tsx`.

### 2. `ProspectionTabs` (composant partagé)
Barre d'onglets **« Prospection »** en tête des 3 modules d'envoi :
- Onglets : **Campagnes** → `/admin/crm/campaigns`, **Séquences** → `/admin/crm/sequences`, **Automatisations** → `/admin/crm/automations`.
- Onglet actif via `usePathname()`.
- **Sous la barre, une ligne descriptive** du module courant (règle le « lequel choisir ») :
  - Campagnes : « Un envoi email unique à un segment de contacts. »
  - Séquences : « Une suite de relances automatiques espacées dans le temps. »
  - Automatisations : « Des actions déclenchées par un événement (ex. prospect gagné). »
- Fichier : `src/components/crm/ProspectionTabs.tsx`. Monté dans `campaigns/page.tsx`, `sequences/page.tsx`, `automations/page.tsx`.
- Note : la page automations garde son `DomainToggle` (Formations/CRM) existant — la barre Prospection se place au-dessus, dans le contexte CRM.

## Hors périmètre
Aucune logique métier, aucune refonte des pages, aucune migration. On ajoute deux composants de navigation + on retire les liens redondants remplacés.

## Règles projet
- shadcn/ui (ou `Link` + styles Tailwind cohérents avec les onglets existants). Pas de type `any`. Composants client (`"use client"`, `usePathname`). Barrières `tsc` + `vitest`.

## Risques / vigilance
1. **Ne pas casser les liens existants** utiles (Kanban→Portefeuille avec `?commercial=`, fiche prospect `[id]`) : on remplace uniquement la navigation inter-vues, pas les actions.
2. **Cohérence visuelle** : reprendre le style des `Tabs`/segmented déjà présents (ex. la `TabsList` de la Liste) pour un rendu homogène.
3. **Actif correct** : `/admin/crm/prospects` (Kanban) ne doit pas s'activer pour `/admin/crm/prospects/liste` (préfixe) — matcher le pathname exact par onglet.

## Critères d'acceptation
- Sur chacune des 3 pages prospects : la barre montre les 3 vues, la courante surlignée, navigation OK.
- Sur chacun des 3 modules de prospection : la barre « Prospection » + la ligne descriptive du module.
- Les liens ad hoc redondants sont retirés (plus de double navigation).
- `tsc` + `vitest` verts.
