---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-03-vision', 'step-04-scope', 'step-05-journeys', 'step-06-domain', 'step-07-frs', 'step-08-nfrs', 'step-09-data-model', 'step-10-architecture', 'step-11-traceability', 'step-12-complete']
inputDocuments:
  - bmad_output/planning-artifacts/cadrage-module-documents.md
  - bmad_output/planning-artifacts/cadrage-module-formations.md
  - bmad_output/planning-artifacts/prd.md
  - bmad_output/planning-artifacts/epics.md
  - CLAUDE.md
workflowType: 'prd'
status: 'complete'
---

# Product Requirements Document — Module Génération de Documents

**Author:** Wissam (proxy Loris VICHOT, gérant OF MR Formation / C3V Formation)
**Date:** 2026-05-15
**Statut:** Brouillon v1.0 — à valider par Wissam + Loris
**Cadrage source:** `bmad_output/planning-artifacts/cadrage-module-documents.md` (v1.0 validé le 2026-05-15)

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

Le module Génération de Documents doit devenir **l'usine documentaire fiable et extensible** de la plateforme MR/C3V Formation. Aujourd'hui fragmenté en 3 moteurs PDF parallèles, 5 tables désynchronisées et 2 flux de signature incompatibles, il devient le second goulot d'étranglement après les Formations — d'autant plus critique que Loris veut élargir son catalogue de documents pour répondre à de nouveaux besoins clients (conventions DPC, attestations spécifiques OPCO, certificats de présence renforcés, etc.).

Ce PRD pose la refonte « big bang » du module pour atteindre **un seul moteur PDF, un seul schéma documents, un seul service de signature, et un mécanisme d'import standardisé** pour absorber les nouveaux types de documents que Loris fournira.

### What Makes This Special

- **Auto-hébergement du moteur PDF** (Puppeteer self-hosted sur Railway) → casse la dépendance critique à CloudConvert (quota 25/jour gratuit, $0.01/conv au-delà), 0$ run-rate, scalable sans limite.
- **Schéma `documents` unifié** avec colonne `status` (draft/generated/sent/signed/cancelled) + audit trail complet (IP, user-agent, timestamp) → pour la première fois, Loris peut répondre simplement à « quel est l'état du document X ? ».
- **Service `DocumentGenerationService` centralisé** → un seul point d'entrée pour tous les types, cache PDF (`pdf-cache`) utilisé sur 100% des chemins (vs 1 seul aujourd'hui).
- **Service `SignatureService` centralisé** → unifie le canvas inline (émargements) et le flux token public (devis CRM), avec audit trail légal cohérent pour Qualiopi.
- **Page d'import par lot** des templates Word/PDF → Loris peut ajouter 10 nouveaux types de documents en 3 minutes via drag-drop, sans dev intervention.

### Effort & calendrier

**22-28 jours-homme** sur **5 lots séquentiel/parallèles** (5-7 semaines en conditions normales). Détail au §10 et §11. Big bang avec feature flag `USE_UNIFIED_DOCUMENTS` par doc_type pour rollback en 1 ligne par type.

---

## 2. Project Classification

- **Type** : Refonte (brownfield) — la fonction existe, on remplace son socle technique.
- **Module concerné** : Génération de Documents (transverse — irrigue Formations, CRM, Apprenants, Clients).
- **Périmètre fonctionnel** : 11 types de documents existants + N nouveaux types fournis par Loris.
- **Périmètre technique** : moteur PDF, schéma DB, signatures électroniques, stockage Supabase, résolution de variables, intégration email.
- **Hors-périmètre** : refonte UI (TabConventionDocs, /admin/documents conservent leur design), intégration DocuSign/Dropbox Sign, signature électronique qualifiée eIDAS-3, versioning des templates, accessibilité PDF.
- **Régulation** : Qualiopi (rétention 10 ans des documents et signatures de conventions/émargements), RGPD (audit trail des signatures avec IP).

---

## 3. Success Criteria

### User Success (Loris + équipe)

1. **Conventions générées sans bug** : 0 incident sur 10 conventions consécutives générées (variables résolues, signatures intégrées, envoi email OK).
2. **Émargement utilisable jour J** : Karim (formateur) peut télécharger un émargement collectif depuis son mobile en moins de 10 secondes sans dépendance à un service externe.
3. **Ajout d'un nouveau type en autonomie** : Loris ajoute un nouveau type de document (ex : « convention DPC ») via la page admin sans demander à Wissam, en moins de 5 minutes.
4. **Visibilité de l'état des documents** : sur la fiche d'une session, Loris voit en un coup d'œil quels documents sont en draft / générés / envoyés / signés, pour chaque apprenant et chaque entreprise.
5. **Aucune perte de données** post-migration : 100% des conventions, attestations, devis et factures déjà générés restent accessibles et téléchargeables.

### Business Success (Loris en tant que dirigeant)

1. **Coûts de génération réduits** : facture CloudConvert à 0€/mois (vs ~10€/mois projeté en croissance).
2. **Préparation Qualiopi audit-ready** : audit trail des signatures (qui, quand, IP) consultable en 1 requête SQL — Nathalie (auditrice externe) peut valider la conformité en 15 min vs 2h aujourd'hui.
3. **Extensibilité business** : ajout d'un nouveau type de document devient une opération "no-code" pour Loris (mécanisme d'import).
4. **Moindre dépendance fournisseur** : Puppeteer self-hosted → 0 risque de panne CloudConvert qui bloque la prod (~3 incidents observés en 6 mois).

### Technical Success (Wissam dev)

