---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
completedAt: '2026-05-16'
inputDocuments:
  - bmad_output/planning-artifacts/prd-documents.md
  - bmad_output/planning-artifacts/cadrage-module-documents.md
  - bmad_output/planning-artifacts/epics-documents.md
  - bmad_output/planning-artifacts/prd.md
  - bmad_output/planning-artifacts/cadrage-module-formations.md
  - bmad_output/planning-artifacts/epics.md
  - CLAUDE.md
  - src/lib/templates/*.ts (34 templates statiques — référence canonique)
  - src/lib/utils/resolve-variables.ts (resolver + ALIAS_TO_VARIABLE_KEY, 83 aliases)
  - src/lib/services/document-generation/ (DocumentGenerationService + engines)
  - src/lib/template-variables.ts (catalogue typé pour /admin/documents/variables)
workflowType: 'architecture'
project_name: 'lms-platform'
user_name: 'Wissam'
date: '2026-05-16'
scope: 'PR2 — Refonte TabConventionDocs (Full équivalent + Hybride templates + Lot C signatures)'
status: 'complete'
---

# Architecture Decision Document — Refonte Module Documents (PR2)

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Context

Cette architecture documente le **PR2 (et ses sous-PRs)** de la refonte du module Génération de Documents — phase d'intégration UI complète après que la base de 34 templates statiques + 90+ endpoints generate-* a été livrée (PRs #45 à #88).

**Scope** : Refactor `TabConventionDocs.tsx` vers le nouveau système avec :
1. **Doc registry** centralisé (remplace constants hardcodés)
2. **Templates hybrides** : statiques (code, 34 templates) avec possibilité de custom override Tiptap par session
3. **State machine préservée** (brouillon → figé → envoyé → signé)
4. **Lot C signatures** intégré (magic link + canvas + storage + embedding)
5. **Matrix UI** préservée (apprenants × docs / entreprises × docs / formateurs × docs)
6. **Mass operations** préservées (batch ZIP + batch email)

**Décisions de scope prises avec Wissam (2026-05-16) :**
- Full équivalent fonctionnel (pas de perte vs aujourd'hui)
- Hybride : statiques par défaut + override custom UI possible
- Bundle Lot C signatures dans le projet
- Décomposition en ~5 sous-PRs séquentiels

---

## Project Context Analysis

_Enrichi par Party Mode multi-agents (Winston / Amelia / Mary) — 2026-05-16_

### Requirements Overview

**Functional Requirements relevant to PR2 :**

PR2 déploie **3 Lots simultanément** via la refonte UI du `TabConventionDocs.tsx` :
- **Lot B** (Story B0+B3) : path unique `resolveDocumentVariables()` + migration conventions → `DocumentGenerationService`
- **Lot C** (Story C1+C2) : `SignatureService` + canvas inline + `/api/documents/sign` + magic link
- **Lot D** (Story D1+D2) : page `/admin/documents/import` + validation templates uploadés

Foundation **Lot A déjà livré** : `DocumentGenerationService` + Puppeteer Railway + cache SHA-256 + 34 templates statiques + 90+ endpoints `generate-*`.

⚠️ **Anti-pattern de release identifié (Winston)** : on ne bundle pas un changement réversible (UI Lot B) avec un changement irréversible (migration data Lot D) dans la même release. Si PR Git unique, le **déploiement** doit être séquencé en **3 phases via feature flags** :
1. **Phase 1 — Lot D first** : migration data avec dual-write `formation_convention_documents` + `documents`, shadow-read 1 semaine en pre-prod
2. **Phase 2 — Lot B** : lecture via flag `USE_UNIFIED_DOCUMENTS_FOR_{type}` puis bascule de TabConventionDocs sur les nouveaux endpoints
3. **Phase 3 — Lot C** : signature workflow activé

**Non-Functional Requirements (critiques) :**

- 🔴 **NFR-SEC-1/2** : RLS `documents.entity_id`, isolation multi-tenant absolue
- 🔴 **NFR-SEC-3** : sanitize tout HTML user-generated (DOMPurify) avant rendu Puppeteer + whitelist stricte des variables résolvables par contexte (anti cross-tenant leak via `[%AutreClient.SIRET%]`)
- 🔴 **NFR-PERF-1/2** : cache hit < 200ms, miss < 5s
  - ⚠️ **SLA explicite à poser** : si < 2s P95 pour signature magic link apprenant, Puppeteer Railway hobby ne tient pas (cold start 3-5s). Décision : worker dédié vs warm ping vs accepter > 2s.
- 🔴 **NFR-MAINT-1** : 0 cast `any`. Pattern obligatoire pour Puppeteer + CloudConvert :
  ```ts
  type PdfResult =
    | { source: 'puppeteer'; buffer: Buffer }
    | { source: 'cloudconvert'; buffer: Buffer }
    | { source: 'cache'; buffer: Buffer; hash: string }
  ```
- 🔴 **Cache key complet (sécurité multi-tenant)** : doit inclure `entity_id` (anti cross-tenant cache poisoning RGPD) + `resolver_version` (invalidation atomique lors d'un bug fix variable). Clé finale = `sha256(template_id + entity_id + source + owner + updated_at + resolver_version)`.
- 🟡 **NFR-OBS-2** : logs structurés (`document_generated`, `document_signed`, `pdf_cache_hit`, `pdf_cache_miss`, `template_resolver_warning`)
- 🟡 **NFR-REL-1** : fallback CloudConvert auto si Puppeteer down + budget alerting (un dimanche soir de panne Railway = combien CloudConvert factures ?)

**Scale & Complexity :**

- ~10-20 sessions actives en parallèle
- 6-20 apprenants/session (INTER majoritairement)
- Matrix UI : ~20-30 docs/session (3 matrices : apprenants × docs / entreprises × docs / formateurs × docs)
- ~50 PDF/jour baseline, 200 en pic
- **⚠️ Volume historique inconnu (Mary)** : combien de docs `formation_convention_documents` existent en prod aujourd'hui ? Si 200 → big bang migration trivial. Si 15 000 → progressive obligatoire avec script de réconciliation.

- Primary domain : full-stack web (Next.js 14 SSR + RSC + Supabase)
- Complexity level : **high** (multi-tenant, multi-layer, regulatory compliance, signatures à valeur probante)

### Technical Constraints & Dependencies

**Décisions architecturales DÉJÀ prises (PRD validé) :**
- Table `documents` canonique (à migrer depuis `formation_convention_documents` legacy)
- Feature flags `USE_UNIFIED_DOCUMENTS_FOR_{type}` pour migration progressive
- Puppeteer self-hosted Railway + CloudConvert fallback
- Cache SHA-256 (à enrichir : voir cache key ci-dessus)
- Path unique `resolveDocumentVariables()` avec balises `[%Var%]`
- Bucket storage `documents/{entity_id}/{doc_type}/{doc_id}.pdf`
- `SignatureService` unifié + canvas inline + token public

**Décisions à arbitrer dans Steps 4-6 :**

1. **Document type registry (Winston Option C recommandée)** : table DB `document_types` (source de vérité runtime) + génération TS au build (`pnpm gen:doc-types` → union type `DocType` typé). Hybride DB + TS = flexibilité prod + safety dev.
   - Compatible avec Amelia : ajouter colonne `is_system boolean` pour distinguer 34 statiques + customs.
   - Fichiers TS `src/lib/templates/*.ts` = seed fallback.

2. **Immutabilité légale PDFs (Winston #7)** : PDF généré = artefact gelé en bucket, jamais régénéré. Table `documents` stocke `template_snapshot_id` (hash du template au moment de la génération) pour traçabilité Qualiopi. **Distinct de la régénération à la volée** qui doit être interdite sur les docs déjà signés.

3. **Signatures Lot C : MVP mono-partie** (Winston + Amelia consensus) :
   - Pas de révocation, pas de re-signature dans MVP
   - Table `signatures` modélisée avec `state` extensible dès jour 1 (`pending | signed | revoked | expired`) pour éviter migration douloureuse v2
   - Audit trail obligatoire : `signer_id`, `signed_at`, `ip_address`, `user_agent`
   - Ticket backlog "Signature workflow v2 (multi-parties + révocation)" créé maintenant

4. **Custom templates : Tiptap + DOMPurify + whitelist resolver** (Amelia) OU **éditeur HTML brut avec preview sandboxed iframe** (Winston "boring choice")
   - ⚠️ **Mary remet en question le besoin** : Loris veut-il vraiment composer en WYSIWYG, ou juste ajuster wording ? Question à valider avant d'arbitrer.

5. **Migration data progressive obligatoire** (Winston + Amelia consensus) :
   - Dual-write `formation_convention_documents` + `documents` pendant N semaines
   - Shadow-read en pre-prod sur 1 semaine min (hash égalité contenu sur N=100 conventions prod)
   - Feature flag par type doc
   - Plan de rollback documenté **avant** de toucher la migration (sinon on ne commence pas)

**Project constraints (CLAUDE.md) :**
- Next.js 14 App Router (API en `app/api/*/route.ts`)
- Supabase RLS obligatoire + filtre `entity_id` partout
- TypeScript strict (0 `any`)
- React Hook Form + Zod pour les forms
- Writes via services (no inline Supabase mutations)
- 0 catch silencieux (CLAUDE.md règle #9)

**Stakeholders identifiés :**
- Loris VICHOT (gérant 2 OF, décideur business)
- Apprenants (reçoivent docs, signent)
- Formateurs (signent conventions, intervenants)
- Clients entreprises (signent conventions, multi-INTER)
- Auditeurs Qualiopi (rétention 10 ans, traçabilité)

**⚠️ Stakeholders potentiellement oubliés (Mary) :**
- **OPCO** (Atlas, AFDAS, FAFIH selon secteur) : exigences format conventions, mentions obligatoires (n° subrogation, dossier OPCO), parfois signature eIDAS conforme
- **Co-traitants** : conventions de sous-traitance MR ↔ C3V (pas dans liste 11 types actuelle)

### Cross-Cutting Concerns Identified

- **Multi-tenant entity_id isolation** : RLS + applicatif + **cache key** (anti cross-tenant cache poisoning)
- **Audit trail signatures** : IP, user-agent, signer_id, timestamp, état (pending/signed/revoked)
- **Error handling explicite** : 0 catch silencieux, UI dialogs sur erreurs Puppeteer/CloudConvert simultanées
- **Structured logging** : Netlify Logs via `logEvent()` pour observabilité
- **Feature flag driven migration** : par `doc_type` pour bascule progressive
- **Backward compatibility** : dual-write pendant migration legacy → canonique
- **Immutabilité légale** : artefact PDF figé, `template_snapshot_id` obligatoire dans `documents`
- **Sécurité templates user-generated** : DOMPurify + whitelist variables resolver (anti XSS + anti cross-tenant leak)
- **Versioning resolver** : `resolver_version` dans cache key pour invalidation atomique

### TODO — Preuves métier manquantes (Mary, à compléter avant Step 4 Decisions)

Bloquantes pour le scope final :

1. ⏳ **Question Loris sur Tiptap** : "Sur les 11 types de docs, combien de fois par an tu veux en créer un nouveau de zéro vs juste ajuster un existant ?" → si "0 nouveau, 2-3 ajustements/an", tuer la story Tiptap (économie 4-6 j-h)
2. ⏳ **Question Loris sur OPCO** : "Quels OPCO reçoivent vos conventions ? Ont-ils des exigences de format spécifiques ?" → ajout possible de types de docs OPCO-spécifiques + signature eIDAS
3. ⏳ **Volume historique** : `SELECT COUNT(*) FROM formation_convention_documents` en prod → calibre stratégie migration

Non-bloquantes mais à clarifier rapidement :

4. ⏳ Co-traitants : conventions de sous-traitance MR ↔ C3V manquantes ?
5. ⏳ **Décision produit signatures (John à consulter)** : revocation autorisée ? Re-signature après modif ? Multi-parties dans MVP ou v2 ?
6. ⏳ **Plan de rollback documenté** pour migration `formation_convention_documents` → `documents` (Winston gate-keeper)

---

## Starter Template Evaluation (Brownfield)

### Primary Technology Domain

**Full-stack web** : Next.js 14 App Router + Supabase + multi-tenant.

### Stack déjà établi (référence — pas de migration)

| Layer | Tech | Statut PR2 |
|---|---|---|
| **Framework** | Next.js 14 (App Router, RSC) | ✅ établi |
| **Language** | TypeScript strict (0 `any`) | ✅ contrainte forte (CLAUDE.md) |
| **UI** | TailwindCSS + Shadcn/ui (Radix) | ✅ établi |
| **Forms** | React Hook Form + Zod | ✅ établi (matrix UI à refondre via RHF) |
| **DB / Auth** | Supabase (Postgres + RLS + Storage) | ✅ multi-tenant `entity_id` partout |
| **Tests** | Vitest (343 tests passent) | ✅ TDD-first imposé pour PR2 |
| **Tables** | TanStack Table | ✅ déjà utilisé pour matrices |
| **Email** | Resend + Gmail OAuth | ✅ établi (worker `process-scheduled`) |
| **Deploy** | Netlify (main = prod, develop = dev) | ✅ |
| **PDF engine** | Puppeteer self-hosted Railway | ✅ Lot A livré |
| **PDF fallback** | CloudConvert | ✅ Lot A livré |
| **Cache PDF** | Supabase Storage bucket SHA-256 | ✅ Lot A livré (clé à enrichir : `entity_id` + `resolver_version`) |

### Dépendances à ajouter pour PR2

| Lib | Pour | Lot |
|---|---|---|
| `dompurify` + `@types/dompurify` | Sanitization HTML user-generated avant rendu Puppeteer (anti XSS templates customs) | D |
| `react-signature-canvas` | Canvas signature inline (à vérifier si déjà installé via CLAUDE.md) | C |
| `qrcode` | QR code magic link (déjà installé — alias `[%QR Code de l'extranet de l'apprenant%]` fonctionne) | C |

### Recommandation

Pas de changement de stack. PR2 = **refactor + extension** d'un système déjà mature :
- Pattern resolver `[%Var%]` éprouvé sur 34 templates
- `DocumentGenerationService` éprouvé sur 90+ endpoints
- Cache SHA-256 éprouvé (juste à enrichir la clé)
- TabConventionDocs existe déjà — c'est un refactor, pas un build from scratch

**Note** : Pas de story d'initialisation projet. Première story PR2 = ajout des 2 dépendances `dompurify` + `react-signature-canvas` + tests de fumée.

---

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation) :**
- **CD-1** : Doc type registry pattern → table DB `document_types` + génération TS au build (Winston Option C)
- **CD-2** : Migration strategy → progressive (dual-write + shadow-read pre-prod 1 sem)
- **CD-3** : Cache key composition → `sha256(template_id + entity_id + source + owner + updated_at + resolver_version)`
- **CD-4** : Immutabilité légale PDFs → champ `documents.template_snapshot_id` (hash template au moment génération)
- **CD-5** : Signatures MVP scope → **mono-partie**, state machine extensible (`pending|signed|revoked|expired`), audit trail obligatoire

**Important Decisions (Shape Architecture) :**
- **ID-1** : Custom templates UI → **Tiptap + DOMPurify + whitelist resolver** ✅ (validé Wissam 2026-05-16)
- **ID-2** : Mass email → progressif (1 par 1 puis batch en V2)
- **ID-3** : Feature flag granularity → 1 flag par `doc_type` (`USE_UNIFIED_DOCUMENTS_FOR_{type}`)
- **ID-4** : SLA PDF generation → < 5s P95 acceptable (pas de worker dédié pour MVP, accepter cold-start Puppeteer hobby)

**Deferred Decisions (Post-MVP) :**
- **DD-1** : Signature workflow v2 (multi-parties, révocation, re-signature)
- **DD-2** : Templates OPCO-spécifiques + signature eIDAS conforme
- **DD-3** : Conventions de sous-traitance MR ↔ C3V

### Data Architecture

**Nouvelles tables / refactor :**

| Table | Status | Schéma simplifié |
|---|---|---|
| `document_types` | **NEW** | `id, key, label, scope (learner/company/trainer/session), default_template_id, requires_signature, is_system, entity_id?` |
| `documents` | **refactor** | `id, entity_id, doc_type_id, template_snapshot_id, session_id, owner_type, owner_id, html_source, pdf_bucket_path, status, is_confirmed, document_date, is_sent, sent_at, is_signed, signed_at, custom_template_id?` |
| `signatures` | **NEW/extend** | `id, document_id, signer_type, signer_id, status, signature_data, signed_at, ip_address, user_agent, magic_link_token` |
| `signing_tokens` | existant | (vérifier schema, purpose='document_signature') |
| `document_templates` | refactor | `id, entity_id, doc_type_id, name, html_content (Tiptap), is_system, version, created_by` |

**Migration legacy → canonique :**
- Dual-write pendant transition (par feature flag)
- Shadow-read en pre-prod 1 sem (script qui hash-compare 100 conventions)
- Plan de rollback OBLIGATOIRE avant de toucher migration (Winston gate)

**Validation :** Zod schemas par entité (CLAUDE.md règle #6)
**Cache :** bucket `pdf-cache` existant + key enrichi (CD-3)

### Authentication & Security

- **Auth** : Supabase Auth (existant)
- **Magic link signatures** : `signing_tokens.token` UUIDv4, `expires_at` = 7 jours, `purpose='document_signature'`
- **RLS policies** :
  - `documents` : `SELECT WHERE entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid())`
  - `document_types` : `SELECT WHERE is_system = true OR entity_id = current_user.entity_id`
  - `signatures` : RLS via parent `documents.entity_id`
  - `signing_tokens` : magic link bypass (anon role) avec validation token côté serveur
- **DOMPurify** : sanitize Tiptap HTML AVANT rendu Puppeteer (anti XSS)
- **Whitelist resolver** : `[%AutreClient.SIRET%]` → throw si client ≠ contexte courant (anti cross-tenant leak)
- **Audit trail signatures** : `ip_address`, `user_agent`, `timestamp` capturés depuis `req.headers`

### API & Communication

**Nouveaux endpoints :**

| Endpoint | Body | Notes |
|---|---|---|
| `POST /api/documents/generate-from-registry` | `{ registry_key, session_id, owner_id, owner_type, custom_template_id? }` | unifié, résout custom OU static |
| `POST /api/documents/sign` | `{ token, signature_data, signer_metadata }` | depuis magic link page |
| `POST /api/documents/import-template` | `multipart/form-data` (file + metadata) | upload .docx OU Tiptap HTML save |
| `POST /api/documents/batch-zip` | `{ session_id, doc_type, owner_filter? }` | mass download |
| `POST /api/documents/send-batch-email` | `{ session_id, doc_type, recipients[] }` | mass email avec PDFs en pièce jointe |

**Response format** : `{ ok: boolean, data?: T, error?: { code, message } }`
**Error handling** : 0 catch silencieux, sanitized error returns (CLAUDE.md règle #9)

### Frontend Architecture

**TabConventionDocs refactor :**
- Source = `documents` table + `document_types` registry
- 3 matrices (apprenants × docs / entreprises × docs / formateurs × docs)
- Actions cellule : Voir / Figer (date) / Envoyer / Demander signature / Télécharger / Reset
- Mass ops : Envoyer tous, Télécharger ZIP, Demander signature à tous
- TanStack Query pour cache server
- React Hook Form + Zod pour les forms (date picker, custom doc assignment)

**Page magic link signature** : `/sign/{token}` (publique, `react-signature-canvas`)
**Page custom template editor** : `/admin/documents/templates/[id]/edit` (Tiptap + DOMPurify + variables picker via catalogue PR1)

### Infrastructure & Deployment

- **Hosting** : Netlify (main=prod, develop=dev) — existant
- **PDF** : Puppeteer Railway + CloudConvert fallback — existant
- **Storage PDFs** : `documents/{entity_id}/{doc_type}/{doc_id}.pdf` (canonique, immutable)
- **Storage cache** : `pdf-cache/{sha256_key}.pdf` (déjà existant)
- **Feature flags** : variables env `NEXT_PUBLIC_USE_UNIFIED_DOCUMENTS_FOR_{type}` (simple, pas de table DB pour MVP)
- **Monitoring** : Netlify Logs + `logEvent()` structuré (vérifier si Sentry installé)
- **SLA** : < 5s P95 acceptable, alerting si > 10s ou si fallback CloudConvert > 5% des appels

### Decision Impact Analysis

**Implementation Sequence (sous-PRs PR2) :**

| Sous-PR | Contenu | Dépend de |
|---|---|---|
| **2.1** | `document_types` table + TS gen + endpoint unifié `/generate-from-registry` + Tiptap rewire `[%Var%]` | — |
| **2.2** | Migration data progressive (dual-write + shadow-read pre-prod 1 sem) | 2.1 |
| **2.3** | Refactor `TabConventionDocs.tsx` (registry + documents table) | 2.1 |
| **2.4** | Lot C signatures (magic link + canvas + storage + embedding) | 2.1 (registry pour `requires_signature`) |
| **2.5** | Mass operations (batch ZIP + batch email) | 2.3 |
| **2.6** | Cleanup ancien code (pdf-export.ts, pdf-generator.ts, /admin/documents/page.tsx Tiptap legacy) | 2.2-2.5 mergés |

**Cross-Component Dependencies :**
- 2.1 BLOQUE tout le reste (registry = source de vérité)
- 2.2 et 2.3 peuvent être en parallèle après 2.1
- 2.4 peut commencer après 2.1 (parallèle 2.3)
- Migration `email-attachments-resolver.ts` = PR3 séparée (pas dans PR2)

---

## Implementation Patterns & Consistency Rules

### Pattern Categories — État actuel + ajouts PR2

**Critical Conflict Points Identified :** ~12 zones où les agents IA pourraient diverger. La plupart sont résolues par CLAUDE.md et les conventions établies (343 tests, 90+ endpoints). Les nouveaux patterns PR2 sont marqués 🆕.

### Naming Patterns

**Database Naming (établi) :**
- Tables : `snake_case` + pluriel (`users`, `sessions`, `formation_convention_documents`)
- Colonnes : `snake_case` (`user_id`, `entity_id`, `created_at`)
- Foreign keys : `{ref_table_singular}_id` (`learner_id`, `session_id`)
- Index : `idx_{table}_{columns}`
- 🆕 Nouvelles tables PR2 : `document_types`, `signatures` (pluriel)
- 🆕 Status enum : valeurs en `snake_case` (`pending`, `signed`, `revoked`, `expired`)

**API Naming (établi) :**
- Routes : `/api/documents/generate-{name}` (kebab-case, verb-resource)
- POST pour mutations, GET pour reads
- 🆕 Endpoints PR2 :
  - `POST /api/documents/generate-from-registry`
  - `POST /api/documents/sign`
  - `POST /api/documents/import-template`
  - `POST /api/documents/batch-zip`
  - `POST /api/documents/send-batch-email`

**Code Naming (établi) :**
- Composants React : `PascalCase`
- Fichiers : `kebab-case.ts` (libs/utils), `PascalCase.tsx` (composants)
- Fonctions / variables : `camelCase`
- Types / interfaces : `PascalCase`
- Tech keys variables : `{{snake_case}}`
- 🆕 Registry keys (doc_type.key) : `snake_case`
- 🆕 Sellsy aliases : `[%Libellé Avec Espaces%]` (préservé pour compat Sellsy)

**Feature Flag Naming :**
- 🆕 Format : `NEXT_PUBLIC_USE_UNIFIED_DOCUMENTS_FOR_{TYPE_UPPERCASE}`
- Lu côté serveur ET client (préfixe `NEXT_PUBLIC_`)

### Structure Patterns

**Project Organization (établi) :**
- Pages : `src/app/(dashboard)/admin/...`
- API : `src/app/api/{resource}/{action}/route.ts`
- Services : `src/lib/services/`
- Templates : `src/lib/templates/`
- Utils : `src/lib/utils/`
- Types : `src/lib/types/`
- Validations : `src/lib/validations/` (Zod)
- Composants : `src/components/ui/` + `src/components/...`
- 🆕 Migrations : `supabase/migrations/{NNN}_{description}.sql`

**Tests Location (établi) :**
- Co-localisés dans `__tests__/` adjacent aux sources
- Pattern : `src/lib/services/__tests__/document-generation.test.ts`
- E2E : `e2e/{feature}-end-to-end.spec.ts` (Playwright)

### Format Patterns

**API Response (🆕 PR2) :**

Tous les nouveaux endpoints PR2 utilisent :

```ts
type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } }
```

Les anciens endpoints (90+ existants) restent inchangés. Pas de bigbang.

**Error Codes (🆕 PR2) :**
- `UNAUTHORIZED` (401)
- `FORBIDDEN` (403) — RLS violation
- `NOT_FOUND` (404)
- `VALIDATION_ERROR` (422) — Zod failure
- `PDF_GENERATION_FAILED` (500) — Puppeteer + CloudConvert down
- `TEMPLATE_RESOLVER_ERROR` (500) — variable manquante (whitelist throw)
- `SIGNATURE_EXPIRED` (410)
- `CACHE_POISONING_DETECTED` (500) — entity_id mismatch dans cache key

**Date Format (établi) :**
- DB : `TIMESTAMPTZ` UTC
- API : ISO 8601 strings
- UI : `date-fns/format` locale `fr` (ex: "15/09/2025")
- Templates : `dd/MM/yyyy`

**JSON Field Naming :**
- DB columns + API : `snake_case`
- TS types : `snake_case` (pas de transformation auto, évite bugs)

### Communication Patterns

**Event Names (🆕 logEvent standardisés) :**
- `document_generated` (cache_hit | cache_miss)
- `document_signed`
- `document_signature_requested`
- `document_template_imported`
- `pdf_cache_hit` / `pdf_cache_miss`
- `template_resolver_warning`
- `puppeteer_fallback_to_cloudconvert`

**State Management (établi) :**
- React local state + TanStack Query (vérifier installé sinon SWR)
- Pas de Redux/Zustand
- 🆕 Query keys PR2 : `['documents', sessionId, ownerType]`

### Process Patterns

**Error Handling (CLAUDE.md règle #9) :**
- 0 catch silencieux
- Pattern service :
  ```ts
  try { ... }
  catch (err) {
    logEvent('operation_failed', { context, error: sanitize(err) });
    return { ok: false, error: { code: 'OPERATION_FAILED', message: '...' } };
  }
  ```
- UI : toast `useToast()` (Shadcn) + Sentry si critique
- 🆕 Puppeteer + CloudConvert simultanément down : dialog explicit "Service indisponible, contactez support"

**Loading States (établi) :**
- `useState<boolean>(false)` + `Loader2` de `lucide-react` avec `animate-spin`
- TanStack Query : `isLoading`, `isFetching`
- 🆕 Mass operations : progress UI `X / N traités`

**Validation (CLAUDE.md règle #6) :**
- Zod schemas dans `src/lib/validations/`
- API : `schema.safeParse(input)`, return validation error si fail
- Front : `useForm({ resolver: zodResolver(schema) })`

### Enforcement Guidelines

**Tous les agents IA DOIVENT :**

1. Filtrer par `entity_id` dans toute requête Supabase
2. 0 cast `any` — unions discriminées, `unknown` + type guards
3. Utiliser `resolveDocumentVariables()` (jamais string replace inline)
4. Passer par `DocumentGenerationService` pour tout PDF
5. Inclure `entity_id` + `resolver_version` dans le cache key
6. DOMPurify HTML user-generated AVANT Puppeteer
7. `logEvent()` structurés pour tous événements documents
8. Tests EN PREMIER (TDD red → green → refactor)
9. Audit trail signatures : IP, user-agent, timestamp

**Pattern Enforcement :**
- `npx tsc --noEmit` (0 any) + `npx vitest run` (343+ tests)
- Code review obligatoire (`superpowers:requesting-code-review`)
- Pattern violations : `// TODO(pattern-violation): ...` avec ticket

