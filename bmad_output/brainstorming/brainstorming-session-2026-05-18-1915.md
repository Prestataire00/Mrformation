---
stepsCompleted: [1, 2, 3]
inputDocuments: []
session_topic: 'Nouvelle gestion du système des tâches dans le CRM commercial'
session_goals: "Benchmark best-in-class (HubSpot / Pipedrive / Salesforce / Asana) et identifier ce qui s'adapte au contexte LMS-CRM hybride pour les commerciaux Marc & Taline"
selected_approach: ''
techniques_used: []
ideas_generated: []
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** Wissam
**Date:** 2026-05-18

## Session Overview

**Topic:** Nouvelle gestion du système des tâches dans le CRM commercial
**Goals:** Benchmark best-in-class (HubSpot / Pipedrive / Salesforce / Asana) et identifier ce qui s'adapte au contexte LMS-CRM hybride pour les commerciaux Marc & Taline. Brainstorming = piocher les meilleures pratiques + identifier ce qui ne s'applique PAS à ton métier (formation pro).

### Context Guidance

Session lancée juste après l'implémentation de l'Epic H story h-17 (accès commerciaux au CRM débloqué : RLS + API + sidebar). Les commerciaux peuvent désormais utiliser le CRM, et la question de la gestion des tâches devient critique car c'est l'outil quotidien du commercial (relances, rappels, rendez-vous, suivis prospects).

### Session Setup

**Approche** : Techniques recommandées par facilitateur — séquence en 3 phases :
1. **Competitive Analysis** structuré par catégorie de feature (vague 1 visible + vague 2 avancée)
2. **SCAMPER focus Adapt** sur les idées retenues — adapter au contexte LMS Qualiopi
3. **Analogical thinking** inter-domaine — piocher dans Notion/Linear/Trello/Things

## Phase 1 — Competitive Analysis : Vague 1 (création, vues, priorité, rappels, automation)

Présentation matrice 4 leaders (HubSpot / Pipedrive / Salesforce / Asana) × 5 catégories.

**Picks Wissam (✅ retenu pour le futur système) :**

| # | Catégorie | Produit retenu | Pattern à adopter |
|---|---|---|---|
| 1 | Création express | **HubSpot** | Bouton flottant global "+ Task" partout dans l'app. Quick-add inline depuis fiche prospect (1 ligne, sans modal). |
| 2 | Vues multiples | **HubSpot** | List, Board (Kanban par statut), Calendar, Today (du jour). Toggle 1-clic. |
| 3 | Priorité | **Pipedrive** | Couleurs personnalisables par utilisateur (chaque commercial code ses propres couleurs/priorités). |
| 4 | Rappels & Notifications | **HubSpot** | Email + in-app + mobile push. Snooze ("rappelle-moi dans 1h"). Digest matinal personnalisé. |
| 5 | Automation | **Salesforce** | Flow Builder visuel (drag-drop), 100+ déclencheurs. |

**Insights émergents** :
- Wissam privilégie l'**ergonomie quotidienne** (HubSpot domine sur 3/5 picks) — UX d'usage > sophistication
- **Personnalisation par utilisateur** valorisée (couleurs Pipedrive) — chaque commercial a son propre style
- **Puissance d'automation visuelle** (Salesforce Flow Builder) — pas peur de la complexité tant que c'est visualisable

### Phase 1 — Vague 2 (collab, lien cross-objets, mobile, reporting, IA)

| # | Catégorie | Décision | Détail |
|---|---|---|---|
| 6 | Collaboration & Délégation | **HubSpot** | Assignation + commentaires inline + @mention + "Delegate to teammate" 1-clic avec note transmise. |
| 7 | Lien cross-objets | **Pipedrive** (+ pattern HubSpot timeline) | "Last activity / Next activity" toujours visibles sur la fiche prospect. Toutes les options plaisent — combo des 2 envisageable. |
| 8 | Mobile / Offline | ❌ **Hors scope** | Pas d'app mobile dans ce projet. Web responsive suffit. |
| 9 | Reporting / Analytics | ❌ **Pas pour commerciaux** | Reporting reste côté admin (Loris). Les commerciaux n'ont pas besoin de dashboards. |
| 10 | IA / Suggestions | ❌ **Hors scope** | Pas d'IA. Système direct et déterministe. |

