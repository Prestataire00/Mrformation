---
stepsCompleted: [1, 2, 3, 4]
session_continued: true
continuation_date: 2026-05-18
inputDocuments: []
session_topic: 'Nouvelle gestion du système des tâches dans le CRM commercial'
session_goals: "Benchmark best-in-class (HubSpot / Pipedrive / Salesforce / Asana) et identifier ce qui s'adapte au contexte LMS-CRM hybride pour les commerciaux Marc & Taline. Phase 4 (continuation 2026-05-18) : filtre par propriétaire pour admin/super_admin/commercial."
selected_approach: ''
techniques_used: ['Competitive Analysis', 'SCAMPER Adapt', 'Analogical Thinking', 'Divergence multi-domaines orthogonaux (Phase 4)']
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

---

## Phase 4 — Continuation 2026-05-18 (post code review h-19)

### Sujet de la phase

**Ajouter dans `/admin/crm/tasks` un filtre par propriétaire (`assigned_to`), visible et utile pour les rôles `admin`, `super_admin`, `commercial`.**

### Contexte technique injecté

Hérité du code review BMad h-19 du 2026-05-18 :
- Le filtre `assigneeFilter` existe déjà dans `page.tsx` (state ligne 140, query ligne 204) mais utilise un `<Select>` simple noyé dans la barre de filtres → faible discoverability.
- Décision produit confirmée : **commercial = peer-access** (voit toutes les tâches de son entité, pas seulement les siennes — voir `deferred-work.md`).
- **Bug pré-existant** : `fetchProfiles` ligne 166 filtre `["admin", "trainer"]` → ne contient PAS les `commercial`. Un commercial assigné à une tâche n'apparaît pas dans le select. **Prérequis P0 à fixer quel que soit le design retenu.**

### Cadrage produit

- **Besoin double** : opérationnel (commercial filtre sur ses propres tâches en 1 clic) ET manager (admin/super_admin filtre sur un commercial donné pour voir sa charge)
- **Couplage vues** : filtre global, affecte les 4 vues (List + Kanban + Calendar + Today)

### Technique facilitateur

**Divergence multi-domaines orthogonaux** (anti-bias) avec pivot tous les ~6 idées. 6 domaines explorés :
- A. Surface UX du filtre
- B. Comportement et presets intelligents
- C. Persistance, sharing, URL
- D. Sécurité, RLS, data quality
- E. Intégration vues (List/Kanban/Calendar/Today)
- F. Adjacent / cross-feature (idées débloquées)

### Idées générées (37)

#### Domaine A — Surface UX

1. Select existant remonté à côté des stats hero (pas noyé)
2. Pill toggle preset "Mes tâches" / "Toute l'équipe" + Combobox secondaire pour cibler 1 commercial
3. Avatar bar HubSpot-style (bulles initiales, ⌘+clic multi-sel)
4. Combobox recherchable shadcn (`Command` / `Popover`) — scale >10 commerciaux
5. ❌ Tabs assignee (conflit avec les tabs vues existantes)
6. Filtre dans URL `?assignee=...` + breadcrumb cliquable "Filtré : Marc ✕"
7. ❌ Sidebar dédiée "Équipe" Asana-style (pivot trop lourd)

#### Domaine B — Comportement / presets

8. Default automatique par rôle : commercial → "Mes tâches" ; admin/super_admin → "Toute l'équipe"
9. Preset "Non assigné" — voir les tâches orphelines à dispatcher
10. Preset "Sans moi" — manager veut voir ce que font les autres
11. Preset "Équipe + moi" — multi-sélection rapide
12. Sticky session : dernier choix mémorisé par utilisateur (localStorage)
13. ❌ Override Today auto vers user_id (rejeté par cadrage : filtre global)

#### Domaine C — Persistance / sharing

14. URL canonique `?assignee=<uuid>` pour partage Slack/email
15. localStorage par user (persistance cross-session sur même navigateur)
16. Pas de persistance (reset chaque visite)
17. ❌ Cookie serveur sync multi-device (overkill)
18. Historique "Last 5 filters used"

#### Domaine D — Sécurité / RLS / data quality

