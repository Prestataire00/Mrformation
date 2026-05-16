---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
status: complete
completedAt: 2026-05-15
inputDocuments:
  - bmad_output/planning-artifacts/prd-documents.md
  - bmad_output/planning-artifacts/cadrage-module-documents.md
  - bmad_output/planning-artifacts/epics.md
  - CLAUDE.md
---

# Refonte du module Génération de Documents — Epic Breakdown

## Overview

Ce document décompose en epics et stories implémentables les requirements du PRD ([`prd-documents.md`](prd-documents.md)) et du cadrage Business Analyst ([`cadrage-module-documents.md`](cadrage-module-documents.md)) pour la refonte « big bang » du module Génération de Documents.

**Contexte clé** :
- Projet **brownfield** de refonte structurelle — pas de nouveau produit.
- **Mode de livraison phasé** : Story de tête A1 (Puppeteer sidecar) → Lot A (parallélisable interne) → Lot B (séquentiel, dépend A) → Lots C + D (parallèle) → Lot E (final).
- **MVP = 21 stories** sur 6 epics (+ Epic F Mass Operations ajouté 2026-05-17). Effort total estimé **25.5-33 j-h dev + 3-4 j-h QA**.
- **Décisions validées** (cf cadrage v1.0) : big bang complet 11 types + schéma unifié, Puppeteer self-hosted Railway, fallback CloudConvert, mécanisme d'import par lot pour les nouveaux types Loris.

---

## Requirements Inventory

### Functional Requirements

Issus du PRD section 7. **45 FRs** sur 9 capability areas. Légende : 🔧 = nouveau/refondu · = préservé (non régressable).

**Moteur PDF unique (Lot A)**
- 🔧 FR-DOC-1 : Interface `PDFEngine` avec méthode `render(html, options): Promise<Buffer>`
- 🔧 FR-DOC-2 : `PuppeteerEngine` hébergé sur Railway (sidecar HTTP)
- 🔧 FR-DOC-3 : Support marges custom, headers/footers, format A4, polices web, images base64, CSS print
- 🔧 FR-DOC-4 : `CloudConvertEngine` fallback automatique si Puppeteer down
- 🔧 FR-DOC-5 : Variable env `PDF_ENGINE_PREFERENCE` pour bascule manuelle
- 🔧 FR-DOC-6 : Métrique `pdf_engine_used` loguée à chaque génération
- 🔧 FR-DOC-7 : Auto-pull Chromium au build Docker

**Service de génération centralisé (Lot A)**
- 🔧 FR-DOC-8 : Service `DocumentGenerationService.generate({ docType, sourceTable, sourceId, ... })` unique point d'entrée
- 🔧 FR-DOC-9 : Séquence (a) template (b) variables (c) cache lookup (d) rendu (e) upload (f) INSERT documents
- 🔧 FR-DOC-10 : Cache PDF hash SHA-256 sur (template_id, source_*, owner_*, updated_at composite)
- 🔧 FR-DOC-11 : Log structuré `document_generated` avec entity, doctype, latence, taille, engine, cache_hit

**Schéma documents unifié (Lot B)**
- 🔧 FR-DOC-12 : Table `documents` créée via migration idempotente
- 🔧 FR-DOC-13 : RLS `entity_isolation` sur `documents`
- 🔧 FR-DOC-14 : UNIQUE composite (entity, source_table, source_id, doc_type, owner_*)
- 🔧 FR-DOC-15 : Backfill idempotent depuis `generated_documents`, `formation_convention_documents`, `signatures`, `quote_signatures`
- 🔧 FR-DOC-16 : Double-write pendant transition (anciennes tables écrites en parallèle)
- 🔧 FR-DOC-17 : Feature flag `USE_UNIFIED_DOCUMENTS_FOR_<doc_type>` par type

**Service signature unifié (Lot C)**
- 🔧 FR-DOC-18 : Service `SignatureService.sign({ documentId, signatureSvg, signerId?, token?, ipAddress, userAgent })`
- 🔧 FR-DOC-19 : Sanitize SVG via `sanitizeSignatureSvg`
- 🔧 FR-DOC-20 : Idempotence (re-call sur doc signé → `already_signed: true`)
- 🔧 FR-DOC-21 : Audit trail complet (`signed_by`, `signed_at`, `signature_ip`, `signature_user_agent`, `signature_method`)
- 🔧 FR-DOC-22 : Cache invalidé via inclusion de `signed_at` dans le hash, PDF régénéré avec signature intégrée
- 🔧 FR-DOC-23 : Log `document_signed` (entity, document, doc_type, method, signer_role)

**Import templates par lot (Lot D)**
- 🔧 FR-DOC-24 : Page `/admin/documents/import` accepte upload multiple drag-and-drop
- 🔧 FR-DOC-25 : Parsing `.docx` détecte les variables `{{xxx}}`, compare au catalogue, signale les inconnues
- 🔧 FR-DOC-26 : Saisie par template : nom, catégorie, default_for_doc_type
- 🔧 FR-DOC-27 : Upload `formation-docs/templates/{entity_id}/{uuid}.docx` + INSERT `document_templates` avec `mode='docx_fidelity'`
- 🔧 FR-DOC-28 : UPSERT si même `system_key` ou même `name` (overwrite + log)
- 🔧 FR-DOC-29 : Page `/admin/documents/how-to` statique avec 5 étapes + captures + exemple téléchargeable

**Résolution variables unifiée (Lot B)**
- 🔧 FR-DOC-30 : Fonction unique `resolveDocumentVariables(template, context)` pour HTML et Word
- 🔧 FR-DOC-31 : Catalogue `TEMPLATE_VARIABLES` unique source de vérité
- 🔧 FR-DOC-32 : Nullish → chaîne vide (jamais "undefined" dans le PDF)
- 🔧 FR-DOC-33 : Dates formatées en français standard via `date-fns`
- 🔧 FR-DOC-34 : Variables images résolues en base64 (HTML) ou embedded (DOCX)

**Suppression jsPDF legacy (Lot E)**
- 🔧 FR-DOC-35 : 5 fichiers `*-pdf-export.ts` supprimés
- 🔧 FR-DOC-36 : Toutes les `import jsPDF` éliminées
- 🔧 FR-DOC-37 : `package.json` retire `jspdf`, `jspdf-autotable`, `html2canvas`
- 🔧 FR-DOC-38 : 0 cast `(doc as any).lastAutoTable.finalY`