### Pattern Examples

**Good Example :**

```ts
const InputSchema = z.object({
  registry_key: z.string(),
  session_id: z.string().uuid(),
  owner_id: z.string().uuid(),
  owner_type: z.enum(['learner', 'company', 'trainer']),
  custom_template_id: z.string().uuid().optional(),
});

export async function POST(req: Request): Promise<Response> {
  const input = InputSchema.safeParse(await req.json());
  if (!input.success) {
    return Response.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: '...', details: input.error.format() } });
  }
  const result = await documentService.generateFromRegistry(input.data);
  return Response.json({ ok: true, data: result });
}
```

**Anti-Patterns :**

```ts
// ❌ Cast any
const session = (data as any).session;

// ❌ Catch silencieux
try { await generatePdf(); } catch {}

// ❌ Variable résolution inline (bypass resolver)
const html = template.replace('{{nom_apprenant}}', learner.name);

// ❌ Manque entity_id dans cache key
const cacheKey = sha256(`${templateId}-${ownerId}-${updatedAt}`);

// ❌ Tiptap HTML rendu sans DOMPurify
const pdf = await puppeteer.generate(tiptapOutput);
```

---

## Project Structure & Boundaries

### Requirements Mapping → Sous-PRs

| Sous-PR | Epic/Story | Composants principaux |
|---|---|---|
| **2.1** | Lot B (Story B0+B3), Lot D (Story D1) | Doc registry + endpoint unifié + Tiptap rewire |
| **2.2** | Lot B (migration data) | dual-write + shadow-read |
| **2.3** | Lot B (Story B3 — TabConventionDocs UI) | Matrix UI refactor |
| **2.4** | Lot C (Story C1+C2) | SignatureService + magic link + canvas |
| **2.5** | Mass ops (épic transverse) | Batch ZIP + batch email |
| **2.6** | Cleanup transversal | Delete legacy PDF code |