### Synthèse Phase 1 — pattern retenu

**Tu prends de chaque leader son point fort :**

- **HubSpot (4 catégories)** : création express, vues multiples, notifications, collaboration → dominance UX quotidienne
- **Pipedrive (2 catégories)** : couleurs personnalisables, last/next activity sur fiche → personnalisation + visibilité
- **Salesforce (1 catégorie)** : Flow Builder visuel automation → puissance configurable
- **Asana (0)** : rien retenu (Asana = project management, pas CRM — logique)

**Contraintes fortes posées** :
- 🚫 Pas de mobile (web responsive only)
- 🚫 Pas de reporting commercial (rapports = admin only)
- 🚫 Pas d'IA (système déterministe)

**Insight central** : tu veux un système **simple, ergonomique, déterministe**. Pas de gadget. L'UX et l'automation visuelle sont les vrais leviers de valeur.

---

## Phase 2 — SCAMPER focus "Adapt" : transposition au métier formation

### Décision structurante (Wissam, 2026-05-18) : tâches = PROSPECTS uniquement

**Scope drastiquement resserré** : les tâches commerciales ne se rattachent QU'AUX `crm_prospects`. Pas de tâches sur devis, session, formateur, financeur, client. Cette contrainte simplifie tout le modèle et clarifie le rôle du commercial : sa zone = le tunnel de vente, pas l'exécution post-signature.

**Conséquence sur les axes** :
- ✅ Modèle data simple : 1 FK `crm_tasks.prospect_id` (déjà existe)
- ✅ Vues centrées sur "Mes prospects + tâches"
- ✅ Automations centrées prospect (relance, qualification, réveil)
- ❌ Pas de tâches "préparer session J-15", "confirmer formateur" → ces tâches restent côté admin (Loris) hors CRM commercial

### Axe A — Rattachement : PROSPECT uniquement ✅

Tranchée. `crm_tasks.prospect_id` reste l'unique FK active. Les autres FKs existantes (`client_id`, `assigned_to`, etc.) ne sont pas exposées dans l'UX commercial.

### Axe B — Types de tâches : ❌ HORS SCOPE

**Décision Wissam** : la gestion des types/catégories de tâches est déjà gérée côté client/produit, on ne touche pas. Pas de couleurs prédéfinies, pas de typologie imposée. À la rigueur, un simple champ libre `category` reste possible si nécessaire, mais aucun design type-driven ne sera proposé.

### Axe C — Automations (2 règles retenues)

Retrait des règles "session/formateur/admin" + retrait OPCO (gestion OPCO se fait ailleurs dans le workflow).

| # | Déclencheur | Tâche générée |
|---|---|---|
| 1 | Devis envoyé pour ce prospect | "Relancer prospect" à J+3 |
| 2 | Prospect inactif 30j | "Réveiller le prospect" |

→ Démarrer avec ces 2 règles en v1. Si valeur démontrée, ouvrir à plus dans une v2.

### Axe D — Vues (4 vues validées)

| Vue | Description |
|---|---|
| 📋 **List** | toutes mes tâches, filtrables par priorité/date |
| 📌 **Kanban** | 3 colonnes "À faire / En cours / Terminé" |
| 📅 **Calendar** | tâches positionnées sur leur date d'échéance |
| ⭐ **Aujourd'hui** | focus du jour (en retard + dues today) |

→ Pas de vue Pipeline (déjà couverte par Tunnel de Vente existant).

### Synthèse Phase 2

