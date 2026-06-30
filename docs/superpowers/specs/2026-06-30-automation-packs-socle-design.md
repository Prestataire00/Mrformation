# Packs d'automatisation — Lot 1 : Socle (modèle de données + moteur) — Design

**Date :** 2026-06-30
**Statut :** Approuvé (design), en attente du plan d'implémentation
**Périmètre :** Lot 1 d'un projet multi-lots. Ce lot pose la **fondation** : modèle de données des packs éditables, snapshot par formation, et bascule du moteur d'exécution sur ce snapshot — **sans changer l'UX** (éditeur de packs = Lot 2, sélecteur à la création = Lot 3, onglet formation = Lot 4, doc contrat ST + parcours C3V = Lot 5).

## Contexte & objectif

Aujourd'hui l'automatisation repose sur des **règles globales par entité** (`formation_automation_rules`) activables individuellement, et des **packs figés dans le code** (`src/lib/automation/default-packs.ts`) qui, à l'activation, sont **éclatés en règles d'entité**. Objectif cible : des **packs/parcours éditables, sélectionnables par formation**, sur un modèle timeline (J-x → action), figés à la création (snapshot).

**Décisions validées en cadrage :**
- Packs **éditables en base** (data-driven), pas figés en code.
- Liaison pack→formation = **snapshot à la création** (éditer un pack n'affecte pas les formations déjà créées ; un « réappliquer le pack » viendra en Lot 4).

## Architecture cible (rappel, pour situer le Lot 1)

A. `automation_packs` + `automation_pack_steps` (gabarit éditable) · B. `session_automation_steps` (snapshot par formation) · C. moteur lit le snapshot · D. éditeur de packs (Lot 2) · E. sélecteur à la création (Lot 3) · F. onglet formation timeline (Lot 4) · G. doc contrat ST + parcours C3V (Lot 5).

---

## Périmètre du Lot 1

### 1. Nouvelles tables (migration SQL dédiée)

**`automation_packs`**
- `id UUID PK`, `entity_id UUID NOT NULL` (isolation entité — un pack appartient à une entité, ce qui permet un pack C3V distinct),
- `name TEXT NOT NULL`, `description TEXT`, `icon TEXT`, `color TEXT`,
- `is_default BOOLEAN DEFAULT false` (le pack proposé par défaut à la création pour cette entité),
- `created_at`, `updated_at`.

**`automation_pack_steps`** (le gabarit réutilisable — une étape = un « rule template »)
- `id UUID PK`, `pack_id UUID NOT NULL REFERENCES automation_packs(id) ON DELETE CASCADE`,
- `order_index INTEGER NOT NULL` (ordre d'affichage / séquence),
- `trigger_type TEXT NOT NULL` (réutilise l'énumération existante : `session_start_minus_days`, `session_end_plus_days`, `on_session_creation`, `on_session_completion`, `on_enrollment`, `on_signature_complete`, `questionnaire_reminder`, etc.),
- `days_offset INTEGER NOT NULL DEFAULT 0`,
- `recipient_type TEXT` (`learners` | `trainers` | `companies` | `all`),
- `document_type TEXT` (un `ConventionDocType`) **ou** `email_template_id UUID` (réutilise `email_templates`),
- `condition_subcontracted BOOLEAN DEFAULT NULL` (conservé pour compat ; deviendra largement inutile une fois la sélection par pack en place),
- `send_email BOOLEAN DEFAULT true` (parité avec l'existant),
- `name TEXT`, `description TEXT`,
- `created_at`, `updated_at`.

**`session_automation_steps`** (le snapshot par formation — ce que la formation exécute réellement)
- `id UUID PK`, `session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE`,
- `source_pack_id UUID REFERENCES automation_packs(id) ON DELETE SET NULL` (traçabilité du pack d'origine),
- **mêmes colonnes d'étape** que `automation_pack_steps` (trigger_type, days_offset, recipient_type, document_type, email_template_id, condition_subcontracted, send_email, name, description, order_index),
- `is_enabled BOOLEAN DEFAULT true` (désactivation au cas par cas — Lot 4),
- `last_executed_at TIMESTAMPTZ`, `execution_count INTEGER DEFAULT 0`,
- `created_at`, `updated_at`.

**RLS** : les 3 tables filtrées par entité. `automation_packs`/`automation_pack_steps` directement via `entity_id` (steps via jointure `pack_id → automation_packs.entity_id`). `session_automation_steps` via jointure `session_id → sessions.entity_id`. Helpers RLS en `public` (cf. mémoire projet : `public.user_role()`, pas `auth`). On garde `session_automation_logs` (audit) inchangée.

### 2. Service de snapshot (instanciation pack → formation)

Fonction métier `instantiatePackForSession(supabase, packId, sessionId)` :
- copie chaque `automation_pack_steps` du pack (étapes du gabarit) en lignes `session_automation_steps` (avec `source_pack_id = packId`),
- **idempotente / remplaçante** : si la session a déjà un snapshot, on le remplace (base du futur « réappliquer le pack » — Lot 4),
- filtrée par entité (le pack et la session doivent appartenir à la même entité).

> Ce service est livré en Lot 1 mais **branché à la création en Lot 3**. En Lot 1, il est testable unitairement et appelable manuellement.

### 3. Bascule du moteur d'exécution (back-compat)

Le cron `run-cron` et `executeRuleForSession` (`src/lib/automation/`) doivent, **pour chaque session traitée** :
- **si la session a des `session_automation_steps`** → exécuter **ce snapshot** (nouvelle source), en réutilisant tout le moteur existant (résolution destinataires, génération PDF, `enqueueEmail`, dedup `email_history`, log `session_automation_logs`, calcul d'offset via `compute-events`).
- **sinon (formations historiques)** → conserver le comportement actuel basé sur `formation_automation_rules` (legacy) — **aucune régression**.

Aucune formation existante n'est forcée vers le nouveau modèle dans ce lot (migration douce, opt-in par snapshot).

### 4. Migration des packs code → base (seed)

Seeder les 4 packs existants (`default-packs.ts` : qualiopi-standard, opco, commercial, sous-traitance) en lignes `automation_packs` + `automation_pack_steps`, **par entité** (MR + C3V). `default-packs.ts` reste la **source du seed** (script de migration de données ou seed idempotent). Le pack `qualiopi-standard` est marqué `is_default = true` par entité (back-compat : c'est ce qui était proposé par défaut).

## Hors périmètre du Lot 1 (lots suivants)

- Éditeur de packs UX (Lot 2), sélecteur de pack à la création + remplacement de la checkbox sous-traitance (Lot 3), onglet formation timeline + « réappliquer le pack » (Lot 4), nouveau doc « contrat de sous-traitance » + assemblage parcours C3V (Lot 5).
- Pas de suppression de `formation_automation_rules` ni des règles d'entité existantes dans ce lot (cohabitation pour back-compat ; dépréciation éventuelle plus tard).

## Règles projet à respecter

- Chaque requête Supabase filtrée par `entity_id` ; RLS sur les 3 nouvelles tables (helpers en `public`).
- Migration SQL dans un fichier dédié (jamais d'édition directe de `schema.sql` sans migration).
- Services dans `src/lib/automation/` (pas d'appels Supabase inline dans les composants — sans objet ici, Lot 1 = data + moteur).
- Pas de type `any`. Barrières : `tsc --noEmit` + `vitest` (lint ESLint 9 cassé).

## Risques / points de vigilance

1. **Double exécution** : garantir qu'une session pack-driven n'exécute PAS aussi les règles d'entité legacy (sinon emails en double). Règle claire : présence de `session_automation_steps` ⇒ on ignore les règles d'entité pour cette session.
2. **Migration Supabase prod** : 3 tables + RLS + seed, à jouer manuellement dans le Dashboard ; extensions hors `search_path` (cf. mémoire).
3. **Parité fonctionnelle** : le snapshot doit couvrir tous les champs que le moteur lit aujourd'hui (recipient_type, document_type, template_id, send_email, condition_subcontracted) — sinon perte de comportement.

## Critères d'acceptation (Lot 1)

- Migration appliquée : 3 tables créées avec RLS, 4 packs seedés par entité.
- `instantiatePackForSession` : instancier un pack sur une session crée les `session_automation_steps` attendus (test unitaire) ; ré-instancier remplace proprement.
- Cron : une session AVEC snapshot exécute ses étapes (et pas les règles d'entité) ; une session SANS snapshot garde le comportement legacy (test/contrôle).
- `tsc --noEmit` vert, `vitest` vert.