1. **Service unique de génération** : 100% des PDFs passent par `DocumentGenerationService.generate()` — code dupliqué éliminé.
2. **Schéma unifié** : table `documents` contient l'intégralité des documents, anciennes tables conservées 90j en lecture puis droppées.
3. **0 cast `any`** dans le code documents (cf règle absolue CLAUDE.md #1) — les 15+ violations actuelles supprimées.
4. **Cache PDF 100%** : tous les chemins utilisent `pdf-cache` avec hash SHA-256 sur (template_id, context, updated_at).
5. **Tests E2E snapshot** : 3 templates clés (convention entreprise, attestation, émargement) ont un test snapshot PDF qui détecte les régressions visuelles.
6. **Logs structurés** : événements `document_generated`, `document_sent`, `document_signed`, `document_failed` émis vers Sentry/Netlify Logs avec entity_id, doc_type, latence, taille fichier.

### Measurable Outcomes (synthèse)

| Indicateur | Aujourd'hui | Cible post-refonte |
|---|---|---|
| Moteurs PDF distincts | 3 (jsPDF, CloudConvert, docxtemplater) | 1 (Puppeteer) + 1 fallback (CloudConvert) |
| Tables documents | 5 (generated_documents, document_templates, formation_convention_documents, signatures, quote_signatures) | 2 (documents, document_templates) |
| Cache PDF couverture | 1 endpoint sur ~10 | 100% des chemins |
| Coût CloudConvert mensuel | ~3-10€ et croissant | 0€ (Puppeteer auto-hébergé), Railway $5/mois |
| Casts `any` | 15+ | 0 |
| Délai ajout nouveau type | 1-2 jours dev | <5 min (no-code Loris) |
| État document (status) | Inférence complexe via JOINs | 1 colonne `documents.status` |
| Audit trail signature | Partiel (juste SVG + signed_at) | Complet (IP, user-agent, signer_id, méthode) |

---

## 4. Product Scope

### MVP — Minimum Viable Product (cible des 5 lots = ce PRD)

1. **Moteur PDF unique** Puppeteer self-hosted (Railway) avec fallback CloudConvert.
2. **Schéma `documents` unifié** + backfill depuis les 5 tables anciennes + suppression progressive.
3. **Service `DocumentGenerationService.generate({ docType, context })`** unique pour les 11 types existants.
4. **Service `SignatureService.sign(...)`** unifié pour émargements + signatures devis.
5. **Page admin `/admin/documents/import`** pour upload massif de templates Word/PDF.
6. **Page de doc utilisateur** "Comment ajouter un nouveau type de document en 3 clics".
7. **Suppression du code jsPDF legacy** (5 fichiers `*-pdf-export.ts`).
8. **Cache PDF 100% des chemins** + logs structurés des événements documents.
9. **Tests E2E snapshot** pour 3 templates clés.

### Growth Features (Post-MVP)

1. **Versioning des templates** : conserver un historique des modifications d'un template + rollback en 1 clic.
2. **Templates collaboratifs** : permettre à Loris d'inviter Marc/Taline à éditer un template en parallèle (Google Docs-style).
3. **Bibliothèque de templates publics** : place de marché interne où d'autres OF peuvent partager leurs templates (validés par Loris en super_admin).
4. **Signature électronique qualifiée eIDAS-3** : intégration Yousign/Universign pour les contrats à fort enjeu (>10k€).
5. **Génération asynchrone** : pour les batchs (50+ documents), file d'attente avec progress bar + email à la fin.
6. **OCR sur documents reçus** : extraction automatique des données d'un PDF signé renvoyé par un client (ex : convention signée scannée).

### Vision (Future, 18-24 mois)

- **Place de marché de templates Qualiopi-ready** : Loris vend son know-how aux autres OF abonnés.
- **IA assistant** : suggérer un template adapté en fonction de la session (ex : « Cette session est un DPC, je propose la convention DPC + attestation DPC »).
- **Signature mobile native** : app iOS/Android dédiée pour Karim (formateur) qui fait signer les émargements jour J sans navigateur.
- **Export comptable** : génération automatique des journaux comptables OPCO/financiers pour Loris (formats CIEL, EBP, Cegid).

---

## 5. User Journeys

### Persona 1 — Loris VICHOT, gérant d'organisme de formation (rôle `super_admin`)

#### Journey 1 — Générer et envoyer une convention entreprise (happy path après refonte)

1. Loris ouvre la fiche d'une session INTER avec 3 entreprises (`/admin/formations/{id}` → onglet « Convention »).
2. Il clique « Générer convention » sur l'entreprise « Acme ».
3. Le service `DocumentGenerationService.generate({ docType: 'convention_entreprise', sourceTable: 'sessions', sourceId, ownerType: 'company', ownerId: acmeCompanyId })` est appelé.
4. Le service :
   a. Cache hit ? Si oui → retourne immédiatement le PDF existant.
   b. Sinon : résout les variables via `resolve-variables.ts` (path unique), génère le PDF via PuppeteerEngine, upload dans bucket `documents/{entity_id}/convention_entreprise/{doc_id}.pdf`, INSERT en table `documents` avec status='generated'.
5. Loris voit le PDF en preview dans un Dialog Shadcn. Il clique « Envoyer par email à Acme » → le service `email-queue` enqueue avec attachment référencé par `documents.id`. Statut → 'sent'.
6. Acme reçoit l'email avec le PDF en pièce jointe + lien public de signature.
7. Le contact Acme clique le lien → page de signature publique → trace son signature canvas → POST `/api/documents/sign` avec le token. Le service `SignatureService` valide le token, sanitize le SVG, UPDATE `documents` avec status='signed', `signed_by`, `signed_at`, `signature_ip`, `signature_user_agent`, `signature_data`.
8. Loris reçoit une notif "Convention Acme signée" + le PDF mis à jour avec la signature intégrée est régénéré (cache invalidé via hash, puisque `signed_at` est inclus dans le hash).
9. La fiche session affiche le badge « Convention Acme : ✅ Signée le 15/05/2026 ».

#### Journey 2 — Ajouter un nouveau type de document (autonome, no-code)

1. Loris reçoit un email d'OPCO Santé : « À partir du 01/07/2026, votre nouveau modèle d'attestation DPC est joint. »
2. Loris télécharge le modèle Word `attestation_dpc_2026.docx` fourni par l'OPCO.
3. Il l'ouvre dans Word, remplace les zones variables par `{{nom_apprenant}}`, `{{date_formation}}`, `{{numero_dpc}}`, etc. (en référence à la doc utilisateur fournie).
4. Il va sur `/admin/documents/import` → drag-and-drop le fichier `.docx`.
5. La page lui demande :
   - Nom du type (ex : "Attestation DPC OPCO Santé 2026")
   - Catégorie (ex : "Attestation")
   - Variables détectées : preview en surbrillance, validation OK ou indique les variables inconnues.
6. Loris clique « Importer ». Le service uploade le `.docx` dans `formation-docs/templates/{entity_id}/`, INSERT en `document_templates` avec `mode='docx_fidelity'`, `is_system=false`, `default_for_doc_type=true`.
7. Le nouveau type apparaît immédiatement dans le dropdown « Générer document » de la fiche session.
8. Loris génère un test sur une session bidon, valide le rendu visuel, communique à l'équipe.

**Bénéfice** : ce qui était 1-2 jours de dev (PR custom) est devenu 3-5 minutes sans intervention dev.

#### Journey 3 — Audit Qualiopi : produire la preuve documentaire pour 5 formations

1. Nathalie (auditrice Qualiopi externe) demande à Loris : « Sur ces 5 formations terminées en 2026, je veux voir : convention signée + émargement complet + attestation + certificat. »
2. Loris ouvre `/admin/reports/qualiopi-audit` (page existante, hors scope refonte mais qui consommera la table `documents`).
3. Il sélectionne les 5 sessions. Le rapport affiche pour chaque session :
   - Convention : statut, date signature, IP signataire, lien preview PDF
   - Émargement : nombre apprenants signés / total, lien preview
   - Attestation : statut, date génération, lien preview
   - Certificat : idem
4. Loris exporte en ZIP : 5 dossiers, chacun contenant les 4 PDFs + un fichier `audit-trail.json` avec horodatage et IP de chaque signature.
5. Nathalie valide en 15 min vs 2h en mode actuel (où elle devait fouiller manuellement dans la fiche session + cliquer chaque document).

### Persona 2 — Karim, formateur (rôle `trainer`)

#### Journey 4 — Émargement jour J en présentiel

1. Karim arrive sur site, ouvre `/admin/formations/{id}` → onglet « Émargement ».
2. La liste des apprenants présents s'affiche. Pour chacun, il passe la tablette → l'apprenant signe au canvas (signature pad mobile-friendly).
3. À chaque signature, `SignatureService.sign({ documentType: 'emargement', sourceTable: 'sessions', sourceId, ownerType: 'learner', ownerId, signatureSvg, sessionAuth })` est appelé. Une ligne `documents` est créée/mise à jour avec status='signed' + audit trail.
4. En fin de demi-journée, Karim clique « Télécharger émargement collectif » → `DocumentGenerationService.generate({ docType: 'emargement_collectif', sourceId })` régénère le PDF (cache invalidé puisque les signatures viennent de changer).
5. PDF téléchargé en moins de 10 sec — généré côté serveur par Puppeteer (pas par jsPDF côté client comme avant).

### Persona 3 — Sophie, apprenante (rôle `learner`)

#### Journey 5 — Recevoir et consulter son attestation

1. Le lendemain de la fin de la formation, Sophie reçoit un email automatique : « Votre attestation de fin de formation est disponible » avec PDF en attachment.
2. L'attestation contient son nom, ses dates de présence, le taux d'assiduité, la signature de Karim formateur + le tampon Loris MR Formation.
3. Sophie peut aussi se connecter à `/client/dashboard` et retrouver tous ses documents (conventions, attestations, certificats) sous l'onglet « Mes documents ».
4. Chaque document affiche : nom, date de génération, statut (signé/non signé), bouton « Télécharger ».

### Persona 4 — Émilie, référente RH chez Acme (rôle `client`)

#### Journey 6 — Suivi documentaire des apprenants Acme sur une session INTER partagée

1. Émilie se connecte à `/client/dashboard` → liste des formations de ses apprenants.
2. Sur la formation « SST 2026-Q1 » (INTER, 3 entreprises dont Acme), Émilie voit uniquement les 4 apprenants Acme (isolation `client_id` via RLS).
3. Pour chaque apprenant Acme, elle voit :
   - Convention Acme : ✅ Signée le 15/05/2026 (lien PDF)
   - Émargements de l'apprenant : 6/6 demi-journées signées
   - Attestation : ✅ Disponible (lien PDF)
4. Elle clique « Télécharger pack documentaire » → ZIP contenant les 4 PDFs de chaque apprenant Acme.
5. **Ne voit jamais** les apprenants des 2 autres entreprises (isolation `client_id`, NFR-SEC-2 héritée de l'Epic 3 Formations).

### Persona 5 — Wissam, développeur backend (rôle technique, hors plateforme)

#### Journey 7 — Ajouter un nouveau moteur PDF (Puppeteer → Gotenberg ou autre)

1. Wissam veut tester Gotenberg comme alternative à Puppeteer.
2. Il crée `src/lib/services/pdf-engines/gotenberg-engine.ts` qui implémente l'interface `PDFEngine.render(html, options): Promise<Buffer>`.
3. Il modifie `lib/services/pdf-generator.ts` pour ajouter Gotenberg dans le switch avec feature flag `PDF_ENGINE=puppeteer|cloudconvert|gotenberg`.
4. Aucun autre fichier à toucher — la centralisation du service garantit que tous les chemins consomment Gotenberg sans changement code applicatif.

---

## 6. Domain-Specific Requirements

### Compliance & Regulatory (France / formation professionnelle)

- **Qualiopi (Critère 5 + 6)** : preuves de réalisation de la formation. Tous les documents doivent être :
  - Conservés 10 ans minimum (rétention).
  - Audit-trail des signatures complet (qui, quand, depuis quelle IP).
  - Téléchargeables en ZIP par formation lors d'un audit.
- **BPF (Bilan Pédagogique et Financier annuel)** : nécessite l'agrégation des données documentaires (nombre conventions, attestations, montants facturés). Ce module produit la donnée, le module Reports l'agrège (hors scope direct).
- **RGPD** : signatures électroniques contiennent des données personnelles (SVG = trait de signature + IP). Doivent être chiffrées en repos (Supabase Storage est chiffré natif), supprimables sur demande (cascade FK).
- **Convention de formation (Code du travail Art. L6353-2)** : obligation légale pour toute formation > 10h. Contenu minimum imposé (titre, durée, objectifs, prix, modalités d'évaluation, dispositions financières).
- **Signature simple vs qualifiée** : pour les conventions < 10k€ et émargements, la signature électronique simple suffit (eIDAS niveau 1). Pas de besoin de Yousign/Universign aujourd'hui.

### Technical Constraints

- **Next.js 14 App Router** : pas de Pages Router, donc les routes API sont en `app/api/*/route.ts`.
- **Supabase RLS obligatoire** : toute table doit avoir une policy `entity_isolation`. La nouvelle table `documents` également.
- **Multi-tenant** : `entity_id` partout. Aucune mutation sans filtre `entity_id`.
- **TypeScript strict, 0 `any`** : règle absolue CLAUDE.md #1.
- **Tous les Supabase writes** doivent passer par `src/lib/services/` (règle absolue CLAUDE.md #10).
- **Tous les forms** doivent utiliser React Hook Form + Zod (règle absolue CLAUDE.md #6).
- **Pas de modification de schema.sql sans migration séparée** (règle absolue CLAUDE.md #7).
- **Déploiement Netlify** : pas de serveur persistant Next.js, donc Puppeteer **ne peut pas tourner directement sur Netlify** (timeout 10s sur les Functions, pas de Chromium). D'où le besoin de Railway/Fly.io en sidecar.

---

## 7. Functional Requirements

> Format : **FR-DOC-N — Titre**. Statut : `MVP` (lot A→E) ou `Post-MVP`.

### 7.1 Moteur PDF unique (Lot A)

- **FR-DOC-1 (MVP)** — Le système doit fournir une interface `PDFEngine` avec une méthode `render(html: string, options: PDFRenderOptions): Promise<Buffer>`.
- **FR-DOC-2 (MVP)** — `PuppeteerEngine` doit être hébergé sur Railway en tant que micro-service HTTP avec endpoint `POST /render`.
- **FR-DOC-3 (MVP)** — `PuppeteerEngine.render` doit supporter : marges custom, header/footer custom, format A4/Letter, polices web (Inter, Roboto), images base64 inline, CSS print media.
- **FR-DOC-4 (MVP)** — `CloudConvertEngine` doit rester fonctionnel en tant que fallback automatique si `PuppeteerEngine` retourne une erreur 5xx ou timeout > 30s.
- **FR-DOC-5 (MVP)** — Une variable d'env `PDF_ENGINE_PREFERENCE=puppeteer|cloudconvert` doit permettre de basculer manuellement.
- **FR-DOC-6 (MVP)** — Une métrique `pdf_engine_used` doit être loguée à chaque génération (`puppeteer` / `cloudconvert_fallback` / `cache_hit`).
- **FR-DOC-7 (MVP)** — Le service Puppeteer doit auto-pull le Chromium au build Docker (pas de download runtime).

### 7.2 Service de génération centralisé (Lot A)

- **FR-DOC-8 (MVP)** — Un service `DocumentGenerationService.generate({ docType, sourceTable, sourceId, ownerType?, ownerId?, options? }): Promise<{ documentId, fileUrl }>` doit être l'unique point d'entrée.
- **FR-DOC-9 (MVP)** — Le service doit séquencer : (a) résolution template, (b) résolution variables, (c) cache lookup (hash SHA-256), (d) rendu PDF si miss, (e) upload Storage, (f) INSERT `documents`.
- **FR-DOC-10 (MVP)** — Le cache PDF doit utiliser un hash basé sur `(template_id, sourceTable, sourceId, ownerType, ownerId, updated_at_compositekey)` pour invalider automatiquement si la session/learner/client/template change.
- **FR-DOC-11 (MVP)** — Le service doit logger un événement structuré `document_generated` avec entity_id, doc_type, latence_ms, file_size, engine_used, cache_hit (boolean).

### 7.3 Schéma documents unifié (Lot B)

- **FR-DOC-12 (MVP)** — Une nouvelle table `documents` doit être créée (cf §9). Migration idempotente.
- **FR-DOC-13 (MVP)** — La table doit avoir RLS `entity_isolation` (sur `entity_id`).
- **FR-DOC-14 (MVP)** — Une contrainte UNIQUE sur `(entity_id, source_table, source_id, doc_type, owner_type, owner_id)` doit empêcher les doublons.
- **FR-DOC-15 (MVP)** — Un script de backfill doit migrer les données existantes de `generated_documents`, `formation_convention_documents`, `signatures`, `quote_signatures` vers `documents`. Idempotent (ré-exécutable sans doublon).
- **FR-DOC-16 (MVP)** — Pendant la transition, **double-write** : les écritures dans les anciennes tables continuent **en plus** de `documents`, jusqu'à la fin du Lot B. Permet rollback feature-flagué.
- **FR-DOC-17 (MVP)** — Un feature flag `USE_UNIFIED_DOCUMENTS_FOR_<doc_type>` doit permettre de basculer chaque type indépendamment.

### 7.4 Service signature unifié (Lot C)

- **FR-DOC-18 (MVP)** — Un service `SignatureService.sign({ documentId, signatureSvg, signerId?, token?, ipAddress, userAgent }): Promise<ServiceResult>` doit unifier les 2 flux (canvas inline + token public).
- **FR-DOC-19 (MVP)** — Le service doit sanitize le SVG (suppression `<script>`, `<iframe>`, etc.) via `sanitizeSignatureSvg`.
- **FR-DOC-20 (MVP)** — La signature doit être idempotente : un re-call sur un document déjà signé retourne `{ ok: true, already_signed: true }`.
- **FR-DOC-21 (MVP)** — L'audit trail doit être complet : `signed_by` (UUID ou NULL pour signataires anonymes via token), `signed_at`, `signature_ip` (INET), `signature_user_agent` (TEXT), `signature_method` (`canvas_inline` / `token_public`).
- **FR-DOC-22 (MVP)** — Sur signature réussie, le PDF doit être régénéré (cache invalidé via inclusion de `signed_at` dans le hash de cache) avec la signature intégrée.
- **FR-DOC-23 (MVP)** — Un événement `document_signed` doit être logué (entity_id, document_id, doc_type, method, signer_role).

### 7.5 Import templates par lot (Lot D)

- **FR-DOC-24 (MVP)** — Une page admin `/admin/documents/import` doit permettre l'upload simultané de plusieurs fichiers `.docx` (drag-and-drop multiple).
- **FR-DOC-25 (MVP)** — La page doit, pour chaque fichier : (a) parser le `.docx` pour détecter les variables `{{xxx}}`, (b) comparer avec le catalogue `TEMPLATE_VARIABLES`, (c) signaler les variables inconnues.
- **FR-DOC-26 (MVP)** — L'admin doit pouvoir, par template : nommer (string), catégoriser (dropdown ou freetext), marquer comme `default_for_doc_type=true`.
- **FR-DOC-27 (MVP)** — À la validation, le service doit uploader les `.docx` dans `formation-docs/templates/{entity_id}/{uuid}.docx` et INSERT dans `document_templates` avec `mode='docx_fidelity'`, `is_system=false`.
- **FR-DOC-28 (MVP)** — Si un template avec le même `system_key` (pour les overrides système) ou même `name` existe → UPSERT (overwrite + log).
- **FR-DOC-29 (MVP)** — Une page `/admin/documents/how-to` (statique) doit expliquer en 5 étapes comment créer un template Word avec les variables (avec captures d'écran et exemple téléchargeable).

### 7.6 Résolution variables unifiée (Lot B)

- **FR-DOC-30 (MVP)** — Une seule fonction `resolveDocumentVariables(template: string, context: DocumentContext): Promise<string>` doit être utilisée par tous les chemins (HTML et Word via docxtemplater).
- **FR-DOC-31 (MVP)** — Le catalogue `TEMPLATE_VARIABLES` doit être l'unique source de vérité des variables disponibles. Chaque variable doit avoir : `key`, `label`, `category`, `description`, `availableIn` (`['document','email']`), `resolver` (fonction pure).
- **FR-DOC-32 (MVP)** — Les variables nullish doivent être systématiquement converties en chaîne vide (pas `"undefined"` ni `"null"` dans le PDF final).
- **FR-DOC-33 (MVP)** — Le formatage des dates doit utiliser `date-fns` avec format français standard (`dd MMMM yyyy`).
- **FR-DOC-34 (MVP)** — Les variables images (`{{logo_organisme}}`, `{{signature_responsable}}`) doivent être résolues en base64 ou URL publique selon le contexte (HTML inline vs DOCX embedded).

### 7.7 Suppression jsPDF legacy (Lot E)

- **FR-DOC-35 (MVP)** — Les 5 fichiers `src/lib/pdf-export.ts`, `src/lib/invoice-pdf-export.ts`, `src/lib/devis-pdf.ts`, `src/lib/emargement-pdf-export.ts`, `src/lib/qr-pdf-export.ts` doivent être supprimés une fois tous les types migrés.
- **FR-DOC-36 (MVP)** — Toutes les références dans le code à `import jsPDF` ou `import 'jspdf-autotable'` doivent être éliminées.
- **FR-DOC-37 (MVP)** — Le `package.json` doit retirer `jspdf`, `jspdf-autotable`, `html2canvas` (à confirmer si toujours utilisé ailleurs).
- **FR-DOC-38 (MVP)** — Aucun cast `(doc as any).lastAutoTable.finalY` ne doit subsister.

### 7.8 Observabilité & tests (Lot E)

- **FR-DOC-39 (MVP)** — Les événements `document_generated`, `document_sent`, `document_signed`, `document_failed` doivent être logués via `logEvent()` (cf Story 5.3 Formations) avec structure JSON.
- **FR-DOC-40 (MVP)** — Une suite de tests E2E snapshot doit couvrir : convention entreprise, attestation, émargement collectif. Snapshot stocké en `tests/snapshots/`.
- **FR-DOC-41 (MVP)** — Un test unitaire doit couvrir `DocumentGenerationService.generate()` (mock Supabase + PDFEngine).
- **FR-DOC-42 (MVP)** — Un test unitaire doit couvrir `SignatureService.sign()` (idempotence, sanitize SVG, audit trail).

### 7.9 Mass Operations (Lot F)

_Ajout 2026-05-17 — pendant readiness check, gap traçabilité identifié : ces FRs étaient dans Architecture (PR2 sous-PR 2.5) mais pas dans PRD/Epics. Formellement intégrés ici._

- **FR-DOC-46 (MVP)** — Mass download batch ZIP par session : un endpoint `POST /api/documents/batch-zip { session_id, doc_type, owner_filter? }` doit permettre de générer en parallèle tous les PDFs d'un doc_type pour tous les owners d'une session et les packager en 1 ZIP. Structure interne `{owner_name}/{doc_type}.pdf`. Fail-soft : si certaines générations échouent, fichier `_erreurs.txt` ajouté au ZIP avec liste des owners en erreur. Bouton dans `TabConventionDocs` "Télécharger tous les docs (X owners) en ZIP". Performance : 20 owners × 5 types = 100 PDFs en < 60s (cache + parallélisme).

- **FR-DOC-47 (MVP)** — Mass send email batch par session : un endpoint `POST /api/documents/send-batch-email { session_id, doc_type, recipients[] }` doit, pour chaque destinataire, générer le PDF, envoyer email via Resend avec PDF en pièce jointe, mettre à jour `documents.is_sent=true, sent_at=NOW()`. Retour `{ success: N, failed: M, errors: [{ owner_id, error }] }`. Progress UI front (compteur "X/N envoyés"). Bouton dans `TabConventionDocs` "Envoyer X docs à tous les destinataires".

- **FR-DOC-48 (MVP)** — Mass signature request par session : pour les doc_types `requires_signature=true`, un endpoint `POST /api/documents/signature-request-batch { session_id, doc_type }` doit, pour chaque owner qui doit signer, créer un magic link (via `signing_tokens`, purpose='document_signature', expires_at = 7j), envoyer email avec lien `/sign/{token}`. Bouton dans `TabConventionDocs` "Demander signature à tous". Bénéficie du `SignatureService` Lot C (FR-DOC-18 à 23).

### 7.10 Post-MVP

- **FR-DOC-49 (Post-MVP)** — Versioning des templates : `document_templates` doit avoir un historique des modifications (renommage : ancien FR-DOC-43).
- **FR-DOC-50 (Post-MVP)** — Intégration eIDAS-3 (Yousign/Universign) en option par doc_type (renommage : ancien FR-DOC-44).
- **FR-DOC-51 (Post-MVP)** — File d'attente asynchrone pour génération batch (200+ docs) avec progress bar + email notification fin (renommage : ancien FR-DOC-45). _Note : pour < 100 docs, FR-DOC-46 mass ZIP synchrone suffit._

---

## 8. Non-Functional Requirements

### NFR-PERF (Performance)

- **NFR-PERF-1** — La génération d'un PDF cache-hit doit retourner en < 200 ms (lecture Storage).
- **NFR-PERF-2** — La génération d'un PDF cache-miss doit retourner en < 5 s (Puppeteer) pour un document standard (≤ 4 pages).
- **NFR-PERF-3** — La page `/admin/documents/import` doit accepter jusqu'à 20 fichiers `.docx` simultanés (uploads parallèles).
- **NFR-PERF-4** — Le backfill `documents` doit traiter 10 000 lignes en moins de 5 minutes (en prod, exécution one-shot).

### NFR-SEC (Sécurité)

- **NFR-SEC-1** — Toutes les tables documents (`documents`, `document_templates`) doivent avoir RLS `entity_isolation` active.
- **NFR-SEC-2** — Toute query Supabase dans le code doit filtrer par `entity_id` (défense en profondeur).
- **NFR-SEC-3** — Le SVG signature doit être sanitize côté server (suppression `<script>`, attributs `on*`).
- **NFR-SEC-4** — Les liens de signature publique (token) doivent expirer après 30 jours.
- **NFR-SEC-5** — Le service Puppeteer Railway doit être accessible uniquement via auth `Bearer <PDF_SERVICE_SECRET>` (pas de endpoint public ouvert).
- **NFR-SEC-6** — Les buckets Supabase Storage doivent avoir RLS appropriée (lecture publique uniquement pour `organization-assets`, lecture authentifiée pour `documents` filtré par entity, écriture admin uniquement).

### NFR-REL (Reliability)

- **NFR-REL-1** — Si Puppeteer Railway est down, le système doit basculer automatiquement sur CloudConvert dans la même requête (pas d'erreur utilisateur).
- **NFR-REL-2** — Si CloudConvert ET Puppeteer sont down, le système doit retourner une erreur explicite "Génération temporairement indisponible, réessayez dans 5 min" (pas de silent fail).
- **NFR-REL-3** — Le backfill `documents` doit être idempotent : ré-exécution = no-op.
- **NFR-REL-4** — Toute mutation `documents` doit être loguée pour traçabilité (qui a fait quoi).
- **NFR-REL-5** — Aucun catch silencieux dans le code documents. Tout catch doit logger via `logEvent({ event: "document_failed", ... })` + retourner une erreur claire.

### NFR-OBS (Observability)

- **NFR-OBS-1** — Sentry doit capturer toutes les erreurs `document_failed` avec context (entity_id, doc_type, error_message).
- **NFR-OBS-2** — Netlify Logs doit afficher les `console.log` structurés des événements documents (grep facile par event name).
- **NFR-OBS-3** — Un dashboard Supabase doit permettre de répondre à : "Combien de documents générés cette semaine ?" et "Quel est le taux de signature des conventions ?" via SQL simple.

### NFR-MAINT (Maintainability)

- **NFR-MAINT-1** — 0 cast `any` dans le code documents.
- **NFR-MAINT-2** — Toute fonction publique du `DocumentGenerationService` et `SignatureService` doit avoir une JSDoc en français expliquant l'usage et les invariants.
- **NFR-MAINT-3** — Tests unitaires couvrent ≥ 70% du service de génération et 100% des helpers de résolution de variables.

### NFR-COST (Cost)

- **NFR-COST-1** — Coût mensuel d'infrastructure documents ≤ 10€ (Railway $5 + Supabase Storage négligeable).
- **NFR-COST-2** — Coût marginal par document généré ≈ 0€ (vs $0.01 CloudConvert).
- **NFR-COST-3** — Cache PDF doit éviter ≥ 80% des régénérations sur une période 30 jours (mesuré par taux `cache_hit` dans les logs).

---

## 9. Data Model

### 9.1 Table `documents` (nouvelle, cible unique)

```sql
CREATE TABLE documents (
  -- Identifiants
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,

  -- Typologie
  doc_type TEXT NOT NULL,
    -- enum souple : 'convention_entreprise', 'convention_apprenant', 'convocation',
    -- 'programme', 'emargement_collectif', 'emargement_individuel', 'attestation',
    -- 'certificat', 'facture', 'devis', 'cgv', 'reglement', + custom
  template_id UUID REFERENCES document_templates(id) ON DELETE SET NULL,

  -- Source (la donnée qui a généré le doc)
  source_table TEXT NOT NULL CHECK (source_table IN ('sessions', 'crm_quotes', 'crm_invoices', 'enrollments')),
  source_id UUID NOT NULL,

  -- Propriétaire (à qui s'adresse le doc)
  owner_type TEXT CHECK (owner_type IN ('session', 'learner', 'company', 'trainer', 'client', 'financier')),
  owner_id UUID,

  -- Fichier
  file_url TEXT,                            -- chemin Supabase Storage (canonique)
  file_size INTEGER,
  file_hash TEXT,                            -- SHA-256 pour cache invalidation

  -- État
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft', 'generated', 'sent', 'signed', 'cancelled')),

  -- Workflow timestamps
  generated_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,

  -- Signature électronique (audit trail complet)
  signed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,   -- NULL si signataire anonyme (token)
  signature_data TEXT,                       -- SVG sanitize
  signature_ip INET,
  signature_user_agent TEXT,
  signature_method TEXT CHECK (signature_method IN ('canvas_inline', 'token_public', 'qualified_eidas')),
  signature_token TEXT,                      -- token public pour flux email
  signature_token_expires_at TIMESTAMPTZ,

  -- Métadonnées
  metadata JSONB,                            -- contexte de génération (variables résolues, options PDF, etc.)

  -- Audit
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE UNIQUE INDEX documents_unique_source_owner ON documents (entity_id, source_table, source_id, doc_type, COALESCE(owner_type, ''), COALESCE(owner_id::text, ''));
CREATE INDEX documents_entity_status ON documents (entity_id, status);
CREATE INDEX documents_source ON documents (source_table, source_id);
CREATE INDEX documents_signature_token ON documents (signature_token) WHERE signature_token IS NOT NULL;

-- RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entity_isolation" ON documents
  FOR ALL TO authenticated
  USING (entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid()));
```

### 9.2 Table `document_templates` (existante, légère évolution)

```sql
-- Existante, on ajoute uniquement :
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS default_for_doc_type BOOLEAN DEFAULT FALSE;
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS variables_detected JSONB; -- snapshot des variables à l'upload
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
```

### 9.3 Tables conservées (lecture seule pendant 90j puis drop)

- `generated_documents` (drop en fin de Lot E)
- `formation_convention_documents` (drop en fin de Lot E)
- `signatures` (drop en fin de Lot E, données migrées dans `documents`)
- `quote_signatures` (drop en fin de Lot E, données migrées dans `documents`)
- `trainer_documents` (à évaluer en Lot B — usage à confirmer)

### 9.4 Storage : 1 seul bucket `documents`

Convention canonique : `documents/{entity_id}/{doc_type}/{document_id}.pdf`.
Buckets existants conservés pour rétro-compat :
- `formation-docs` (templates Word custom) — conservé.
- `pdf-cache` (cache CloudConvert) — devient inutile en Lot A (Puppeteer self-hosted), à drop en Lot E.
- `invoices` (factures legacy) — migré dans `documents/{entity_id}/facture/`, drop en Lot E.
- `organization-assets` (logos, tampons) — conservé.

---

## 10. Technical Architecture

### 10.1 Couches

```
┌──────────────────────────────────────────────────────────────────┐
│ UI : <DocumentActions docType=… sourceId=… ownerType=… ownerId=…/>│
│   Composant unique, contextualise pour 11 types                    │
└────────────────────────────────┬─────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│ API Next.js :                                                     │
│   POST /api/documents/generate                                    │
│   POST /api/documents/sign                                        │
│   POST /api/documents/send                                        │
│   GET  /api/documents/:id/download                                │
│   POST /api/documents/templates/import (Lot D)                    │
└────────────────────────────────┬─────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│ Services métier :                                                 │
│   DocumentGenerationService                                       │
│   SignatureService                                                │
│   TemplateImportService                                           │
│   resolve-variables.ts (path unique)                              │
└────────────────────────────────┬─────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│ Engine (interface PDFEngine) :                                    │
│   - PuppeteerEngine (default, sidecar Railway)                    │
│   - CloudConvertEngine (fallback)                                 │
└──────────────────────────────────────────────────────────────────┘
```

### 10.2 Puppeteer Sidecar (Railway)

- **Stack** : Node.js + Express + Puppeteer + Chromium headless.
- **Image Docker** : `node:20-slim` + dépendances Chromium (libnss3, etc.). Auto-pull Chromium au build.
- **Endpoint** : `POST /render` accepte JSON `{ html, options: { format, margins, headerTemplate, footerTemplate } }`, retourne PDF binary.
- **Auth** : header `Authorization: Bearer <PDF_SERVICE_SECRET>` (env var).
- **Health check** : `GET /health` retourne `{ status: 'ok', chromium_version: '...' }`.
- **Déploiement** : push GitHub → Railway auto-deploy. Coût ~$5/mois (plan Hobby).

### 10.3 Feature flags

```typescript
// src/lib/feature-flags.ts
export const USE_UNIFIED_DOCUMENTS: Record<DocType, boolean> = {
  convention_entreprise: false,  // toggle on per doc_type
  convention_apprenant: false,
  emargement_collectif: false,
  // ...
};
```

Toggle activé via env var ou table `feature_flags` (à créer si pas existante).

### 10.4 Migration progressive (5 lots)

| Semaine | Lot | Travail |
|---|---|---|
| S1 | A | Puppeteer Railway up, `DocumentGenerationService` skeleton, PDFEngine interface |
| S2 | B | Migration table `documents`, backfill, premier doc_type migré (convention entreprise) |
| S3 | B | Migration des 10 autres doc_types un par un, feature flags |
| S4 | C + D parallel | `SignatureService` unifié + page import templates |
| S5 | E | Suppression jsPDF, tests E2E, logs structurés, recette |

---

## 11. Traceability Matrix

| FR | Cadrage US | Lot | Story implémentation prévue |
|---|---|---|---|
| FR-DOC-1 → 7 | US-1, US-2 | A | Story A1 : Puppeteer sidecar + PDFEngine interface |
| FR-DOC-8 → 11 | US-2 | A | Story A2 : DocumentGenerationService unifié |
| FR-DOC-12 → 17 | US-3, US-4 | B | Story B1 : Migration documents + backfill |
| FR-DOC-(par doc_type) | US-5 | B | Stories B2 → B12 : 1 story par doc_type migré |
| FR-DOC-18 → 23 | US-6, US-7, US-8 | C | Story C1 : SignatureService + audit trail |
| FR-DOC-24 → 29 | US-9, US-10 | D | Stories D1 (import) + D2 (doc utilisateur) |
| FR-DOC-30 → 34 | US-5 (sous-jacent) | B | Story B0 : resolve-variables unifié |
| FR-DOC-35 → 38 | US-11 | E | Story E1 : Suppression jsPDF legacy |
| FR-DOC-39 → 42 | US-12, US-13, US-14 | E | Stories E2 (cache 100%), E3 (logs), E4 (tests E2E) |
| FR-DOC-43 → 45 | — | Post-MVP | Reportés à un Epic ultérieur |

---

## 12. Risks & Constraints

| Risque | Impact | Probabilité | Mitigation |
|---|---|---|---|
| Puppeteer Railway down → bug critique génération | Élevé | Faible | Fallback CloudConvert automatique (FR-DOC-4) |
| Backfill `documents` perd des lignes | Élevé | Moyen | Idempotent + dry-run en staging + comptage avant/après |
| Templates Word Loris incompatibles avec docxtemplater | Moyen | Moyen | FR-DOC-25 : validateur de variables au upload |
| Migration `signatures` casse l'audit Qualiopi | Élevé | Faible | Tables conservées 90j en lecture, backfill complet |
| Quota CloudConvert dépassé avant fin migration Lot A | Moyen | Élevé | Lot A en première priorité, Puppeteer dispo dès J+7 |
| Tests E2E PDF complexes à mettre en place | Faible | Élevé | FR-DOC-40 : limité à 3 snapshots templates clés |
| Loris bloqué entre l'envoi du template Word et le rendu PDF non-conforme | Moyen | Moyen | FR-DOC-29 : doc utilisateur "comment créer un template" + preview avant publication |
| Régression visuelle sur les conventions existantes | Élevé | Moyen | FR-DOC-40 (snapshots) + recette manuelle sur 5 sessions historiques en fin de Lot B |

---

**Fin du PRD v1.0** — prêt pour validation et passage en epics/stories via `bmad-create-epics-and-stories`.
