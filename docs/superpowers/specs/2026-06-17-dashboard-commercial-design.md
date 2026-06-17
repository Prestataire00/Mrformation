# Design — Bandeau d'indicateurs du Suivi Commercial

**Date :** 2026-06-17
**Statut :** Design validé (brainstorming)
**Page cible :** `src/app/(dashboard)/admin/crm/suivi/page.tsx`

---

## 0. Problème & objectif

Le Suivi Commercial est aujourd'hui une **liste d'actions** (bonne, conservée) surmontée de **4 cartes KPI brutes** (total / appels / emails / relances). La direction n'a pas de **lecture claire des indicateurs**.

**Objectif** : remplacer les 4 cartes basiques par un **bandeau d'indicateurs riche** au-dessus de la liste (tout sur un écran, zéro clic), centré sur **l'activité & l'effort** et la **performance par commercial** (comparatif). La liste d'actions reste inchangée en dessous.

## 1. Décisions de cadrage (validées)

| # | Décision |
|---|----------|
| D1 | Indicateurs prioritaires : **Activité & effort** + **Performance par commercial**. Pipeline/funnel & conversion **hors périmètre**. |
| D2 | Performance : **comparatif d'équipe** maintenant (calculé depuis l'existant) ; **objectifs/cibles en phase 2**. |
| D3 | Structure : **bandeau en haut** de la page Suivi (remplace les 4 cartes), pas d'onglet ni de page séparée. |

## 2. Contenu du bandeau

1. **Sélecteur de période** : `Ce mois` (défaut) / `30 jours` / `Trimestre`, avec comparaison **vs période précédente** de même durée.
2. **Rangée KPI (4)** avec tendance ↑/↓ (% vs période précédente) :
   - **Actions menées** (count `crm_commercial_actions` sur la période).
   - **CA gagné** (Σ `crm_prospects.amount` où `status='won'` et passé à won sur la période — à défaut de date de gain, on utilise `updated_at`).
   - **Pipeline en cours** (Σ `amount` des prospects au statut ouvert : `new|contacted|qualified|proposal`).
   - **Actions/jour** (intensité = actions ÷ jours ouvrés de la période).
3. **Courbe d'activité** (Recharts, ~8 dernières semaines) : appels / emails / relances (empilés) → lecture de l'effort dans le temps.
4. **Comparatif par commercial** (tableau trié par actions desc) : `commercial · actions · pipeline géré · CA gagné`. Colonne `% objectif` réservée à la phase 2.

## 3. Architecture (règles projet : services + Zod + entity_id + shadcn + Recharts)

```
crm/suivi/page.tsx
  └─ <CommercialDashboardBanner period=… />   (remplace les 4 Cards)
        └─ GET /api/crm/suivi/dashboard?period=   (requireRole admin/super_admin, entity_id)
              └─ src/lib/crm/commercial-dashboard.ts  (fonctions PURES)
                   computeKpis(actions, prospects, period)
                   computeActivitySeries(actions, weeks)
                   computeByCommercial(actions, prospects, profilesById)
```

- **Service** `src/lib/crm/commercial-dashboard.ts` — fonctions **pures** (entrées = lignes déjà chargées + bornes de période ; sorties = objets agrégés). Aucune I/O → **testables en TDD**.
- **Route API** `GET /api/crm/suivi/dashboard` — `requireRole(["super_admin","admin"])`, entité résolue via `resolveActiveEntityId` (super_admin = entité active sélectionnée), charge `crm_commercial_actions` + `crm_prospects` filtrés `entity_id`, appelle les fonctions pures, renvoie `{ kpis, activitySeries, byCommercial }`. Validation des params via Zod (`period ∈ {month,30d,quarter}`).
- **Composant** `src/app/(dashboard)/admin/crm/suivi/_components/CommercialDashboardBanner.tsx` — fetch la route, rend KPI + courbe Recharts + tableau shadcn. Gère loading/erreur/empty.
- **Intégration** : dans `suivi/page.tsx`, retirer le bloc des 4 `Card` KPI (≈l.317-339) et insérer `<CommercialDashboardBanner />`. La logique `fetchKpis` basique devient redondante → supprimée (le bandeau porte les KPI). La liste + filtres + dialog d'ajout restent intacts.

## 4. Données

100 % existant (colonnes vérifiées) — `crm_commercial_actions` (`action_type`, **`author_id`** → profiles NOT NULL, `created_at`, `prospect_id`, `entity_id` NOT NULL) et `crm_prospects` (`status`, `amount`, `assigned_to`, `updated_at`, `entity_id`). **Aucune migration.** Identité commercial : **`author_id`** pour les actions, **`assigned_to`** pour les prospects (mêmes `profiles`) ; le comparatif joint les deux sur l'id profil, nom résolu via `profiles`.

**Phase 2 (objectifs)** — point d'extension prévu : une future table `crm_commercial_targets (profile_id, period, metric, target)` alimentera la colonne `% objectif`. Non construit ici.

## 5. États & robustesse

- **Loading** : skeleton du bandeau.
- **Empty** : période sans action/prospect → message neutre (« Aucune activité sur cette période »), pas de graphe vide cassé.
- **Erreur** : toast + état dégradé (le bandeau n'empêche pas la liste de s'afficher).
- **Isolation `entity_id`** : stricte côté route ; aucune donnée cross-entité (respect NFR-SEC / multi-tenant).
- **Rôles** : route admin/super_admin uniquement (la page Suivi est déjà admin-only).

## 6. Tests (TDD sur les fonctions pures)

- `computeKpis` : count actions sur période ; Σ CA gagné (won dans la fenêtre) ; Σ pipeline ouvert ; actions/jour ; **tendance %** vs période précédente (incl. cas période préc. = 0 → pas de division par zéro).
- `computeActivitySeries` : groupement par semaine + par type ; semaines sans action = 0 (pas de trou).
- `computeByCommercial` : actions groupées par `author_id`, pipeline/CA groupés par `assigned_to`, fusion sur l'id profil ; tri par actions desc ; commercial sans action mais avec pipeline présent (et inverse) ; nom résolu depuis `profiles`, fallback « — » si profil manquant.

## 7. Hors périmètre (YAGNI)

- Pipeline/funnel & taux de conversion (écartés en D1).
- Objectifs/cibles (phase 2).
- Modification de la liste d'actions, des filtres, ou du dialog d'ajout (inchangés).

## 8. Suite

Design → **writing-plans** (plan d'implémentation TDD) → exécution → PR sur `main`.