**Scope final** ultra-resserré :
- Tâches **uniquement liées aux prospects** (FK `prospect_id`)
- **Pas de système de types** (géré ailleurs)
- **2 automations** (relance devis J+3, réveil prospect 30j)
- **4 vues** (List, Kanban, Calendar, Aujourd'hui)
- + l'ergonomie HubSpot retenue Phase 1 : bouton flottant, quick-add inline, notifs in-app + email + snooze + digest matinal, assignation + commentaires + @mention + delegate, last/next activity sur fiche prospect, Flow Builder visuel pour les 2 automations

**Volume de la story future** : moyen. ~3-4 j-h dev backend (model + 2 automations) + ~3-5 j-h dev frontend (4 vues + ergonomie HubSpot). Peut être splitté en 2-3 stories.

## Phase 3 — Skippée (décision Wissam)

Décision de sauter la phase Analogical thinking pour éviter le scope creep. Le périmètre est suffisamment clair pour passer en spec d'implémentation.

---

## 🎯 Synthèse finale — Pattern cible "Tâches CRM commercial"

### Modèle data (minimal — table `crm_tasks` existe déjà)

Réutiliser la table existante. Vérifier les colonnes nécessaires :
- `id`, `entity_id`, `prospect_id` (FK obligatoire pour ce scope), `assigned_to` (commercial), `title`, `description`, `due_date`, `status` (à faire / en cours / terminé), `priority`, `created_at`, `updated_at`
- Champs additionnels recommandés : `snoozed_until` (pour le snooze type HubSpot), `completed_at`, `created_via` ('manual' | 'automation_devis_relance' | 'automation_inactif_30j' pour traçabilité)

### Backend

**API CRUD `/api/crm/tasks`** : déjà existante, à compléter pour les nouveaux endpoints (snooze, delegate).

**2 cron jobs / triggers automation** :
1. Quotidien à 8h : scan des devis envoyés J-3 → crée tâche "Relancer prospect" si pas déjà existante (idempotent)
2. Quotidien à 8h : scan des prospects inactifs (last_activity_at + 30j < today) → crée tâche "Réveiller le prospect" (idempotent, 1 fois par cycle)

**Hook dans le pipeline existant** : à la fin de la digest matinale (déjà existante `notifications/daily-digest`), inclure les tâches du jour.

### Frontend (UX HubSpot-inspirée)

1. **Bouton flottant `+ Task`** global (visible sur toutes les pages CRM, position bottom-right)
2. **Quick-add inline** sur la fiche prospect (1 ligne en haut de la timeline activités)
3. **4 vues** sur `/admin/crm/tasks` :
   - List (par défaut)
   - Kanban (3 colonnes À faire / En cours / Terminé)
   - Calendar (vue semaine + mois)
   - Aujourd'hui (focus du jour : en retard + dues today, tri priorité)
4. **Switch de vue 1-clic** (tabs en haut)
5. **Last activity / Next activity** affichés sur fiche prospect (pattern Pipedrive)
6. **Délégation 1-clic** : bouton "Déléguer" sur une tâche → modal de choix collègue + note transmise
7. **Commentaires inline + @mention** sur chaque tâche
8. **Snooze** : bouton "Reporter" sur tâche → options "1h / 4h / Demain / La semaine prochaine / Date custom"
9. **Digest matinal** : 1 email/jour par commercial avec ses tâches du jour + en retard

### Notifications

- In-app (cloche header)
- Email (digest matinal + alertes en retard)
- Snooze respecté (pas de notif tant que `snoozed_until > now()`)

### Hors scope (NE PAS implémenter)

- ❌ App mobile / offline
- ❌ Reporting / analytics commercial
- ❌ IA / suggestions
- ❌ Système de types/catégories (géré ailleurs)
- ❌ Tâches sur autres objets (devis, session, formateur, financeur, client)
- ❌ Automation OPCO
- ❌ Vue Pipeline (couverte par Tunnel de Vente existant)

### Découpage stories recommandé

**Option A — 1 story compacte (h-19)** : tout dans 1 story, ~6-9 j-h dev. Risque : story large, code review lourd.

**Option B — 3 stories séquentielles (recommandé)** :
- **h-19** : backend + 4 vues (List/Kanban/Calendar/Today) — 3-4 j-h
- **h-20** : ergonomie HubSpot (bouton flottant, quick-add, snooze, delegate, @mention) — 2-3 j-h
- **h-21** : 2 automations + digest matinal — 1-2 j-h

→ Choix à faire dans `bmad-create-story`.

### Prochaine étape recommandée

Lancer `bmad-create-story` pour produire la story h-19 (ou les 3 stories h-19/20/21 séquentielles).
