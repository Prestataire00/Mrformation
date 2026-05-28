---
stepsCompleted: ['step-01-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments:
  - bmad_output/planning-artifacts/cadrage-module-emails.md
  - bmad_output/planning-artifacts/prd-emails.md
  - bmad_output/planning-artifacts/architecture-module-emails.md
  - bmad_output/planning-artifacts/ux-design-module-emails.md
  - CLAUDE.md
workflowType: 'epics-and-stories'
project_name: 'lms-platform'
user_name: 'Wissam'
date: '2026-05-28'
scope: 'Module Emails — refonte big bang vers source de vérité unique + autonomie client Loris'
status: 'draft-v1'
---

# LMS MR/C3V Formation — Epic Breakdown : Module Emails

## Overview

Ce document décompose la refonte du module Emails (cadrage Mary + PRD John + architecture Winston + UX Sally, tous validés le 2026-05-28) en **6 epics** et **22 stories** INVEST mappées 1:1 avec les FR-EML-N du PRD.

**Effort total estimé** : ~14.5 jours-homme (cf. architecture §Decision Impact Analysis).

**Périmètre V1** : Lots A, B, C, D, F (5 epics actifs). Lot E (CRM campaigns template-driven) reporté V2 — 1 epic placeholder.

**Priorités** : P0 (sécurité bloquante), P1 (core feature), P2 (UX raffiné / hygiène).

---

## Requirements Inventory

### Functional Requirements (64 FR-EML-N — résumé)

| Range | Couverture | Cf. PRD §7 |
|-------|------------|------------|
| FR-EML-1 → 5 | Service resolver unifié | §7.1 |
| FR-EML-6 → 11 | Schéma `email_templates` étendu | §7.2 |
| FR-EML-12 → 15 | Seed templates par défaut idempotent | §7.3 |
| FR-EML-16 → 19 | Fix RLS `crm_automation_rules` (P0) | §7.4 |
| FR-EML-20 → 26 | Migration des 5 pipelines vers resolver | §7.5 |
| FR-EML-27 → 46 | UI `/admin/emails` refondue (4 tabs, dialog 3-col) | §7.6 |
| FR-EML-47 → 50 | Cross-entity duplication super_admin | §7.7 |
| FR-EML-51 → 53 | Vue SQL `email_template_usage` | §7.8 |
| FR-EML-54 → 58 | Observabilité, tests, doc | §7.9 |
| FR-EML-59 → 64 | Post-MVP V2 (différé) | §7.10 |

### Non-Functional Requirements

- **NFR-EML-PERF** : resolver < 50ms P95, tab Modèles < 800ms P95, preview live < 100ms, seed 100 INSERTs < 5s
- **NFR-EML-SEC** : 0 policy `USING(true)` périmètre, fix RLS audité, XSS prevention (`sanitizeHtml`), super_admin check server-side
- **NFR-EML-REL** : resolver null = graceful (pas crash), feature flag rollback < 5min, migration réversible, concurrent edit 100% détecté
- **NFR-EML-OBS** : logs structurés sur chaque envoi, alerte sur `template_missing`, dashboard mensuel
- **NFR-EML-MAINT** : 0 cast `any` (règle absolue CLAUDE.md #1), types centralisés `lib/types/email.ts`, services Supabase isolés (règle #10), page.tsx ≤ 400 LOC
- **NFR-EML-COST** : Resend free tier suffit (~50 mails/sem), upgrade à $20/mois anticipé si dépassement

### Additional Requirements (Architecture Winston)

- Migration SQL idempotente (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`) + `down.sql` réversible
- Feature flag pattern : 5 flags par route (`USE_TEMPLATE_RESOLVER_INVOICES`, `_QUOTES`, `_SIGN_REQUEST`, `_OPCO`, `_BATCH`)
- React Context pour état partagé du dialog d'édition (pas de Zustand — boring tech)
- Optimistic locking via comparaison `updated_at` au save (Server Action → 409 `concurrent_edit`)
- Cross-entity duplication via Server Action avec check `user_role()='super_admin'` server-side
- Logs structurés : 10 events typés (`email_template_resolved`, `email_template_missing`, `email_sent`, `email_failed`, etc.)
- Tests Vitest baseline 550 → cible 580+
- PR1 hotfix RLS standalone, mergeable avant Lot A complet

### UX Design Requirements (Sally)

- **UX-DR1** — Composant `EmailsTabsNav` sticky 4-onglets (Modèles / Historique / Automatisations / Archivés), calqué sur `DocumentsTabsNav` (réutilisation pattern V3 documents)
- **UX-DR2** — Composant `TemplateCard` avec badge catégorie coloré (6 catégories), nom, snippet body, `UsageBadge` orange si N>0, audit footer, actions `[Modifier]` + `[⋯]`
- **UX-DR3** — Composant `TemplateRow` pour vue Liste compacte (toggle Cards/Liste persisté localStorage)
- **UX-DR4** — Composant `CategoryFilter` (chips multi-select, état URL params pour partage)
- **UX-DR5** — Composant `TemplateEditDialog` 3-colonnes responsive (lg=3col / md=2col / sm=1col accordéon)
- **UX-DR6** — Sous-composants : `MetaPanel`, `EditorPanel` (Tiptap + InsertVariableButton), `PreviewPanel` (preview live), `UsagePopover`, `UsageBadge`
- **UX-DR7** — Composant `HistoryDetailSheet` (slide-in droite via shadcn `<Sheet>`, remplace dialog full)
- **UX-DR8** — Composant `AutomationsTab` avec 3 sous-tabs (Relances / Déclencheurs formation / Automatisations CRM)
- **UX-DR9** — Composant `ArchivedTab` avec opacity-60 + boutons restore/delete (delete = saisie texte "supprimer")
- **UX-DR10** — Composant `QuickActions` (2 cards header : Créer un modèle / Envoyer un mail maintenant — emerald-50 style)
- **UX-DR11** — Empty states explicites par tab (icône XXL + texte + CTA primary)
- **UX-DR12** — Accessibilité : contraste WCAG AA tous les badges, focus order documenté, ARIA labels, screen reader sur usage_count, keyboard shortcuts (⌘+S save, Esc close avec confirm)
- **UX-DR13** — Couleurs catégories cohérentes documents : `transactional`=slate, `automation`=blue, `reminder`=orange, `batch`=indigo, `campaign`=purple, `custom`=gray
- **UX-DR14** — Suppression dead code `EmailPreviewDialog.tsx` (~150 LOC)
- **UX-DR15** — Warnings UI bloquants : edit/delete d'un template utilisé par N automations actives

### FR Coverage Map (Story ↔ FR-EML)

| Epic | Story | FR-EML couverts | Priorité | Estimation |
|------|-------|-----------------|----------|------------|
| A | A.1 | FR-EML-6 → 11 | P1 | 1.5 j |
| A | A.2 | FR-EML-1 → 5 | P1 | 1 j |
| A | A.3 | FR-EML-12 → 15 | P1 | 1 j |
| A | A.4 | FR-EML-16 → 19 | **P0 (hotfix)** | 0.5 j |
| A | A.5 | FR-EML-51 → 53 | P1 | 0.5 j |
| B | B.1 | FR-EML-20 + 26 partiel | P1 | 0.75 j |
| B | B.2 | FR-EML-21 + 26 partiel | P1 | 0.75 j |
| B | B.3 | FR-EML-22 + 26 partiel | P1 | 0.5 j |
| B | B.4 | FR-EML-23 + 26 partiel | P1 | 0.5 j |
| B | B.5 | FR-EML-24 + 26 partiel | P1 | 1 j |
| B | B.6 | FR-EML-26 (cleanup) | P1 | 0.5 j |
| C | C.1 | FR-EML-27 + 45 | P1 | 1 j |
| C | C.2 | FR-EML-28 → 31, 35 (Modèles tab) | P1 | 1.5 j |
| C | C.3 | FR-EML-32 → 39, 46 (dialog) | P1 | 2 j |
| C | C.4 | FR-EML-40 → 42 (archives) | P2 | 0.5 j |
| C | C.5 | FR-EML-44 (automations tab) | P2 | 1 j |
| C | C.6 | FR-EML-43 (historique sheet) | P2 | 0.5 j |
| D | D.1 | FR-EML-47 → 50 | P2 | 1 j |
| F | F.1 | FR-EML-54 (logs) | P2 | 0.5 j |
| F | F.2 | FR-EML-55 + 56 (tests Vitest) | P2 | 1 j |
| F | F.3 | FR-EML-58 (doc) | P2 | 0.25 j |
| F | F.4 | FR-EML-57 (E2E) | P2 | 0.5 j |
| **Total** | **22 stories** | **51 FR-EML couverts (V1) + 13 différés V2** | | **~17.75 j** |

> Note écart estimation : 17.75 j cumulé stories vs 14.5 j architecture Winston. La différence (~3.25 j) couvre les revues PR, tests, debug. Cohérent.

---

## Epic Breakdown

### Vue d'ensemble des 6 epics

| Epic | Nom | Lot cadrage | Stories | Effort | Priorité |
|------|-----|-------------|---------|--------|----------|
| A | Infrastructure : schéma + resolver + seed + RLS fix + vue usage | A | 5 | 4.5 j | P0-P1 |
| B | Migration des 5 pipelines vers le resolver | B | 6 | 4 j | P1 |
| C | UI `/admin/emails` refondue (4 tabs + dialog 3-col + soft-archive) | C | 6 | 6.5 j | P1-P2 |
| D | Cross-entity duplication super_admin | D | 1 | 1 j | P2 |
| E | CRM campaigns template-driven | E (V2) | 0 (différé) | — | — |
| F | Hygiène : logs + tests + doc + E2E | F | 4 | 2.25 j | P2 |

**Sequencing** : A.4 hotfix → A.1+A.2+A.3+A.5 (en parallèle dès A.4 mergé) → B.1-B.5 (parallèle après A) → B.6 cleanup (T+1 sem) → C.1-C.6 (parallèle B après A) → D.1 (après C.3) → F (continu).

---

## Epic A — Infrastructure : schéma + resolver + seed + RLS fix + vue usage

**Goal** : Établir la fondation technique du nouveau module Emails — un service unique de résolution de templates, un schéma `email_templates` enrichi avec gouvernance lifecycle, un seed idempotent des templates par défaut, et **le fix RLS P0 sur `crm_automation_rules`** déployé en hotfix.

**Couvre** : FR-EML-1 → 19 + FR-EML-51 → 53 ; cadrage Lot A.

### Story A.1 — Migration SQL `email_templates` étendue + trigger + index 🚩 STORY DE TÊTE

**As a** developer (Wissam),
**I want** une migration SQL idempotente qui ajoute les 10 colonnes lifecycle/audit à `email_templates`, les index couvrant les queries du resolver, et un trigger `updated_at`,
**So that** le service resolver et la nouvelle UI peuvent s'appuyer sur un schéma complet sans casser l'existant.

**Priorité** : P1 (bloque le reste sauf A.4 hotfix)
**Estimation** : 1.5 j-h
**Couvre** : FR-EML-6 → 11

**Acceptance Criteria** :

**Given** un fichier de migration `supabase/migrations/2026_05_29_email_module_v1.sql` (location à confirmer entre `supabase/migrations/` ou `migrations/` — open question Winston #1),
**When** la migration est appliquée sur staging,
**Then** la table `email_templates` contient les 10 nouvelles colonnes : `key TEXT`, `category TEXT`, `is_active BOOLEAN DEFAULT TRUE`, `created_by UUID FK profiles(id)`, `updated_at TIMESTAMPTZ DEFAULT NOW()`, `updated_by UUID FK profiles(id)`, `sender_name TEXT`, `sender_email TEXT`, `recipient_type TEXT`, `trigger_config JSONB DEFAULT '{}'`,
**And** un CHECK constraint `category IN ('transactional','automation','reminder','batch','campaign','custom')` est actif,
**And** les anciennes colonnes (`name`, `subject`, `body`, `type`, etc.) sont inchangées.

**Given** la migration appliquée,
**When** je consulte les index `\d email_templates` dans psql,
**Then** l'index `email_templates_entity_key_uniq` (UNIQUE PARTIAL `(entity_id, key) WHERE key IS NOT NULL AND is_active = TRUE`) existe,
**And** l'index `email_templates_category_active` ON `(entity_id, category, is_active)` existe.

**Given** la migration appliquée,
**When** je fais un `UPDATE email_templates SET name = 'X' WHERE id = ?`,
**Then** la colonne `updated_at` est mise à jour automatiquement par le trigger `email_templates_set_updated_at`.

**Given** la migration appliquée une première fois,
**When** je la ré-applique (idempotence),
**Then** elle ne throw pas (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`).

**Given** la migration appliquée,
**When** un script `down.sql` est exécuté,
**Then** toutes les colonnes ajoutées sont DROPées + tous les index + trigger + fonction — retour à l'état initial.

**Notes techniques (hors AC)** :
- DDL complet déjà rédigé dans architecture §Data Architecture
- Section `-- ROLLBACK` commentée dans le fichier de migration pour rappel
- Tests à appliquer staging avant prod (NFR-EML-REL-3)

**Définition of Done** :
- [ ] Migration mergée sur main + appliquée sur staging
- [ ] Schema validation visuel via Supabase Dashboard
- [ ] `down.sql` fourni et testé en staging
- [ ] Vitest test idempotence (re-run migration) → pass

---

### Story A.2 — Service `email-template-resolver.ts` + `assertSeedComplete`

**As a** developer (Wissam),
**I want** un service unique TypeScript `resolveEmailTemplate(key, entityId)` qui lookup `email_templates` avec graceful null + logs structurés, et `assertSeedComplete(entityId)` pour validation au boot des crons,
**So that** toute route consommatrice peut accéder à un template sans dupliquer la logique et sans crash si template manquant.

**Priorité** : P1 (bloque Epic B)
**Estimation** : 1 j-h
**Dépend de** : A.1
**Couvre** : FR-EML-1 → 5

**Acceptance Criteria** :

**Given** un fichier `src/lib/services/email-template-resolver.ts`,
**When** un caller fait `await resolveEmailTemplate('reminder_invoice_first', entityId)`,
**Then** une query `SELECT * FROM email_templates WHERE entity_id = ? AND key = ? AND is_active = TRUE LIMIT 1` est exécutée,
**And** retourne l'objet `EmailTemplate` typé si trouvé,
**And** retourne `null` si non trouvé (jamais throw),
**And** émet un event `logEvent("email_template_resolved", { entity_id, key, template_id, latency_ms, status: "ok" })` en cas de succès,
**And** émet un event `logEvent("email_template_missing", { entity_id, key, latency_ms }, "error")` en cas de null.

**Given** la fonction `assertSeedComplete(entityId)`,
**When** elle est appelée,
**Then** elle vérifie présence de tous les `key` listés dans `REQUIRED_KEYS` (constante exportée par le service, ~25 keys),
**And** retourne `{ ok: true, missing: [] }` si tous présents,
**And** retourne `{ ok: false, missing: [...] }` + log `email_template_seed_incomplete` au niveau "critical" si manquants.

**Given** un test Vitest `email-template-resolver.test.ts`,
**When** je le lance,
**Then** je trouve au minimum les cas suivants :
- happy path : template trouvé → retour objet
- missing key : retour null + log emitted
- is_active=false : ignoré (comme si absent)
- cross-entity RLS : user entité A query entité B → retour null (bloqué par RLS)
- assertSeedComplete tout OK → ok=true
- assertSeedComplete 1 manquant → ok=false + missing array

**Notes techniques** :
- Pattern code dans architecture §Implementation Patterns 1
- Pas de cache applicatif (CD-EML-1 : Rule of Three pas atteinte)
- Latency cible < 50ms P95 (NFR-EML-PERF-1) — index unique partiel couvre

**Définition of Done** :
- [ ] Service code mergé sur main
- [ ] Tests Vitest 6+ cas, tous passants
- [ ] Type `EmailTemplate` exporté depuis `src/lib/types/email.ts`
- [ ] Documenté dans `docs/emails.md` (créé par F.3)

---

### Story A.3 — Seed idempotent des templates par défaut

**As a** dev (Wissam) et **as an** admin (Loris),
**I want** un seed SQL idempotent qui crée ~25 templates par défaut par entité (MR et C3V), reprenant **exactement** les wordings actuellement hardcodés dans le code,
**So that** la migration vers le resolver est invisible pour Loris (aucun changement de wording final) et les routes consommatrices ont toujours un template à lookup.

**Priorité** : P1
**Estimation** : 1 j-h
**Dépend de** : A.1
**Couvre** : FR-EML-12 → 15

**Acceptance Criteria** :

**Given** le fichier de migration ou un fichier seed séparé,
**When** il est appliqué,
**Then** ~25 lignes par entité sont créées dans `email_templates`, soit **50 lignes au total** (MR + C3V),
**And** chaque ligne a `key` non-null, `is_active=true`, `created_by=NULL` (= système), `trigger_config={"seed_version": "2026-05-28-v1"}`.

**Given** la liste des `key` à seeder,
**When** je consulte le seed,
**Then** je trouve au minimum : `reminder_invoice_first`, `reminder_invoice_second`, `reminder_invoice_final`, `reminder_quote_first`, `reminder_quote_second`, `reminder_quote_final`, `quote_sign_request`, `opco_deposit`, `batch_convocation`, `batch_attestation_assiduite`, `batch_certificat_realisation`, `batch_programme`, `batch_cgv`, etc. (liste complète documentée dans `docs/emails.md`).

**Given** le wording (subject + body) de chaque template seedé,
**When** je le compare au hardcoded actuel via un test snapshot,
**Then** les chaînes match à 100% (FR-EML-15 — pixel-perfect copy depuis `REMINDER_TEMPLATES`, `TEMPLATES`, `EMAIL_SUBJECT_LABELS`, OPCO inline).

**Given** le seed appliqué une 1ʳᵉ fois,
**When** je le ré-applique,
**Then** aucune nouvelle ligne n'est créée (clause `ON CONFLICT (entity_id, key) DO NOTHING`).

**Given** une nouvelle entité créée post-déploiement (improbable mais possible),
**When** un trigger ou script de provisionning tourne,
**Then** le seed est automatiquement appliqué pour la nouvelle entité (ou documenté manuellement dans le runbook).

**Notes techniques** :
- Seed dans la même transaction que la migration ALTER TABLE (architecture §Risques #1 — race condition)
- Test snapshot Vitest : extraire les hardcoded actuels en fixtures, comparer ligne à ligne
- Le wording sera modifiable par Loris après seed (c'est le but)

**Définition of Done** :
- [ ] Seed mergé + appliqué staging
- [ ] Test snapshot wording = hardcoded actuel → pass
- [ ] Test idempotence → pass
- [ ] Liste complète des keys documentée dans `docs/emails.md`

---

### Story A.4 — Fix RLS `crm_automation_rules` (HOTFIX P0 INDÉPENDANT) 🚨

**As a** developer (Wissam) et **as the** business owner,
**I want** que la policy `crm_automation_rules` ne soit plus `USING (true)` mais entity-scoped granular,
**So that** je peux donner accès `/admin/emails` à Loris (et plus tard à un client autonome) sans exposer cross-entité les templates / recipients / configs d'automation.

**Priorité** : **P0 — HOTFIX INDÉPENDANT** (PR1, mergeable avant Epic A complet)
**Estimation** : 0.5 j-h
**Dépend de** : aucune dépendance — déployable solo
**Couvre** : FR-EML-16 → 19

**Acceptance Criteria** :

**Given** un audit préalable `grep -rn "crm_automation_rules" src/`,
**When** je liste tous les callers,
**Then** chaque caller est revu manuellement pour s'assurer qu'aucun ne dépend du comportement `USING (true)` (notamment : pas de lecture cross-entité utilisée par une fonctionnalité existante),
**And** le résultat de l'audit est documenté dans la PR (commentaire ou markdown).

**Given** une migration SQL `2026_05_28_fix_rls_crm_automation_rules.sql`,
**When** appliquée,
**Then** la policy `"crm_automation_rules_admin"` est DROP,
**And** une nouvelle policy `"crm_automation_rules_admin_entity"` est créée avec :
```sql
USING (entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid())
       AND user_role() IN ('admin', 'super_admin'))
WITH CHECK (entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid())
            AND user_role() IN ('admin', 'super_admin'));
```

**Given** un test Vitest `rls-crm-automation-rules.test.ts`,
**When** je le lance,
**Then** un user authentifié de l'entité A tentant de lire `crm_automation_rules` de l'entité B retourne 0 lignes,
**And** une tentative d'INSERT cross-entité retourne une erreur RLS,
**And** un super_admin (`resolveActiveEntityId` switchable) peut accéder à plusieurs entités.

**Given** la PR mergée,
**When** je vérifie en production via Supabase Dashboard `pg_policies`,
**Then** seule la nouvelle policy est active sur `crm_automation_rules`,
**And** aucune policy `USING (true)` ne subsiste dans le périmètre emails (audit complet).

**Notes techniques** :
- Architecture CD-EML-3 — déployable en hotfix indépendant
- ~20 LOC SQL + ~80 LOC tests
- Mergeable en 1h
- Risque de régression : aucun attendu (les vrais usages sont déjà entity-scoped applicatif)

**Définition of Done** :
- [ ] Audit callers documenté
- [ ] Migration mergée + appliquée staging puis prod
- [ ] Tests Vitest 3+ cas → pass
- [ ] Validation visuelle `pg_policies` en prod
- [ ] Communiqué à Wissam : "P0 sécurité fixée"

---

### Story A.5 — Vue SQL `email_template_usage` pour usage tracking

**As an** admin (Loris) ayant ouvert un template,
**I want** voir "Utilisé par N automations actives" avant de modifier ou archiver,
**So that** je ne casse pas un email critique sans m'en rendre compte.

**Priorité** : P1
**Estimation** : 0.5 j-h
**Dépend de** : A.1 + A.4 (la vue agrège `crm_automation_rules` post-fix RLS)
**Couvre** : FR-EML-51 → 53

**Acceptance Criteria** :

**Given** une migration SQL,
**When** appliquée,
**Then** une vue `email_template_usage` est créée agrégeant :
```sql
SELECT template_id, entity_id, COUNT(*) AS usage_count,
       array_agg(jsonb_build_object('source', source, 'rule_id', rule_id, 'name', name)) AS usages
FROM (
  SELECT 'formation_automation_rules' AS source, id, template_id, entity_id, name
  FROM formation_automation_rules WHERE is_enabled = TRUE AND template_id IS NOT NULL
  UNION ALL
  SELECT 'crm_automation_rules' AS source, id, (config->>'template_id')::uuid, entity_id, name
  FROM crm_automation_rules WHERE is_enabled = TRUE AND config ? 'template_id'
) AS u GROUP BY template_id, entity_id;
```

**Given** un hook React Query `useTemplateUsage(entityId)`,
**When** je l'appelle depuis `TemplateListView`,
**Then** il retourne un `Map<template_id, { usage_count, usages }>` pour O(1) lookup côté UI,
**And** `staleTime: 30_000ms` (revalidation sur focus).

**Given** un test Vitest `email-template-usage-view.test.ts`,
**When** je crée un dataset de test (1 template, 2 rules formation, 1 rule CRM avec template_id dans config),
**Then** la vue retourne `usage_count = 3` pour ce template,
**And** `usages` contient les 3 entrées avec source et name corrects.

**Notes techniques** :
- ID-EML-1 : vue simple suffit pour volumes actuels (~1500 lignes max)
- Si dépassement futur, basculer en materialized view avec REFRESH on commit (DD-EML-4 future)
- RLS hérite des tables sous-jacentes (pas de policy à définir sur la vue)

**Définition of Done** :
- [ ] Vue créée + appliquée staging
- [ ] Hook React Query implémenté
- [ ] Test Vitest count exact → pass
- [ ] Doc dans `docs/emails.md`

---

## Epic B — Migration des 5 pipelines vers le resolver

**Goal** : Faire en sorte que chacun des 5 pipelines email du LMS (invoices reminders, quotes reminders, quote sign-request, OPCO deposit, batch sends) lookup `email_templates` via le resolver au lieu de fallback hardcoded. Chaque route migrée derrière un feature flag pour rollback rapide.

**Couvre** : FR-EML-20 → 26 ; cadrage Lot B.

### Story B.1 — Migration `invoices/process-reminders` vers resolver

**As a** developer,
**I want** la route cron `/api/invoices/process-reminders` qui utilise `resolveEmailTemplate('reminder_invoice_<level>', entityId)` au lieu des constantes `REMINDER_TEMPLATES`,
**So that** Loris peut modifier les templates de relance facture dans `/admin/emails` et voir les changements appliqués au prochain run du cron.

**Priorité** : P1
**Estimation** : 0.75 j-h
**Dépend de** : A.2 (resolver) + A.3 (seed `reminder_invoice_*`)
**Couvre** : FR-EML-20

**Acceptance Criteria** :

**Given** la route `src/app/api/invoices/process-reminders/route.ts` refactorée,
**When** la variable env `USE_TEMPLATE_RESOLVER_INVOICES=true`,
**Then** la route appelle `assertSeedComplete(entityId)` en début de processing,
**And** pour chaque relance facture, appelle `resolveEmailTemplate('reminder_invoice_' + level, entityId)`,
**And** si template trouvé : extrait subject/body, applique `resolveVariables()` sur le contexte facture, enqueue email,
**And** si template null : skip cet envoi + log `email_failed` avec `error: template_missing`.

**Given** `USE_TEMPLATE_RESOLVER_INVOICES=false` (rollback),
**When** la route est appelée,
**Then** le comportement legacy (constantes `REMINDER_TEMPLATES` + fallback DB) est conservé sans erreur.

**Given** la constante `REMINDER_TEMPLATES`,
**When** la PR de migration est mergée,
**Then** elle reste dans le code (PR8 cleanup la supprimera après stabilisation).

**Given** chaque appel à la route,
**When** un envoi est tenté,
**Then** un event `email_template_resolved` est loggé avec `{ entity_id, template_key, template_id, latency_ms }`.

**Notes techniques** :
- Pattern dans architecture §Implementation Patterns 2
- Feature flag par défaut OFF, ON après staging validé (~1 semaine)

**Définition of Done** :
- [ ] Route refactorée + flag implémenté
- [ ] Test Vitest mock Supabase + Resend → pass
- [ ] Activation staging → 5+ envois OK observés
- [ ] Activation prod (flag ON via env var Netlify)

---

### Story B.2 — Migration `crm/quotes/process-reminders` vers resolver

**As a** developer,
**I want** la route `/api/crm/quotes/process-reminders` qui utilise le resolver pour les relances devis,
**So that** Loris peut éditer les wordings des 3 niveaux de relance devis.

**Priorité** : P1
**Estimation** : 0.75 j-h
**Dépend de** : A.2 + A.3
**Couvre** : FR-EML-21

**Acceptance Criteria** :

Mirror Story B.1 mais pour quotes :
- `USE_TEMPLATE_RESOLVER_QUOTES=true` → resolver `reminder_quote_<level>`
- `=false` → comportement legacy `TEMPLATES` constantes
- Constante `TEMPLATES` conservée jusqu'à PR8

**Définition of Done** : idem B.1 adapté quotes.

---

### Story B.3 — Migration `crm/quotes/sign-request` vers resolver

**As a** developer,
**I want** la route `/api/crm/quotes/sign-request` qui utilise le resolver `quote_sign_request`,
**So that** Loris peut éditer le wording du mail "Signez votre devis ici" et qu'il n'y a plus de hardcoded fallback ligne 121.

**Priorité** : P1
**Estimation** : 0.5 j-h
**Dépend de** : A.2 + A.3
**Couvre** : FR-EML-22

**Acceptance Criteria** :

**Given** flag `USE_TEMPLATE_RESOLVER_SIGN_REQUEST=true`,
**When** un admin déclenche le sign-request manuel,
**Then** le service appelle `resolveEmailTemplate('quote_sign_request', entityId)`,
**And** utilise le subject/body retourné + résout les variables,
**And** si l'admin a fourni un wording custom dans le dialog UI, celui-ci prime sur le template (input → DB → ❌ hardcoded supprimé).

**Given** flag OFF,
**Then** comportement legacy (input → DB → fallback hardcoded).

**Notes** : le 3ᵉ niveau "hardcoded fallback" est supprimé en PR8 cleanup, ne subsiste que comme constante référence dans le code jusqu'à la suppression définitive.

---

### Story B.4 — Migration branche OPCO de `formations/automation-rules/run-cron`

**As a** developer,
**I want** la branche OPCO du cron formations qui utilise le resolver `opco_deposit`,
**So that** Loris peut enfin éditer le wording du mail "Rappel OPCO à déposer" qui était 100% hardcodé inline ligne 358.

**Priorité** : P1
**Estimation** : 0.5 j-h
**Dépend de** : A.2 + A.3
**Couvre** : FR-EML-23

**Acceptance Criteria** :

**Given** flag `USE_TEMPLATE_RESOLVER_OPCO=true`,
**When** le cron tourne et identifie une session OPCO en attente,
**Then** le service appelle `resolveEmailTemplate('opco_deposit', entityId)`,
**And** résout `{{nom_admin}}`, `{{formation}}`, `{{date_debut}}` etc. via `resolveVariables`,
**And** enqueue l'email.

**Given** flag OFF,
**Then** comportement legacy (subject + textBody hardcodés ligne 358-359).

---

### Story B.5 — Migration `batch-email-handler.ts` vers resolver `batch_<docType>`

**As a** developer,
**I want** que les 15+ routes `/api/documents/send-*-batch-email/*` qui passent par `batchSendDocsEmail()` utilisent le resolver `batch_<docType>` au lieu du map `EMAIL_SUBJECT_LABELS` figé,
**So that** Loris peut customiser **subject ET body** de chaque batch send (au lieu d'un subject hardcoded + body auto-généré depuis le doc).

**Priorité** : P1
**Estimation** : 1 j-h (le plus complexe car impacte 15+ routes)
**Dépend de** : A.2 + A.3 (seed `batch_*` keys)
**Couvre** : FR-EML-24

**Acceptance Criteria** :

**Given** flag `USE_TEMPLATE_RESOLVER_BATCH=true`,
**When** une route `/api/documents/send-X-batch-email` appelle `batchSendDocsEmail(supabase, entityId, sessionId, docType, profileId)`,
**Then** le helper appelle `resolveEmailTemplate('batch_' + docType, entityId)`,
**And** utilise le `subject` et `body` du template (au lieu de `EMAIL_SUBJECT_LABELS[docType]` + body auto-généré),
**And** les variables sont résolues sur le contexte session+learner+entity.

**Given** flag OFF,
**Then** comportement legacy (subject map + body auto).

**Given** un seed manquant pour un doc_type particulier,
**When** la route tourne,
**Then** `resolveEmailTemplate` retourne null + log critical,
**And** la route fail-soft (log + skip cet envoi, retourne 207 partial success).

**Notes techniques** :
- 15+ doc_types à seeder en A.3 : `batch_convocation`, `batch_attestation_assiduite`, `batch_certificat_realisation`, `batch_attestation_competences`, `batch_attestation_abandon`, `batch_avis_habilitation_electrique`, `batch_certificat_travail_hauteur`, `batch_attestation_aipr`, `batch_reponses_satisfaction`, `batch_resultats_evaluations`, `batch_cgv`, `batch_politique_confidentialite`, `batch_bilans_poe`, `batch_programme`, etc.
- Source de vérité : grep des routes `/api/documents/send-*-batch-email/route.ts`

**Définition of Done** :
- [ ] Helper refactoré + flag
- [ ] Tests Vitest sur batch-email-handler avec mock resolver → pass
- [ ] 15+ doc_types testés manuellement en staging
- [ ] Loris valide 2-3 wordings batch en édition

---

### Story B.6 — Cleanup : suppression des fallbacks hardcoded + feature flags

**As a** developer,
**I want** supprimer définitivement les constantes `REMINDER_TEMPLATES`, `TEMPLATES`, `EMAIL_SUBJECT_LABELS`, OPCO inline ainsi que les 5 feature flags `USE_TEMPLATE_RESOLVER_*`,
**So that** la dette technique est éliminée et le code n'a qu'un seul path (le resolver).

**Priorité** : P1
**Estimation** : 0.5 j-h
**Dépend de** : B.1 à B.5 stables 1 semaine en flag ON
**Couvre** : FR-EML-26

**Acceptance Criteria** :

**Given** les 5 routes en flag ON en prod depuis ≥ 7 jours sans incident (taux échec < 1%),
**When** la PR cleanup est mergée,
**Then** les constantes `REMINDER_TEMPLATES` (invoices), `TEMPLATES` (quotes), `EMAIL_SUBJECT_LABELS` (batch), et OPCO inline subject+body sont supprimées du code,
**And** les 5 feature flags sont supprimés (toujours considérés ON, le code l'a en dur),
**And** les variables d'env `USE_TEMPLATE_RESOLVER_*` peuvent être retirées de Netlify (documenté dans le runbook).

**Given** un grep audit `git grep -rE "REMINDER_TEMPLATES|EMAIL_SUBJECT_LABELS|USE_TEMPLATE_RESOLVER"`,
**When** je le lance après merge,
**Then** zéro résultat (à l'exception des docs et tests historiques).

**Notes techniques** :
- ~700 LOC supprimées net
- Tests passent encore (mock resolver continue de marcher)

**Définition of Done** :
- [ ] Constantes hardcoded supprimées + feature flags supprimés
- [ ] Grep audit zéro résultat
- [ ] Tests Vitest baseline maintenue
- [ ] Variables d'env `USE_TEMPLATE_RESOLVER_INVOICES`, `_QUOTES`, `_SIGN_REQUEST`, `_OPCO`, `_BATCH` retirées du dashboard Netlify (prod + staging) + documenté dans `docs/emails.md` runbook — mitigation readiness #3

---

## Epic C — UI `/admin/emails` refondue

**Goal** : Refondre complètement la page `/admin/emails` selon le UX design Sally : 4 tabs sticky, dialog 3-colonnes responsive avec preview live et usage tracking, soft-archive avec restauration, sous-tabs Automatisations, sheet slide-in pour l'historique. Split `page.tsx` 1656 LOC en 8+ sous-composants.

**Couvre** : FR-EML-27 → 46 ; cadrage Lot C ; UX-DR1 à UX-DR15.

### Story C.1 — Split `page.tsx` + scaffolding `_components/` + `EmailsTabsNav`

**As a** developer,
**I want** le fichier `page.tsx` 1656 LOC splitté en orchestrateur ≤ 400 LOC + scaffolding `_components/` avec 8+ sous-composants, et le composant `EmailsTabsNav` sticky 4-onglets en place,
**So that** la base UI est en place pour les stories C.2-C.6 de remplir les onglets.

**Priorité** : P1 (bloque C.2-C.6)
**Estimation** : 1 j-h
**Couvre** : FR-EML-27 + 28 + 45 ; UX-DR1, UX-DR14

**Acceptance Criteria** :

**Given** le fichier `src/app/(dashboard)/admin/emails/page.tsx`,
**When** la PR C.1 est mergée,
**Then** la taille du fichier est ≤ 400 LOC,
**And** un dossier `_components/` contient au minimum : `EmailsTabsNav.tsx`, `QuickActions.tsx`, `TemplateListView.tsx` (placeholder), `HistoryTab.tsx` (placeholder), `AutomationsTab.tsx` (placeholder), `ArchivedTab.tsx` (placeholder).

**Given** le composant `EmailsTabsNav`,
**When** je consulte la page,
**Then** je vois 4 onglets sticky en haut : `📂 Modèles`, `📨 Historique`, `⚙️ Automatisations`, `🗄️ Archivés`,
**And** un badge count apparaît sur "Historique" si emails en échec sur 24h > 0,
**And** un badge count apparaît sur "Archivés" si archivés > 0,
**And** la nav reste sticky en scroll (calquée sur `DocumentsTabsNav`).

**Given** le composant dead `EmailPreviewDialog.tsx` dans `src/components/emails/`,
**When** la PR C.1 est mergée,
**Then** le fichier est supprimé + import retiré de `page.tsx`.

**Given** le dossier `_actions/`,
**When** je consulte,
**Then** des Server Actions vides (signature uniquement, à implémenter en C.3) sont scaffoldés : `saveTemplate.ts`, `archiveTemplate.ts`, `restoreTemplate.ts`, `deleteTemplatePermanent.ts`.

**Définition of Done** :
- [ ] page.tsx ≤ 400 LOC vérifié `wc -l`
- [ ] EmailPreviewDialog.tsx supprimé
- [ ] Tabs Nav fonctionnel + badge count
- [ ] Vitest baseline 550 tests toujours passants
- [ ] Vérification a11y (contraste WCAG AA, ARIA labels, keyboard nav, focus visible) — mitigation readiness #1

---

### Story C.2 — Tab "Modèles" : cards + liste + filtres + quick actions

**As an** admin (Loris),
**I want** la vue principale "Modèles" avec toggle Cards/Liste, filtre par catégorie (6 chips), recherche texte, et 2 cards quick actions en header,
**So that** je peux scanner mes 25 templates en < 5 secondes et identifier rapidement celui que je veux éditer.

**Priorité** : P1
**Estimation** : 1.5 j-h
**Dépend de** : C.1 + A.5 (vue usage)
**Couvre** : FR-EML-29 → 31, FR-EML-35 ; UX-DR2, UX-DR3, UX-DR4, UX-DR10, UX-DR11, UX-DR13

**Acceptance Criteria** :

**Given** la tab Modèles active,
**When** la page charge,
**Then** je vois 2 quick action cards (Créer un modèle / Envoyer un mail maintenant) — emerald-50,
**And** une barre de filtres : 🔍 recherche + chips catégories multi-select + toggle Actifs/Archivés + tri (récent/A-Z/usage),
**And** un toggle vue (`▦ Cards` / `≡ Liste`) persistant en `localStorage`,
**And** un grid de cards (mode par défaut) affichant tous les templates actifs de l'entité.

**Given** un template avec `usage_count > 0` (issu de la vue),
**When** je vois sa card,
**Then** un badge orange `⚠️ Utilisé par N automations` est affiché en haut de la card.

**Given** un template avec `usage_count = 0`,
**When** je vois sa card,
**Then** **aucun badge usage** (pas de "0 usages" qui pollue).

**Given** la card,
**When** je hover ou click sur `[⋯]`,
**Then** un menu contextuel apparaît avec : Dupliquer, Archiver, Dupliquer vers <autre entité> (visible si `super_admin AND entities > 1`), Voir l'historique d'envois.

**Given** le filtre catégorie,
**When** je sélectionne 2 chips (ex: Relance + Automatisation),
**Then** seuls les templates avec `category IN ('reminder','automation')` sont affichés,
**And** l'état est reflété dans l'URL via params (`?category=reminder,automation`) pour bookmark/partage.

**Given** la recherche texte,
**When** je tape `convoc`,
**Then** seuls les templates dont `name` ou `subject` contiennent "convoc" (case-insensitive) sont affichés.

**Given** mode Liste activé,
**When** je consulte,
**Then** une table compacte affiche : Catégorie | Nom | Usage | Modifié | Actions (~25 lignes scannables).

**Given** aucun résultat (filtre + search),
**When** je consulte,
**Then** un empty state `🔍 Aucun modèle "Campagne" dans MR Formation. [Réinitialiser les filtres] [Créer un modèle "Campagne"]` est affiché.

**Notes UX** :
- Couleurs catégories : slate/blue/orange/indigo/purple/gray (cf. UX §3.2)
- Click direct sur card → ouvre le dialog d'édition (pas de "..." pour Modifier — direct click)

**Définition of Done** :
- [ ] Composants TemplateCard, TemplateRow, CategoryFilter, QuickActions implémentés
- [ ] Hook useTemplateUsage branché
- [ ] Toggle persisté localStorage
- [ ] Empty states 3 cas (vide + filtre + search)
- [ ] Tests Vitest snapshot des composants (option)
- [ ] Vérification a11y (WCAG AA, ARIA labels, keyboard nav, focus visible) — mitigation readiness #1

---

### Story C.3 — Dialog Édition 3-colonnes (Méta / Éditeur / Preview live) + Server Actions save/archive

**As an** admin (Loris),
**I want** un dialog d'édition 3-colonnes responsive avec : panneau méta+usage à gauche, éditeur Tiptap centre, preview live à droite avec variables résolues sur un contexte réel choisi,
**So that** je peux éditer sereinement, voir le rendu final immédiatement, et savoir qui utilise le template avant de modifier.

**Priorité** : P1 (cœur fonctionnel)
**Estimation** : 2 j-h
**Dépend de** : C.1 + A.2 (resolver pour preview) + A.5 (usage)
**Couvre** : FR-EML-32 → 39 + 46 ; UX-DR5, UX-DR6, UX-DR12, UX-DR15

**Acceptance Criteria** :

**Given** une card cliquée,
**When** le dialog ouvre,
**Then** un layout 3-colonnes (`lg ≥ 1280px`) s'affiche : MetaPanel (300px) / EditorPanel (1fr) / PreviewPanel (360px),
**And** en `md` (1024-1279px) : MetaPanel empilé au-dessus,
**And** en `sm` (< 1024px) : 1 colonne avec accordéons.

**Given** le MetaPanel,
**When** je consulte,
**Then** je vois : catégorie (select 6 options), nom (input required), `recipient_type` (select), pièces jointes auto (checkboxes liés à `attachment_doc_types`), sender override collapsible (`sender_name` + `sender_email` optional),
**And** un usage panel `⚠️ Utilisé par 3 automations` cliquable qui ouvre un popover détaillé avec liens profonds vers chaque automation.

**Given** l'EditorPanel,
**When** je consulte,
**Then** je vois un input `Subject *` + un `RichTextEditor` Tiptap pour le body,
**And** le bouton `InsertVariableButton` filter `context="email"` est dans la toolbar Tiptap,
**And** un compteur "X variables détectées ✓" sous l'éditeur (rouge si vars inconnues).

**Given** le PreviewPanel,
**When** je consulte,
**Then** je vois 2 dropdowns en haut : `Session ▼` + `Apprenant ▼` (sélection contexte preview, persisté `localStorage`),
**And** le subject et body sont rendus avec les variables résolues en temps réel (debounced 200ms).

**Given** je modifie le subject ou body,
**When** je clique "Enregistrer",
**Then** la Server Action `saveTemplate` est appelée avec `initialUpdatedAt` comparé au `updated_at` actuel DB,
**And** si match → UPDATE + toast vert + close dialog + revalidate cache,
**And** si mismatch (concurrent edit) → toast "Quelqu'un a modifié ce template entre-temps. [Recharger]" + bloque le save.

**Given** un template avec `usage_count > 0`,
**When** je clique "Enregistrer",
**Then** un confirm modal apparaît : "Ce template est utilisé par 3 automations actives. Modifier ?" avec primary "Oui, enregistrer" focus default,
**And** seulement après confirmation, la Server Action s'exécute.

**Given** le bouton "Archiver" (bottom-left du dialog),
**When** je clique sur un template avec `usage_count > 0`,
**Then** un modal **bloquant** apparaît "Ce template est utilisé par N automations actives. Désactive-les d'abord ou redirige-les vers un autre template." avec un lien vers les automations,
**And** l'action archive est empêchée.

**Given** un template avec `usage_count = 0`,
**When** je clique "Archiver",
**Then** un confirm soft "Archiver ce template ? Il restera dans 'Archivés' et tu pourras le restaurer." apparaît,
**And** confirmation → Server Action `archiveTemplate` → `is_active = false` + toast.

**Given** le panel preview,
**When** je tape dans l'éditeur,
**Then** la preview recalcule après 200ms de pause (debounce),
**And** le rendu utilise `useMemo` pour éviter recalc inutile,
**And** la latence end-to-end après debounce reste < 100ms (NFR-EML-PERF-3).

**Définition of Done** :
- [ ] Composants TemplateEditDialog + 4 panels implémentés
- [ ] React Context partagé entre panels
- [ ] Server Actions saveTemplate, archiveTemplate avec optimistic lock
- [ ] React Hook Form + Zod (CLAUDE.md règle #6)
- [ ] Tests Vitest sur Server Actions (happy + concurrent_edit + archive_in_use → pass)
- [ ] Validation manuelle UX par Wissam (cf. Sally §6.3 wireframe)
- [ ] Vérification a11y (WCAG AA, ARIA labels, keyboard shortcuts ⌘+S/Esc, focus visible) — mitigation readiness #1
- [ ] Bundle size dialog mesuré post-build. Si > 200KB → basculer en `next/dynamic` — mitigation readiness #2

---

### Story C.4 — Tab "Archivés" + restauration + suppression définitive

**As an** admin (Loris),
**I want** un onglet Archivés qui liste les templates `is_active=false` avec actions Restaurer + Supprimer définitivement (avec confirmation forte),
**So that** j'ai un filet de sécurité — j'archive sans peur, je restaure si besoin, je supprime définitivement seulement les vrais déchets.

**Priorité** : P2
**Estimation** : 0.5 j-h
**Dépend de** : C.1 + Server Actions (C.3 saveTemplate)
**Couvre** : FR-EML-40 → 42 ; UX-DR9

**Acceptance Criteria** :

**Given** l'onglet Archivés actif,
**When** je consulte,
**Then** je vois la liste des templates `is_active=false` en cards opacity-60,
**And** chaque card a 2 boutons : `[Restaurer]` + `[Supprimer définitivement]`,
**And** un message header explique "Ces modèles ne sont plus envoyés mais l'historique reste consultable."

**Given** je clique "Restaurer",
**When** la Server Action `restoreTemplate` s'exécute,
**Then** `is_active = TRUE` + toast vert + le template réapparaît dans la tab Modèles.

**Given** je clique "Supprimer définitivement",
**When** un modal apparaît,
**Then** il contient le texte "Cette action est irréversible. L'historique des mails envoyés via ce template restera consultable, mais le template lui-même sera perdu. Tape 'supprimer' pour confirmer.",
**And** un input texte est requis,
**And** le bouton danger reste disabled tant que l'input ≠ "supprimer".

**Given** je tape "supprimer" et clique le bouton,
**When** la Server Action `deleteTemplatePermanent` s'exécute,
**Then** elle vérifie d'abord qu'aucun `formation_automation_rules.template_id` ni `crm_automation_rules.config.template_id` ne référence ce template,
**And** si référencé → erreur "Référencé par une automation, archive d'abord la rule",
**And** si non référencé → HARD DELETE + toast.

**Notes techniques** :
- Constraint check côté Server Action (et idéalement aussi côté DB via trigger BEFORE DELETE — cf. architecture §Risques #2)

**Définition of Done** :
- [ ] Composant ArchivedTab implémenté
- [ ] 2 Server Actions (restore + deletePermanent) avec checks
- [ ] Tests Vitest delete bloqué si référencé → pass
- [ ] Vérification a11y (WCAG AA, ARIA, keyboard nav, focus visible) — mitigation readiness #1

---

### Story C.5 — Tab "Automatisations" : 3 sous-tabs (Relances / Formation / CRM)

**As an** admin (Loris),
**I want** un onglet Automatisations avec 3 sous-tabs distincts (Relances, Déclencheurs formation, Automatisations CRM) chacun listant les rules avec leur template lié + lien profond vers le template,
**So that** je gère la **configuration trigger** dans cet onglet et le **contenu** dans l'onglet Modèles (séparation claire des préoccupations).

**Priorité** : P2
**Estimation** : 1 j-h
**Dépend de** : C.1 + A.4 (RLS fix pour `crm_automation_rules`)
**Couvre** : FR-EML-44 ; UX-DR8

**Acceptance Criteria** :

**Given** l'onglet Automatisations actif,
**When** je consulte,
**Then** je vois 3 sous-tabs : `Relances`, `Déclencheurs formation`, `Automatisations CRM`.

**Given** sous-tab Relances,
**When** je consulte,
**Then** je vois les 3 reminder types (Invoice / Quote / OPCO) avec leur config trigger (jours, conditions),
**And** chaque type affiche le template lié avec un lien `[Modifier →]` qui ouvre le dialog d'édition de ce template.

**Given** sous-tab Déclencheurs formation,
**When** je consulte,
**Then** je vois la liste des `formation_automation_rules` actives (`is_enabled = TRUE`) avec leur trigger (start-N, end+N, document_type, etc.),
**And** chaque rule affiche le template lié + lien profond.

**Given** sous-tab Automatisations CRM,
**When** je consulte (en tant qu'admin entité X),
**Then** je vois la liste des `crm_automation_rules` de mon entité **uniquement** (RLS post-A.4),
**And** zéro rule des autres entités n'apparaît.

**Notes techniques** :
- Sous-tab Relances réutilise la logique de l'ancien `RelancesTab.tsx` (à intégrer dans le nouveau composant)
- ID-EML-3 décision : 3 sous-tabs distincts car triggers sémantiquement différents

**Définition of Done** :
- [ ] Composant AutomationsTab + 3 sous-composants
- [ ] Liens profonds bidirectionnels vers Modèles
- [ ] RelancesTab existant migré ici (peut être supprimé de son emplacement original)
- [ ] Test RLS : trainer ne voit que les rules de son entité
- [ ] Vérification a11y (WCAG AA, ARIA, keyboard nav, focus visible) — mitigation readiness #1

---

### Story C.6 — Tab "Historique" : refonte avec Sheet slide-in (au lieu de dialog full)

**As an** admin (Loris),
**I want** la tab Historique avec un Sheet shadcn slide-in droite pour le détail (au lieu d'un dialog full), pour pouvoir scanner rapidement les emails et voir le détail d'un échec sans perdre le contexte de la liste,
**So that** mon J6 (comprendre pourquoi un mail ne part pas) prend < 2 min comme cible.

**Priorité** : P2
**Estimation** : 0.5 j-h
**Dépend de** : C.1
**Couvre** : FR-EML-43 ; UX-DR7

**Acceptance Criteria** :

**Given** l'onglet Historique actif,
**When** je consulte,
**Then** je garde la structure actuelle (filtres status/date/recipient + tableau + chips filter rapide),
**And** click sur une ligne ouvre un `<Sheet>` shadcn slide-in droite (480px desktop, full-width mobile) au lieu d'un dialog full.

**Given** le Sheet ouvert sur un email en échec,
**When** je consulte,
**Then** je vois : destinataire, status icon, `error_message`, template lié (lien clic vers le template), audit `sent_by` + `sent_at`,
**And** un block "Body envoyé (capture exacte)" qui affiche `email_history.body` (rendu HTML escaped) — Loris voit immédiatement les variables non résolues.

**Given** le Sheet ouvert,
**When** je clique [Renvoyer manuellement],
**Then** un confirm + la Server Action `sendOneShotEmail` réutilise les data de l'historique pour ré-envoyer.

**Définition of Done** :
- [ ] HistoryDetailSheet implémenté (Sheet shadcn)
- [ ] HistoryTab refondu
- [ ] Renvoi manuel fonctionnel
- [ ] Smoke test : email échoué → ouvrir → comprendre l'erreur sans Wissam
- [ ] Vérification a11y (WCAG AA, ARIA, keyboard nav, focus visible) — mitigation readiness #1

---

## Epic D — Cross-entity duplication super_admin

**Goal** : Permettre à un super_admin (Loris gérant MR + C3V) de dupliquer un template d'une entité vers l'autre en 30 secondes.

**Couvre** : FR-EML-47 → 50 ; cadrage Lot D.

### Story D.1 — Bouton "Dupliquer vers <entité>" + Server Action server-side check

**As a** super_admin (Loris),
**I want** un bouton "Dupliquer vers <autre entité>" dans le menu `[⋯]` de chaque card (visible **uniquement** si super_admin + plusieurs entités), qui crée une copie dans l'entité cible avec lien rapide vers la copie,
**So that** je n'ai pas à recréer manuellement les mêmes templates dans MR puis C3V.

**Priorité** : P2
**Estimation** : 1 j-h
**Dépend de** : C.3 (dialog d'édition fonctionnel pour ouvrir la copie)
**Couvre** : FR-EML-47 → 50

**Acceptance Criteria** :

**Given** je suis un admin simple (pas super_admin),
**When** je consulte le menu `[⋯]` d'une card,
**Then** l'option "Dupliquer vers ..." **n'apparaît pas**.

**Given** je suis super_admin avec accès MR + C3V,
**When** je consulte une card MR,
**Then** l'option "Dupliquer vers C3V Formation" apparaît dans le menu,
**And** click → confirm dialog avec preview du contenu à dupliquer.

**Given** je confirme la duplication,
**When** la Server Action `duplicateTemplateToEntity({templateId, targetEntityId})` s'exécute,
**Then** elle vérifie côté serveur que `profile.role === 'super_admin'` (jamais juste UI — NFR-EML-SEC-5),
**And** elle INSERT une nouvelle ligne dans `email_templates` avec : même contenu, `entity_id = targetEntityId`, `key` reseté à NULL (pour éviter collision unique index), `created_by = auth.uid()`, `updated_by = auth.uid()`.

**Given** la duplication réussie,
**When** la Server Action retourne,
**Then** un toast vert apparaît avec un lien `[Voir →]` qui change l'entité active (via `resolveActiveEntityId`) et ouvre le dialog d'édition de la copie.

**Given** sur la card source (MR), un autre template du même nom existe déjà dans C3V,
**When** je consulte,
**Then** un sub-badge info `↗ Existe aussi sur C3V` apparaît (UX-DR2 indicateur).

**Notes techniques** :
- Pattern Server Action dans architecture §Authentication & Security
- ID-EML-5 : check côté server obligatoire, jamais juste UI

**Définition of Done** :
- [ ] Server Action implémentée + test Vitest "non super_admin → forbidden"
- [ ] Bouton conditionnel UI
- [ ] Lien `[Voir →]` fonctionnel
- [ ] Sub-badge info "existe aussi sur..." (option polish)

---

## Epic E — CRM campaigns template-driven (V2 — différé)

**Goal** : Faire en sorte que `crm_campaigns.subject/body` ne soient plus freeform mais référencent un `email_templates.template_id`, pour gouvernance centralisée des campagnes.

**Statut** : **Différé V2** (décision cadrage §6 question Q3). Pas de story V1.

**Trigger pour reconsidérer** : Si Loris confirme utiliser activement les CRM campaigns (réponse question ouverte cadrage Q3 = OUI).

**Stories V2 (placeholders)** :
- E.1 — Migration `crm_campaigns.template_id` FK + backward compat freeform
- E.2 — UI campaign avec sélecteur "Utiliser un template / Saisie libre"

---

## Epic F — Hygiène : logs structurés + tests Vitest + doc + E2E Playwright

**Goal** : Garantir la maintenabilité et l'observabilité long terme du module Emails — 10 events typés, tests complets, doc utilisateur, smoke test e2e.

**Couvre** : FR-EML-54 → 58 ; cadrage Lot F.

### Story F.1 — Logs structurés sur 10 events du module

**As a** developer (Wissam),
**I want** que chaque action significative dans le module Emails émette un event structuré via `logEvent()` avec payload JSON typé,
**So that** je peux diagnostiquer les problèmes (template manquant, échec d'envoi, etc.) en consultant les Netlify Logs sans devoir débugger le code.

**Priorité** : P2
**Estimation** : 0.5 j-h
**Dépend de** : A.2, B.1-B.5, C.3, D.1
**Couvre** : FR-EML-54

**Acceptance Criteria** :

**Given** le code du module Emails,
**When** je grep les calls `logEvent(`,
**Then** je trouve **au minimum** ces 10 events typés (cf. architecture §Pattern 4) :
1. `email_template_resolved` (succès du resolver)
2. `email_template_missing` (resolver null) — level error
3. `email_template_seed_incomplete` — level critical
4. `email_sent` (post-envoi succès)
5. `email_failed` — level error
6. `email_template_edit_completed` (front, mesure J1)
7. `email_template_archived`
8. `email_template_restored`
9. `email_template_duplicated_cross_entity`
10. `email_template_concurrent_edit_conflict` — level warn

**Given** un event émis,
**When** je consulte Netlify Logs,
**Then** la structure JSON contient au moins `entity_id`, plus les champs spécifiques (template_id, latency_ms, recipient_type, etc. selon le pattern).

**Notes techniques** :
- Si `logEvent()` n'existe pas centralisé, écrire le wrapper minimal dans `src/lib/utils/log.ts` (cf. open question Winston #2)

**Définition of Done** :
- [ ] 10 events implémentés
- [ ] `logEvent()` confirmé existant ou wrapper créé
- [ ] Doc dans `docs/emails.md` listant les events + payload

---

### Story F.2 — Tests Vitest : resolver, RLS, Server Actions, migration, seed

**As a** developer (Wissam),
**I want** une suite de tests Vitest couvrant 6 zones critiques du module Emails,
**So that** la baseline 550 tests passe à 580+ et les régressions sont détectées à chaque PR.

**Priorité** : P2
**Estimation** : 1 j-h (en cours de chaque story implémentation, ici consolidation)
**Dépend de** : toutes les stories core implémentées
**Couvre** : FR-EML-55, FR-EML-56

**Acceptance Criteria** :

**Given** la suite Vitest complète,
**When** je lance `npx vitest run`,
**Then** **au minimum 580 tests passent** (vs baseline 550),
**And** la couverture inclut :
- `resolveEmailTemplate` : 6+ cas (happy, missing, inactive, RLS, latency)
- `assertSeedComplete` : 2+ cas (ok / missing)
- Server Actions : `saveTemplate` (happy + concurrent_edit), `archiveTemplate` (happy + in_use blocked), `deleteTemplatePermanent` (referenced blocked), `duplicateTemplateToEntity` (not super_admin forbidden)
- RLS `crm_automation_rules` : 3+ cas (cross-entity read, cross-entity write, super_admin allowed)
- Migration : 1 cas idempotence (run twice)
- Seed : 1 cas idempotence + 1 cas snapshot vs hardcoded fixtures
- Vue `email_template_usage` : count exact sur dataset test

**Notes techniques** :
- Mock Supabase via le pattern existant du projet
- Mock Resend via stub

**Définition of Done** :
- [ ] `npx vitest run` retourne ≥ 580 passants
- [ ] Coverage report inspecté (target ≥ 80% sur services emails)
- [ ] CI Netlify Build inclut Vitest dans la pipeline

---

### Story F.3 — Documentation `docs/emails.md`

**As a** developer futur (Wissam ou un autre),
**I want** une doc unique `docs/emails.md` qui explique l'architecture du module Emails, la liste des `key` seedés, le format `trigger_config`, comment ajouter un nouveau pipeline,
**So that** quelqu'un qui découvre le module en 6 mois comprend en 15 minutes au lieu de lire 4000 lignes de planning artifacts.

**Priorité** : P2
**Estimation** : 0.25 j-h
**Dépend de** : A.2, A.3, B.5
**Couvre** : FR-EML-58

**Acceptance Criteria** :

**Given** le fichier `docs/emails.md`,
**When** je le lis,
**Then** je trouve les sections :
1. **Architecture en 1 schéma** (diagramme couches resolver → routes → email_queue → Resend)
2. **Liste exhaustive des `key`** seedés (~25) avec leur signification + pipeline consommateur
3. **Format `trigger_config`** JSONB (pour automations)
4. **Comment ajouter un nouveau pipeline** (checklist 5 étapes : créer key seed, écrire route, ajouter feature flag, tester, supprimer flag)
5. **Liste des 10 events `logEvent()`** + payload
6. **Variables d'env** : `USE_TEMPLATE_RESOLVER_*` flags (à supprimer après B.6)
7. **Liens** vers cadrage / PRD / architecture / UX / epics

**Définition of Done** :
- [ ] Fichier créé sous `docs/` (~200-300 lignes)
- [ ] Reviewed par Wissam

---

### Story F.4 — Smoke test e2e Playwright (ou manuel) parcours J1 Loris

**As a** developer,
**I want** un test e2e (Playwright si configuré, sinon smoke manuel documenté) qui valide le parcours J1 de Loris : login → modifier "Relance facture 1er rappel" → cron tourne → mail envoyé contient le wording modifié,
**So that** la régression la plus impactante business (Loris édite, ça ne s'applique pas) est détectée automatiquement.

**Priorité** : P2
**Estimation** : 0.5 j-h
**Dépend de** : Epic A, B, C complets
**Couvre** : FR-EML-57

**Acceptance Criteria** :

**Given** Playwright configuré dans le projet (open question Winston #3 — à confirmer en début de F.4),
**When** je lance `npx playwright test admin-emails-loris-j1.spec.ts`,
**Then** le test :
1. Login en admin sur staging (creds fixtures)
2. Navigue vers `/admin/emails` tab Modèles
3. Clique sur la card "Relance facture - 1er rappel"
4. Modifie le subject : ajoute " (TEST E2E)"
5. Confirme l'usage warning + save
6. POST direct à `/api/invoices/process-reminders/route` avec fixture invoice overdue
7. Vérifie que `email_history` contient une nouvelle ligne avec le subject modifié
8. Cleanup : restore le subject original

**Given** Playwright non configuré,
**When** le test est impossible,
**Then** une procédure smoke check manuelle est documentée dans `docs/emails.md` (10 étapes), exécutable par Wissam en < 5 min avant chaque release.

**Notes techniques** :
- Architecture §Risques #5 — pas de scheduled function trigger, donc POST direct
- Open question Winston #3 résolue en début de F.4

**Définition of Done** :
- [ ] Test Playwright OU procédure smoke manuelle documentée
- [ ] Exécuté en staging avant le merge prod final

---

## Notes "à trancher pendant l'implémentation" (5 open questions Winston)

Au moment d'attaquer les stories, ces 5 points doivent être tranchés rapidement :

1. **Migration SQL location** (avant A.1) : `supabase/migrations/` (CLI) ou `migrations/` (script custom du projet) ? → Wissam tranche en début de Story A.1.
2. **`logEvent()` API** (avant F.1) : wrapper centralisé existe ou faut l'écrire ? → Wissam vérifie via grep en début de Story F.1.
3. **Test E2E Playwright** (avant F.4) : config Playwright déjà setup ou on reste sur smoke check manuel ? → Wissam tranche en début de Story F.4.
4. **Resend DNS verify per-entity** (V1.5 si retenu) : Loris vs Wissam pour la config DNS ? → différé V1.5, pas bloquant V1.
5. **Décision Resend cost** (V1.5 si retenu) : passage plan $20/mois anticipé ? → Loris approuve, hors scope tech V1.

---

## Synthèse pour la suite (`bmad-check-implementation-readiness`)

| Aspect | Statut |
|--------|--------|
| Cadrage validé | ✅ 2026-05-28 |
| UX design validé | ✅ 2026-05-28 |
| PRD validé | ✅ 2026-05-28 (draft v1.0) |
| Architecture validée | ✅ 2026-05-28 (draft v1.0) |
| Epics + stories | ✅ Ce document (draft v1.0) |
| **Total stories** | **22** (5 epics actifs + 1 différé V2) |
| **Effort total** | **~17.75 j-h** (cohérent avec architecture 14.5 j-h + 3.25 j-h buffer) |
| FR-EML couverts V1 | 51 / 64 (les 13 restants = V2 explicitement différés) |
| Story de tête | **A.4 hotfix RLS** (P0 sécurité, déployable solo) + **A.1 migration schéma** (P1, bloque le reste) |
| Risque maximal | Migration des 5 pipelines avec feature flags (B.1-B.5) — mitigation déjà spécifiée |

**Prochaine étape BMAD** : `bmad-check-implementation-readiness` pour valider la cohérence finale PRD ↔ UX ↔ Architecture ↔ Epics avant de lancer le sprint planning.

---

**Fin des Epics + Stories v1.0** — prêt pour validation Wissam et passage à `bmad-check-implementation-readiness`.