**Observabilité & tests (Lot E)**
- 🔧 FR-DOC-39 : Événements documents émis via `logEvent()` (JSON structuré)
- 🔧 FR-DOC-40 : Tests E2E snapshot sur 3 templates clés (convention, attestation, émargement)
- 🔧 FR-DOC-41 : Test unitaire `DocumentGenerationService.generate()` (mock Supabase + PDFEngine)
- 🔧 FR-DOC-42 : Test unitaire `SignatureService.sign()` (idempotence, sanitize, audit)

**Post-MVP (hors scope refonte)**
- 🔧 FR-DOC-43 : Versioning templates
- 🔧 FR-DOC-44 : eIDAS-3 Yousign/Universign
- 🔧 FR-DOC-45 : Queue asynchrone génération batch

### Non-Functional Requirements

- **NFR-PERF** : cache hit < 200ms, cache miss < 5s, batch upload templates 20 fichiers parallèles, backfill 10k lignes < 5 min.
- **NFR-SEC** : RLS entity_isolation, sanitize SVG, tokens publics expirent 30j, Bearer auth sur Puppeteer Railway, RLS sur buckets Storage.
- **NFR-REL** : fallback CloudConvert auto, erreur explicite si 2 moteurs down, backfill idempotent, mutations loguées, 0 catch silencieux.
- **NFR-OBS** : Sentry capture les failures, Netlify Logs structurés, dashboard SQL Supabase pour KPIs.
- **NFR-MAINT** : 0 `any`, JSDoc française sur API publique, tests ≥ 70% service génération.
- **NFR-COST** : infra ≤ 10€/mois, coût marginal ≈ 0€/doc, cache PDF évite ≥ 80% des régénérations.

---

## Epic Breakdown

### Vue d'ensemble des 5 epics

| Epic | Titre | Lot cadrage | Stories | Effort dev |
|---|---|---|---|---|
| **Epic A** | Infrastructure Moteur PDF & Service de génération | Lot A | 2 | 5-7 j-h |
| **Epic B** | Schéma documents unifié & migration des 11 types | Lot B | 7 | 8-10 j-h |
| **Epic C** | Signatures électroniques unifiées | Lot C | 3 | 4-5 j-h |
| **Epic D** | Import templates par lot & autonomie Loris | Lot D | 2 | 2-3 j-h |
| **Epic E** | Hygiène, observabilité, tests | Lot E | 4 | 3 j-h |
| **Epic F** | Mass Operations (TabConventionDocs) | Lot F | 3 | 3.5-5 j-h |
| **Total** | | | **21** | **25.5-33 j-h** |

**Séquencement** :
- **Story de tête** : Epic A Story A1 (Puppeteer sidecar) — débloque le reste.
- **Séquentiel** : A → B (B dépend du service de génération unifié)
- **Parallélisable** : C + D peuvent démarrer en parallèle dès la fin de B
- **Final** : E après C et D (suppression jsPDF nécessite tous les types migrés)

---

## Epic A — Infrastructure Moteur PDF & Service de génération

**Goal** : Casser la dépendance critique CloudConvert et établir un service unique de génération PDF utilisé par tous les chemins. Story de tête du projet.

**Couvre** : FR-DOC-1 → FR-DOC-11 ; cadrage US-1, US-2.

### Story A1 — Puppeteer sidecar Railway + interface PDFEngine 🚩 STORY DE TÊTE

**As a** developer (Wissam),
**I want** a self-hosted Puppeteer service deployed on Railway with a clean `PDFEngine` TypeScript interface,
**So that** I can generate PDFs without depending on the rate-limited CloudConvert API and without paying $0.01 per conversion.

**Acceptance Criteria :**

**Given** un repo Git pour le sidecar Puppeteer (peut être un sous-dossier `puppeteer-service/` du projet principal ou un repo séparé),
**When** un développeur push sur `main`,
**Then** Railway détecte le commit, build l'image Docker (Node.js 20-slim + Chromium auto-pull + Puppeteer + Express),
**And** le service est déployé en moins de 5 minutes,
**And** le endpoint `GET /health` retourne `{ status: 'ok', chromium_version: '<version>' }` (200).

**Given** le service Puppeteer est up,
**When** un client appelle `POST /render` avec body `{ html: '<h1>Test</h1>', options: { format: 'A4', margins: { top: '20mm' } } }` et header `Authorization: Bearer <PDF_SERVICE_SECRET>`,
**Then** la réponse est un Buffer PDF binaire (content-type `application/pdf`) en moins de 5 secondes pour un document standard,
**And** sans le header d'auth ou avec une mauvaise valeur, la réponse est 401 Unauthorized.

**Given** une interface TypeScript `PDFEngine` est créée dans `src/lib/services/pdf-engines/types.ts`,
**When** le développeur consulte le code,
**Then** l'interface définit `render(html: string, options: PDFRenderOptions): Promise<Buffer>`,
**And** `PDFRenderOptions` inclut `format`, `margins`, `headerTemplate`, `footerTemplate`, `printBackground`.

**Given** une implémentation `PuppeteerEngine` dans `src/lib/services/pdf-engines/puppeteer-engine.ts`,
**When** elle est instanciée avec `{ baseUrl, secret }` env vars,
**Then** elle implémente l'interface `PDFEngine`,
**And** sa méthode `render` appelle le sidecar Railway via fetch HTTP,
**And** elle gère les timeouts (30s max) avec retry exponential (2 tentatives).