### Project Directory Structure (PR2 — new/modified/deleted)

```
/lms-platform/
├── supabase/migrations/
│   ├── NNN_create_document_types_table.sql          ⬆️ 2.1
│   ├── NNN_create_documents_table_canonical.sql     ⬆️ 2.2
│   ├── NNN_extend_signatures_table.sql              ⬆️ 2.4
│   └── NNN_drop_legacy_pdf_tables.sql               ⬆️ 2.6
│
├── scripts/
│   ├── gen-doc-types.ts                             🆕 2.1
│   └── shadow-read-conventions.ts                   🆕 2.2
│
├── src/
│   ├── app/(dashboard)/admin/
│   │   ├── documents/
│   │   │   ├── page.tsx                             ✏️ 2.1   (Tiptap rewire [%Var%])
│   │   │   ├── templates/[id]/edit/page.tsx         🆕 2.1
│   │   │   └── variables/page.tsx                   ✅ PR1
│   │   ├── formations/[id]/_components/
│   │   │   ├── TabConventionDocs.tsx                ✏️ 2.3   (big rewrite)
│   │   │   ├── DocumentMatrix.tsx                   🆕 2.3
│   │   │   ├── DocumentCell.tsx                     🆕 2.3
│   │   │   ├── DocumentActionsMenu.tsx              🆕 2.3
│   │   │   ├── MassOperationsBar.tsx                🆕 2.5
│   │   │   └── SignatureRequestDialog.tsx           🆕 2.4
│   │   └── test-convention/page.tsx                 ✅ existant
│   │
│   ├── app/sign/[token]/page.tsx                    🆕 2.4   (magic link publique)
│   │
│   ├── app/api/documents/
│   │   ├── generate-from-registry/route.ts          🆕 2.1
│   │   ├── sign/route.ts                            🆕 2.4
│   │   ├── signature-request/route.ts               🆕 2.4
│   │   ├── import-template/route.ts                 🆕 2.1
│   │   ├── batch-zip/route.ts                       🆕 2.5
│   │   ├── send-batch-email/route.ts                🆕 2.5
│   │   ├── generate-from-template/route.ts          🗑️ 2.6
│   │   ├── sign-request/route.ts                    🗑️ 2.6
│   │   ├── preview-docx/route.ts                    🗑️ 2.6
│   │   └── generate-*/route.ts (30+ existants)      ✅
│   │
│   ├── lib/services/
│   │   ├── document-registry.ts                     🆕 2.1
│   │   ├── documents-migration.ts                   🆕 2.2
│   │   ├── signature-service.ts                     🆕 2.4
│   │   ├── document-mass-operations.ts              🆕 2.5
│   │   ├── document-generation.ts                   ✅ Lot A
│   │   ├── pdf-generator.ts                         🗑️ 2.6
│   │   ├── docx-converter.ts                        🗑️ 2.6
│   │   └── __tests__/
│   │       ├── document-registry.test.ts            🆕 2.1
│   │       ├── documents-migration.test.ts          🆕 2.2
│   │       ├── signature-service.test.ts            🆕 2.4
│   │       └── document-mass-operations.test.ts     🆕 2.5
│   │
│   ├── lib/templates/
│   │   ├── *.ts (34 existants)                      ✅ référence canonique
│   │   └── decharge-responsabilite.ts               ⚠️ doublon avec lettre-decharge-responsabilite.ts (vérifier)
│   │
│   ├── lib/types/
│   │   ├── document-types.generated.ts              🆕 2.1   (généré par script)
│   │   ├── document.ts                              🆕 2.1
│   │   └── signature.ts                             🆕 2.4
│   │
│   ├── lib/validations/
│   │   ├── document-input.ts                        🆕 2.1
│   │   ├── signature-input.ts                       🆕 2.4
│   │   └── template-import-input.ts                 🆕 2.1
│   │
│   ├── lib/utils/
│   │   ├── resolve-variables.ts                     ✏️ 2.1   (ajout resolver_version + whitelist)
│   │   ├── sanitize-html.ts                         🆕 2.1   (DOMPurify wrapper)
│   │   └── feature-flags.ts                         🆕 2.1
│   │
│   ├── lib/
│   │   ├── email-attachments-resolver.ts            ✏️ PR3 séparée
│   │   ├── pdf-export.ts                            🗑️ 2.6
│   │   ├── emargement-pdf-export.ts                 🗑️ 2.6
│   │   ├── invoice-pdf-export.ts                    🗑️ PR3
│   │   ├── qr-pdf-export.ts                         🗑️ 2.6
│   │   ├── planning-hebdo-pdf-export.ts             🗑️ 2.6
│   │   ├── questionnaire-qr-pdf-export.ts           🗑️ 2.6
│   │   ├── document-templates-defaults.ts           🗑️ 2.6
│   │   ├── migrate-templates.ts                     🗑️ 2.6
│   │   └── template-variables.ts                    ✅ PR1
│   │
│   └── components/
│       ├── inline-signature-pad.tsx                 🆕 2.4
│       └── ui/...                                   ✅ Shadcn
│
├── e2e/
│   ├── tab-convention-docs-end-to-end.spec.ts       🆕 2.3
│   ├── signature-magic-link.spec.ts                 🆕 2.4
│   ├── convention-end-to-end.spec.ts                🆕 2.3   (parité legacy vs new)
│   └── mass-operations-end-to-end.spec.ts           🆕 2.5
│
└── docs/superpowers/
    ├── specs/2026-05-XX-pr2-tab-convention-docs-design.md  🆕
    └── plans/2026-05-XX-pr2-implementation-plan.md         🆕 (writing-plans après step 8)
```