19. **Bug fix prereq P0** : `fetchProfiles` ne filtre pas `commercial`. Élargir aux rôles `["admin", "super_admin", "trainer", "commercial"]`.
20. Inclure tous les rôles capables d'avoir des tâches dans le select
21. Filtrer aux rôles avec `has_crm_access = true` (join propre)
22. RLS check : un commercial peut filtrer sur un admin ? Oui (peer-access). OK.
23. Garde anti-fuite URL : UUID d'autre entité → 0 résultat (déjà couvert par `eq("entity_id", entityId)`)
24. ❌ Audit log "qui regarde qui" (overkill GDPR)

#### Domaine E — Intégration vues

25. Filtre appliqué uniformément aux 4 vues
26. Indicator visuel persistant "Filtré : Marc (12 tâches)" dans la barre de vue
27. Counts dynamiques dans le select : "Marc (12) / Taline (8) / Moi (5) / Non assigné (3)"
28. Stats hero recalculées selon filtre (sinon stats menteuses)
29. Reset auto au switch d'entité (MR ↔ C3V)
30. Color-code par owner dans Kanban / Calendar (bordure colorée)

#### Domaine F — Adjacent / cross-feature débloqués

31. Swimlanes Kanban par owner (mode "vue manager")
32. Workload widget : graphe top "Marc 12 | Taline 8 | Moi 5" cliquable comme filtre
33. Réassignation rapide depuis menu 3-points + filtre owner → workflow rebalance fluide
34. Bulk actions : "Réassigner toutes les tâches filtrées à Taline"
35. Email digest matin (h-21) — filtre owner = base technique pour scoper
36. Notification "X t'a assigné une tâche" + redirect vers vue filtrée sur moi
37. Badge global rouge sidebar si tâches "non assignées" existent

### Convergence — design MVP recommandé

**Story h-20 candidat (~1 j-h)** : combo de 5 idées qui se renforcent.

| # | Idée retenue | Source | Rôle |
|---|--------------|--------|------|
| A | Pill toggle preset "Mes tâches" / "Toute l'équipe" + Combobox shadcn cible 1 commercial | #2 + #4 | Couvre besoin double, scale >10 commerciaux |
| B | Default automatique par rôle (commercial → Moi ; admin → Équipe) | #8 | Zero friction au premier load |
| C | Fix bug `fetchProfiles` + élargir rôles + check `has_crm_access` | #19 + #20 + #21 | **Prereq P0** — sans ça le filtre est cassé |
| D | URL canonique `?assignee=<uuid>` + counts dynamiques select + stats hero recalculées | #14 + #27 + #28 | Partage + cohérence visuelle |
| E | Preset bonus "Non assigné" | #9 | Tiny add, gros impact manager |

**Hors MVP — vagues 2/3 (stories séparées)** :
- Avatar bar HubSpot (#3) — UX premium, validation post-MVP
- Swimlanes Kanban par owner (#31) — pivot lourd, story dédiée si demande terrain
- Bulk réassignation (#34) — surface produit nouvelle
- Color-code Calendar/Kanban (#30) — nice-to-have
- Workload widget (#32) — utile pour story dashboard manager

**Explicitement écartés** :
- ❌ Sidebar Asana (#7) — pivot trop lourd
- ❌ Override Today auto (#13) — rejeté en cadrage
- ❌ Audit log GDPR (#24) — overkill

### Effort estimé MVP

| Tâche | Lignes | Temps |
|-------|--------|-------|
| Fix `fetchProfiles` (rôles + `has_crm_access`) | ~5 | 15 min |
| Pill toggle "Mes tâches" / "Toute l'équipe" (pattern toggle vue existant) | ~30 | 30 min |
| Combobox shadcn `Command` cible commercial | ~50 | 1h |
| Default par rôle (useEffect) | ~5 | 15 min |
| URL params (`useSearchParams` Next.js) | ~10 | 30 min |
| Counts dans select + stats hero recalculées | ~15 | 1h |
| Preset "Non assigné" | ~10 | 30 min |
| Smoke tests + tsc | — | 30 min |
| **Total** | **~125 LOC** | **~1 j-h** |

### Prochaine étape recommandée pour la Phase 4

Lancer `bmad-create-story` pour produire la story **h-20 — Filtre par propriétaire dans /admin/crm/tasks**.

Inputs prêts pour la story :
- Acceptance criteria : 1 AC par idée retenue A-E + AC anti-régression sur le filtre existant
- Dev notes : pattern toggle vue existant (page.tsx:467-480), Combobox shadcn dispo, `has_crm_access` à vérifier dans le schema
- Risque clé : ne PAS casser le comportement actuel pour les rôles `trainer` (qui sont scopés différemment côté backend route.ts)
