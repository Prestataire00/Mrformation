# Solidification du workflow Automatisations — Design

**Date :** 2026-05-22
**Statut :** Validé
**Périmètre :** sous-onglet « Automatisations » de la fiche formation (`TabAutomation`) et tout son moteur — composants `TabAutomation` / `AutomationTimeline`, `lib/automation/*`, routes `/api/formations/automation-rules/*` et `/api/formations/[id]/automation-*`, tables `formation_automation_rules` / `session_automation_overrides` / `session_automation_logs`. Refonte de fiabilité et de cohérence — **pas** de nouvelle fonctionnalité produit.
**Base :** audit deep-dive `docs/deep-dive-automatisations.md`, sections §6 (état des lieux) et §9 (pistes).

---

## 1. Contexte & objectif

L'audit deep-dive a établi que le sous-onglet « Automatisations » ressemble à un système complet (3 tables avec vraie RLS, 7 routes API, `lib/automation/*`) mais **n'automatise presque rien aujourd'hui** :

- **B1 — la vue « Règles » est morte.** `TabAutomation.fetchData` lit la colonne `is_active`, qui n'existe pas (le booléen est `is_enabled`). La requête échoue, l'erreur est avalée par un `catch {}`, la liste des règles est toujours vide → la vue affiche en permanence « Aucune règle configurée ».
- **B2 — le bouton « Tester » ne teste rien.** Il envoie `trigger_type: "manual_test"` qui ne correspond à aucune règle ; le `rule_id` est perdu par le proxy. Réponse toujours `{ sent: 0 }`.
- **B3 — les actions manuelles en masse sont un stub.** La route `automation-trigger` journalise un faux `success`/`0` et n'envoie rien.
- **B4 — les automatisations à date ne partent jamais.** Aucun planificateur n'appelle `run-cron` en mode global ; `netlify.toml` ne planifie que la file email. Les règles « Convocation J-X », « Certificat J+X », « Satisfaction », « Rappel OPCO » — le cœur du produit — ne s'exécutent jamais d'elles-mêmes.
- **Dette :** moteur `run` mort (aucun appelant), colonne `document_types[]` orpheline, route `automation-overrides` propre mais inutilisée, deux jeux de « règles par défaut » divergents, des `any` (violation CLAUDE.md), aucun test.

**Objectif :** rendre ce workflow **fonctionnel, fiable et cohérent**.

### Décisions de cadrage

1. **Solidification complète** : corriger B1→B4 **et** traiter la dette **et** ajouter des tests — un seul chantier cohérent.
2. **Planificateur B4 : fonction planifiée Netlify** (dans le dépôt, versionnée, sans dépendance externe — même pattern que `process-scheduled-emails.mts`).
3. **Déclenchement manuel : exécution réelle par règle**, et **retrait** des actions manuelles en masse (redondantes, trompeuses). Un seul mécanisme.
4. **Contrôle par session : activer/désactiver seulement.** Pas de nouvelle capacité d'édition (offset / template par session) — les colonnes restent disponibles pour un chantier ultérieur.
5. **Approche hybride** (cf. §3).

---

## 2. Approche retenue : hybride

Extraire le cœur réutilisé là où la duplication coûte cher ; corriger le reste en place.

- Le cœur d'exécution (résolution des destinataires + exécution d'une règle), aujourd'hui dupliqué entre les 2 modes de `run-cron`, est extrait dans un **module testable** (volet A).
- `run-cron` devient un routeur à **3 modes** s'appuyant tous sur ce module (volet B).
- Un **planificateur Netlify** branche enfin le moteur quotidien (volet C).
- Les correctifs UI (B1, B2, B3) et la dette sont traités en place (volets D, E).
- Une couche de tests Vitest couvre le cœur extrait et la logique de timeline (volet F).

Une refonte complète en couche de service a été écartée — disproportionnée et risquée sur un moteur d'envoi d'emails en production.

---

## 3. Volet A — Cœur d'exécution extrait & testable

Nouveau module `src/lib/automation/execute-rule.ts`. On y déplace la logique aujourd'hui dupliquée dans les modes ciblé et global de `run-cron` :

- **`resolveRecipients(supabase, session, recipientType)`** — construit la liste des destinataires d'une session selon `recipient_type` (`learners` / `trainers` / `companies` / `all`) en interrogeant `enrollments`, `formation_trainers`, `formation_companies`. Forme de sortie normalisée : `{ id, email, first_name, last_name, type }`.
- **`buildAttachmentsForRecipient(...)`** — déjà isolée comme fonction dans `run-cron` (types système + templates Word custom par UUID) ; déplacée telle quelle dans le module.
- **`executeRuleForSession(supabase, rule, session, templateMap, customTemplatesById)`** — exécute **une** règle pour **une** session : résout les destinataires, construit sujet/corps (template `email_templates` ou fallback), `enqueueEmail` par destinataire (`email_history` `status='pending'`, le worker existant envoie), renvoie un compte d'emails enqueués.