**Notes techniques (hors AC) :**
- Sidecar Express minimal (~150 lignes TypeScript), `puppeteer-core` + `@sparticuz/chromium` pour minimiser la taille image.
- Auth header `Bearer` simple (pas de JWT complexe — la surface d'attaque est interne).
- Variables d'env Netlify : `PDF_SERVICE_URL=https://...railway.app`, `PDF_SERVICE_SECRET=<random>`.
- Health check Railway configuré pour redémarrage auto si crash.
- Effort estimé : **2.5-3 j-h dev** (Dockerfile, code Express, déploy, tests).

### Story A2 — DocumentGenerationService unifié + CloudConvert fallback + cache 100%

**As a** developer (Wissam),
**I want** a single `DocumentGenerationService.generate()` method that handles all 11 doc types via the unified PDFEngine, with automatic CloudConvert fallback and aggressive PDF caching,
**So that** every code path that generates a document goes through one tested, observed, cached entry point.

**Acceptance Criteria :**

**Given** le service `DocumentGenerationService` est créé dans `src/lib/services/document-generation.ts`,
**When** un caller appelle `generate({ docType, sourceTable, sourceId, ownerType?, ownerId?, options? })`,
**Then** le service séquence :
  1. Résolution du template (système ou custom Word via `document_templates`)
  2. Résolution des variables via `resolveDocumentVariables()` (path unique, cf Story B0)
  3. Calcul d'un hash SHA-256 du contexte (template_id + source + owner + updated_at composite)
  4. Lookup dans le cache PDF (`pdf-cache` bucket avec convention `documents-cache/{hash}.pdf`)
  5. Si cache hit → retourne le PDF existant + INSERT `documents` (status='generated') si pas déjà fait
  6. Si cache miss → appel `PDFEngine.render()` → upload bucket `documents/{entity_id}/{doc_type}/{document_id}.pdf` → INSERT/UPDATE `documents` → upload cache → retourne
**And** retourne `{ documentId, fileUrl, cacheHit, latencyMs }`.

**Given** `PDFEngine` est l'interface introduite en Story A1,
**When** `DocumentGenerationService` est instancié,
**Then** il accepte un `engine: PDFEngine` en dépendance injectable,
**And** par défaut utilise `PuppeteerEngine`,
**And** wrappe avec un `FallbackEngine` qui essaie Puppeteer puis CloudConvert sur échec (timeout, 5xx, fetch error).

**Given** une variable env `PDF_ENGINE_PREFERENCE` peut valoir `puppeteer` (défaut), `cloudconvert`, `auto` (= fallback chain),
**When** elle est définie,
**Then** le service utilise le moteur correspondant ou la chain (`auto`).

**Given** chaque appel à `generate()`,
**When** la génération termine (succès OU échec),
**Then** un événement `logEvent("document_generated", { entity_id, doc_type, latency_ms, file_size, engine_used: "puppeteer"|"cloudconvert_fallback"|"cache_hit", cache_hit: boolean })` est émis.

**Given** les anciens services de génération existent (`pdf-generator.ts`, `docx-converter.ts`),
**When** la Story A2 est mergée,
**Then** ces anciens services restent fonctionnels (pas de breaking change), mais sont marqués `@deprecated` en JSDoc,
**And** un nouveau code applicatif doit utiliser `DocumentGenerationService`.

**Notes techniques (hors AC) :**
- `DocumentGenerationService` doit aussi exposer un `previewHtml({ docType, ... }): Promise<string>` pour les previews UI sans génération PDF (utilisé dans `TabConventionDocs`).
- Cache invalidation : le hash inclut `updated_at` de toutes les entités impliquées (session, learner, client, template, ...) — toute modification invalide.
- `FallbackEngine` log un `pdf_engine_fallback_triggered` quand il bascule.
- Effort estimé : **2.5-4 j-h dev** (service, fallback, cache, tests unitaires de base).

---

## Epic B — Schéma documents unifié & migration des 11 types

**Goal** : Une seule table `documents` qui remplace les 5 actuelles, avec un backfill idempotent. Migration progressive de chaque doc_type via feature flag pour rollback granulaire.

**Couvre** : FR-DOC-12 → FR-DOC-17 + FR-DOC-30 → FR-DOC-34 ; cadrage US-3, US-4, US-5.

### Story B0 — `resolveDocumentVariables` unifiée (path unique)

**As a** developer (Wissam),
**I want** a single function `resolveDocumentVariables(template, context)` used by all paths (HTML and DOCX via docxtemplater),
**So that** the variables `{{nom_apprenant}}`, `{{date_formation}}`, etc. are resolved identically everywhere — no more drift between 3 implementations.

**Acceptance Criteria :**

**Given** le fichier `src/lib/utils/resolve-variables.ts` existant,
**When** la story est livrée,
**Then** une seule fonction exportée `resolveDocumentVariables(template: string, context: DocumentContext): Promise<string>` remplace les 3 paths actuels (`TabConventionDocs.tsx`, `email-attachments-resolver.ts`, `docx-converter.ts`).

**Given** le catalogue `TEMPLATE_VARIABLES` dans `src/lib/document-templates-defaults.ts`,
**When** une variable est ajoutée,
**Then** elle a obligatoirement : `key`, `label`, `category`, `description`, `availableIn: ('document'|'email')[]`, `resolver: (context) => Promise<string>`,
**And** un test unitaire valide qu'une variable inconnue retourne `""` (pas `"undefined"`).

**Given** une variable image (`{{logo_organisme}}`, `{{signature_responsable}}`),
**When** le contexte cible est HTML,
**Then** le resolver retourne une data URI base64 (`data:image/png;base64,...`),
**And** quand le contexte cible est DOCX, le resolver retourne le path Storage que docxtemplater peut embedder.

**Given** une variable date,
**When** elle est résolue,
**Then** le format de sortie est français standard via `date-fns` : `dd MMMM yyyy` (ex : "15 mai 2026"),
**And** une variable date nullish retourne `""` (pas `"Invalid Date"`).

**Notes techniques (hors AC) :**
- Le catalogue doit lister ≥ 40 variables (cf `document-templates-defaults.ts:37-440` actuel).
- Effort estimé : **0.5-1 j-h dev** + tests unitaires (la majorité du code existe déjà, c'est surtout de l'unification).

### Story B1 — Migration table `documents` (schéma cible)

**As a** developer (Wissam),
**I want** the new `documents` table created with the target schema, RLS, indexes, and unique constraints,
**So that** future writes can land in a unified, audit-ready data model.

**Acceptance Criteria :**

**Given** un fichier `supabase/migrations/add_documents_unified_table.sql`,
**When** il est exécuté dans Supabase SQL Editor,
**Then** la table `documents` est créée avec exactement les 24 colonnes définies au PRD §9.1,
**And** la migration est idempotente (CREATE TABLE IF NOT EXISTS, contraintes protégées par DO bloc pg_constraint).

**Given** la table existe,
**When** la migration termine,
**Then** RLS `entity_isolation` est active (USING `entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid())`),
**And** un index UNIQUE sur `(entity_id, source_table, source_id, doc_type, owner_type, owner_id)` empêche les doublons,
**And** un index sur `(entity_id, status)` permet le filtrage rapide par état,
**And** un index sur `signature_token WHERE signature_token IS NOT NULL` permet le lookup public.

**Given** une session de test,
**When** un INSERT manuel ajoute une ligne dans `documents` puis un second INSERT identique (même contrainte UNIQUE),
**Then** le second INSERT échoue avec erreur 23505 (unique_violation).

**Notes techniques (hors AC) :**
- Inclure colonnes audit : `created_at`, `updated_at`, `created_by`, trigger `updated_at = NOW()` sur UPDATE.
- Effort estimé : **0.5 j-h dev**.

### Story B2 — Backfill idempotent depuis les 5 tables legacy

**As a** developer (Wissam),
**I want** an idempotent SQL backfill that copies data from `generated_documents`, `formation_convention_documents`, `signatures`, `quote_signatures`, and `trainer_documents` into the new `documents` table,
**So that** existing documents and signatures are preserved with zero data loss when feature flags get flipped.

**Acceptance Criteria :**

**Given** un fichier `supabase/migrations/backfill_documents_from_legacy.sql`,
**When** il est exécuté,
**Then** chaque ligne de `generated_documents` produit une ligne `documents` correspondante avec `source_table='sessions'`, `source_id=session_id`, `doc_type='convention_entreprise' or similar`, `status='generated'` (inférée du contexte),
**And** chaque ligne de `formation_convention_documents` est ajoutée avec `doc_type=<doc_type>`, `owner_type=<owner_type>`, `owner_id=<owner_id>`, `status=<status existante>`,
**And** chaque ligne de `signatures` met à jour le document correspondant avec `status='signed'`, `signed_at`, `signature_data`, `signed_by=signer_id`,
**And** chaque ligne de `quote_signatures` ajoute un document `doc_type='devis'`, `source_table='crm_quotes'`, `source_id=quote_id`, `signed_at`, etc.

**Given** le backfill a été exécuté une fois,
**When** il est ré-exécuté,
**Then** aucune ligne dupliquée n'est créée (grâce à `INSERT ... ON CONFLICT DO NOTHING` ou `WHERE NOT EXISTS`),
**And** les comptages avant/après sont identiques (vérifié par SELECT diagnostic final).

**Given** une session avec 1 convention entreprise signée + 5 émargements + 1 attestation,
**When** le backfill tourne,
**Then** la table `documents` contient 7 lignes pour cette session, avec status corrects (1 signed convention, 5 generated/signed émargements, 1 generated attestation).

**Notes techniques (hors AC) :**
- Dry-run en staging d'abord, comptage avant/après obligatoire.
- Conserver les anciennes tables en lecture pendant 90j (drop en Story E1).
- Effort estimé : **1-1.5 j-h dev** + 0.5 j-h QA staging.

### Story B3 — Migration des conventions vers `DocumentGenerationService`

**As an** admin (Loris),
**I want** the 3 convention types (entreprise, apprenant, intervention formateur) to be generated via the new unified service when their feature flag is on,
**So that** convention generation becomes reliable, cached, and observable.

**Acceptance Criteria :**

**Given** le feature flag `USE_UNIFIED_DOCUMENTS_FOR_convention_entreprise=true`,
**When** un admin clique "Générer convention entreprise" sur une session,
**Then** l'appel passe par `DocumentGenerationService.generate({ docType: 'convention_entreprise', ... })`,
**And** une ligne `documents` est créée avec `status='generated'`,
**And** le PDF est uploadé dans `documents/{entity_id}/convention_entreprise/{document_id}.pdf`,
**And** l'événement `document_generated` est logué.

**Given** les feature flags pour `convention_apprenant` et `convention_intervention` sont également activés,
**When** un admin génère ces 2 types,
**Then** ils suivent le même flow que `convention_entreprise`.

**Given** le feature flag est OFF (par défaut),
**When** un admin génère une convention,
**Then** l'ancien code (`pdf-generator.ts` legacy) est utilisé — backward compat garanti.

**Notes techniques (hors AC) :**
- Pour la transition double-write : pendant que le flag est ON, le code écrit AUSSI dans `formation_convention_documents` jusqu'à fin Lot B (filet de sécurité rollback).
- Effort estimé : **1-1.5 j-h dev**.

### Story B4 — Migration des attestations et certificats

**As an** admin (Loris),
**I want** the 2 attestation/certificat types (attestation d'assiduité, certificat de réalisation) to be generated via the unified service,
**So that** end-of-formation documents are reliable and easily extensible.

**Acceptance Criteria :**

**Given** feature flags `USE_UNIFIED_DOCUMENTS_FOR_attestation` et `_certificat`,
**When** un admin marque une session comme `completed` et génère les attestations,
**Then** une ligne `documents` est créée par apprenant pour `attestation`, et une pour `certificat`,
**And** les variables `{{taux_assiduite}}`, `{{date_debut}}`, `{{date_fin}}` sont correctement résolues.

**Given** un apprenant absent à 100% de la formation,
**When** l'attestation est générée,
**Then** elle indique `taux_assiduite: 0%` et un message "Aucune présence enregistrée" (pas une attestation "vide").

**Notes techniques (hors AC) :**
- Effort estimé : **0.5-1 j-h dev**.

### Story B5 — Migration des émargements (collectif + individuel)

**As a** trainer (Karim),
**I want** to download an attendance sheet PDF generated server-side instead of in the browser,
**So that** the PDF is reliable on mobile, properly cached, and consistent visually.

**Acceptance Criteria :**

**Given** feature flags `USE_UNIFIED_DOCUMENTS_FOR_emargement_collectif` et `_emargement_individuel`,
**When** Karim clique "Télécharger émargement collectif" depuis `TabEmargements`,
**Then** la génération passe par `DocumentGenerationService` (côté serveur via Puppeteer),
**And** le PDF inclut les colonnes : Nom Prénom apprenant, dates des time slots, cases signature avec SVG signature si signée,
**And** pour une session INTER, un onglet PDF par entreprise (cf FR26 du PRD Formations).

**Given** un mobile bas de gamme avec connexion 3G,
**When** Karim télécharge l'émargement,
**Then** le téléchargement est < 10 secondes (génération côté serveur, pas de jsPDF qui timeout).

**Given** un émargement vient d'être signé,
**When** Karim re-télécharge,
**Then** le PDF retourné inclut la nouvelle signature (cache invalidé via inclusion de `signed_at` dans le hash).

**Notes techniques (hors AC) :**
- Effort estimé : **1.5-2 j-h dev** (émargement = la fonctionnalité la plus utilisée, mise en page complexe avec table dynamique).

### Story B6 — Migration des documents administratifs (programme, convocation, CGV, règlement)

**As an** admin (Loris),
**I want** the 4 administrative documents (programme de formation, convocation, CGV, règlement intérieur) generated via the unified service,
**So that** all session-attached documents share the same generation infrastructure.

**Acceptance Criteria :**

**Given** feature flags pour les 4 doc_types,
**When** un admin génère chacun,
**Then** ils passent tous par `DocumentGenerationService`,
**And** le programme est généré une seule fois pour toute la session (pas par entreprise — cf décision US-5 du cadrage Formations, programme commun en INTER).

**Notes techniques (hors AC) :**
- Effort estimé : **1 j-h dev** (4 types simples, surtout du HTML).

### Story B7 — Migration des factures et devis

**As an** admin (Loris) and a commercial (Marc, Taline),
**I want** invoices and quotes generated via the unified service with proper accounting layout,
**So that** the visual quality matches CloudConvert-grade rendering instead of jsPDF approximations.

**Acceptance Criteria :**

**Given** feature flags `USE_UNIFIED_DOCUMENTS_FOR_facture` et `_devis`,
**When** un commercial clique "Télécharger devis" sur un `crm_quote`,
**Then** la génération passe par `DocumentGenerationService` avec `sourceTable='crm_quotes'`, `sourceId=<quote.id>`,
**And** le PDF respecte la maquette fournie par Loris (logo, numéro devis, montants HT/TVA/TTC, conditions de paiement, mentions légales).

**Given** une facture est marquée comme `sent`,
**When** un admin la régénère,
**Then** le statut `documents.status` ne repasse pas à `generated` (resté `sent`),
**And** la facture ne suit plus les changements de prix de la session (cf FR45 du PRD Formations).

**Notes techniques (hors AC) :**
- Les casts `(doc as any).lastAutoTable.finalY` dans l'ancien code sont remplacés par du CSS print classique (table HTML + page-break).
- Effort estimé : **1.5-2 j-h dev** (mise en page comptable précise, numérotation, gestion crédit / TVA).

---

## Epic C — Signatures électroniques unifiées

**Goal** : Un seul service de signature qui gère les 2 flux actuels (canvas inline pour émargements, token public pour devis) avec audit trail complet exploitable pour Qualiopi.

**Couvre** : FR-DOC-18 → FR-DOC-23 ; cadrage US-6, US-7, US-8.

### Story C1 — `SignatureService` unifié + endpoint `/api/documents/sign`

**As a** developer (Wissam),
**I want** a single service `SignatureService.sign(...)` and a single API endpoint `/api/documents/sign` that handle both inline canvas signatures (émargements) and public token signatures (devis),
**So that** the 2 incompatible flows become one — easier to audit, observe, and extend.

**Acceptance Criteria :**

**Given** le service `SignatureService` créé dans `src/lib/services/signature.ts`,
**When** un caller appelle `sign({ documentId, signatureSvg, signerId?, token?, ipAddress, userAgent })`,
**Then** le service :
  1. Charge le document depuis `documents` par id
  2. Vérifie l'idempotence : si déjà signé, retourne `{ ok: true, alreadySigned: true }`
  3. Vérifie l'auth : si `token` fourni, valide via `signature_token` + non expiré ; sinon vérifie via auth.uid()
  4. Sanitize le SVG via `sanitizeSignatureSvg`
  5. UPDATE `documents` : `status='signed'`, `signed_at=NOW()`, `signed_by`, `signature_*` audit fields, `signature_method` (`canvas_inline` ou `token_public`)
  6. Invalide le cache PDF (suppression cache key correspondante)
  7. Log `document_signed`

**Given** l'endpoint `/api/documents/sign`,
**When** il reçoit un POST avec body validé Zod,
**Then** il appelle `SignatureService.sign()` et retourne `{ ok, alreadySigned?, documentId }`.

**Given** un document signé,
**When** un caller relance `sign()` avec les mêmes args,
**Then** la réponse est `{ ok: true, alreadySigned: true }` (pas d'erreur, pas de double-écriture).

**Notes techniques (hors AC) :**
- `sanitizeSignatureSvg` existe déjà dans `src/lib/utils/sanitize-svg.ts` (réutiliser).
- Endpoint protégé par rate-limit (cf `src/lib/rate-limit.ts`) pour les requêtes par token (pas pour les sessions authentifiées).
- Effort estimé : **1-1.5 j-h dev**.

### Story C2 — Migration des 2 flux existants vers `SignatureService`

**As a** trainer (Karim) and a client representative (Émilie),
**I want** the signature workflow (canvas inline for émargements, public token for devis) to use the new unified service while keeping the same UX,
**So that** I see no difference at all — but the audit trail is now complete in the new schema.

**Acceptance Criteria :**

**Given** la story C1 est livrée,
**When** Karim utilise `InlineSignaturePad` dans `TabEmargements` pour faire signer un apprenant,
**Then** l'appel passe par `/api/documents/sign` (vs l'ancien endpoint qui écrivait dans `signatures`),
**And** la table `signatures` n'est plus écrite (mais reste lue pour la transition),
**And** la table `documents` reflète immédiatement la signature avec audit trail.

**Given** Émilie clique le lien public de signature de devis reçu par email,
**When** elle signe sur la page publique,
**Then** l'appel passe par `/api/documents/sign` avec le token,
**And** `quote_signatures` n'est plus écrite (mais reste lue),
**And** `documents.status='signed'` avec `signature_method='token_public'`.

**Given** une régression visuelle sur l'UI signature serait critique,
**When** la story est livrée,
**Then** aucune modification de l'UI utilisateur n'est faite — c'est uniquement le backend qui change.

**Notes techniques (hors AC) :**
- Pendant la transition, double-write également : `signatures` et `quote_signatures` continuent à être écrites en parallèle de `documents`, jusqu'à fin Lot E.
- Effort estimé : **1.5-2 j-h dev**.

### Story C3 — Audit trail signature complet pour Qualiopi

**As an** external auditor (Nathalie, Qualiopi),
**I want** to query a single source of truth for any signed document with IP address, user agent, signer identity, timestamp, and signature method,
**So that** an audit takes 15 minutes instead of 2 hours.

**Acceptance Criteria :**

**Given** la table `documents` après les stories C1 et C2,
**When** une auditrice exécute :
```sql
SELECT doc_type, signed_at, signed_by, signature_ip, signature_user_agent, signature_method
FROM documents WHERE id = '<doc_id>';
```
**Then** elle obtient en une seule ligne toutes les informations légales requises.

**Given** une session avec 5 émargements et 1 convention signés,
**When** Loris export un "pack audit Qualiopi" depuis l'UI (story future, hors scope),
**Then** le ZIP contient un `audit-trail.json` listant pour chaque signature : doc_type, signed_at, signer (nom complet via JOIN profiles ou anonyme via token), IP, user_agent, méthode.

**Given** une signature via token expire après 30 jours,
**When** un token est généré au moment de l'envoi du lien email,
**Then** `signature_token_expires_at = NOW() + INTERVAL '30 days'`,
**And** une tentative de signature après expiration retourne 410 Gone avec message "Lien expiré, redemander un nouveau lien".

**Notes techniques (hors AC) :**
- `signature_user_agent TEXT` (pas limit chars — User-Agent peut être très long).
- `signature_method` enum `('canvas_inline', 'token_public', 'qualified_eidas')` — eIDAS reserved pour post-MVP.
- Effort estimé : **1-1.5 j-h dev** (mostly schema + UPDATE logic, AC sur consultation auditeur).

---

## Epic D — Import templates par lot & autonomie Loris

**Goal** : Permettre à Loris d'ajouter de nouveaux types de documents en autonomie via une page admin no-code.

**Couvre** : FR-DOC-24 → FR-DOC-29 ; cadrage US-9, US-10.

### Story D1 — Page `/admin/documents/import` avec drag-drop multiple

**As an** admin (Loris),
**I want** a page where I can drag and drop multiple Word/PDF template files at once, name and categorize each, and import them as new document templates,
**So that** I can add new document types (e.g., OPCO-specific attestations) in minutes without asking Wissam to code each one.

**Acceptance Criteria :**

**Given** la page `/admin/documents/import` (accessible uniquement role admin/super_admin),
**When** un admin glisse-dépose 5 fichiers `.docx` dans la zone d'upload,
**Then** la page parse chaque fichier pour détecter les variables `{{xxx}}` qui s'y trouvent,
**And** pour chaque fichier, affiche : nom (modifiable), catégorie (dropdown avec valeurs courantes + "Autre"), default_for_doc_type (checkbox), liste des variables détectées avec status (✅ connue / ⚠️ inconnue),
**And** un fichier avec des variables inconnues affiche un warning mais n'est pas bloqué.

**Given** un admin clique "Importer les 5 templates",
**When** la requête backend démarre,
**Then** une progress bar affiche l'avancement (1/5, 2/5, ...),
**And** pour chaque template : upload `.docx` dans `formation-docs/templates/{entity_id}/{uuid}.docx`,
**And** INSERT dans `document_templates` avec `mode='docx_fidelity'`, `is_system=false`, `variables_detected: <json snapshot>`, `uploaded_by=auth.uid()`, `uploaded_at=NOW()`.

**Given** un template avec même `name` existe déjà,
**When** l'admin clique "Importer",
**Then** une confirmation s'affiche : "Un template nommé 'X' existe déjà. Écraser ?" → si oui, UPSERT,
**And** un événement `template_imported` (ou `template_overwritten`) est logué.

**Given** un template uploadé,
**When** un admin va sur `/admin/documents` (liste templates),
**Then** le nouveau template apparaît immédiatement,
**And** peut être utilisé pour générer un document de test depuis une fiche session.

**Notes techniques (hors AC) :**
- Parse `.docx` : utiliser `docxtemplater` en mode read-only pour détecter les `{{var}}` via regex sur le XML.
- Limite : max 20 fichiers simultanés, max 5MB par fichier (validation Zod).
- Effort estimé : **1-1.5 j-h dev** (UI Shadcn drag-drop + backend route + parsing variables).

### Story D2 — Documentation utilisateur "Comment ajouter un nouveau type"

**As an** admin (Loris),
**I want** a clear in-app guide explaining in 5 steps how to create a new document template from scratch (Word with placeholders),
**So that** I'm autonomous and don't need to ask the dev team.

**Acceptance Criteria :**

**Given** la page `/admin/documents/how-to`,
**When** un admin la consulte,
**Then** elle affiche 5 étapes illustrées :
  1. Télécharger un exemple de template `.docx` (lien direct)
  2. Modifier le contenu dans Word, garder les variables `{{xxx}}` inchangées
  3. Liste exhaustive des variables disponibles (catalogue `TEMPLATE_VARIABLES`) avec preview du résultat
  4. Aller sur `/admin/documents/import`, glisser-déposer le fichier
  5. Valider l'import et tester en générant un document sur une session de test

**Given** la page,
**When** un admin clique sur le lien "Variables disponibles",
**Then** une liste paginée des ~40 variables s'affiche avec : `key`, `label`, `category`, `description`, exemple de valeur.

**Notes techniques (hors AC) :**
- Page statique markdown rendue côté serveur (`/admin/documents/how-to/page.tsx`).
- Le `.docx` d'exemple est stocké dans `public/templates/exemple-template.docx`.
- Effort estimé : **0.5-1 j-h dev** (page statique + capture d'écran si possible).

---

## Epic E — Hygiène, observabilité, tests

**Goal** : Finaliser la refonte par la suppression du code legacy, la mise en place du cache 100%, des logs structurés et des tests E2E.

**Couvre** : FR-DOC-35 → FR-DOC-42 ; cadrage US-11, US-12, US-13, US-14.

### Story E1 — Suppression du code jsPDF legacy

**As a** developer (Wissam),
**I want** to delete the 5 legacy jsPDF files and remove the npm dependencies once all doc types have been migrated,
**So that** there's only one PDF generation path and no more `(doc as any)` casts.

**Acceptance Criteria :**

**Given** toutes les feature flags `USE_UNIFIED_DOCUMENTS_FOR_*` sont à `true` et stables depuis ≥ 7 jours en prod,
**When** la story est démarrée,
**Then** les fichiers suivants sont supprimés :
  - `src/lib/pdf-export.ts`
  - `src/lib/invoice-pdf-export.ts`
  - `src/lib/devis-pdf.ts`
  - `src/lib/emargement-pdf-export.ts`
  - `src/lib/qr-pdf-export.ts`

**Given** les imports,
**When** la story est livrée,
**Then** aucune occurrence de `import jsPDF` ou `from "jspdf"` ne subsiste,
**And** aucun cast `(doc as any).lastAutoTable.finalY` ne subsiste,
**And** les dépendances `jspdf`, `jspdf-autotable` sont retirées de `package.json`,
**And** `npx tsc --noEmit` passe avec 0 erreur,
**And** `npm test` passe en intégralité.

**Given** les 5 tables legacy `generated_documents`, `formation_convention_documents`, `signatures`, `quote_signatures`, `trainer_documents`,
**When** la story est livrée (après ≥ 90 jours de transition double-write),
**Then** une migration de drop est appliquée (avec backup snapshot Supabase préalable),
**And** seule `documents` + `document_templates` subsistent.

**Notes techniques (hors AC) :**
- Cette story est la **dernière à livrer** — elle dépend de la stabilité confirmée de toutes les migrations.
- Snapshot Supabase Storage des PDFs avant drop des tables legacy (filet de sécurité ultime).
- Effort estimé : **0.5-1 j-h dev** + 0.5 j-h QA tests régression.

### Story E2 — Cache PDF 100% des chemins

**As a** developer and a CFO (Loris),
**I want** every PDF generation path to use the `pdf-cache` to avoid regenerating identical PDFs,
**So that** infrastructure cost and latency are minimized.

**Acceptance Criteria :**

**Given** la story est livrée,
**When** un benchmark grep `from("documents")` est lancé,
**Then** 100% des chemins de génération vont via `DocumentGenerationService` (qui utilise le cache par design),
**And** les anciens endpoints qui bypassaient le cache (ex : `pdf-export.ts`) sont supprimés (cf Story E1).

**Given** un document a été généré une première fois,
**When** un appel ultérieur identique est fait,
**Then** le PDF retourné est servi depuis le cache (latence < 200ms vs > 3s pour Puppeteer),
**And** l'événement `document_generated` est émis avec `cache_hit=true`,
**And** un dashboard SQL peut calculer le taux de cache hit moyen via `SELECT COUNT(*) FILTER (WHERE cache_hit = true) * 100.0 / COUNT(*) FROM logs WHERE event = 'document_generated'`.

**Given** une mesure sur 30 jours en production,
**When** le taux de cache hit est calculé,
**Then** il est ≥ 80% (NFR-COST-3 du PRD).

**Notes techniques (hors AC) :**
- Le cache est déjà implémenté dans `pdf-cache.ts` mais sous-utilisé. Cette story s'assure que tous les chemins l'utilisent.
- Effort estimé : **0.5 j-h dev** (la plupart du travail est fait via Story A2 ; ici on vérifie + on instrumente).

### Story E3 — Logs structurés des événements documents

**As a** developer (Wissam) and an SRE (Loris en cas de support),
**I want** structured events emitted for every critical document operation (generated, sent, signed, failed),
**So that** I can diagnose any production issue in under 5 minutes via Netlify Logs grep.

**Acceptance Criteria :**

**Given** une génération de document,
**When** elle réussit,
**Then** un événement `logEvent("document_generated", { entity_id, document_id, doc_type, source_table, source_id, owner_type, owner_id, latency_ms, file_size_bytes, engine_used, cache_hit })` est émis.

**Given** une génération qui échoue,
**When** l'erreur est catchée,
**Then** un événement `logEvent("document_failed", { entity_id, doc_type, source_*, error_message, engine_attempted })` est émis,
**And** Sentry capture l'erreur avec les mêmes tags.

**Given** un document envoyé par email,
**When** l'email est queued,
**Then** `logEvent("document_sent", { entity_id, document_id, doc_type, recipient_type, recipient_id })`.

**Given** un document signé,
**When** `SignatureService.sign()` réussit,
**Then** `logEvent("document_signed", { entity_id, document_id, doc_type, signature_method, signer_id })`.

**Given** un cron quotidien (ou hebdomadaire),
**When** il agrège les événements `document_generated` des 7 derniers jours,
**Then** un récap email peut être envoyé à Loris : "Cette semaine : 47 documents générés, taux cache hit 85%, 3 échecs (détails dans Sentry)".

**Notes techniques (hors AC) :**
- Réutilise `logEvent()` créé en Story 5.3 du module Formations (cf `src/lib/logger.ts`).
- Aucune donnée perso loguée — uniquement IDs et compteurs (cf NFR-OBS-3 du PRD Formations).
- Effort estimé : **0.5 j-h dev**.

### Story E4 — Tests E2E snapshot pour 3 templates clés

**As a** developer (Wissam),
**I want** snapshot tests for 3 critical templates (convention entreprise, attestation, émargement collectif),
**So that** any visual regression on these business-critical PDFs is caught before production.

**Acceptance Criteria :**

**Given** un dossier `tests/snapshots/` créé,
**When** un test Vitest exécute `generateDocumentPDF({ docType: 'convention_entreprise', sourceId: '<fixture-session-id>' })`,
**Then** le PDF binaire est comparé byte-à-byte avec `tests/snapshots/convention_entreprise.pdf`,
**And** si différence, le test échoue avec un diff visuel (hash mismatch).

**Given** un développeur modifie volontairement le template convention entreprise,
**When** il lance `npm test -- --update-snapshots`,
**Then** le snapshot est régénéré et le diff est visible dans `git diff`,
**And** la PR peut être reviewée visuellement.

**Given** les 3 templates clés (convention, attestation, émargement),
**When** la story est livrée,
**Then** chacun a son fichier snapshot et son test Vitest.

**Notes techniques (hors AC) :**
- Comparaison byte-à-byte fiable car Puppeteer est déterministe (à condition d'avoir une date fixe en variable, ex : utiliser `Date.now() = mock`).
- Alternative : utiliser `pdf-parse` pour extraire le texte et comparer texte vs texte (moins strict mais plus stable).
- Effort estimé : **1-1.5 j-h dev** (mise en place infra tests + 3 snapshots initiaux).

---

## Epic F — Mass Operations (TabConventionDocs)

_Ajout 2026-05-17 — pendant readiness check, gap traçabilité identifié : ces stories étaient dans Architecture (PR2 sous-PR 2.5) mais pas dans Epics. Formellement intégrées ici._

**Goal** : Donner à l'admin la capacité de générer / envoyer / faire signer en masse les documents d'une session (vs 1-par-1 dans la matrix), depuis `TabConventionDocs`. Bénéficie de tous les autres lots (registry, service unifié, SignatureService).

**User value** : Loris peut envoyer 20 conventions d'un coup en cliquant 1 bouton (vs 20 clics), idem pour télécharger un ZIP complet ou lancer une vague de demandes de signature. Gain temps massif sur sessions INTER (>10 apprenants).

### Story F1 — Mass download batch ZIP par session

**Description** : Bouton "Télécharger tous les docs (X owners) en ZIP" dans `TabConventionDocs`. Endpoint `POST /api/documents/batch-zip { session_id, doc_type, owner_filter? }` qui génère parallèlement tous les PDFs et les package en ZIP avec structure `{owner_name}/{doc_type}.pdf`. Fail-soft via `_erreurs.txt`.

**Dependencies** : depends on A2 (DocumentGenerationService), B1 (table documents)

**Acceptance Criteria** :
- Given session INTER avec 20 apprenants, when admin clique "Télécharger tous attestations ZIP", then le ZIP est généré avec 20 PDFs nommés `{nom_apprenant}/attestation.pdf` en < 60s.
- Given 2 PDFs échouent sur 20, when ZIP est généré, then `_erreurs.txt` à la racine liste les 2 owners + raison + 18 PDFs OK dans le ZIP.
- Given cache hit sur tous les PDFs, when ZIP est généré, then total < 5s (juste assemblage).

**Effort** : 1-1.5 j-h dev

### Story F2 — Mass send email batch par session

**Description** : Bouton "Envoyer X docs par email" dans `TabConventionDocs`. Endpoint `POST /api/documents/send-batch-email { session_id, doc_type, recipients[] }` qui pour chaque destinataire : génère PDF, envoie email via Resend avec PDF en pièce jointe, met à jour `documents.is_sent=true, sent_at=NOW()`. Retour structuré `{ success, failed, errors }`. Progress UI front.

**Dependencies** : depends on A2 (DocumentGenerationService), B1 (table documents), `email-queue` existant (Resend)

**Acceptance Criteria** :
- Given session avec 10 apprenants validés pour envoi convocation, when admin clique "Envoyer convocations à tous", then 10 emails partent avec PDF en pièce jointe, et `documents.is_sent=true, sent_at` à jour pour les 10.
- Given 1 email échoue (recipient invalide), when batch terminé, then `{ success: 9, failed: 1, errors: [{ owner_id: X, error: "Invalid email" }] }`, et seuls les 9 OK ont `is_sent=true`.
- Given progress UI front, when batch en cours, then compteur "X/N envoyés" affiché en temps réel.

**Effort** : 1.5-2 j-h dev

### Story F3 — Mass signature request par session

**Description** : Bouton "Demander signature à tous" dans `TabConventionDocs` (visible uniquement pour doc_types `requires_signature=true`). Endpoint `POST /api/documents/signature-request-batch { session_id, doc_type }` qui pour chaque owner devant signer : crée magic link (via `signing_tokens`, purpose='document_signature', expires_at = 7j), envoie email avec lien `/sign/{token}`. Bénéficie du SignatureService (Lot C).

**Dependencies** : depends on C1 (SignatureService + endpoint), B1 (table documents), B5 (émargements migrés si applicable)

**Acceptance Criteria** :
- Given session INTER avec 5 entreprises devant signer convention, when admin clique "Demander signature à tous", then 5 emails partent avec lien magic link unique, et 5 rows `signing_tokens` créés avec `purpose='document_signature', expires_at = NOW() + 7j`.
- Given un destinataire clique sur son lien, when il signe, then `documents.is_signed=true, signed_at, signature_*` à jour (via SignatureService C1).
- Given un token expire après 7j sans signature, when destinataire tente d'accéder, then 410 Gone + message "Lien expiré, demandez un nouveau lien à l'admin".

**Effort** : 1-1.5 j-h dev

**Epic F Total** : **3.5-5 j-h dev**

---

## FR Coverage Map

Mapping entre les 48 FRs MVP du PRD et les 21 stories :

| FR | Story |
|---|---|
| FR-DOC-1, 2, 3, 7 (Puppeteer) | A1 |
| FR-DOC-4, 5, 6 (Fallback CloudConvert, env var) | A2 |
| FR-DOC-8, 9, 10, 11 (DocumentGenerationService + cache) | A2 |
| FR-DOC-12, 13, 14 (Table documents + RLS + UNIQUE) | B1 |
| FR-DOC-15 (Backfill) | B2 |
| FR-DOC-16, 17 (Double-write + feature flags) | B3-B7 (transverse) |
| FR-DOC-(par doc_type, conventions) | B3 |
| FR-DOC-(par doc_type, attestations) | B4 |
| FR-DOC-(par doc_type, émargements) | B5 |
| FR-DOC-(par doc_type, programme + convocation + CGV) | B6 |
| FR-DOC-(par doc_type, factures + devis) | B7 |
| FR-DOC-18, 19, 20 (SignatureService + sanitize + idempotence) | C1 |
| FR-DOC-21, 22 (Audit trail + cache invalidation) | C1 + C3 |
| FR-DOC-23 (log document_signed) | C1 |
| FR-DOC-24, 25, 26, 27, 28 (Import templates) | D1 |
| FR-DOC-29 (Doc utilisateur how-to) | D2 |
| FR-DOC-30, 31, 32, 33, 34 (Résolution variables unifiée) | B0 |
| FR-DOC-35, 36, 37, 38 (Suppression jsPDF) | E1 |
| FR-DOC-39 (Logs structurés) | E3 |
| FR-DOC-40 (Tests E2E snapshot) | E4 |
| FR-DOC-41, 42 (Tests unitaires service + sign) | A2 + C1 (inclus) |
| **FR-DOC-46 (Mass download ZIP)** | **F1** |
| **FR-DOC-47 (Mass send email)** | **F2** |
| **FR-DOC-48 (Mass signature request)** | **F3** |
| FR-DOC-49, 50, 51 (Post-MVP) | — (reportés) |

**100% des 48 FRs MVP couverts par les 21 stories.** Les 3 FRs Post-MVP (FR-DOC-49/50/51) sont volontairement hors scope.

---

## Effort Summary

| Epic | Stories | Effort dev (j-h) |
|---|---|---|
| Epic A — Infra moteur PDF | A1 + A2 | 5-7 |
| Epic B — Schéma unifié | B0 + B1 + B2 + B3 + B4 + B5 + B6 + B7 | 8.5-11 |
| Epic C — Signatures | C1 + C2 + C3 | 3.5-5 |
| Epic D — Import templates | D1 + D2 | 1.5-2.5 |
| Epic E — Hygiène & obs | E1 + E2 + E3 + E4 | 2.5-3.5 |
| **Total dev** | **18 stories** | **21-29 j-h** |
| **QA + recette** | | **3-4 j-h** |
| **TOTAL** | | **24-33 j-h** |

**Calendrier indicatif** : 5-7 semaines à 4 j-h/semaine en mode "BAU + refonte".

---

## Risques & dépendances inter-epics

1. **Epic A doit être stable avant Epic B** : si Puppeteer Railway down pendant Epic B, le fallback CloudConvert prend le relais sans bloquer la migration.
2. **Epic B en séquentiel doc_type par doc_type** : ne PAS faire les 11 types en parallèle. Migrer un type, valider, puis suivant.
3. **Epic C (signatures) peut démarrer après Epic B Story B5** (émargements migrés) — pas besoin d'attendre la fin de B.
4. **Epic D (import templates) indépendant** : peut démarrer dès Epic B Story B1 (table créée).
5. **Epic E (suppression legacy) en dernier** : exige 90 jours de stabilité confirmée + backup Supabase préalable.
6. **Régression visuelle conventions historiques** : recette manuelle obligatoire en fin de Lot B sur 5 sessions de 2024-2025 (générer + comparer visuellement avec les anciennes versions).

---

**Fin du document Epics & Stories v1.0** — prêt pour validation et passage en implémentation via `subagent-driven-development`.
