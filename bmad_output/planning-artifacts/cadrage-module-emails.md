# Cadrage du module Emails — MR / C3V Formation

**Auteur :** Mary (Business Analyst, BMad)
**Date :** 2026-05-28
**Statut :** Document de cadrage — v1.0 (✅ validé le 2026-05-28 par Wissam)
**Demandeur :** Wissam (dev) au nom de Loris (gérant OF, utilisateur principal et future cible "client autonome")
**Branche analysée :** `main` (post-merge sous-chantier 2 `/admin/documents` V2 Patch UX, commit `30d67c4`)

> **Décisions validées le 2026-05-28** :
> 1. **Périmètre "client autonome"** : le client cible est **l'admin de l'entité MR/C3V** (= Loris aujourd'hui). Pas le client B2B final, pas les trainers. Donner à Loris l'autonomie complète sur le contenu des emails du LMS/CRM sans devoir solliciter Wissam.
> 2. **Tous les champs sont éditables** par l'admin : subject, body, variables, pièces jointes auto (`attachment_doc_types`), `recipient_type`, `trigger_type` (pour les rules), et l'expéditeur configurable par entité.
> 3. **Périmètre : big bang complet** — unification des 5 pipelines email actuels vers une source de vérité unique `email_templates`. Pas de just-enough.
> 4. **Suppression des fallbacks hardcoded** : après migration, les routes cron/batch n'ont plus de filet de sécurité hardcoded (sécurité par seed obligatoire de templates par défaut au déploiement).
> 5. **Pas de full versioning** (décision Mary, validée par Wissam "je sais pas") — on s'appuie sur `email_history.body` qui archive déjà tout email envoyé. Ajout uniquement de `created_by` + `updated_at` + `is_active` (soft-archive). Si évolution future nécessaire, on pourra ajouter `email_template_versions` sans casser l'existant.
> 6. **Pas de templates système verrouillés** — tout est custom. Seed initial des templates par défaut au déploiement, modifiables et supprimables. (Différence vs documents où on a `OFFICIAL_TEMPLATES` verrouillés.)
> 7. **Fix RLS `crm_automation_rules` inclus** dans la refonte — vulnérabilité P0 bloquante pour l'autonomie client, doit être réglée dans ce chantier.
> 8. **Cross-entity sharing autorisé** — un super_admin (ex: Loris gérant MR + C3V) doit pouvoir partager / dupliquer des templates entre entités. Pas de strict per-entity hermétique.

---

## 0. Résumé exécutif

Le module **Emails** est le 3ᵉ pilier opérationnel de la plateforme (après Formations et Documents) mais il est devenu **non gouvernable** parce que **trois décisions structurantes ont été prises à moitié** :

1. **Source of truth fragmenté** — Le même type d'email peut provenir de 3 endroits différents : table `email_templates` (admin-éditable), constantes hardcodées dans les routes cron (`REMINDER_TEMPLATES` dans `invoices/process-reminders/route.ts:17-32` et `quotes/process-reminders/route.ts:33-49`), ou littéraux inline (`run-cron/route.ts:358` pour OPCO, `batch-email-handler.ts:252` pour les 15+ batch sends). Loris modifie un template dans l'UI → le cron continue d'utiliser le fallback hardcoded → personne ne comprend pourquoi le mail envoyé est différent.

2. **Aucune gouvernance lifecycle sur les templates** — `email_templates` n'a pas de `is_active`, `is_locked`, `is_system`, `version`, `parent_id`, `created_by`, `updated_at`. Pas de soft-delete, pas d'audit, pas de protection contre un écrasement accidentel d'un template utilisé par 17 `automation_rules`. Le `EmailPreviewDialog.tsx` est importé mais jamais instancié (dead code ~150 LOC). Les concurrent edits sont en last-write-wins.

3. **Sécurité multi-tenant cassée sur `crm_automation_rules`** — policy `FOR ALL TO authenticated USING (true)` (allow_all anti-pattern). Tout utilisateur authentifié peut lire/écrire les règles d'automation de **toutes les entités**, y compris les `action_type='send_email'` avec template_id + recipient_list. Bloquant absolu pour le feature "client autonome" : aujourd'hui donner accès à `/admin/emails` = exposer cross-entité.

**Diagnostic Loris** | **Cause technique racine**
---|---
"Les relances facture/devis ne suivent pas mes modifs" | 2 sources concurrentes : `email_templates` (UI) + constantes `REMINDER_TEMPLATES` (cron fallback) — le cron utilise le fallback si la query DB échoue silencieusement
"Le mail de relance OPCO part avec un mauvais wording, je ne peux pas le changer" | 100% hardcoded à `run-cron/route.ts:358`, aucune ligne `email_templates` lookup
"Les convocations / attestations partent avec un sujet figé" | `EMAIL_SUBJECT_LABELS` map dans `batch-email-handler.ts:252` — 30+ entrées hardcodées
"J'ai peur de modifier un template, je ne sais pas qui l'utilise" | Pas de relation inverse trackée, pas de warning UI "ce template est utilisé par X automations actives"

**Vision cible** : `/admin/emails` devient le **panneau de contrôle unique** où Loris édite tous les emails du LMS/CRM (transactionnels, automations, relances, campagnes, batch sends). Toute route qui envoie un mail passe par un seul service `resolveEmailTemplate(key, entityId)` lisant `email_templates`. Templates par défaut seedés au déploiement (modifiables). Tracking inverse `template → automations → sessions` visible dans l'UI.

---

## 1. Méthodologie

**Phase A — Récolte factuelle (3 sondes parallèles)** :
- Sonde 1 : cartographie UI `/admin/emails/page.tsx` + état actuel (tabs, actions, dialogs, state machine, dead code)
- Sonde 2 : inventaire CRM-wide des usages templates email (routes API, services, cron, batch, automation_rules)
- Sonde 3 : audit schema + RLS Supabase des tables `email_*`

**Phase B — Discussion ciblée Wissam** : 8 questions d'arbitrage sur périmètre, gouvernance, sécurité, versioning, cross-entity.

**Phase C — Production cadrage validé** : ce document.

Aucune décision n'est prise sans évidence factuelle (principe Mary n°1). Chaque finding est référencé `file:line`.

---

## 2. État des lieux

### 2.1 Inventaire des 7 pipelines email actuels

| # | Pipeline | Trigger | Source contenu | Editable par Loris ? |
|---|----------|---------|----------------|---------------------|
| 1 | Formation automation (start/end ±N jours) | Cron `formations/automation-rules/run-cron` | `email_templates` via `formation_automation_rules.template_id` | ✅ Oui (UI complète) |
| 2 | Invoice reminders (first/second/final) | Cron `invoices/process-reminders` | Constantes `REMINDER_TEMPLATES` (l17-32) + fallback DB | ⚠️ Partiel (admin doit créer la ligne DB manuellement) |
| 3 | Quote reminders (first/second/final) | Cron `crm/quotes/process-reminders` | Constantes `TEMPLATES` (l33-49) + fallback DB | ⚠️ Partiel (idem) |
| 4 | Quote sign-request | Action admin via `/api/crm/quotes/sign-request` | 3 niveaux : input user → DB template → hardcoded fallback (l121) | ⚠️ Partiel |
| 5 | OPCO deposit reminder | Cron `formations/automation-rules/run-cron:358` | 100% hardcoded inline | ❌ Non |
| 6 | Batch document sends (15+ types) | Action admin via `/api/documents/send-*-batch-email` | Subject = `EMAIL_SUBJECT_LABELS[docType]` map (`batch-email-handler.ts:252`) ; body auto-généré depuis le doc template | ❌ Non |
| 7 | Direct send admin | UI `/admin/emails` → `/api/emails/send` | User input direct | ✅ Oui |
| 8 | CRM campaigns bulk | Admin via UI campaigns | `crm_campaigns.subject/body` (freeform, pas de template_id FK) | ✅ Oui mais sans gouvernance |

### 2.2 Architecture page `/admin/emails` — UI actuelle

**Fichier** : `src/app/(dashboard)/admin/emails/page.tsx` (1 656 lignes — déjà gros, à splitter)

**3 tabs principaux** :
- **Modèles d'emails** : liste + search + filtres catégorie ; CRUD via `templateDialog`
- **Historique** : audit log avec filtres status/date/recipient ; relance possible (`handleResend`)
- **Relances automatiques** : sous-composant `RelancesTab` (gère `reminder_settings` + 7 sous-templates invoice/quote/OPCO)

**Quick action cards** (header) : Create template / Send now / View history (badge failed count).

**Composants composés** :
- `InsertVariableButton` — popover variables (✅ déjà bien fait, réutilisé par `/admin/documents`)
- `RelancesTab` — settings + édition des 7 reminder types
- `EmailPreviewDialog` — **dead code** (importé jamais instancié)

**Dialogs majeurs** :
- Template edit dialog (max-w-5xl) avec preview live + InsertVariableButton + attachments doc_types selector
- Send email dialog avec context-aware variable resolution (session/client/learner) + warning unresolved vars (soft-fail)
- Delete confirmation dialog
- History details expandable

**State machine templates** : **inexistante**. Pas de draft/active/archived, pas de versioning, pas de lock. Concurrent edits = last-write-wins.

### 2.3 Schéma email — tables actuelles

**Tables touchées** :

| Table | RLS | entity_id | Lifecycle flags | Risque |
|-------|-----|-----------|-----------------|--------|
| `email_templates` | ✅ Granulaire (admin all / trainer read) | ✅ | ❌ Aucun | ⚠️ Pas de soft-delete/audit |
| `email_history` | ✅ Granulaire | ✅ | n/a (status: pending/sent/failed/processing/failed_permanent) | ⚠️ Pas de `created_by` |
| `gmail_connections` | ✅ Profile-scoped | ❌ (via trainer→entity) | `is_active` ✅ | ✅ OK |
| `crm_campaigns` | ✅ Granulaire (admin all) | ✅ | status (draft/scheduled/sent/cancelled) | ⚠️ Pas de template_id FK (freeform) |
| `formation_automation_rules` | ✅ Granulaire | ✅ | `is_enabled` ✅ | ✅ OK (FK `template_id` → `email_templates`) |
| `crm_automation_rules` | 🔴 `USING (true)` | ✅ (présent mais non vérifié) | `is_enabled` ✅ | **🔴 P0 — allow_all** |
| `session_automation_logs` | ✅ via session.entity_id | n/a | n/a | ✅ |
| `session_automation_overrides` | ✅ via session.entity_id | n/a | n/a | ✅ |

### 2.4 Inventaire des variables et de la résolution

- **`src/lib/template-variables.ts`** : 83 variables catégorisées (organisme, apprenant, formateur, client, formation, dates, montants, signatures, qr, documents, autres). Bien structuré, discoverable.
- **`InsertVariableButton`** : popover de sélection par catégorie avec filter `context: "document" | "email"`. Réutilisable, déjà partagé avec `/admin/documents`.
- **Résolution** : `resolveVariables()` dans `src/lib/utils/resolve-variables.ts` — chemin unique côté `/api/emails/send`.
- **Warning unresolved** : soft-fail dans le UI (`confirm()`) — peut être skippé, vars apparaissent en clair dans le mail si bypass.

---

## 3. Incohérences identifiées

### 3.1 Doublure invoice reminders
`invoices/process-reminders/route.ts:17-32` définit `REMINDER_TEMPLATES.first/second/final` en constantes. `email_templates` peut héberger les mêmes (clés `reminder_invoice_first/second/final`) mais seulement si admin les a créés manuellement. **Tentative de lookup DB silencieuse en cas d'absence → fallback hardcoded sans log.**

### 3.2 Doublure quote reminders (idem)
`crm/quotes/process-reminders/route.ts:33-49` identique en miroir pour les devis.

### 3.3 OPCO deposit 100% hardcoded
`run-cron/route.ts:358-359` :
```ts
const subject = `Rappel : demande OPCO à déposer — ${sessionTitle}`;
const textBody = `Bonjour ${admin.first_name},\n\nLa demande de prise en charge OPCO...`;
```
Pas de lookup DB du tout. Loris ne peut **pas** modifier ce mail sans toucher au code.

### 3.4 Batch sends — labels figés
`batch-email-handler.ts:252-290` :
```ts
const EMAIL_SUBJECT_LABELS: Record<string, string> = {
  convocation: "Convocation",
  attestation_assiduite: "Attestation d'assiduité",
  // ... 30+ entrées
};
```
Le body est auto-généré depuis le doc template HTML (ne peut pas être surchargé au niveau email). Loris ne peut **rien** customiser sur ces 15+ batch sends.

### 3.5 CRM campaigns sans gouvernance template
`crm_campaigns.subject/body` sont des champs TEXT freeform. Pas de FK vers `email_templates`. Conséquence : un admin crée 50 campagnes avec le même wording, chacune dupliquant la chaîne → impossible de "modifier le wording de toutes mes campagnes 2026" en un endroit.

### 3.6 RLS `crm_automation_rules` allow_all
```sql
"crm_automation_rules_admin" → FOR ALL TO authenticated USING (true)
```
Toute personne authentifiée (admin, trainer, client, learner) lit/écrit toutes les rules de toutes les entités. **`config` JSONB peut contenir template_id + recipient list** → fuite cross-entité immédiate.

### 3.7 Dead code `EmailPreviewDialog.tsx`
Importé dans `page.tsx` mais jamais instancié. ~150 LOC à supprimer ou à brancher (probablement supprimer puisque le preview live est dans le template edit dialog).

### 3.8 Sender hardcoded "MR Formation"
`page.tsx:1256` — le sender affiché est en dur, ne respecte pas la multi-tenance. C3V envoie aussi depuis "MR Formation" visuellement.

### 3.9 Concurrent edits race condition
Pas d'optimistic locking sur `email_templates.id` update. Si Loris et un trainer (read-only normalement, mais via admin role) éditent le même template, last-write-wins silencieux.

### 3.10 Pas de tracking inverse template → automations
Si Loris veut modifier le template "Convocation", il ne voit nulle part qu'il est utilisé par 3 `formation_automation_rules` actives. Risque cascade.

---

## 4. Architecture cible

### 4.1 Principe : 1 service, 1 table, 1 UI

```
┌─────────────────────────────────────────────────────────────────┐
│                    /admin/emails (panneau unique)                │
│  CRUD templates + automations + campaigns + relances + history  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Service unifié : src/lib/services/email-template-resolver.ts    │
│  resolveEmailTemplate(key, entityId) → { subject, body, ... }    │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│   Table unique : email_templates (étendue)                       │
│   + colonnes lifecycle + audit + key index                       │
└─────────────────────────────────────────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
   Cron formation        Cron invoices/quotes    Routes batch
   automation rules      reminders               (15+ doc types)
        │                      │                      │
        ▼                      ▼                      ▼
   email_queue (email_history) → Resend / Gmail
```

### 4.2 Schéma cible — `email_templates` étendu

```sql
ALTER TABLE email_templates
  ADD COLUMN key TEXT,                          -- 'reminder_invoice_first', 'opco_deposit', 'batch_convocation', ...
  ADD COLUMN category TEXT,                     -- 'transactional', 'automation', 'reminder', 'batch', 'campaign', 'custom'
  ADD COLUMN is_active BOOLEAN DEFAULT TRUE,    -- soft-archive
  ADD COLUMN created_by UUID REFERENCES profiles(id),
  ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN updated_by UUID REFERENCES profiles(id),
  ADD COLUMN sender_name TEXT,                  -- override de l'expéditeur (sinon entity default)
  ADD COLUMN sender_email TEXT,                 -- idem
  ADD COLUMN recipient_type TEXT,               -- 'learner' | 'trainer' | 'client' | 'manager' | 'custom'
  ADD COLUMN trigger_config JSONB DEFAULT '{}'; -- pour automations : { trigger: 'session_start_minus_days', offset_days: 7 }

CREATE UNIQUE INDEX email_templates_entity_key_uniq
  ON email_templates(entity_id, key) WHERE key IS NOT NULL AND is_active = TRUE;

CREATE INDEX email_templates_category_active ON email_templates(entity_id, category, is_active);
```

**Note** : `key` permet aux routes/crons de faire `WHERE entity_id = ? AND key = 'reminder_invoice_first' AND is_active = TRUE`. C'est le remplacement du fallback hardcoded.

### 4.3 Soft-delete + audit + seed

- **Seed migration** : crée 1 ligne par `key` "système" par entité au déploiement (pour MR et C3V). Modifiables, archivables (`is_active = FALSE`), pas supprimables hard si référencées par des `*_automation_rules.template_id`.
- **Audit** : `created_by` + `updated_by` + trigger PG `updated_at = NOW()` à chaque UPDATE.
- **Tracking inverse** : vue SQL `email_template_usage` qui agrège `template_id` depuis `formation_automation_rules` + `crm_automation_rules` (après fix RLS) → UI affiche "utilisé par 3 automations actives" avant édit/delete.

### 4.4 RLS — fix bloquant

```sql
DROP POLICY "crm_automation_rules_admin" ON crm_automation_rules;

CREATE POLICY "crm_automation_rules_admin_entity" ON crm_automation_rules
  FOR ALL TO authenticated
  USING (entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid()) AND user_role() IN ('admin', 'super_admin'))
  WITH CHECK (entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid()) AND user_role() IN ('admin', 'super_admin'));
```

Couplé à `super_admin` cross-entity helper `resolveActiveEntityId` déjà en place (cf. memory `project_super_admin_cross_entity`).

### 4.5 Cross-entity sharing (super_admin)

- UI `/admin/emails` : bouton **"Dupliquer vers C3V"** (ou MR) visible uniquement si `user_role() = 'super_admin'`.
- Action = `INSERT email_templates (..., entity_id = target_entity_id)` avec même contenu.
- Pas de "shared template" partagé en lecture (= simpler, évite les questions de gouvernance cross-entity sur qui peut modifier).

### 4.6 Migration `crm_campaigns` → template-driven

- Ajout `crm_campaigns.template_id UUID REFERENCES email_templates(id)` (nullable pour backward compat).
- Option `inline` (= freeform actuel) reste possible pour les one-shots.
- UI campaign creation : sélecteur "Utiliser un template" / "Saisie libre".

---

## 5. User stories priorisées

### Lot A — Infrastructure (story de tête : service resolver + schéma)
- **A.1** Migration SQL : ajout colonnes lifecycle + index + trigger `updated_at` sur `email_templates`
- **A.2** Service `email-template-resolver.ts` : `resolveEmailTemplate(key, entityId) → EmailTemplate | null`
- **A.3** Seed des templates par défaut par entité (`reminder_invoice_*`, `reminder_quote_*`, `opco_deposit`, `batch_*` × 15+, `quote_sign_request`)
- **A.4** Fix RLS `crm_automation_rules` (P0 sécurité)

### Lot B — Migration des pipelines vers le resolver
- **B.1** Refactor `invoices/process-reminders` : suppression `REMINDER_TEMPLATES`, lookup via resolver
- **B.2** Refactor `crm/quotes/process-reminders` : idem
- **B.3** Refactor `crm/quotes/sign-request` : suppression fallback hardcoded
- **B.4** Refactor `formations/automation-rules/run-cron` OPCO branch : passage par resolver
- **B.5** Refactor `batch-email-handler.ts` : remplacement `EMAIL_SUBJECT_LABELS` par resolver `key=batch_<docType>`

### Lot C — UI `/admin/emails` refondue
- **C.1** Split `page.tsx` 1 656 LOC en sous-composants (`TemplateList`, `TemplateEditDialog`, `HistoryTab`, `AutomationsTab`)
- **C.2** Filtre par `category` (transactional / automation / reminder / batch / campaign / custom)
- **C.3** Affichage "usage" : badge "utilisé par N automations" sur chaque template
- **C.4** Warning UI avant édit/delete d'un template utilisé
- **C.5** Soft-delete (archive) + onglet "Archivés" (réactivable)
- **C.6** Audit visible : "modifié par X le Y" sur chaque template
- **C.7** Sender configurable par template (override expéditeur)
- **C.8** Suppression dead code `EmailPreviewDialog.tsx`

### Lot D — Cross-entity & super_admin
- **D.1** Bouton "Dupliquer vers <autre entité>" (super_admin uniquement)
- **D.2** Indicateur visuel "ce template existe aussi sur <autre entité>" pour info

### Lot E — Campaigns template-driven
- **E.1** Ajout `crm_campaigns.template_id` FK + migration douce
- **E.2** UI campaign : sélecteur template / saisie libre

### Lot F — Hygiène & observabilité
- **F.1** Logs structurés : chaque envoi mail log `{ template_key, template_id, recipient_type, entity_id }`
- **F.2** Tests Vitest : resolver, RLS crm_automation_rules, migration seed, refactor des 5 cron routes
- **F.3** Documentation `docs/emails.md` : architecture + liste des `key` seed
- **F.4** Smoke test e2e Playwright : édit template Loris → cron tourne → mail envoyé contient les modifs

---

## 6. Lots d'implémentation — séquencement

```
Lot A (infrastructure)
  ├── A.4 RLS fix crm_automation_rules ────┐
  ├── A.1 Migration schéma                 │
  ├── A.2 Service resolver                 │ ⚠️ A.4 doit shipper en hotfix indépendant si possible
  └── A.3 Seed templates par défaut        │    (sécurité P0)
                                           │
       ▼ (A.1 + A.2 + A.3 mergées)         ▼
Lot B (migration pipelines) ──parallel──> Lot C (UI refondue)
  ├── B.1 invoices                         ├── C.1 split fichier
  ├── B.2 quotes                           ├── C.2 filtres category
  ├── B.3 sign-request                     ├── C.3 usage badge
  ├── B.4 OPCO                             ├── C.4 warnings
  └── B.5 batch handler                    ├── C.5 soft-delete
                                           ├── C.6 audit
       ▼                                   ├── C.7 sender override
Lot D (cross-entity)                       └── C.8 dead code cleanup
  ├── D.1 dup button
  └── D.2 indicateur

Lot E (campaigns) ──optionnel V2──
Lot F (hygiène) ──cross-cutting, en parallèle de chaque lot──
```

**Estimation à la louche** :
- Lot A : 1 sprint (1 semaine)
- Lot B + C en parallèle : 2 sprints (2 semaines)
- Lot D : 0.5 sprint
- Lot E : 0.5 sprint (peut être différé V2)
- Lot F : continu

**Total cible** : ~3-4 semaines de dev pour shipper V1 (sans E).

---

## 7. Plan de migration progressive

Big bang ≠ risqué si la séquence est bien ordonnée :

1. **Pré-déploiement** :
   - PR de migration SQL (A.1, A.3, A.4) déployée seule, vérifiée sur staging
   - Seed des templates par défaut (idempotent : `ON CONFLICT (entity_id, key) DO NOTHING`)
   - Vérification : `SELECT COUNT(*) FROM email_templates WHERE key IS NOT NULL AND is_active GROUP BY entity_id` → attendu ~25 lignes par entité

2. **Déploiement Lot B (migration pipelines)** :
   - Chaque route migrée garde un **feature flag** pendant 1 semaine : `USE_TEMPLATE_RESOLVER` boolean env var
   - Si flag OFF → ancien comportement (hardcoded fallback). Si ON → resolver
   - Activation progressive : invoices d'abord, puis quotes, puis OPCO, puis batch
   - Monitoring `email_history.error_message` pour spotter les regressions

3. **Suppression des fallbacks** (1 semaine après activation 100%) :
   - Suppression des constantes `REMINDER_TEMPLATES`, `EMAIL_SUBJECT_LABELS`, hardcoded OPCO
   - Suppression du feature flag

4. **Lot C (UI)** déployé en parallèle, indépendant — pas de migration de données nécessaire pour la refonte UI.

---

## 8. Risques et mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|------------|--------|------------|
| Mail critique non envoyé pendant migration (resolver échoue, fallback supprimé) | Moyenne | 🔴 Élevé (Qualiopi, OPCO) | Feature flag par route + monitoring `email_history.failed` → rollback automatique si > 5% taux échec |
| Seed manquant pour 1 entité → resolver retourne null → crash cron | Faible | Moyen | Test idempotent au boot du cron : `assertSeedComplete(entityId)` → log critique si manquant |
| Fix RLS `crm_automation_rules` casse une fonctionnalité existante | Faible | Moyen | Audit préalable : grep all callers de la table + tests Vitest avant déploiement |
| Loris écrase un template critique sans s'en rendre compte | Moyenne | Moyen | Warning UI "utilisé par N automations actives" + soft-delete (récupérable) + `email_history.body` archive = rollback manuel possible |
| Migration `crm_campaigns.template_id` casse des campagnes scheduled | Faible | Faible | Colonne nullable, backward compat, migration douce |
| Cross-entity duplication crée des doublons orphelins (super_admin oublié) | Faible | Faible | UI préviewable avant dup + tag visuel "dupliqué depuis <entité>" |

---

## 9. Non-objectifs

- **Pas de full versioning** (table `email_template_versions` parent/child) — `email_history.body` archive déjà tout envoi, c'est suffisant pour rollback ad-hoc. Si évolution future, ajout possible sans casser l'existant.
- **Pas d'A/B testing** des templates — overkill pour OF solo Loris.
- **Pas de WYSIWYG visual builder** type Mailchimp — Tiptap + variables suffit pour les besoins LMS.
- **Pas de templates système verrouillés** (vs `OFFICIAL_TEMPLATES` du module documents) — tout est custom, seed = point de départ modifiable.
- **Pas d'intégration provider SMTP custom** (Mailjet, Postmark, SES) — Resend + Gmail OAuth suffisent. Configurable par entité reportée V2.
- **Pas d'éditeur HTML avancé** côté `body` (CSS inlining auto, dark mode preview, etc.) — Tiptap rendu suffit.
- **Pas de système de tags / labels** sur les templates — `category` enum suffit pour filtrer.
- **Pas de scheduling avancé** au niveau template (envoyer chaque mardi à 9h) — déjà géré par les `automation_rules` + `email_queue.scheduled_for`.

---

## 10. Prochaines étapes

1. **Validation cadrage** par Wissam (toi-même — Loris en proxy via tes échanges quotidiens avec lui)
2. **Génération PRD** via `bmad-create-prd` (ou `bmad-agent-pm` John) à partir de ce cadrage — Phase 2 BMAD
3. **Optionnel** : UX design via `bmad-create-ux-design` (Sally) si on veut wireframes formels avant code — la refonte UI Lot C est UI-heavy, ça peut valoir le coup
4. **Architecture** via `bmad-create-architecture` (Winston) — formaliser le schéma cible, le service resolver, les patterns RLS
5. **Epics + stories** via `bmad-create-epics-and-stories`
6. **Implementation readiness check** via `bmad-check-implementation-readiness`
7. **Sprint planning** via `bmad-sprint-planning`
8. **Cycle stories** : `bmad-create-story` → `bmad-dev-story` (Amelia) → `bmad-code-review` → next

> **Questions ouvertes non bloquantes** :
> 1. Faut-il intégrer le fix RLS `crm_automation_rules` en hotfix indépendant **maintenant** (P0 sécurité) ou attendre le Lot A ?
> 2. Loris a-t-il une préférence pour le **sender_email per entity** (ex: `formation@mr-formation.fr` vs `contact@c3v.fr`) ? Si oui il faudra DNS verify les domaines côté Resend.
> 3. Les CRM campaigns sont-elles vraiment utilisées par Loris aujourd'hui ? Si non, Lot E peut être totalement déprioritisé (voire le feature supprimé).
