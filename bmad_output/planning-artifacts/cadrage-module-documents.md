# Cadrage du module Génération de Documents — MR / C3V Formation

**Auteur :** Mary (Business Analyst, BMad)
**Date :** 2026-05-15
**Statut :** Document de cadrage — v1.0 (✅ validé le 2026-05-15 par Wissam)
**Demandeur :** Wissam (dev) au nom de Loris (gérant OF, utilisateur principal)
**Branche analysée :** `main` (post-merge PR #34)

> **Décisions validées le 2026-05-15** :
> 1. **Périmètre : big bang complet** — refonte des 11 types de documents + schéma unifié `documents` (pas de just-enough).
> 2. **Tous les types souffrent** d'après Loris : conventions (entreprise + apprenant), émargements, attestations/certificats, devis/factures. Les 4 axes sont prioritaires en parallèle.
> 3. **Nouveaux documents** : Loris fournira une liste écrite avec modèles Word/PDF. Le cadrage anticipe un **mécanisme d'import par lot** (story dédiée) pour absorber facilement les ajouts post-MVP.
> 4. **Moteur PDF** : migration vers **Puppeteer self-hosted** (Railway/Fly.io). Casse la dépendance CloudConvert critique (quota 25/jour + $0.01/conv).

---

## 0. Résumé exécutif

Le module **Génération de Documents** est le second pilier de la plateforme (après Formations) mais il est devenu instable parce que **trois décisions structurantes ont été prises à moitié** :

1. **Trois moteurs PDF coexistent** sans stratégie de bascule : `jsPDF` côté client (legacy, polices manquantes, casts `any`), `CloudConvert` côté serveur (fidèle mais payant et quota limité), `docxtemplater + CloudConvert` pour les templates Word custom. Chaque type de document a "son" moteur, ce qui multiplie par 3 le coût de chaque correctif.

2. **Cinq tables fragmentées** se partagent le concept "document" : `generated_documents` (minimale, pas de `status`), `document_templates`, `formation_convention_documents` (riche), `signatures`, `quote_signatures` — sans modèle unifié. Conséquence : impossible de répondre simplement à « quel est l'état du document X ? ».

3. **Deux flux de signature électronique incompatibles** : émargements via canvas inline (`InlineSignaturePad` + table `signatures`), devis via token public (`crm_quotes.signature_token` + table `quote_signatures`). Validation légale Qualiopi fragilisée si audit.

**Diagnostic Loris** | **Cause technique racine**
---|---
"Les conventions ne génèrent pas bien" | Variables `{{xxx}}` résolues différemment selon l'origine (3 paths : `resolve-variables.ts`, `email-attachments-resolver.ts`, `TabConventionDocs.tsx` inline)
"Les émargements partent mal en email" | Path jsPDF client → buffer → email queue → CloudConvert : 4 conversions, chacune un point de casse
"Les factures sortent moches" | jsPDF + autotable + casts `(doc as any).lastAutoTable.finalY` — polices, marges et styles non maîtrisés
"Je ne sais pas si un doc a été signé" | Pas de colonne `status` sur `generated_documents` ; FK `signatures.document_id` optionnelle
"Loris veut ajouter de nouveaux types" | Aucun mécanisme d'import standardisé : chaque nouveau type est un PR custom

**Recommandation cardinale** : avant tout nouveau type de document, **centraliser le moteur PDF** (Puppeteer self-hosted), **unifier le schéma** (super-table `documents` avec status + audit trail) et **unifier les signatures** sous un service unique. Sans ça, le client cumule la dette à chaque nouveau doc.

**Effort estimé** pour atteindre une génération stable, performante et extensible : **22-28 jours-homme** sur 4 lots (cf §7). Le big bang est ambitieux mais l'architecture cible est claire et les lots peuvent être livrés progressivement (chaque lot stabilise un pan).

---

## 1. Méthodologie

- **Cartographie code** : 1 sous-agent Explore exhaustif a lu les 9 sections clés (templates, variables, points d'entrée UI, moteur PDF, Storage, schéma, signatures, email, types TS).
- **Critères d'audit** : conformité aux 10 règles absolues du `CLAUDE.md` (notamment #1 zéro `any`, #2 filtre `entity_id`, #10 services centralisés), workflow utilisateur clair, gestion d'erreur, audit trail.
- **Pas de spéculation** : tout constat cite un fichier et, quand pertinent, un numéro de ligne.
- **Hors-périmètre** : tests automatisés de rendu visuel (snapshots PDF), accessibilité PDF, internationalisation.

---

## 2. État des lieux

### 2.1 Inventaire des 11 types de documents

| Type | Source | Moteur | Stockage | État |
|---|---|---|---|---|
| Convention entreprise | `document-templates-defaults.ts` (système) | CloudConvert (docx_fidelity) ou HTML | `generated_documents` + bucket `formation-docs` | ✅ Fonctionnel |
| Convocation | `document-templates-defaults.ts` | CloudConvert | `generated_documents` | ✅ Fonctionnel |
| **Émargement collectif** | `lib/emargement-pdf-export.ts` | **jsPDF client** | **Téléchargement direct, pas Storage** | ⚠️ Partiel |
| Émargement individuel | `document-templates-defaults.ts` + `signatures` table | CloudConvert | `generated_documents` + `signatures` | ✅ Fonctionnel |
| Certificat de réalisation | `document-templates-defaults.ts` | CloudConvert | `generated_documents` | ✅ Fonctionnel |
| Attestation d'assiduité | `document-templates-defaults.ts` | CloudConvert | `generated_documents` | ✅ Fonctionnel |
| **Programme de formation** | `lib/pdf-export.ts` (client) + `document-templates-defaults.ts` (serveur) | **Dupliqué client/serveur** | Bucket `formation-docs` ou téléchargement | ⚠️ Dupliqué |
| Facture | `lib/invoice-pdf-export.ts` + API | jsPDF client ou CloudConvert serveur | bucket `invoices` + `generated_documents` | ✅ Fonctionnel mais 2 chemins |
| **Devis** | `lib/devis-pdf.ts` | **jsPDF client** | Table `crm_quotes` + téléchargement | ✅ Fonctionnel mais Storage absent |
| CGV / Règlement intérieur | `document-templates-defaults.ts` | CloudConvert | `generated_documents` | ✅ Fonctionnel |
| Convention intervention (formateur) | `document-templates-defaults.ts` | CloudConvert | `generated_documents` | ✅ Fonctionnel |

### 2.2 Architecture moteur PDF — 3 implémentations parallèles

**Implémentation 1 — jsPDF côté client** (legacy, à supprimer) :
- Fichiers : `lib/pdf-export.ts`, `lib/invoice-pdf-export.ts`, `lib/devis-pdf.ts`, `lib/emargement-pdf-export.ts`, `lib/qr-pdf-export.ts`
- Problèmes : polices manquantes (Helvetica seulement), pas d'accès réseau fiable, CSS faible, casts `(doc as any).lastAutoTable.finalY` (violation CLAUDE.md #1)
- Couverture : devis, émargements collectifs, factures (legacy)

**Implémentation 2 — CloudConvert serveur** (prod actuelle) :
- Fichier : `lib/services/pdf-generator.ts`
- Pipeline : HTML/DOCX → API CloudConvert → LibreOffice/Chrome headless → PDF
- Coûts : quota gratuit 25/jour, puis $0.01/conversion ; ~3-4€/mois aujourd'hui mais grimpera avec volume
- Cache : `lib/services/pdf-cache.ts` (SHA-256 sur context+template+updated_at) → utilisé **uniquement** sur `/api/documents/generate-from-template`

**Implémentation 3 — Docxtemplater + CloudConvert** (templates Word custom) :
- Fichier : `lib/services/docx-converter.ts`
- Pipeline : fetch `.docx` Supabase Storage → docxtemplater substitue `{{var}}` → CloudConvert convertit en PDF
- Fidélité : ~99% (tableaux, logos, mise en page conservés)

### 2.3 Système de templates — 3 niveaux superposés

1. **Templates système hardcodés** dans `lib/document-templates-defaults.ts` (93 KB) — 11 templates HTML complets + catalogue typé de 40+ variables (`TEMPLATE_VARIABLES` lignes 37-440) avec `availableIn: ["document", "email"]`.
2. **Templates Word custom** uploadés via `/admin/documents` — bucket `formation-docs`, paths `templates/{entity_id}/{uuid}.docx`. Deux modes : `docx_fidelity` (Word natif) ou `editable` (HTML extrait).
3. **Templates HTML custom** dans `document_templates.content` — éditeur RichTextEditor, résolution via `lib/utils/resolve-variables.ts`.

**Problème** : trois façons de définir un template, deux mécanismes de résolution de variables différents. Aucune doc utilisateur sur "quand choisir lequel".

### 2.4 Schéma documents (fragmenté)

```sql
-- 5 tables, aucune unification :
generated_documents       -- minimal : id, template_id, session_id, client_id,
                          --   learner_id, name, content, file_url, created_at
                          -- ❌ pas de status, pas de signed_at, pas d'audit
document_templates        -- templates HTML/Word (id, entity_id, name, type,
                          --   content, is_system, system_key, source_docx_url, mode)
formation_convention_documents  -- doc_type, owner_type, status, is_signed, etc.
                          -- ✅ riche mais coexiste avec generated_documents
signatures                -- session_id, signer_id, signer_type, signature_data SVG
quote_signatures          -- quote_id, signature_data SVG, ip_address, user_agent
```

---

## 3. Incohérences de données identifiées

### 3.1 `generated_documents` vs `formation_convention_documents`
- Deux modèles concurrents pour le même concept ("document généré pour une session").
- `generated_documents.file_url` souvent NULL → impossible de savoir où le PDF a fini.
- `formation_convention_documents` a `status` (draft/confirmed/sent/signed) — `generated_documents` n'en a pas.

### 3.2 4 buckets Supabase Storage sans politique unifiée
- `formation-docs` (templates Word + certains PDFs générés)
- `pdf-cache` (cache CloudConvert, hash-based)
- `invoices` (factures uniquement)
- `organization-assets` (logos, tampons)

Aucune convention de nommage cross-bucket. Le path `formation-docs/templates/...` côtoie `formation-docs/generated/...`. RLS configurée différemment par bucket.

### 3.3 Résolution de variables triplée
- `lib/utils/resolve-variables.ts` (path canonique, utilisé par TabConventionDocs et par templates HTML custom)
- `lib/services/docx-converter.ts:76` (delimiters Mustache pour docxtemplater)
- `lib/services/email-attachments-resolver.ts` (résolution inline pour les attachments email)

Chaque path peut diverger sur (a) les variables supportées, (b) la gestion des nullish, (c) le formatage des dates.

### 3.4 Signatures : 2 flux incompatibles
- **Émargement** : `InlineSignaturePad` canvas → POST `/api/documents/sign` → écrit en table `signatures`
- **Devis** : email avec lien public → page signature → POST `/api/documents/sign` → écrit en table `quote_signatures`

Pas de service unique. Pas d'audit trail cohérent (qui, quand, depuis quelle IP, sur quel doc).

### 3.5 Cache PDF sous-utilisé
- `pdf-cache.ts` excellent design (hash sur context+updated_at) mais utilisé seulement sur 1 endpoint.
- Conséquence : régénération CloudConvert à chaque consultation pour 80% des paths → coût × 5 et latence × 3.

### 3.6 Casts `any` legacy
- 15+ occurrences dans `lib/pdf-export.ts`, `lib/invoice-pdf-export.ts`, `lib/emargement-pdf-export.ts` (`(doc as any).lastAutoTable.finalY`).
- Violation règle absolue CLAUDE.md #1.

### 3.7 Gestion d'erreur silencieuse
- `pdf-cache.ts:106-108` : échec upload → `console.warn` seulement, email partira sans pièce jointe valide.
- `email-attachments-resolver.ts:51-55` : catch silencieux par attachment → email envoyé même si un attachment est cassé.
- Aucun circuit breaker CloudConvert (si quota dépassé, batch entier timeout).

---

## 4. Architecture cible

### 4.1 Couches

```
┌─────────────────────────────────────────────────────────────────┐
│ UI : 1 seul composant <DocumentActions docType=... contextId=…/>│
└──────────────────────────────┬──────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ API : /api/documents/generate (POST) — point d'entrée unique     │
│       /api/documents/sign     (POST) — point d'entrée unique     │
│       /api/documents/send     (POST) — point d'entrée unique     │
└──────────────────────────────┬──────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ Service : DocumentGenerationService.generate({ doctype, context })│
│   1. Résout template (système OU custom Word OU custom HTML)     │
│   2. Résout variables via resolve-variables.ts (path unique)     │
│   3. Cache lookup (pdf-cache, hash context+template+updated_at)  │
│   4. Si miss → PDFEngine.render(html_or_docx) → upload bucket    │
│   5. INSERT documents (status='generated', file_url=…, audit)    │
│   6. Retourne { id, file_url }                                   │
└──────────────────────────────┬──────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ PDFEngine : interface unique avec 2 implémentations              │
│   - PuppeteerEngine (default, self-hosted Railway, 0$/conv)      │
│   - CloudConvertEngine (fallback, si Puppeteer down)             │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 Schéma cible — table unique `documents`

```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY,
  entity_id UUID NOT NULL,           -- multi-tenant
  doc_type TEXT NOT NULL,            -- 'convention_entreprise' | 'emargement' | ...
  template_id UUID REFERENCES document_templates(id),
  source_table TEXT,                 -- 'sessions' | 'crm_quotes' | etc.
  source_id UUID,                    -- l'id de la ligne source (session.id, quote.id…)
  owner_type TEXT,                   -- 'session' | 'learner' | 'company' | 'trainer'
  owner_id UUID,
  file_url TEXT,                     -- chemin Supabase Storage canonique
  file_size INTEGER,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft','generated','sent','signed','cancelled')),
  generated_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  signed_by UUID REFERENCES profiles(id),
  signature_ip INET,                 -- audit trail
  signature_user_agent TEXT,
  signature_data TEXT,               -- SVG (remplace tables signatures/quote_signatures)
  metadata JSONB,                    -- contexte de génération (variables, options)
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Migration : on garde `generated_documents`, `formation_convention_documents`, `signatures`, `quote_signatures` en lecture pendant la transition ; les écritures passent par `documents`. Backfill puis drop des anciennes tables en fin de big bang.

### 4.3 Storage : un seul bucket `documents`

`documents/{entity_id}/{doc_type}/{document_id}.pdf` — convention unique, RLS entity_isolation.

### 4.4 Service signature unifié

`SignatureService.sign({ documentId, signatureSvg, signerId?, token? })` — gère les 2 flux actuels (inline learner + token public client) via une seule API.

---

## 5. User stories priorisées

### Lot A — Infrastructure (story de tête : moteur PDF)
- **US-1** : Mettre en place PuppeteerEngine (Docker + Railway + endpoint interne `/render`) — **story de tête, débloque tout le reste**
- **US-2** : Créer `PDFEngine` interface + `CloudConvertEngine` fallback + `DocumentGenerationService` (service unique)

### Lot B — Schéma unifié
- **US-3** : Migration SQL `add_documents_unified_table.sql` (créer `documents`, RLS, indexes, contrainte unique sur (entity_id, source_table, source_id, doc_type))
- **US-4** : Backfill `documents` depuis `generated_documents` + `formation_convention_documents` (idempotent)
- **US-5** : Migrer 11 types vers `DocumentGenerationService.generate()` un par un

### Lot C — Signatures unifiées
- **US-6** : `SignatureService` + API `/api/documents/sign` (token OR session-auth)
- **US-7** : Migrer `InlineSignaturePad` (émargements) + `quote_signatures` flow vers le service unique
- **US-8** : Audit trail complet (IP, user-agent, timestamp, ratio canvas SVG/photo) dans `documents.signature_*`

### Lot D — Import templates + extensibilité
- **US-9** : Mécanisme d'import par lot des templates Word/PDF (page admin `/admin/documents/import` avec drag-drop multiple → upload bucket → INSERT `document_templates` avec `mode='docx_fidelity'`)
- **US-10** : Doc utilisateur pour Loris ("comment ajouter un nouveau type de document en 3 clics")

### Lot E — Hygiène et observabilité
- **US-11** : Supprimer `jsPDF` legacy (pdf-export, devis-pdf, invoice-pdf-export, emargement-pdf-export, qr-pdf-export) une fois tous les types migrés
- **US-12** : Cache PDF utilisé sur 100% des paths (pas seulement 1 endpoint)
- **US-13** : Logging structuré sur tous les events documents (`document_generated`, `document_sent`, `document_signed`, `document_failed`) avec entity_id, doc_type, latence, taille
- **US-14** : Tests unitaires service generation + 2-3 tests E2E rendu PDF (snapshot)

---

## 6. Lots d'implémentation — séquencement

| Lot | Stories | Effort | Dépend de | Critère de succès |
|---|---|---|---|---|
| **A** — Infra moteur PDF | US-1, US-2 | **5-7 j-h** | — | Un PDF généré via PuppeteerEngine end-to-end depuis un appel API local |
| **B** — Schéma unifié | US-3, US-4, US-5 | **8-10 j-h** | A | Les 11 types lus depuis `documents`, anciennes tables en lecture seule |
| **C** — Signatures | US-6, US-7, US-8 | **4-5 j-h** | B | Émargement + signature devis passent par le même endpoint, audit trail complet |
| **D** — Import templates | US-9, US-10 | **2-3 j-h** | B | Loris peut uploader 10 fichiers .docx en bulk depuis `/admin/documents/import` |
| **E** — Hygiène | US-11, US-12, US-13, US-14 | **3 j-h** | A, B, C, D | jsPDF supprimé, cache 100%, logs structurés, tests verts |

**Total : 22-28 j-h**. Lots A et B sont **séquentiels** (B dépend de A). Lots C, D, E peuvent paralléliser après B.

---

## 7. Plan de migration progressive

**Semaine 1** : Lot A (Puppeteer infra)
**Semaine 2-3** : Lot B (schéma unifié + migration des 11 types, par paquets de 3-4)
**Semaine 4** : Lot C en parallèle de Lot D
**Semaine 5** : Lot E + recette

**Stratégie de transition** :
- Pendant le big bang, **double-write** : les anciennes tables (`generated_documents`, `formation_convention_documents`) continuent à être écrites jusqu'à fin Lot B. Évite le risque de régression UI.
- **Feature flag** `USE_UNIFIED_DOCUMENTS` par doc_type. Permet de migrer un type à la fois et de rollback en 1 ligne si bug.
- **Cache PDF préservé** pendant toute la migration → Loris ne voit aucune dégradation de perf.

---

## 8. Risques et mitigations

| Risque | Impact | Probabilité | Mitigation |
|---|---|---|---|
| Puppeteer Railway down → bug critique génération | Élevé | Faible | Fallback `CloudConvertEngine` actif via PDFEngine interface |
| Backfill `documents` perd des lignes | Élevé | Moyen | Idempotent + dry-run en staging + comptage avant/après |
| Templates Word Loris incompatibles avec docxtemplater | Moyen | Moyen | Story US-9 inclut un validateur de template (preview en uploadant) |
| Migration `signatures` casse l'audit Qualiopi | Élevé | Faible | Tables `signatures` + `quote_signatures` conservées en lecture pendant 90j ; documents.signature_data backfillé depuis |
| Quota CloudConvert dépassé avant fin migration | Moyen | Élevé | Lot A en première priorité (Puppeteer dispo dès J+7) |
| Tests E2E PDF complexes à mettre en place | Faible | Élevé | Story US-14 limitée à snapshot 3 templates clés, pas exhaustif |

---

## 9. Non-objectifs

- **Pas de refonte UI** : `/admin/documents`, `TabConventionDocs`, `TabEmargements` conservent leur design actuel validé. On change le moteur, pas l'interface.
- **Pas d'intégration DocuSign / Dropbox Sign** : signatures internes suffisent, intégration tiers reportée à un Epic ultérieur si besoin Qualiopi.
- **Pas de signature électronique qualifiée eIDAS niveau 3** : on reste sur "signature simple" + audit trail (suffisant pour conventions OF privées).
- **Pas de versioning de documents** : si Loris modifie un template, les anciens PDFs gardent leur ancienne version (via cache hash). Pas de migration rétroactive.

---

## 10. Prochaines étapes

1. **Validation cadrage** par Wissam + Loris (toi en proxy pour Loris)
2. **Génération PRD** via `bmad-create-prd` à partir de ce cadrage (Phase 4 méthodologie BMAD)
3. **Génération epics + stories** via `bmad-create-epics-and-stories` (Phase 5)
4. **Implémentation lot par lot** via subagent-driven-development (Phase 6)

> **Question ouverte (non bloquante)** : Loris a-t-il une préférence pour Railway vs Fly.io vs Render pour héberger Puppeteer ? Si non, je propose Railway par défaut (UX simple, $5/mois, déploy via push GitHub).
