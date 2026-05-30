# Module Automatisations — Notes techniques

## Triggers V1 supportés (CHECK constraint actif)

| Trigger | Mécanisme | Story | Statut |
|---|---|---|---|
| `session_start_minus_days` | Cron quotidien (Netlify scheduler → `/api/formations/automation-rules/run-cron`) | (existant) | ✅ Prod |
| `session_end_plus_days` | Cron quotidien | (existant) | ✅ Prod |
| `on_session_creation` | Ping fire-and-forget depuis `POST /api/sessions` après insert réussi | (existant) | ✅ Prod |
| `on_session_completion` | Ping fire-and-forget depuis `TabParcours.tsx:handleMarkCompleted` quand l'admin marque la formation terminée | (existant) | ✅ Prod |
| `on_enrollment` | Ping fire-and-forget depuis `ResumeLearners.tsx` après chaque `enrollLearner` / `createLearnerAndEnroll`, avec filtre `learner_id` pour ne notifier que le nouvel apprenant inscrit | aut-d-1 | ✅ Prod |
| `certificate_ready` | Ping fire-and-forget depuis `TabParcours.tsx:handleMarkCompleted`, juste après `on_session_completion`. L'admin est responsable de marquer "terminée" uniquement quand tous les émargements sont signés (philosophie V1 loose). | aut-d-2 | ✅ Prod |
| `opco_deposit_reminder` | Cron quotidien — détecte les dossiers OPCO en attente | (existant) | ✅ Prod |

## ADR — Triggers différés V2 (FR-AUT-56)

Le CHECK constraint sur `formation_automation_rules.trigger_type` accepte 10 valeurs (cf. `extend_automation_system.sql`), mais seulement 7 sont implémentées en V1. Les 3 autres sont **différés V2** avec justification :

### `on_signature_complete` — différé V2

**Raison** : partiellement couvert par `certificate_ready` (V1). Le cas business-critique (envoi certificat post-formation Qualiopi) est traité.

**Si besoin en V2** : ajouter un ping côté route ou trigger PG qui détecte la dernière signature posée pour une session (`UPDATE signatures` quand `(count signatures signed = count enrollments × count time_slots)`).

### `questionnaire_reminder` — différé V2

**Raison** : la logique de relance post-session questionnaire est hors scope V1. La fonctionnalité auto-send questionnaires existe déjà (cron #1 `/api/questionnaires/auto-send`, chantier 2c), mais sans relance.

**Si besoin en V2** : nouveau cron quotidien qui détecte les questionnaires envoyés > N jours sans réponse et relance.

### `invoice_overdue` — différé V2

**Raison** : déjà adressé hors module automatisations par la route dédiée `/api/invoices/process-reminders` (cron facturation). Pas de raison de dupliquer dans le moteur automatisations.

**Si besoin en V2** : migrer la logique des reminders factures dans le moteur automatisations pour unifier l'UX d'audit. Lourd, faible ROI.

## Check strict émargements pour `certificate_ready` (envisagé V2)

**Philosophie V1 actuelle (loose)** : l'admin est responsable de marquer "terminée" uniquement quand tous les émargements sont signés. Le trigger se déclenche dès la transition `status → completed` (TabParcours.tsx).

**Check strict envisagé V2** : avant le ping, vérifier côté `trigger-event` ou `run-cron` que pour chaque enrollment de la session, il existe une signature par créneau (matin/après-midi/jour selon le timeslots de la formation). Si la condition n'est pas remplie, ne pas déclencher et laisser un warning dans `session_automation_logs`.

**Pourquoi différé** : la définition de "tous les émargements signés" dépend du modèle d'émargement (par jour, par demi-journée, par créneau). La logique de comptage demande de croiser `signatures × enrollments × formation_time_slots` avec une définition métier précise. À cadrer avec Wissam quand le besoin émerge (cas qualité Qualiopi terrain).

## Routes ping fire-and-forget — pattern

Toutes les surfaces UI qui doivent déclencher un trigger événementiel passent par une **route admin-auth** qui :
1. Vérifie le rôle (`admin`/`super_admin`/`trainer`)
2. Vérifie l'appartenance entité (la session/learner/etc. doit appartenir à l'entité de l'appelant ; super_admin bypass)
3. Proxy vers `/api/formations/automation-rules/run-cron` avec `Bearer ${process.env.CRON_SECRET}` côté serveur

Routes existantes :

| Route | Trigger | Body |
|---|---|---|
| `/api/formations/automation-rules/trigger-event` | générique (`on_session_completion`, `certificate_ready`, etc.) | `{ session_id, trigger_type \| rule_id }` |
| `/api/automation/trigger-on-enrollment` | `on_enrollment` spécifiquement (porte `learner_id`) | `{ session_id, learner_id }` |
| `/api/automation/dry-run` | aperçu sans envoi | `{ rule_id, session_id? }` |

**Catch silencieux** : un échec du ping ne doit jamais casser l'action déclenchante (inscription apprenant, marquage session terminée, etc.). Le ping est fire-and-forget.

## Filtrage learner_id (aut-d-1)

`resolveRecipients(supabase, sessionId, recipientType, opts?: { onlyLearnerId?: string })` filtre les recipients de type `learner` sur cet apprenant uniquement quand `onlyLearnerId` est fourni. Les recipients `trainers`/`companies` ne sont pas affectés — c'est l'inscription qui les concerne, pas l'apprenant inscrit.

Propagation depuis `run-cron` TARGETED MODE → `executeRuleForSession.onlyLearnerId` → `resolveRecipients`.