Typage propre : `SupabaseClient` (de `@supabase/supabase-js`) partout — plus aucun `any`.

Les parties pures (construction du fallback sujet/corps, descripteurs d'attachements) sont conçues pour être testables isolément.

---

## 4. Volet B — `run-cron` : 3 modes sur le même cœur

`run-cron` reste la route protégée par `CRON_SECRET`. Elle devient un routeur à trois modes, tous délégant à `execute-rule.ts` :

1. **Global** (body vide) — itère les entités, traite les règles date-based (`session_start_minus_days`, `session_end_plus_days`) et les rappels `opco_deposit_reminder`. Comportement fonctionnel inchangé, mais la boucle d'exécution passe par le helper. Conserve l'anti-doublon via `email_history`.
2. **Ciblé par trigger** (`{ trigger_type, session_id }`) — inchangé fonctionnellement (utilisé par `sessions/route.ts` pour `on_session_creation` et par la clôture de session pour `on_session_completion`).
3. **Nouveau — ciblé par règle** (`{ rule_id, session_id }`) — charge **la** règle et **la** session (contrôle d'appartenance entité), exécute via le helper, **journalise** le résultat dans `session_automation_logs` (`is_manual: true`, `status` `success`/`partial`/`failed`, `recipient_count` réel). Renvoie une erreur explicite si la règle ou la session est introuvable. C'est le socle de B2.

---

## 5. Volet C — Le planificateur (B4)

Nouvelle fonction planifiée Netlify **`netlify/functions/run-automations.mts`**, calquée sur `process-scheduled-emails.mts` :

- Planifiée **1×/jour le matin** (`schedule: "0 7 * * *"` — 7h UTC ≈ 9h Paris).
- `POST` `/api/formations/automation-rules/run-cron` avec `Authorization: Bearer ${CRON_SECRET}` et **body vide** → déclenche le mode global.
- Journalise le résultat (comme la fonction email).

C'est le correctif décisif : sans lui, les automatisations à date ne partent jamais.

---

## 6. Volet D — Correctifs de l'onglet

### B1 — réanimer la vue « Règles »
`TabAutomation.fetchData` : `is_active` → `is_enabled` dans le `select(...)` **et** dans le filtre `applicableRules`. Le `catch {}` muet devient un `catch` qui pose un toast d'erreur (plus de panne silencieuse — conforme CLAUDE.md « action async sans try/catch + toast »).

### B2 — exécution réelle par règle
- Le bouton « Tester » de la vue Règles est renommé **« Exécuter maintenant »** (libellé honnête : il exécute réellement la règle pour cette session). Idem « Envoyer maintenant » / « Relancer » du dialog Timeline (déjà bien nommés).
- Le proxy `POST /api/formations/automation-rules/trigger-event` transmet désormais le `rule_id` reçu (aujourd'hui ignoré) et appelle `run-cron` en **mode ciblé-par-règle** (`{ rule_id, session_id }`).
- Le résultat (compte d'emails) est affiché dans le toast, et la donnée est rafraîchie (`fetchData` / `fetchTimeline`).

### B3 — retrait des actions manuelles en masse
- Suppression des 3 boutons « Actions manuelles » de `TabAutomation`, du tableau `bulkActions`, de `handleBulkAction`, de l'état `bulkDialog` et de son `Dialog`.
- Suppression de la route stub `src/app/api/formations/[id]/automation-trigger/route.ts`.

---

## 7. Volet E — Dette technique

- **Suppression du moteur mort** `src/app/api/formations/automation-rules/run/route.ts` (aucun appelant ; implémentation synchrone divergente de `run-cron`).
- **Migration SQL** (`supabase/migrations/`) : `ALTER TABLE formation_automation_rules DROP COLUMN IF EXISTS document_types;` (colonne orpheline, ajoutée par `extend_automation_system.sql`, lue par aucun code).
- **Unification des règles par défaut** : `DEFAULT_RULES` (dans `automation-rules/route.ts`) est dérivé de `AUTOMATION_PACKS` (`default-packs.ts`) — source unique. Le fallback GET « aucune règle » réutilise le pack Qualiopi standard.
- **Unification de l'écriture des overrides** : `TabAutomation.handleToggle` et `AutomationTimeline.handleToggleOverride` adoptent **une seule sémantique** — `upsert` sur `session_automation_overrides` avec `onConflict: "session_id,rule_id"` (activer = `is_enabled: true`, désactiver = `is_enabled: false`). La route `automation-overrides` (GET/PATCH/DELETE), inutilisée, est **supprimée** : les tables ont une RLS réelle, l'écriture directe par le client navigateur est sûre et suffisante pour un simple toggle.
- **Suppression des `any`** : `compute-events.ts` (`SupabaseLike`) et tout résidu, typés via `SupabaseClient`.

---

## 8. Volet F — Tests (Vitest, environnement `node`)

- **`buildSessionEvents`** (`compute-events.ts`, fonction pure) — calcul des `scheduled_date` (J-X / J+X / création / clôture), des `status` (`pending` / `executed` / `overridden` / `failed`), application des overrides, filtrage `condition_subcontracted`.
- **Parties pures de `execute-rule.ts`** — construction du fallback sujet/corps, descripteurs d'attachements (`buildAttachmentsForRecipient` : type système vs UUID template Word), shaping de la liste de destinataires.
- Les routes et la fonction planifiée sont vérifiées par `tsc --noEmit` + suite verte (pas de framework de test d'intégration HTTP/cron dans le projet).

---

## 9. Architecture & fichiers

**Créés :**
- `src/lib/automation/execute-rule.ts` — cœur d'exécution (résolution destinataires, attachements, exécution d'une règle).
- `src/lib/automation/__tests__/execute-rule.test.ts`, `src/lib/automation/__tests__/compute-events.test.ts` — tests Vitest.
- `netlify/functions/run-automations.mts` — fonction planifiée quotidienne (volet C).
- Une **migration SQL** (`supabase/migrations/`) : `DROP COLUMN document_types`.

**Modifiés :**
- `src/app/api/formations/automation-rules/run-cron/route.ts` — 3 modes, délègue au helper, mode ciblé-par-règle ajouté.
- `src/app/api/formations/automation-rules/trigger-event/route.ts` — transmet `rule_id`.
- `src/app/api/formations/automation-rules/route.ts` — `DEFAULT_RULES` dérivé de `AUTOMATION_PACKS`.
- `src/app/(dashboard)/admin/formations/[id]/_components/TabAutomation.tsx` — B1 (`is_enabled`, toast d'erreur), B2 (« Exécuter maintenant »), B3 (retrait des actions en masse), sémantique d'override unifiée.
- `src/app/(dashboard)/admin/formations/[id]/_components/AutomationTimeline.tsx` — sémantique d'override unifiée.
- `src/lib/automation/compute-events.ts` — typage `SupabaseClient`, plus de `any`.

**Supprimés :**
- `src/app/api/formations/automation-rules/run/route.ts` (moteur mort).
- `src/app/api/formations/[id]/automation-trigger/route.ts` (stub B3).
- `src/app/api/formations/[id]/automation-overrides/route.ts` (route inutilisée).

**Inchangé :** modèle de données (hormis le `DROP COLUMN document_types`), `default-packs.ts`, la page globale `/admin/automation`, le worker `process-scheduled-emails.mts`.

---

## 10. Hors périmètre

- Aucune nouvelle capacité d'édition par session (offset / template / destinataire) — décision de cadrage : on/off seulement.
- Refonte de la page globale `/admin/automation` (édition des règles) — inchangée.
- Câblage des 5 `trigger_type` déclarés mais jamais exécutés (`on_enrollment`, `on_signature_complete`, `invoice_overdue`, `questionnaire_reminder`, `certificate_ready`) — c'est une fonctionnalité, pas un correctif ; chantier ultérieur.
- Réécriture des policies RLS — les 3 tables d'automatisation ont déjà une RLS réelle (isolation par entité).

---

## 11. Critères de succès

- La vue « Règles » affiche les règles réelles de l'entité (B1 corrigé) ; une erreur de chargement est visible (toast), plus silencieuse.
- « Exécuter maintenant » exécute réellement la règle ciblée pour la session et affiche le compte d'emails ; le `rule_id` n'est plus perdu (B2 corrigé).
- Les 3 actions manuelles en masse et la route stub `automation-trigger` n'existent plus (B3 corrigé).
- Une fonction planifiée Netlify déclenche `run-cron` en mode global chaque jour — les automatisations à date partent enfin (B4 corrigé).
- Le cœur d'exécution est extrait dans `execute-rule.ts`, partagé par les 3 modes, sans duplication.
- Le moteur mort `run`, la route inutilisée `automation-overrides`, la colonne orpheline `document_types`, les `any` et les doublons de règles par défaut sont supprimés.
- `buildSessionEvents` et les parties pures de `execute-rule.ts` sont couverts par des tests Vitest.
- Aucune régression : suite de tests verte, `tsc --noEmit` propre.
