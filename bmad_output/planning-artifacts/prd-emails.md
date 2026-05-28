---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-03-vision', 'step-04-scope', 'step-05-journeys', 'step-06-domain', 'step-07-frs', 'step-08-nfrs', 'step-09-data-model', 'step-10-architecture', 'step-11-traceability', 'step-12-complete']
inputDocuments:
  - bmad_output/planning-artifacts/cadrage-module-emails.md
  - bmad_output/planning-artifacts/ux-design-module-emails.md
  - bmad_output/planning-artifacts/cadrage-module-documents.md
  - bmad_output/planning-artifacts/prd-documents.md
  - CLAUDE.md
workflowType: 'prd'
status: 'draft-v1'
---

# Product Requirements Document — Module Emails

**Author:** John (Product Manager, BMad) — par délégation de Wissam, proxy de Loris VICHOT (gérant OF MR Formation / C3V Formation)
**Date:** 2026-05-28
**Statut:** Brouillon v1.0 — à valider par Wissam
**Cadrage source:** `bmad_output/planning-artifacts/cadrage-module-emails.md` (v1.0 validé le 2026-05-28)
**UX source:** `bmad_output/planning-artifacts/ux-design-module-emails.md` (v1.0 validé le 2026-05-28)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Project Classification](#2-project-classification)
3. [Success Criteria](#3-success-criteria)
4. [Product Scope](#4-product-scope)
5. [User Journeys](#5-user-journeys)
6. [Domain-Specific Requirements](#6-domain-specific-requirements)
7. [Functional Requirements](#7-functional-requirements)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [Data Model](#9-data-model)
10. [Technical Architecture](#10-technical-architecture)
11. [Traceability Matrix](#11-traceability-matrix)
12. [Risks & Constraints](#12-risks--constraints)

---

## 1. Executive Summary

### Vision produit

Le module Emails doit devenir **la console unique et gouvernable de toute communication sortante** du LMS et du CRM, autonome pour Loris. Aujourd'hui éclaté en 7 pipelines (DB-driven, hardcoded constants, hardcoded inline, hardcoded labels, freeform campaigns, etc.) avec une faille RLS P0 sur `crm_automation_rules`, il empêche Loris d'éditer sereinement son propre wording — il modifie un template dans l'UI, le cron continue d'envoyer le fallback hardcoded, personne ne comprend pourquoi.

Ce PRD pose la refonte **big bang** du module pour atteindre **un seul service `email-template-resolver`, une seule table `email_templates` enrichie, une seule UI `/admin/emails` redessinée**, fournie d'un mécanisme de gouvernance (soft-delete, audit, usage tracking) qui rend Loris totalement autonome sur le contenu de ses emails LMS/CRM.

### What Makes This Special

- **Source de vérité unique** : `resolveEmailTemplate(key, entityId)` remplace les 5 pipelines hardcoded — chaque cron/route/batch lit la DB, fin des fallbacks fantômes.
- **Schéma `email_templates` enrichi** avec `key` (clef sémantique), `category` (filter), `is_active` (soft-archive), `created_by`/`updated_by` (audit), `sender_name`/`sender_email` (override per template) et `trigger_config` JSONB (pour automations).
- **Vue SQL `email_template_usage`** qui agrège l'utilisation depuis `formation_automation_rules` + `crm_automation_rules` → **Loris voit "utilisé par 3 automations" avant de cliquer "Modifier"**, premier UX du genre dans la plateforme.
- **Fix RLS `crm_automation_rules`** intégré (P0 bloquant pour l'autonomie client) — passage de `USING (true)` à `entity_id`-scoped granular.
- **UI 3-colonnes** dans le dialog d'édition (Méta + Usage / Éditeur Tiptap / Preview live avec variables résolues sur contexte réel) → Loris édite sereinement, voit immédiatement le rendu final.
- **Soft-archive + onglet Archivés** → Loris peut "supprimer" sans peur (réversible). `email_history.body` reste l'archive ultime du rendu envoyé.

### Effort & calendrier

**18-22 jours-homme** sur **6 lots séquentiel/parallèles** (4 semaines en conditions normales). Détail au §10 et §11. Big bang avec feature flag `USE_TEMPLATE_RESOLVER_<route>` par route pour rollback en 1 ligne par pipeline.

Estimation par lot (cf. cadrage §6) :
- Lot A (infrastructure) : 5 j
- Lot B (migration pipelines) : 5 j
- Lot C (UI refondue) : 6 j (parallèle avec B)
- Lot D (cross-entity) : 2 j
- Lot E (campaigns) : différé V2 (out of scope V1)
- Lot F (hygiène) : continu, ~2 j cumulés

---

## 2. Project Classification

- **Type** : Refonte (brownfield) — la fonction existe en partie, on remplace le socle technique et la gouvernance.
- **Module concerné** : Emails (transverse — irrigue Formations, CRM, Apprenants, Clients, Documents).
- **Périmètre fonctionnel** : 7 pipelines email existants + ~25 templates par défaut seedés par entité.
- **Périmètre technique** : service resolver unifié, schéma `email_templates` étendu, RLS fix `crm_automation_rules`, UI `/admin/emails` refondue (4 tabs + dialog 3 colonnes), soft-archive, audit, usage tracking, cross-entity duplication.
- **Hors-périmètre V1** : visual builder type Mailchimp, A/B testing, multi-langue, suggestions IA wording, scheduling avancé per-template, intégration provider SMTP custom (Resend + Gmail OAuth suffisent), CRM campaigns template-driven (Lot E différé V2).
- **Régulation** : RGPD (audit trail `created_by`/`updated_by`), Qualiopi (rétention 10 ans des emails de convocation/attestation via `email_history`).

---

## 3. Success Criteria

### User Success (Loris — admin OF solo, persona principal)

1. **Édition en moins d'1 minute** : Loris modifie le wording d'un template existant (J1, parcours principal) en moins de **60 secondes** mesurées entre l'ouverture du dialog et le click "Enregistrer". Mesure : événement front `email_template_edit_completed` avec durée.
2. **Confiance à toucher** : Loris édite **5 templates / mois** en moyenne (vs ~1 / 2 mois aujourd'hui) — proxy de la confiance acquise. Mesure : agrégation `email_templates.updated_at` par mois.
3. **Visibilité de l'impact** : avant d'éditer un template, Loris voit "utilisé par N automations" dans 100% des cas où N ≥ 1. Mesure : présence du badge dans le dialog, vérifié par test E2E.
4. **Filet de sécurité utilisé** : si Loris archive par erreur un template, il peut le restaurer en moins de **30 secondes** depuis l'onglet Archivés. Mesure : événement `email_template_restored` avec durée < 30s en P95.
5. **Diagnostic d'échec autonome** : sur un email échoué, Loris voit la cause (variable non résolue, destinataire invalide, etc.) directement dans l'historique sans solliciter Wissam dans **80% des cas**. Mesure : sondage Loris à T+30j post-livraison.

### Business Success (Loris en tant que dirigeant)

1. **Autonomie wording 100%** : sur les **7 pipelines email**, Loris peut modifier subject + body sans demander à Wissam — vs **2 pipelines aujourd'hui** (formation automation + direct send). Mesure : checklist de couverture par pipeline.
2. **Pas de tickets "le mail part avec un mauvais wording"** : passage de ~2 tickets / mois sur ce sujet à **0 ticket / mois** sur T+3 mois post-livraison. Mesure : tracking interne Wissam.
3. **Cross-entity efficace** : Loris duplique un template MR → C3V en **moins de 30 secondes**. Mesure : événement front `email_template_duplicated_cross_entity` avec durée.
4. **Qualiopi audit-ready** : un audit demande "qui a modifié le template Convocation le 15 mars 2026 ?" — réponse en 1 requête SQL `SELECT updated_by, updated_at FROM email_templates WHERE id = ?`. Aujourd'hui : information inexistante.

### Technical Success (Wissam dev)

1. **Service unique** : 100% des envois email passent par `resolveEmailTemplate()` puis `email_queue` (via `email_history`). Aucune route/cron ne contient de subject/body inline après Lot B. Mesure : grep audit `git grep -rE "subject|body" src/app/api/ | grep -v "resolveEmailTemplate"`.
2. **RLS `crm_automation_rules` durcie** : policy `USING (entity_id = ...)` au lieu de `USING (true)`. Mesure : test Vitest qui essaie de lire une rule d'une autre entité depuis un user authentifié → doit retourner 0 lignes.
3. **0 cast `any`** dans le code du module emails (règle absolue CLAUDE.md #1). Mesure : `tsc --noEmit` clean + grep `as any` dans `src/app/(dashboard)/admin/emails/` et `src/lib/services/email-*.ts`.
4. **Tests Vitest** couvrant : `resolveEmailTemplate()` (cache, fallback null), seed migration (idempotence), RLS `crm_automation_rules`, refactor des 5 cron routes (mocks). Baseline 550 → cible 580+ tests passants.
5. **Logs structurés** : `email_sent`, `email_failed`, `email_template_resolved` émis avec `{ entity_id, template_key, template_id, recipient_type, latency_ms }`.
6. **Split `page.tsx`** : le fichier passe de 1 656 LOC à ≤ 400 LOC, avec 8+ sous-composants dans `_components/`. Dead code `EmailPreviewDialog.tsx` supprimé.

### Measurable Outcomes (synthèse)

| Indicateur | Aujourd'hui | Cible post-refonte | Mesure |
|---|---|---|---|
| Pipelines email avec wording éditable par Loris | 2 / 7 | 7 / 7 | Checklist couverture |
| Sources de vérité du contenu email | 5 (DB + 3 hardcoded + 1 freeform) | 1 (`email_templates`) | Grep + service resolver |
| Tables/policies avec RLS allow_all dans le périmètre | 1 (`crm_automation_rules`) | 0 | Audit SQL `pg_policies` |
| Templates avec `created_by`/`updated_by` tracé | 0 | 100% des nouveaux | Schéma + tests |
| Soft-delete sur templates | ❌ Hard DELETE | ✅ `is_active = false` | Schéma |
| Usage tracking (template → automations) | ❌ Inexistant | ✅ Vue SQL + badge UI | Vue + test E2E |
| Time on task — édit template Loris (P50) | ~3 min (estim. par sondage) | < 60 s | Événement front |
| LOC `page.tsx` /admin/emails | 1 656 | ≤ 400 | Split en sous-composants |
| Dead code `EmailPreviewDialog.tsx` | 150 LOC importés non utilisés | Supprimé | Git diff |
| Tickets Wissam "le mail part avec un mauvais wording" | ~2 / mois | 0 / mois | Tracking interne T+3 mois |

---

## 4. Product Scope

### MVP — V1 (cible des Lots A→D + F = ce PRD)

1. **Service `email-template-resolver.ts`** unifié (Lot A.2)
2. **Migration schéma `email_templates`** : ajout `key`, `category`, `is_active`, `created_by`, `updated_by`, `updated_at`, `sender_name`, `sender_email`, `recipient_type`, `trigger_config` (Lot A.1)
3. **Seed initial des templates par défaut** par entité (~25 par entité × 2 entités = 50 lignes) (Lot A.3)
4. **Fix RLS `crm_automation_rules`** : passage à entity-scoped granular (Lot A.4)
5. **Migration des 5 pipelines** vers le resolver, avec feature flag par route (Lot B.1→B.5)
6. **Suppression des fallbacks hardcoded** après stabilisation (T+1 sem post-déploiement Lot B)
7. **UI `/admin/emails` refondue** : 4 tabs (Modèles / Historique / Automatisations / Archivés), dialog 3 colonnes, usage badges, soft-archive, audit, sender override per template, vue Mode toggle Cards/Liste (Lot C.1→C.8)
8. **Sous-tabs Automatisations** : Relances / Déclencheurs formation / Automatisations CRM (3 vues distinctes)
9. **Cross-entity duplication** : bouton "Dupliquer vers <entité>" pour super_admin (Lot D)
10. **Hygiène cross-cutting** : logs structurés, tests Vitest, doc `docs/emails.md`, smoke test e2e Playwright (Lot F)

### Growth Features (V1.5 — post-livraison V1, 1-3 mois)

1. **Vue détaillée "Usage panel"** sur une page dédiée `/admin/emails/[id]/usage` (au-delà du popover dialog)
2. **Bulk archive** : sélection multiple de templates dans la vue Liste → archive en lot
3. **Préview destinataire réel** : remplacer le `[Apprenant ▼]` dropdown par un champ recherche pour trouver vite un cas test précis
4. **Export du wording** en CSV (audit Qualiopi rapide)
5. **Sender mail per entity** avec DNS verify Resend (si Loris confirme question ouverte cadrage)

### Vision (Post-MVP V2, 6-18 mois)

1. **Lot E réactivé** — `crm_campaigns` template-driven (FK `template_id` + UI)
2. **Versioning des templates** (table `email_template_versions` parent/child) si évolution du besoin
3. **Suggestions IA wording** (claude-sonnet via Anthropic SDK)
4. **A/B testing** (split subject lines, mesure taux ouverture)
5. **Multi-langue** templates (FR/EN/ES) si C3V s'étend internationalement
6. **Intégration provider SMTP** custom (Mailjet, Postmark, SES) configurable per-entity
7. **Variables computed** (variables calculées à partir d'autres)
8. **Scheduling avancé per-template** (pas seulement via `automation_rules`)

---

## 5. User Journeys

### Persona 1 — Loris VICHOT, gérant OF (rôle `admin` / `super_admin`)

> **Profil détaillé** : cf. UX design §1.

**Volume** : 50 mails/sem envoyés via plateforme, 25+ templates actifs, édite ~5 templates/mois en cible.

**Journeys principaux (par fréquence)** :

**J1 — Modifier le wording d'un template (plusieurs fois/semaine)**
- Ouvre `/admin/emails` (tab Modèles par défaut)
- Filtre par catégorie "Relance" → identifie "Relance facture 1er rappel"
- Click card → dialog 3 colonnes ouvre
- Voit "⚠️ Utilisé par 3 automations actives" dans panel gauche
- Modifie le subject/body, preview live se met à jour
- Click "Enregistrer" → confirm modal (car usage actif) → toast succès
- Time on task cible : **< 60 sec**

**J2 — Consulter l'historique de la matinée (quotidien)**
- Ouvre `/admin/emails` → tab Historique
- Filter rapide "Aujourd'hui" pré-sélectionné
- Scanne les status (vert/orange/rouge) en visuel
- Si erreur : click la ligne → detail panel slide-in droite → cause technique visible
- Time on task cible : **< 15 sec** pour scanner

**J3 — Renvoyer un mail (2-3×/semaine)**
- Tab Historique → click sur l'email à renvoyer
- Detail panel → bouton "Renvoyer manuellement"
- Confirm + toast
- Time on task cible : **< 30 sec**

**J4 — Envoyer un mail one-shot depuis un template (1×/semaine)**
- Click quick action card "📨 Envoyer un mail maintenant"
- Sélectionne destinataire (Apprenant / Client / Email manuel) + template
- Modifie inline si besoin
- Click "Envoyer" → toast
- Time on task cible : **< 90 sec**

**J5 — Créer un nouveau template (1×/mois)**
- Click quick action card "✏️ Créer un modèle"
- Catégorie pré-sélectionnée (Custom par défaut)
- Choix "Partir d'un modèle existant" ou repartir from scratch
- Édite, voit preview live, ajoute variables via InsertVariableButton
- Save → toast + highlight card 30s
- Time on task cible : **< 5 min**

**J6 — Comprendre pourquoi un template ne part pas (1×/mois)**
- Tab Historique → filter "❌ Échec"
- 3 lignes en échec, click la 1ʳᵉ
- Detail panel : "Variable {{nom_client}} non résolue" + body capturé
- Comprend la cause sans Wissam
- Time on task cible : **< 2 min**

**J7 — Dupliquer un template MR → C3V (1×/mois, super_admin only)**
- Sur template MR → hover → menu "⋯" → "Dupliquer vers C3V Formation"
- Confirm dialog avec preview du contenu
- Click "Dupliquer" → toast "Template dupliqué. [Voir →]"
- Click [Voir →] → bascule entité + ouvre la copie
- Time on task cible : **< 30 sec**

### Persona 2 — Karim, formateur (rôle `trainer`)

- **Accès limité** : lecture seule sur `email_templates` (RLS `email_templates_trainer_read`). Ne touche pas à `/admin/emails`.
- **Usage indirect** : reçoit copie des emails de convocation envoyés à ses apprenants, via `email_history` (s'il est trainer assigné à la session).
- **Hors scope de ce PRD** : pas d'évolution de ses droits.

### Persona 3 — Sophie, apprenante (rôle `learner`)

- **Aucun accès** à `/admin/emails`.
- **Touchpoint** : reçoit les emails (convocation, attestation, satisfaction…) — c'est elle qui constate visuellement la qualité du wording.
- **Hors scope direct** : pas de change pour Sophie, mais bénéficie indirectement (Loris peut maintenant corriger un wording maladroit qui la déstabilisait).

### Persona 4 — Émilie, référente RH chez Acme (rôle `client`)

- **Touchpoint** : reçoit les emails CRM (relance devis, relance facture, sign-request, OPCO).
- **Sensible** au wording (relations B2B) : un mail de relance trop sec = client perdu.
- **Hors scope direct** : pas d'accès UI, mais Loris peut maintenant adoucir/durcir le ton selon la situation client.

### Persona 5 — Wissam, développeur (rôle technique)

- **Objectif** : ne plus être sollicité pour modifier un wording. Décharge complète sur Loris.
- **Bénéfice technique** : code plus simple (1 service vs 5 pipelines), audit Qualiopi facilité, sécurité durcie (fix RLS).
- **Cost** : 18-22 jours-homme, mais ROI immédiat sur les ~2 tickets/mois économisés + sérénité Loris.

---

## 6. Domain-Specific Requirements

### Compliance & Regulatory (France / formation professionnelle)

- **Qualiopi** : les emails de convocation, attestation, certificat de réalisation, satisfaction doivent être archivés 10 ans (déjà en place via `email_history` — pas de changement).
- **RGPD** : audit trail `created_by`/`updated_by` sur les templates → traçabilité des modifications de contenu adressé à des personnes physiques.
- **CNIL** : pas de stockage de données sensibles dans les templates eux-mêmes (les variables résolues le sont au moment de l'envoi).
- **Loi pour une République Numérique** : opt-out explicite déjà présent dans les templates de campagne (footer "Se désinscrire") — à préserver.

### Technical Constraints

- **Resend API** : provider email par défaut. Quota free tier = 100 emails/jour. Plan payant si dépassement.
- **Gmail OAuth** : provider alternatif pour les trainers (déjà en place via `gmail_connections`). Hors scope ce PRD.
- **`email_queue`** (alias `email_history` avec status `pending`) : queue déjà en place avec retry (max_retries, next_retry_at, scheduled_for). Pas de changement.
- **Cache** : pas de cache nécessaire au niveau template (DB lookup rapide via index `(entity_id, key)`).
- **Variables** : 83 variables catalogue (cf. `template-variables.ts`) — déjà en place, pas d'évolution.

---

## 7. Functional Requirements

> Format : **FR-EML-N — Titre**. Statut : `V1` (Lots A→D + F) ou `V2` (post-MVP).

### 7.1 Service resolver unifié (Lot A.2)

- **FR-EML-1 (V1)** — Le système doit fournir un service `email-template-resolver.ts` exportant `resolveEmailTemplate(key: string, entityId: UUID): Promise<EmailTemplate | null>`.
- **FR-EML-2 (V1)** — Le resolver doit lire `email_templates WHERE entity_id = ? AND key = ? AND is_active = TRUE LIMIT 1` (index unique `email_templates_entity_key_uniq` couvre cette query).
- **FR-EML-3 (V1)** — Si aucune ligne ne match, le resolver retourne `null` et logue un événement `email_template_missing` avec `{ entity_id, key }` au niveau ERROR.
- **FR-EML-4 (V1)** — Le resolver doit exposer une fonction de validation `assertSeedComplete(entityId: UUID): Promise<{ ok: boolean; missing: string[] }>` qui vérifie que toutes les `key` "système" sont seedées pour l'entité donnée.
- **FR-EML-5 (V1)** — `assertSeedComplete()` doit être appelé au boot de chaque cron job (`run-cron`, `process-reminders`) — log CRITICAL si manquant.

### 7.2 Schéma `email_templates` étendu (Lot A.1)

- **FR-EML-6 (V1)** — La migration SQL doit ajouter les colonnes : `key TEXT`, `category TEXT`, `is_active BOOLEAN DEFAULT TRUE`, `created_by UUID REFERENCES profiles(id)`, `updated_at TIMESTAMPTZ DEFAULT NOW()`, `updated_by UUID REFERENCES profiles(id)`, `sender_name TEXT`, `sender_email TEXT`, `recipient_type TEXT`, `trigger_config JSONB DEFAULT '{}'`.
- **FR-EML-7 (V1)** — Un trigger PostgreSQL doit mettre `updated_at = NOW()` à chaque UPDATE de `email_templates`.
- **FR-EML-8 (V1)** — Un index unique partiel `email_templates_entity_key_uniq ON (entity_id, key) WHERE key IS NOT NULL AND is_active = TRUE` doit garantir une seule ligne active par `key` par entité.
- **FR-EML-9 (V1)** — Un index `email_templates_category_active ON (entity_id, category, is_active)` doit accélérer les filtres UI.
- **FR-EML-10 (V1)** — Le `category` doit être contraint à un CHECK enum : `'transactional' | 'automation' | 'reminder' | 'batch' | 'campaign' | 'custom'`.
- **FR-EML-11 (V1)** — La migration doit être idempotente (`IF NOT EXISTS` sur ADD COLUMN, `ON CONFLICT DO NOTHING` sur seed).

### 7.3 Seed templates par défaut (Lot A.3)

- **FR-EML-12 (V1)** — Au déploiement initial (et à toute nouvelle entité créée), seed automatique de ~25 templates par entité couvrant tous les `key` requis par les pipelines : `reminder_invoice_first`, `reminder_invoice_second`, `reminder_invoice_final`, `reminder_quote_first`, `reminder_quote_second`, `reminder_quote_final`, `quote_sign_request`, `opco_deposit`, `batch_convocation`, `batch_attestation_assiduite`, `batch_certificat_realisation`, etc. (liste complète dans `docs/emails.md`).
- **FR-EML-13 (V1)** — Le seed doit utiliser `created_by = NULL` (système) et marquer un commentaire technique `seed_version='2026-05-28-v1'` dans `trigger_config` JSONB.
- **FR-EML-14 (V1)** — Le seed doit être idempotent : ré-exécution sans doublon (via `ON CONFLICT (entity_id, key) DO NOTHING`).
- **FR-EML-15 (V1)** — Le wording initial des templates seedés doit reprendre **exactement** les wordings hardcoded actuels (récupérés depuis `REMINDER_TEMPLATES`, `TEMPLATES`, `EMAIL_SUBJECT_LABELS`, `run-cron OPCO`) pour assurer une transparence parfaite à Loris.

### 7.4 Fix RLS `crm_automation_rules` (Lot A.4, P0)

- **FR-EML-16 (V1)** — La policy `"crm_automation_rules_admin"` doit être DROP puis remplacée par `"crm_automation_rules_admin_entity"` avec `USING (entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid()) AND user_role() IN ('admin', 'super_admin'))` et même prédicat en `WITH CHECK`.
- **FR-EML-17 (V1)** — Un audit préalable doit lister tous les callers de `crm_automation_rules` (`grep -rn "crm_automation_rules" src/`) pour vérifier qu'aucun caller ne dépend du comportement allow_all.
- **FR-EML-18 (V1)** — Le fix doit être livré en **PR de sécurité indépendante** (hotfix), shippable avant le Lot A complet — l'attente n'est pas acceptable étant donné la sensibilité P0.
- **FR-EML-19 (V1)** — Un test Vitest doit créer un user de l'entité X et tenter de lire/écrire les rules de l'entité Y → assertion 0 lignes / RLS denial.

### 7.5 Migration des pipelines vers le resolver (Lot B)

- **FR-EML-20 (V1)** — `invoices/process-reminders/route.ts` doit retirer la constante `REMINDER_TEMPLATES` et utiliser `resolveEmailTemplate('reminder_invoice_<level>', entityId)`. Feature flag : `USE_TEMPLATE_RESOLVER_INVOICES`.
- **FR-EML-21 (V1)** — `crm/quotes/process-reminders/route.ts` doit retirer la constante `TEMPLATES` et utiliser `resolveEmailTemplate('reminder_quote_<level>', entityId)`. Feature flag : `USE_TEMPLATE_RESOLVER_QUOTES`.
- **FR-EML-22 (V1)** — `crm/quotes/sign-request/route.ts` doit retirer le fallback hardcoded ligne 121 et utiliser `resolveEmailTemplate('quote_sign_request', entityId)`. Feature flag : `USE_TEMPLATE_RESOLVER_SIGN_REQUEST`.
- **FR-EML-23 (V1)** — `formations/automation-rules/run-cron/route.ts` branche OPCO doit retirer le hardcoded inline (lignes 358-359) et utiliser `resolveEmailTemplate('opco_deposit', entityId)`. Feature flag : `USE_TEMPLATE_RESOLVER_OPCO`.
- **FR-EML-24 (V1)** — `batch-email-handler.ts` doit retirer `EMAIL_SUBJECT_LABELS` et utiliser `resolveEmailTemplate('batch_' || docType, entityId)` pour subject + body (body devient configurable, plus juste auto-généré). Feature flag : `USE_TEMPLATE_RESOLVER_BATCH`.
- **FR-EML-25 (V1)** — Chaque route migrée doit logger `email_template_resolved` avec `{ entity_id, template_key, template_id, latency_ms }` au niveau INFO.
- **FR-EML-26 (V1)** — Après 1 semaine d'activation 100% (toutes routes en flag ON), une PR de cleanup doit supprimer les constantes hardcoded ET les feature flags.

### 7.6 UI `/admin/emails` refondue (Lot C)

- **FR-EML-27 (V1)** — Le fichier `src/app/(dashboard)/admin/emails/page.tsx` doit être splitté en sous-composants dans `_components/` (target ≤ 400 LOC pour page.tsx, vs 1 656 actuels).
- **FR-EML-28 (V1)** — La navigation principale doit utiliser un composant `EmailsTabsNav` sticky avec 4 onglets : `Modèles`, `Historique`, `Automatisations`, `Archivés`.
- **FR-EML-29 (V1)** — L'onglet `Modèles` doit afficher un filtre par catégorie (chips multi-select), une recherche texte, et un toggle vue Cards/Liste (persisté en `localStorage`).
- **FR-EML-30 (V1)** — Chaque `TemplateCard` doit afficher : badge catégorie coloré top-left, nom, snippet body (60 chars truncate), badge usage `⚠️ Utilisé par N automations` si `usage_count > 0`, footer audit `Modifié par X il y a Y`, actions `[Modifier]` primary + `[⋯]` menu contextuel.
- **FR-EML-31 (V1)** — Le menu `[⋯]` doit proposer : Dupliquer, Archiver, Dupliquer vers <autre entité> (super_admin only), Voir l'historique d'envois.
- **FR-EML-32 (V1)** — Le `TemplateEditDialog` doit être responsive 3-colonnes (`xl` ≥ 1280px), 2-colonnes (`lg` ≥ 1024px), 1-colonne accordéon (`md` <1024px).
- **FR-EML-33 (V1)** — Le `MetaPanel` (gauche) doit contenir : catégorie (select), nom (input), recipient_type (select), pièces jointes auto (checkboxes), sender override (collapsible), usage panel (toujours visible).
- **FR-EML-34 (V1)** — L'`EditorPanel` (centre) doit utiliser `RichTextEditor` (Tiptap, déjà en place) avec `InsertVariableButton` filter `context="email"`.
- **FR-EML-35 (V1)** — Le `PreviewPanel` (droite) doit afficher le rendu HTML avec variables résolues en temps réel sur un contexte choisi par l'utilisateur (Session + Apprenant dropdowns, persisté localStorage par user). Et un badge "X variables détectées ✓" + liste des unknowns en orange.
- **FR-EML-36 (V1)** — La sauvegarde doit utiliser React Hook Form + Zod (CLAUDE.md règle absolue #6). Schéma : `name` required, `subject` required, `body` non-empty, `category` enum strict, `key` optional (lecture seule sur les templates seedés).
- **FR-EML-37 (V1)** — Avant save d'un template avec `usage_count > 0`, un confirm modal doit demander confirmation explicite "Ce template est utilisé par N automations actives. Modifier ?".
- **FR-EML-38 (V1)** — Avant archivage d'un template avec `usage_count > 0`, un modal bloquant doit empêcher l'action et proposer un lien vers les automations concernées.
- **FR-EML-39 (V1)** — Une `UsagePopover` accessible depuis le badge doit lister les usages avec liens profonds vers chaque automation (`/admin/emails?tab=automations&rule_id=<X>`).
- **FR-EML-40 (V1)** — L'onglet `Archivés` doit lister les templates `is_active=false` avec opacity-60 et boutons `[Restaurer]` (= `is_active=true`) + `[Supprimer définitivement]` (= HARD DELETE).
- **FR-EML-41 (V1)** — La suppression définitive doit exiger une saisie texte explicite "supprimer" pour activer le bouton danger.
- **FR-EML-42 (V1)** — La suppression définitive doit être bloquée par DB si le template est référencé par un `formation_automation_rules.template_id` ou `crm_automation_rules.config.template_id` (constraint check via fonction PG).
- **FR-EML-43 (V1)** — L'onglet `Historique` doit garder le pattern actuel (filtres status/date/recipient/template) mais migrer le détail vers un `<Sheet>` slide-in droite (pas un dialog full).
- **FR-EML-44 (V1)** — L'onglet `Automatisations` doit contenir 3 sous-tabs : `Relances` (intégration `reminder_settings` + sélecteurs `template_id`), `Déclencheurs formation` (vue `formation_automation_rules`), `Automatisations CRM` (vue `crm_automation_rules` post-fix RLS).
- **FR-EML-45 (V1)** — Le composant `EmailPreviewDialog.tsx` doit être supprimé (dead code, ~150 LOC).
- **FR-EML-46 (V1)** — Une détection de concurrent edit doit comparer `updated_at` au load du dialog vs save → si différent, toast "Quelqu'un a modifié ce template entre-temps. [Recharger]" et bloquer le save.

### 7.7 Cross-entity duplication (Lot D)

- **FR-EML-47 (V1)** — Un bouton "Dupliquer vers <entité>" doit apparaître dans le menu `[⋯]` de chaque card uniquement si `user_role() = 'super_admin' AND entities.length > 1`.
- **FR-EML-48 (V1)** — L'action doit insérer une nouvelle ligne dans `email_templates` avec : même contenu, `entity_id = target_entity_id`, `key` reseté (`NULL`) si le `key` existe déjà sur la cible (sinon copié), `created_by = auth.uid()`, `updated_at = NOW()`.
- **FR-EML-49 (V1)** — Le toast de succès doit inclure un lien `[Voir →]` qui change l'entité active et ouvre la copie.
- **FR-EML-50 (V1)** — Un indicateur visuel sur la card MR doit afficher "ce template existe aussi sur C3V" en sub-badge (info, non bloquant).

### 7.8 Vue SQL usage tracking (Lot A)

- **FR-EML-51 (V1)** — Une vue SQL `email_template_usage` doit être créée, agrégeant :
  ```sql
  SELECT template_id, entity_id, COUNT(*) AS usage_count,
         array_agg(jsonb_build_object('source', source, 'rule_id', rule_id, 'name', name)) AS usages
  FROM (
    SELECT 'formation_automation_rules' AS source, id AS rule_id, template_id, entity_id, name
    FROM formation_automation_rules WHERE is_enabled = TRUE
    UNION ALL
    SELECT 'crm_automation_rules' AS source, id AS rule_id,
           (config->>'template_id')::uuid AS template_id, entity_id, name
    FROM crm_automation_rules WHERE is_enabled = TRUE AND config ? 'template_id'
  ) AS u
  GROUP BY template_id, entity_id;
  ```
- **FR-EML-52 (V1)** — La vue doit être interrogeable côté UI via `supabase.from('email_template_usage').select('*').eq('entity_id', X)` pour batch-loader les `usage_count` sur toutes les cards.
- **FR-EML-53 (V1)** — La vue doit être inclus dans les tests Vitest (vérifier le count exact sur un dataset de test).

### 7.9 Observabilité & tests (Lot F)

- **FR-EML-54 (V1)** — Les événements `email_sent`, `email_failed`, `email_template_resolved`, `email_template_missing`, `email_template_edit_completed`, `email_template_restored`, `email_template_duplicated_cross_entity` doivent être logués via `logEvent()` avec structure JSON.
- **FR-EML-55 (V1)** — Une suite de tests Vitest doit couvrir : `resolveEmailTemplate()` (happy path, cache, missing key, RLS), `assertSeedComplete()`, seed migration idempotence, RLS `crm_automation_rules`, refactor des 5 cron routes (mocks Supabase + Resend), vue `email_template_usage` (count exact).
- **FR-EML-56 (V1)** — Baseline 550 tests passants → cible 580+ tests passants après livraison.
- **FR-EML-57 (V1)** — Un test E2E Playwright doit couvrir le J1 (parcours principal Loris) : login → modifier template "Relance facture 1er" → cron tourne → mail envoyé contient le wording modifié.
- **FR-EML-58 (V1)** — Une documentation `docs/emails.md` doit lister : l'architecture, la liste des `key` seed avec leur signification, le format `trigger_config`, comment ajouter un nouveau pipeline.

### 7.10 Post-MVP (V2)

- **FR-EML-59 (V2)** — Lot E réactivé : `crm_campaigns.template_id` FK + UI campaign avec sélecteur "Utiliser un template" / "Saisie libre".
- **FR-EML-60 (V2)** — Versioning des templates : table `email_template_versions` parent/child si évolution du besoin.
- **FR-EML-61 (V2)** — Suggestions IA wording via claude-sonnet (Anthropic SDK).
- **FR-EML-62 (V2)** — A/B testing (split subject lines, mesure ouverture).
- **FR-EML-63 (V2)** — Multi-langue templates (FR/EN/ES) si C3V s'internationalise.
- **FR-EML-64 (V2)** — Intégration provider SMTP custom (Mailjet, Postmark, SES).

---

## 8. Non-Functional Requirements

### NFR-EML-PERF (Performance)

- **NFR-EML-PERF-1** — `resolveEmailTemplate()` doit retourner en < **50 ms** (P95) sur DB ayant ~50 templates par entité (index couvre la query).
- **NFR-EML-PERF-2** — La vue principale `/admin/emails` (tab Modèles) doit charger en < **800 ms** (P95) côté client pour 25 templates affichés.
- **NFR-EML-PERF-3** — La preview live dans le dialog d'édition doit recalculer le rendu HTML en < **100 ms** après modification (côté client uniquement).
- **NFR-EML-PERF-4** — Le seed initial doit traiter 50 templates × 2 entités = 100 INSERTs en < **5 sec**.

### NFR-EML-SEC (Sécurité)

- **NFR-EML-SEC-1** — Toutes les tables touchées (`email_templates`, `email_history`, `crm_automation_rules`, `formation_automation_rules`, `crm_campaigns`) doivent avoir RLS activée avec policies entity-scoped (pas de `USING (true)`).
- **NFR-EML-SEC-2** — Le fix `crm_automation_rules` doit être audité avant déploiement : grep all callers + tests RLS unitaires.
- **NFR-EML-SEC-3** — Aucun secret en clair dans `email_templates` (sender_email peut contenir un domaine mais pas une clé API).
- **NFR-EML-SEC-4** — Les variables résolues doivent être HTML-escapées avant insertion dans le body pour prévenir XSS (via `sanitizeHtml()` ou équivalent).
- **NFR-EML-SEC-5** — La duplication cross-entity doit vérifier `user_role() = 'super_admin'` côté serveur (pas juste côté UI).

### NFR-EML-REL (Reliability)

- **NFR-EML-REL-1** — `resolveEmailTemplate()` retournant `null` ne doit jamais crasher le cron — log CRITICAL + skip de l'envoi avec `email_history.status='failed'` et `error_message='template_missing:<key>'`.
- **NFR-EML-REL-2** — Le feature flag par route doit permettre un rollback en < **5 min** (modification var d'env + redéploiement Netlify).
- **NFR-EML-REL-3** — La migration SQL doit être réversible (script `down.sql` fourni pour chaque migration).
- **NFR-EML-REL-4** — Le concurrent edit detection doit prévenir 100% des cas (compare `updated_at` int load vs save).

### NFR-EML-OBS (Observability)

- **NFR-EML-OBS-1** — Tout envoi d'email doit logger `{ entity_id, template_key, template_id, recipient_type, latency_ms, status }`.
- **NFR-EML-OBS-2** — Tout `template_missing` doit déclencher une alerte Sentry/Netlify Logs au niveau ERROR.
- **NFR-EML-OBS-3** — Un dashboard Posthog (ou équivalent simple) doit tracker : count templates édités par mois, time on task moyen J1, taux d'échec d'envoi par template.

### NFR-EML-MAINT (Maintainability)

- **NFR-EML-MAINT-1** — Aucun cast `any` dans le code emails (CLAUDE.md règle absolue #1).
- **NFR-EML-MAINT-2** — Tous les types email centralisés dans `src/lib/types/email.ts` (à créer si absent).
- **NFR-EML-MAINT-3** — Toute logique Supabase passe par `src/lib/services/email-*.ts` (CLAUDE.md règle #10) — aucun appel inline dans les composants.
- **NFR-EML-MAINT-4** — Le fichier `page.tsx` final doit faire ≤ 400 LOC.

### NFR-EML-COST (Cost)

- **NFR-EML-COST-1** — Aucun nouveau service tiers payant requis. Resend free tier (100/jour) suffit pour le dev/staging.
- **NFR-EML-COST-2** — Le run-rate Resend doit rester en deçà de **5€/mois** (estimation : ~150 mails/jour en pic = plan starter $20/mois — à confirmer si l'OF dépasse).

---

## 9. Data Model

### 9.1 Table `email_templates` étendue

```sql
ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS key TEXT,                                  -- 'reminder_invoice_first', etc.
  ADD COLUMN IF NOT EXISTS category TEXT,                             -- enum CHECK
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS sender_name TEXT,
  ADD COLUMN IF NOT EXISTS sender_email TEXT,
  ADD COLUMN IF NOT EXISTS recipient_type TEXT,                       -- 'learner' | 'trainer' | 'client' | 'manager' | 'custom'
  ADD COLUMN IF NOT EXISTS trigger_config JSONB DEFAULT '{}';

-- CHECK constraint catégorie
ALTER TABLE email_templates
  ADD CONSTRAINT email_templates_category_check
  CHECK (category IS NULL OR category IN ('transactional', 'automation', 'reminder', 'batch', 'campaign', 'custom'));

-- Index pour resolver (couvre WHERE entity_id = ? AND key = ? AND is_active = TRUE)
CREATE UNIQUE INDEX IF NOT EXISTS email_templates_entity_key_uniq
  ON email_templates(entity_id, key)
  WHERE key IS NOT NULL AND is_active = TRUE;

-- Index pour filtres UI
CREATE INDEX IF NOT EXISTS email_templates_category_active
  ON email_templates(entity_id, category, is_active);

-- Trigger updated_at auto
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER email_templates_set_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### 9.2 Vue `email_template_usage`

```sql
CREATE OR REPLACE VIEW email_template_usage AS
SELECT
  template_id,
  entity_id,
  COUNT(*) AS usage_count,
  array_agg(jsonb_build_object('source', source, 'rule_id', rule_id, 'name', name) ORDER BY name) AS usages
FROM (
  SELECT 'formation_automation_rules' AS source, id AS rule_id, template_id, entity_id, name
  FROM formation_automation_rules
  WHERE is_enabled = TRUE AND template_id IS NOT NULL

  UNION ALL

  SELECT 'crm_automation_rules' AS source, id AS rule_id,
         (config->>'template_id')::uuid AS template_id, entity_id, name
  FROM crm_automation_rules
  WHERE is_enabled = TRUE AND config ? 'template_id'
) AS u
WHERE template_id IS NOT NULL
GROUP BY template_id, entity_id;
```

### 9.3 RLS `crm_automation_rules` durcie

```sql
DROP POLICY IF EXISTS "crm_automation_rules_admin" ON crm_automation_rules;

CREATE POLICY "crm_automation_rules_admin_entity" ON crm_automation_rules
  FOR ALL TO authenticated
  USING (
    entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid())
    AND user_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (
    entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid())
    AND user_role() IN ('admin', 'super_admin')
  );
```

### 9.4 Tables conservées sans modification

- `email_history` — pas de changement structure, déjà OK (status, retry_count, attachments, etc.)
- `gmail_connections` — pas de changement
- `crm_campaigns` — pas de changement V1 (Lot E différé V2)
- `formation_automation_rules` — pas de changement (déjà `template_id` FK + RLS OK)
- `session_automation_logs`, `session_automation_overrides` — pas de changement

### 9.5 Migration `down.sql` (réversibilité)

```sql
-- Rollback FR-EML-6 (ajout colonnes)
ALTER TABLE email_templates
  DROP COLUMN IF EXISTS key,
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS is_active,
  DROP COLUMN IF EXISTS created_by,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS updated_by,
  DROP COLUMN IF EXISTS sender_name,
  DROP COLUMN IF EXISTS sender_email,
  DROP COLUMN IF EXISTS recipient_type,
  DROP COLUMN IF EXISTS trigger_config;

DROP INDEX IF EXISTS email_templates_entity_key_uniq;
DROP INDEX IF EXISTS email_templates_category_active;
DROP TRIGGER IF EXISTS email_templates_set_updated_at ON email_templates;
DROP FUNCTION IF EXISTS set_updated_at();
DROP VIEW IF EXISTS email_template_usage;

-- Rollback FR-EML-16 (RLS)
DROP POLICY IF EXISTS "crm_automation_rules_admin_entity" ON crm_automation_rules;
CREATE POLICY "crm_automation_rules_admin" ON crm_automation_rules
  FOR ALL TO authenticated USING (TRUE);  -- ⚠️ retour à allow_all (à éviter)
```

---

## 10. Technical Architecture

### 10.1 Couches

```
┌─────────────────────────────────────────────────────────────────┐
│  UI : /admin/emails (Next.js 14 App Router, ~400 LOC page.tsx)  │
│  + 8 sous-composants dans _components/                          │
└──────────────────────────────┬──────────────────────────────────┘
                               │ React Query / Server Actions
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Services : src/lib/services/                                   │
│  ├─ email-template-resolver.ts (NEW)                            │
│  ├─ email-template-service.ts (CRUD wrapper Supabase)           │
│  ├─ email-queue.ts (existant, conservé)                         │
│  ├─ batch-email-handler.ts (refactor B.5)                       │
│  └─ email-attachments-resolver.ts (existant, conservé)          │
└──────────────────────────────┬──────────────────────────────────┘
                               │ Supabase JS Client (RLS-aware)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  DB Supabase :                                                  │
│  ├─ email_templates (étendue)                                   │
│  ├─ email_history (queue + audit, inchangée)                    │
│  ├─ email_template_usage (vue NEW)                              │
│  ├─ formation_automation_rules (RLS OK, FK template_id)         │
│  ├─ crm_automation_rules (RLS fixée P0)                         │
│  └─ crm_campaigns (V2)                                          │
└─────────────────────────────────────────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
   Resend API           Gmail OAuth API        (futur SMTP V2)
```

### 10.2 Composants UI

Réutilisation maximale des composants Shadcn/ui + composants déjà existants `/admin/documents` :

| Composant | Source | Rôle |
|---|---|---|
| `EmailsTabsNav` | NEW (calqué sur `DocumentsTabsNav`) | Sticky tabs 4-onglets |
| `TemplateCard` | NEW | Card unitaire avec badge catégorie + usage |
| `TemplateRow` | NEW | Ligne pour vue Liste compacte |
| `CategoryFilter` | NEW | Chips multi-select persisté URL |
| `TemplateEditDialog` | NEW (refonte du dialog actuel) | 3-colonnes responsive |
| `MetaPanel` | NEW (sous-composant) | Catégorie, nom, recipient, attachments, sender, usage |
| `EditorPanel` | NEW (sous-composant) | Subject + RichTextEditor + InsertVariableButton |
| `PreviewPanel` | NEW (sous-composant) | Preview live + sélecteurs contexte |
| `UsageBadge` + `UsagePopover` | NEW | Affichage + popover usage tracking |
| `ArchiveTab` | NEW | Liste templates archivés + actions restore/delete |
| `HistoryDetailSheet` | NEW (refonte) | Sheet shadcn slide-in droite (remplace dialog full) |
| `AutomationsTab` + 3 sous-tabs | NEW | Relances + Formation + CRM |
| `RichTextEditor` | Existant | Tiptap (réutilisé) |
| `InsertVariableButton` | Existant | Popover variables (réutilisé) |

### 10.3 Feature flags

| Flag | Effet OFF | Effet ON | Default |
|---|---|---|---|
| `USE_TEMPLATE_RESOLVER_INVOICES` | Hardcoded `REMINDER_TEMPLATES` | Resolver | OFF au déploiement, ON après staging validé |
| `USE_TEMPLATE_RESOLVER_QUOTES` | Idem quotes | Resolver | Idem |
| `USE_TEMPLATE_RESOLVER_SIGN_REQUEST` | Hardcoded fallback | Resolver | Idem |
| `USE_TEMPLATE_RESOLVER_OPCO` | Hardcoded inline | Resolver | Idem |
| `USE_TEMPLATE_RESOLVER_BATCH` | `EMAIL_SUBJECT_LABELS` | Resolver | Idem |

Tous les flags sont supprimés du code 1 semaine après leur activation 100% (FR-EML-26).

### 10.4 Migration progressive (cf. cadrage §7)

1. **PR1 (sécurité)** : Fix RLS `crm_automation_rules` seul (FR-EML-16) — déployable en hotfix indépendant.
2. **PR2 (infra)** : Migration SQL `email_templates` étendu + vue + seed (FR-EML-6 à 15).
3. **PR3 (service)** : `email-template-resolver.ts` + tests (FR-EML-1 à 5).
4. **PR4-8 (migration pipelines)** : 1 PR par route migrée avec son feature flag, déployable indépendamment.
5. **PR9 (cleanup)** : Suppression constantes hardcoded + flags, 1 semaine après PR8.
6. **PR10 (UI Lot C)** : Refonte `/admin/emails` complète. Indépendante des PR2-9 (pas de migration data).
7. **PR11 (cross-entity)** : Bouton "Dupliquer vers <entité>".
8. **PR12 (hygiène)** : Tests E2E + doc + logs structurés.

---

## 11. Traceability Matrix

| FR | Cadrage Lot | UX section | Story implémentation prévue |
|---|---|---|---|
| FR-EML-1 → 5 | A.2 | UX §7.2 (service backend) | Story A2 : `email-template-resolver.ts` + tests |
| FR-EML-6 → 11 | A.1 | UX §9 (data model) | Story A1 : Migration SQL `email_templates` étendu |
| FR-EML-12 → 15 | A.3 | UX §6.7 empty state | Story A3 : Seed templates par défaut idempotent |
| FR-EML-16 → 19 | A.4 | UX §11 a11y/sec | Story A4 : Fix RLS `crm_automation_rules` (P0 hotfix indépendant) |
| FR-EML-20 → 26 | B.1 → B.5 | — (backend pure) | Stories B1 → B5 : 1 story par route migrée |
| FR-EML-27 → 46 | C.1 → C.8 | UX §3 IA, §5 flows, §6 wireframes, §7 composants | Stories C1 → C8 : split, tabs, cards, dialog, archives, etc. |
| FR-EML-47 → 50 | D.1, D.2 | UX §5.4 flow J7 | Story D1 : Cross-entity duplication |
| FR-EML-51 → 53 | A (annexe) | UX §7.3 UsageBadge | Story A5 : Vue SQL `email_template_usage` |
| FR-EML-54 → 58 | F.1 → F.4 | UX §11 a11y | Stories F1 (logs), F2 (tests Vitest), F3 (doc), F4 (E2E Playwright) |
| FR-EML-59 → 64 | E (V2) | — | Reportés V2 |

---

## 12. Risks & Constraints

| Risque | Impact | Probabilité | Mitigation |
|---|---|---|---|
| Mail critique non envoyé pendant migration (resolver retourne null, fallback supprimé) | 🔴 Élevé (Qualiopi, OPCO) | Moyenne | Feature flag par route + `assertSeedComplete()` au boot cron (FR-EML-5) + monitoring `email_history.status='failed'` → rollback flag automatique si > 5% taux échec en 1h |
| Fix RLS `crm_automation_rules` casse une fonctionnalité existante | Moyen | Faible | Audit préalable callers (FR-EML-17) + tests RLS Vitest (FR-EML-19) + déploiement staging avant prod |
| Seed wording ne match pas exactement les hardcoded actuels → wording différent post-migration | Moyen | Moyen | FR-EML-15 : wording initial = copie pixel-perfect des hardcoded. Test snapshot SQL `SELECT body FROM email_templates WHERE key='reminder_invoice_first'` vs ancien hardcoded |
| Loris écrase un template critique sans s'en rendre compte | Moyen | Moyenne | Warning UI usage_count (FR-EML-37) + soft-delete réversible (FR-EML-40) + `email_history.body` archive ultime |
| Concurrent edit Loris ↔ Wissam → last-write-wins silencieux | Faible | Moyen | Détection FR-EML-46 (compare `updated_at` load vs save) |
| Cross-entity duplication crée des orphelins (super_admin oublie) | Faible | Faible | FR-EML-50 : indicateur visuel "existe aussi sur <entité>" + preview avant duplication |
| Vue `email_template_usage` perf dégradée à grande échelle | Faible | Faible | Vue simple (2 UNION), exécutée à la demande seulement (pas dans des hot paths) — re-évaluer si problème en V2 |
| Resend free tier dépassé (>100 mails/jour) | Faible | Faible | Anticiper le passage plan starter $20/mois si Loris monte en volume. NFR-EML-COST-2. |
| Refonte UI Lot C produit des régressions visuelles sur les workflows existants (RelancesTab notamment) | Moyen | Moyen | Tests E2E Playwright sur les 7 JTBD (FR-EML-57) + smoke check manuel Wissam en staging |
| Loris ne comprend pas la sub-tab "Automatisations" → friction post-livraison | Faible | Faible | UX design §6.5 wireframe explicite + onboarding flash quand il visite l'onglet pour la 1ʳᵉ fois (out of scope V1, mais documentation `docs/emails.md` à pousser) |

---

**Fin du PRD v1.0** — prêt pour validation Wissam et passage à l'étape suivante (architecture via `bmad-create-architecture` ou directement epics via `bmad-create-epics-and-stories`).