**Légende :** 🆕 nouveau · ✏️ modifié · 🗑️ supprimé · ✅ existant inchangé

### Integration Boundaries

**API Boundaries :**
- Public (anon) : `/sign/[token]` (magic link, validation via `signing_tokens`)
- Admin (RLS auth) : `/api/documents/generate-from-registry`, `/api/documents/import-template`, `/api/documents/batch-*`, `/api/documents/sign`
- Sortants : Puppeteer Railway, CloudConvert, Resend (email), Supabase Storage

**Component Boundaries :**
- `TabConventionDocs.tsx` orchestrateur → `DocumentMatrix` (présentation) → `DocumentCell` (cellule)
- `DocumentCell` consomme `DocumentActionsMenu` (popover Shadcn)
- `MassOperationsBar` au-dessus de la matrix, callbacks `onMassSend(docType)`, `onMassDownload(docType)`
- `SignatureRequestDialog` → `/api/documents/signature-request` → server envoie email + crée magic link
- Service layer : pure functions, pas de UI deps

**Data Access Boundaries :**
- Tous writes Supabase via services dans `src/lib/services/` (CLAUDE.md règle #10)
- RLS Supabase = source de vérité sécurité (applicatif = défense en profondeur)
- Cache : `pdf-cache` bucket via `pdf-cache.ts` (existant, modifié pour nouvelle clé)

**Cross-Component Dependencies :**
- 2.1 BLOQUE 2.2, 2.3, 2.4
- 2.2 parallèle 2.3 et 2.4 après 2.1
- 2.5 après 2.3
- 2.6 après 2.2-2.5 mergés + PR3 séparée

### Boundaries non-PR2 (PR3+)

Hors scope PR2 mais flagged pour traçabilité :
- `TabEmargements.tsx` migration (utilise pdf-export.ts legacy) → PR3
- `TabFinances.tsx` migration (utilise invoice-pdf-export.ts) → PR3
- `email-attachments-resolver.ts` migration (utilise pdf-generator.ts) → PR3
- `/admin/crm/quotes` + `prospects/[id]` (utilisent devis-pdf.ts) → décision user attendue

---

## Architecture Validation

### Coherence Validation

| Check | Statut | Notes |
|---|---|---|
| Tech choices compatible | ✅ | Next.js 14 + Supabase + Puppeteer + Tiptap + DOMPurify |
| Versions compatibles | ✅ | Stack mature, pas de conflits |
| Patterns alignés avec stack | ✅ | RHF+Zod, snake_case DB, ApiResponse, RLS partout |
| Décisions contradictoires | ✅ | Aucune — ID-1 Tiptap tranché |
| Structure supporte décisions | ✅ | Mapping sous-PRs → fichiers précis |
| Boundaries définies | ✅ | API/Component/Data explicites |

### Requirements Coverage

**Epics PRD couverts :**

| Lot | Stories | Couverture PR2 | Statut |
|---|---|---|---|
| A (Foundation) | A1-A4 | Déjà livré | ✅ |
| B (Schéma unifié) | B0, B3 | Sous-PR 2.1 + 2.2 + 2.3 | ✅ |
| C (Signatures) | C1, C2 | Sous-PR 2.4 | ✅ |
| D (Import templates) | D1 (page), D2 (doc utilisateur) | Sous-PR 2.1 (D1) ; D2 différé | ⚠️ partiel |
| E (Cleanup) | E1 | Sous-PR 2.6 + PR3 séparée | ✅ |

**NFRs couverts :**

| NFR | Couverture | Mécanisme |
|---|---|---|
| NFR-SEC-1/2 (RLS multi-tenant) | ✅ | RLS + cache key entity_id |
| NFR-SEC-3 (XSS sanitization) | ✅ | DOMPurify + whitelist resolver |
| NFR-PERF-1/2 (cache < 200ms) | ✅ | Cache SHA-256 enrichi |
| NFR-PERF SLA magic link | ⚠️ ID-4 accepte < 5s | Limitation MVP |
| NFR-MAINT-1 (0 any) | ✅ | Unions discriminées |
| NFR-OBS-2 (logs structurés) | ✅ | 7 event names |
| NFR-REL-1 (fallback CloudConvert) | ✅ | Déjà en place |

### Gaps & Risques identifiés

| ID | Gap / Risque | Sévérité | Mitigation |
|---|---|---|---|
| G1 | Volume historique inconnu | 🟡 | TODO Mary — check `SELECT COUNT(*)` avant 2.2 |
| **G2** | **Plan de rollback migration data non documenté** | 🔴 | **Winston gate** : à produire AVANT sous-PR 2.2 |
| G3 | OPCO format eIDAS | 🟡 | DD-2 (post-MVP) |
| G4 | Co-traitants MR ↔ C3V | 🟢 | DD-3 (post-MVP) |
| G5 | Bundle B+C+D blast radius | 🟡 | 3 phases déploiement via feature flags |
| G6 | Cold start Puppeteer hobby 3-5s | 🟡 | ID-4 accepté |
| G7 | Doublon templates decharge-responsabilite | 🟢 | À résoudre sous-PR 2.6 |
| G8 | Email worker legacy coexiste PR2 | 🟡 | E2E test parité hash (Amelia bombe #5) |
| G9 | Story D2 (doc utilisateur Tiptap) | 🟢 | Différer après MVP |

### Cross-Cutting Validation

- ✅ Multi-tenant isolation (4 niveaux : RLS, applicatif, cache key, whitelist resolver)
- ✅ Audit trail signatures (IP, user-agent, signer_id, timestamp)
- ✅ Immutabilité légale (template_snapshot_id + PDFs gelés)
- ✅ Error handling (0 silent catch + ApiResponse + UI dialogs)
- ✅ Observabilité (7 logEvent + Netlify Logs + Sentry à vérifier)

### Readiness for Handoff

**✅ Prêt pour writing-plans :**
- 6 sous-PRs identifiés avec dépendances claires
- Fichiers concrets mappés par sous-PR
- Tests TDD priorité Amelia documentés
- Patterns enforcement clairs
- 9 risques identifiés avec mitigations

**⚠️ Blockers avant implémentation :**
1. **G2** : Plan de rollback migration data → produire en TOUT DÉBUT de sous-PR 2.2
2. **G1** : Volume historique → check rapide avant scoping sous-PR 2.2

**⏳ TODOs métier (non-bloquants pour démarrer 2.1) :**
- OPCO format requirements (G3)
- Co-traitants conventions (G4)
- Validation Tiptap usage réel (Mary)
