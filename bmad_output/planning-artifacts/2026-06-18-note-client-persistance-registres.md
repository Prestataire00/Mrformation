# Note — 3 fonctionnalités qui ne sauvegardent pas les données (à arbitrer)

> 2026-06-18 · Détecté pendant l'audit admin. Ces 3 écrans **fonctionnent à l'écran** mais
> **ne sauvegardent rien de façon durable** — ce ne sont pas des « quick wins », il faut un
> petit développement backend (table de base de données). À décider avec le client.

## 1. Registre « Amélioration continue » (Qualiopi, critère 32)
- **Page** : Rapports → Amélioration continue (`admin/reports/amelioration`)
- **Problème** : tout ajout/modification/suppression vit uniquement dans la page ouverte. **Au
  rafraîchissement ou en changeant de page, tout est perdu.** La liste redémarre vide.
- **Risque** : registre exigé par Qualiopi — données non conservées = non-conformité potentielle.
- **Correctif** : créer une table Supabase (avec `entity_id`) + brancher lecture/écriture. ~0,5–1 j.

## 2. Registre « Incidents / Réclamations qualité »
- **Page** : Rapports → Incidents (`admin/reports/incidents`)
- **Problème** : identique au point 1 — saisie volatile, perdue au rechargement.
- **Risque** : suivi des réclamations exigé Qualiopi.
- **Correctif** : table Supabase dédiée + branchement. ~0,5–1 j.

## 3. Gestion des « Lieux »
- **Page** : Administration → Lieux (`admin/lieux`)
- **Problème** : les lieux sont stockés **dans le navigateur** (localStorage). Conséquences :
  visibles uniquement sur le poste/navigateur qui les a saisis, **invisibles pour les autres
  administrateurs**, perdus en cas de changement de poste ou de nettoyage du navigateur, et non
  séparés par entité (MR / C3V).
- **Correctif** : table Supabase `venues` (avec `entity_id`) + branchement. ~0,5 j.

## Recommandation
Prioriser **1 et 2** (enjeu Qualiopi) si ces registres sont réellement utilisés. Le point **3**
selon l'usage réel de la gestion des lieux. En attendant un arbitrage, on peut afficher un
bandeau « démonstration — données non enregistrées » pour éviter toute fausse attente (quick win).
