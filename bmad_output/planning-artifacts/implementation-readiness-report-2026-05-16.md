---
stepsCompleted: [1, 2, 3, 4, 5, 6]
status: 'complete'
completedAt: '2026-05-17'
workflowType: 'implementation-readiness'
project_name: 'lms-platform'
user_name: 'Wissam'
date: '2026-05-16'
scope: 'PR2 — Refonte Module Documents (TabConventionDocs + Lot C signatures + hybride templates)'
inputDocuments:
  - bmad_output/planning-artifacts/prd-documents.md (PRD, complete, 584 lignes)
  - bmad_output/planning-artifacts/architecture.md (Architecture, complete, ~760 lignes)
  - bmad_output/planning-artifacts/epics-documents.md (Epics, complete, 18 stories MVP)
  - bmad_output/planning-artifacts/cadrage-module-documents.md (cadrage business, contexte)
missingDocuments:
  - UX Design (bmad-create-ux-design non exécuté) — limitation acceptée
---

# Implementation Readiness Assessment Report

**Date :** 2026-05-16
**Project :** lms-platform
**Scope :** PR2 — Refonte Module Documents

## Document Inventory

### Documents retenus pour assessment

| Type | Fichier | Statut | Notes |
|---|---|---|---|
| PRD | `prd-documents.md` | ✅ complete (584 lignes) | Module Documents — pertinent PR2 |
| Architecture | `architecture.md` | ✅ complete (760+ lignes) | Produit aujourd'hui via bmad-create-architecture 8 steps |
| Epics | `epics-documents.md` | ✅ complete (18 stories MVP) | Module Documents |
| Cadrage | `cadrage-module-documents.md` | ✅ validé 2026-05-15 | Contexte business additionnel |
| UX Design | — | ❌ absent | Limitation acceptée |

### Documents adjacents (hors scope PR2)

- `prd.md` (module Formations, scope séparé)
- `epics.md` (module Formations, scope séparé)
- `cadrage-module-formations.md` (contexte historique)

### Issues identifiés

- ⚠️ **UX Design manquant** : pas de `bmad-create-ux-design` exécuté. Pour PR2 (matrix UI + signature canvas + magic link page), UX spec aurait été utile. Mitigation : les décisions UI ont été tranchées dans Architecture Step 6 (DocumentMatrix, DocumentCell, etc.).
- ✅ Pas de duplicates stricts (les 2 PRD / 2 epics couvrent modules distincts).
- ✅ Architecture document produit à l'instant, status complete.

---

## PRD Analysis

Le PRD `prd-documents.md` (584 lignes, status complete) couvre le **module entier Génération de Documents** sur 5 Lots (A-E). Pour traçabilité fine, voir prd-documents.md sections §6-§8 (texte intégral). Synthèse :

### Functional Requirements (45 FRs total)

**Lot A — Moteur PDF unique (FR-DOC-1 à 7)** — ✅ déjà livré
- FR-DOC-1 : Interface `PDFEngine.render()`
- FR-DOC-2 : Hébergement Puppeteer Railway sidecar HTTP
- FR-DOC-3 : Capacités techniques (marges, header/footer, A4, polices, images, CSS print)
- FR-DOC-4 : Fallback CloudConvert automatique si Puppeteer 5xx/timeout 30s
- FR-DOC-5 : Variable env `PDF_ENGINE_PREFERENCE`
- FR-DOC-6 : Métrique `pdf_engine_used`
- FR-DOC-7 : Auto-pull Chromium au build Docker

**Lot A — Service de génération centralisé (FR-DOC-8 à 11)** — ✅ déjà livré
- FR-DOC-8 : `DocumentGenerationService.generate({docType, sourceTable, sourceId, ownerType?, ownerId?, options?})`
- FR-DOC-9 : Pipeline résolution template → variables → cache lookup → render → upload → INSERT
- FR-DOC-10 : Cache PDF hash SHA-256 sur `(template_id, sourceTable, sourceId, ownerType, ownerId, updated_at_compositekey)`
- FR-DOC-11 : Event `document_generated` structuré (entity_id, doc_type, latence_ms, file_size, engine_used, cache_hit)

**Lot B — Schéma documents unifié (FR-DOC-12 à 17)** — 🟡 partiellement à faire dans PR2 (sous-PR 2.2)
- FR-DOC-12 : Création table `documents` avec migration idempotente
- FR-DOC-13 : RLS `entity_isolation` sur `documents`
- FR-DOC-14 : Contrainte UNIQUE `(entity_id, source_table, source_id, doc_type, owner_type, owner_id)`
- FR-DOC-15 : Script backfill `generated_documents`, `formation_convention_documents`, `signatures`, `quote_signatures` → `documents` (idempotent)
- FR-DOC-16 : Double-write durant transition (rollback feature-flagué)
- FR-DOC-17 : Feature flag `USE_UNIFIED_DOCUMENTS_FOR_<doc_type>`

**Lot C — Service signature unifié (FR-DOC-18 à 23)** — ❌ à faire dans PR2 (sous-PR 2.4)
- FR-DOC-18 : `SignatureService.sign({documentId, signatureSvg, signerId?, token?, ipAddress, userAgent})`
- FR-DOC-19 : Sanitization SVG (suppression `<script>`, `<iframe>`)
- FR-DOC-20 : Idempotence (re-call doc signé → `{ok: true, already_signed: true}`)
- FR-DOC-21 : Audit trail complet (`signed_by`, `signed_at`, `signature_ip` INET, `signature_user_agent`, `signature_method` canvas/token)
- FR-DOC-22 : Régénération PDF après signature (cache invalidé via `signed_at` dans hash)
- FR-DOC-23 : Event `document_signed` (entity_id, document_id, doc_type, method, signer_role)

**Lot D — Import templates par lot (FR-DOC-24 à 29)** — ❌ à faire dans PR2 (sous-PR 2.1)
- FR-DOC-24 : Page `/admin/documents/import` drag-drop multi-fichiers .docx
- FR-DOC-25 : Détection variables `{{xxx}}` + comparaison avec `TEMPLATE_VARIABLES` + signalement inconnues
- FR-DOC-26 : Formulaire config per-file (nom, catégorie, `default_for_doc_type`)
- FR-DOC-27 : Upload .docx dans `formation-docs/templates/{entity_id}/{uuid}.docx` + INSERT `document_templates` avec `mode='docx_fidelity'`, `is_system=false`
- FR-DOC-28 : UPSERT si même `system_key` ou `name` (overwrite + log)
- FR-DOC-29 : Page `/admin/documents/how-to` (statique) explication 5 étapes

**Lot B — Résolution variables unifiée (FR-DOC-30 à 34)** — 🟡 partiellement (Lot A a fait base, à finir dans PR2 sous-PR 2.1)
- FR-DOC-30 : Fonction unique `resolveDocumentVariables(template, context)` (HTML + Word via docxtemplater)
- FR-DOC-31 : Catalogue `TEMPLATE_VARIABLES` source de vérité (key, label, category, description, availableIn, resolver)
- FR-DOC-32 : Variables nullish → chaîne vide (pas "undefined"/"null")
- FR-DOC-33 : Formatage dates français via date-fns (`dd MMMM yyyy`)
- FR-DOC-34 : Variables images base64 ou URL publique selon contexte

**Lot E — Suppression jsPDF legacy (FR-DOC-35 à 38)** — ❌ à faire dans PR2 (sous-PR 2.6) + PR3 séparée
- FR-DOC-35 : Suppression 5 fichiers `pdf-export.ts`, `invoice-pdf-export.ts`, `devis-pdf.ts`, `emargement-pdf-export.ts`, `qr-pdf-export.ts`
- FR-DOC-36 : Suppression imports `jspdf`, `jspdf-autotable`
- FR-DOC-37 : Cleanup `package.json` (retrait deps jspdf, html2canvas si plus utilisé)
- FR-DOC-38 : 0 cast `(doc as any).lastAutoTable.finalY`

**Lot E — Observabilité & tests (FR-DOC-39 à 42)** — 🟡 partiellement
- FR-DOC-39 : Events `document_generated`, `document_sent`, `document_signed`, `document_failed` via `logEvent()` JSON
- FR-DOC-40 : Tests E2E snapshot PDF (convention entreprise, attestation, émargement collectif)
- FR-DOC-41 : Test unitaire `DocumentGenerationService.generate()` (mock Supabase + PDFEngine)
- FR-DOC-42 : Test unitaire `SignatureService.sign()` (idempotence, sanitize SVG, audit)

**Post-MVP (FR-DOC-43 à 45)** — DD (Deferred)
- FR-DOC-43 : Versioning templates
- FR-DOC-44 : Intégration eIDAS-3 Yousign/Universign
- FR-DOC-45 : Génération asynchrone batch (50+ docs) avec progress bar + email

### Non-Functional Requirements (24 NFRs)

| Catégorie | IDs | Synthèse |
|---|---|---|
| **Performance (4)** | NFR-PERF-1/2/3/4 | Cache-hit <200ms, miss <5s, upload 20 .docx parallèle, backfill 10k lignes <5min |
| **Sécurité (6)** | NFR-SEC-1/2/3/4/5/6 | RLS `entity_isolation`, filtre `entity_id` partout, sanitize SVG, token signature expire 30j, auth Bearer Puppeteer, RLS Storage |
| **Fiabilité (5)** | NFR-REL-1/2/3/4/5 | Fallback CloudConvert auto, message erreur explicite si tout down, backfill idempotent, audit trail mutations, 0 catch silencieux |
| **Observabilité (3)** | NFR-OBS-1/2/3 | Sentry capture `document_failed`, Netlify Logs structurés, dashboard Supabase queries |
| **Maintenabilité (3)** | NFR-MAINT-1/2/3 | 0 cast `any`, JSDoc français, tests couverture ≥70% services + 100% helpers |
| **Coût (3)** | NFR-COST-1/2/3 | <10€/mois infra, ~0€/doc marginal, ≥80% cache hit rate |

### Additional Requirements (Contraintes / Compliance / Architecture / etc.)

**57 contraintes additionnelles** réparties en 11 catégories : TECH (8), REG (5), SCOPE (4), SUCCESS (12), DATA (5), EFFORT (3), RISKS (8 risques avec mitigations), VISION (4 long-terme), ARCH (5), INTEG (3).

**Compliance critique (REG) :**
- REG-1 : Qualiopi Critères 5+6 — rétention 10 ans, audit-trail signatures (qui/quand/IP), ZIP par formation
- REG-3 : RGPD — signatures chiffrées au repos (Storage natif), suppressibles sur demande (cascade FK)
- REG-4 : Code travail Art. L6353-2 — convention obligatoire >10h formation
- REG-5 : Signature électronique simple suffit pour conventions <10k€ et émargements (eIDAS niveau 1)

**Risques majeurs déjà identifiés (mitigations dans Architecture) :**
- Puppeteer down → fallback CloudConvert ✅
- Backfill perd des lignes → idempotent + dry-run staging + comptage avant/après ✅
- Templates Word Loris incompatibles → validateur variables upload (FR-DOC-25)
- Migration signatures casse audit Qualiopi → tables 90j conservées + backfill complet
- Régression visuelle conventions → snapshots tests + recette manuelle 5 sessions historiques

### PRD Completeness Assessment

| Dimension | Note | Commentaire |
|---|---|---|
| Couverture fonctionnelle | ✅ excellente | 45 FRs détaillés couvrant 5 Lots, MVP + Post-MVP |
| Couverture NFR | ✅ excellente | 24 NFRs sur 6 axes (perf/sec/rel/obs/maint/cost) avec critères mesurables |
| Critères acceptance | ✅ excellents | 12 critères SUCCESS (user/business/tech) chiffrés |
| Compliance | ✅ couverte | Qualiopi, RGPD, Code travail, eIDAS explicités |
| Architecture | ⚠️ partielle | 5 décisions ARCH dans PRD ; détail produit dans `architecture.md` séparé (notre nouveau doc) |
| Migration data | ✅ couverte | Stratégie progressive double-write + backfill idempotent + retention 90j |
| Risques + mitigations | ✅ couvert | 8 risques majeurs avec mitigations explicites |
| Test plan | ✅ couvert | FR-DOC-40/41/42 (snapshot, unit Service, unit Signature) |

**⚠️ Gap notable** : PRD ne mentionne pas explicitement le **plan de rollback migration data** (point Winston dans architecture Step 7 G2). À combler dans sous-PR 2.2.

---

## Epic Coverage Validation

### Coverage Matrix (FR → Epic/Story)

| FR ID | Epic | Story | Statut |
|---|---|---|---|
| FR-DOC-1 à 11 | Epic A | A1, A2 | ✅ Couverts (Lot A déjà livré) |
| FR-DOC-12 à 17 | Epic B | B1, B2, B3-B7 | ✅ Couverts |
| FR-DOC-18 à 23 | Epic C | C1, C3 | ✅ Couverts |
| FR-DOC-24 à 29 | Epic D | D1, D2 | ✅ Couverts |
| FR-DOC-30 à 34 | Epic B | B0 | ✅ Couverts |
| FR-DOC-35 à 38 | Epic E | E1 | ✅ Couverts |
| FR-DOC-39 à 40 | Epic E | E3, E4 | ✅ Couverts |
| FR-DOC-41 | Epic A | A2 (test unit DGS) | ✅ Couvert |
| FR-DOC-42 | Epic C | C1 (test unit SignatureService) | ✅ Couvert |
| FR-DOC-43 à 45 | — | — | ⏸️ Post-MVP intentionnellement hors scope |

### Mapping par Epic

| Epic | Stories | FRs couverts | Nombre |
|---|---|---|---|
| **Epic A** (Foundation PDF) | A1, A2 | FR-DOC-1 à 11, 41 | 12 FRs ✅ déjà livré |
| **Epic B** (Schéma documents + resolver) | B0 à B7 | FR-DOC-12 à 17, 30 à 34 | 17 FRs |
| **Epic C** (Signatures unifiées) | C1 à C3 | FR-DOC-18 à 23, 42 | 8 FRs |
| **Epic D** (Import templates) | D1, D2 | FR-DOC-24 à 29 | 6 FRs |
| **Epic E** (Cleanup + observabilité + tests) | E1 à E4 | FR-DOC-35 à 40 | 6 FRs |
| **Post-MVP** | — | FR-DOC-43 à 45 | 3 FRs (hors scope refonte) |
| **TOTAL MVP couvert** | **18 stories** | **42 / 42 FRs** | **100%** |

### Missing Requirements

**Aucun FR MVP manquant.** Les 3 FRs Post-MVP (FR-DOC-43 versioning templates, FR-DOC-44 eIDAS-3, FR-DOC-45 queue async batch) sont **intentionnellement hors scope refonte** — documentés dans PRD §7 et confirmés dans epics-documents.md lignes 94-97 et 751.

### Coverage Statistics

- **Total PRD FRs MVP** : 42
- **FRs couverts dans epics** : 42
- **Coverage percentage MVP** : **100%** ✅
- **FRs Post-MVP différés** : 3 (intentionnel, hors scope)
- **Stories total MVP** : 18

### Cross-référencement avec Architecture (PR2 sous-PRs)

| Sous-PR PR2 | Lot | Stories couvertes | FRs couverts |
|---|---|---|---|
| **2.1** | Lot B (resolver) + Lot D (import) | B0, D1 | FR-DOC-30/31/32/33/34, 24/25/26/27/28 |
| **2.2** | Lot B (migration data) | B1, B2 | FR-DOC-12/13/14/15/16/17 |
| **2.3** | Lot B (UI) | B3 (convention entreprise migrée) | + dépendances FR-DOC-30 etc |
| **2.4** | Lot C (signatures) | C1, C3 | FR-DOC-18/19/20/21/22/23, 42 |
| **2.5** | Mass ops (épic transverse) | — | (pas de FR PRD direct, dérivé du besoin UX) |
| **2.6** | Lot E (cleanup) | E1, E3, E4 | FR-DOC-35/36/37/38, 39, 40 |

**⚠️ Gap traçabilité identifié** : Mass operations (sous-PR 2.5) n'ont **pas de FR direct dans le PRD**. C'est une feature dérivée du besoin UX TabConventionDocs (boutons "Envoyer tous"). À ajouter au PRD ou justifier dans story dédiée.

---

## UX Alignment Assessment

### UX Document Status

**Not Found** — `bmad-create-ux-design` n'a pas été exécuté pour ce module.

### UX Implied?

✅ **OUI fortement implied** — Le PRD + Architecture contiennent de nombreuses décisions UI/UX :

| Source | UX implied |
|---|---|
| PRD §5 User Journeys | Mentionne Loris admin, Karim formateur (mobile émargement) |
| PRD §8.3 Architecture | Page `/admin/documents/import` drag-drop (FR-DOC-24) |
| PRD §8.5 Documents UX | Page `/admin/documents/how-to` statique (FR-DOC-29) |
| Architecture Step 6 | Matrix UI (apprenants × docs / entreprises × docs / formateurs × docs) |
| Architecture Step 6 | `DocumentMatrix` + `DocumentCell` + `DocumentActionsMenu` + `MassOperationsBar` + `SignatureRequestDialog` |
| Architecture Step 6 | Page magic link signature `/sign/[token]` (publique, react-signature-canvas) |
| Architecture Step 6 | Page Tiptap editor `/admin/documents/templates/[id]/edit` |

### Alignment Issues

| Issue | Sévérité | Notes |
|---|---|---|
| **Pas de wireframes / mockups** | 🟡 Medium | Les composants UI sont nommés et décrits, mais aucun wireframe formel. Pour PR2 sous-PR 2.3 (matrix refactor), risque d'aller-retours dev/produit si l'interprétation visuelle diverge. |
| **Pas de spec accessibilité (a11y)** | 🟡 Medium | Pas de WCAG level défini. Pour magic link signature page (publique apprenants), risque d'exclusion. |
| **Pas de responsive breakpoints** | 🟡 Medium | Magic link signature accessed mobile — pas de breakpoint formel défini. Mitigation : Tailwind responsive utility par défaut. |
| **Pas de user flow diagram** | 🟢 Low | Implicite dans Architecture cross-component dependencies (signature flow : admin → request → email → magic link → sign → audit) |

### Warnings

⚠️ **UX Design manquant pour module UI-heavy** : PR2 = gros refactor UI (matrix 3D + 3 nouvelles pages). Sans wireframes/user flows formels, risque divergence d'interprétation entre dev (toi/agents) et stakeholder (Loris). 

**Mitigation acceptable** :
- Architecture Step 6 a documenté la structure component (10+ composants nommés)
- TabConventionDocs **existe déjà** — c'est un refactor visuel léger, pas un build from scratch
- Magic link signature page → pattern standard (canvas + submit)
- Tiptap editor page → pattern standard d'éditeur

→ Verdict : **acceptable pour démarrer PR2**, mais Loris devra valider en preview avant merge de la sous-PR 2.3 (TabConventionDocs refactor).

### Recommandation post-PR2

Exécuter `bmad-create-ux-design` avant les **futurs modules UI-heavy** (ex : portail apprenant, dashboard analytics). Pour PR2 actuel, on s'en passe.

---

## Epic Quality Review

### Best Practices Compliance per Epic

#### Epic A — Infrastructure Moteur PDF & Service de génération
| Critère | Note | Notes |
|---|---|---|
| User value | 🟡 borderline | Pure technical foundation (PDFEngine + DocumentGenerationService). Acceptable en brownfield car débloque tout le reste. Outcome user inféré : génération PDF fiable + coût zéro marginal. |
| Epic indépendance | ✅ | Aucune dépendance d'autres epics |
| Story sizing | ✅ | A1 (2.5-3 j-h) + A2 (2.5-4 j-h) — chunks raisonnables |
| Forward deps | ✅ | A1 → A2 séquentiel intra-epic, pas de fwd vers epics futurs |
| ACs format | ✅ | Given/When/Then x 3-5 par story |
| Status | ✅ déjà livré | Lot A terminé en prod |

#### Epic B — Schéma documents unifié & migration des 11 types
| Critère | Note | Notes |
|---|---|---|
| User value | ✅ + technique | Migration progressive sans downtime + audit trail complet par doc |
| Epic indépendance | 🟠 **MAJOR** | **B5 (émargements) déclare dépendance sur C1 (signatures unifiées) → forward dependency cross-epic** |
| Story sizing | ✅ | 0.5-2 j-h par story |
| Forward deps intra-epic | ✅ | B0 → B3-B7, B1 → B2 → B3-B7 (séquence cohérente) |
| ACs format | ✅ | Given/When/Then x 2-3 par story |
| DB tables timing | ✅ | B1 crée `documents` quand needed, pas upfront |

#### Epic C — Signatures électroniques unifiées
| Critère | Note | Notes |
|---|---|---|
| User value | ✅ explicite | Apprenant signe, audit Qualiopi exploitable |
| Epic indépendance | ✅ | Dépend Epic B (acceptable car ordre A→B→C) |
| Story sizing | ✅ | 1-2 j-h par story |
| Forward deps | ✅ | C1 → C2 → C3 séquentiel cohérent |
| ACs format | ✅ | Given/When/Then x 3-5 par story |
| DB tables timing | ✅ | Réutilise `documents` créé en B1 |

#### Epic D — Import templates par lot & autonomie Loris
| Critère | Note | Notes |
|---|---|---|
| User value | ✅ explicite | "Loris autonome ajoute doc types en < 5 min" — outcome clair |
| Epic indépendance | ✅ | Dépend juste B1 (table) — quasi indépendant |
| Story sizing | ✅ | 0.5-1.5 j-h par story |
| Forward deps | ✅ | D1 → D2 séquentiel |
| ACs format | ✅ | Given/When/Then x 2-4 par story |
| DB tables timing | ✅ | Réutilise `document_templates` existante |

#### Epic E — Hygiène, observabilité, tests
| Critère | Note | Notes |
|---|---|---|
| User value | 🟡 borderline | Pure technique (cleanup + observabilité + tests). Acceptable car finalise refonte brownfield. Outcome user inféré : stabilité + maintenabilité long terme. |
| Epic indépendance | ✅ | Dépend A+B+C+D (dernière, cohérent) |
| Story sizing | ✅ | 0.5-1.5 j-h par story |
| Forward deps | ✅ | E1 dépend stabilité 90j (gate explicite) |
| ACs format | ✅ | Given/When/Then x 3-5 par story |
| DB tables timing | ✅ | E1 drop legacy après 90j transition + backup |

### Quality Findings par Sévérité

#### 🔴 Critical Violations
**Aucune.**

#### 🟠 Major Issues
**M1 — Forward dependency cross-epic : B5 → C1**
- **Localisation** : Story B5 (émargements) déclare "depends on C1 (signatures unifiées)" dans Epic B
- **Violation** : Epic B référence une story d'Epic C (futur)
- **Impact** : Si on suit strictement l'ordre Epic A → B → C → D → E, B5 ne peut pas être complété sans C1 qui appartient au futur Epic C
- **Remédiation acceptable** : C1 peut être livré pendant Epic B (parallèle) — le sequencing prévoit déjà "C peut démarrer après fin de B5"
- **Verdict** : violation théorique du principe, mais **mitigée par la stratégie de parallélisme documentée**. Le sprint plan devra explicitement séquencer : A1 → A2 → B0/B1 → B2 → B3-B4-B6-B7 (parallèle) → B5 + C1 (parallèle) → C2 → C3 → D1 → D2 → E1-E4

#### 🟡 Minor Concerns
**m1 — Epic A et Epic E sont des epics techniques (no direct user value)**
- En projet greenfield, ce serait inacceptable
- En **brownfield** (refonte), foundation technique (A) et hygiène finale (E) sont des patterns nécessaires et acceptables
- Verdict : **accepté**

**m2 — Mass operations (sous-PR 2.5 dans Architecture) n'ont pas de FR explicite dans PRD**
- Déjà flagué en Step 3 Coverage Validation
- À ajouter au PRD ou justifier dans story dédiée du sprint plan

**m3 — Story D2 (doc utilisateur how-to) peut être post-MVP**
- Pas critique pour démarrer prod si Loris n'importe pas de templates immédiatement
- Verdict : OK à garder dans MVP, mais peut être différé sans bloquant

### Brownfield Indicators (validation)

✅ **Stories de migration explicites** : B2 backfill, B3-B7 migration progressive
✅ **Double-write transition documenté** : 5 tables legacy conservées 90j parallèle
✅ **Feature flags rollback** : par doc_type pour granularité
✅ **Cleanup final isolé** : E1 dans dernier epic, attente 90j stabilité
✅ **Integration points existants** : `TabConventionDocs`, `email-attachments-resolver`, `InlineSignaturePad` clairement référencés

### Best Practices Compliance Matrix (récap)

| Epic | User value | Indep. | Sizing | Fwd deps | ACs | DB timing | Score |
|---|---|---|---|---|---|---|---|
| A | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ | 5/6 |
| B | ✅ | 🟠 M1 | ✅ | ✅ | ✅ | ✅ | 5/6 |
| C | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 6/6 |
| D | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 6/6 |
| E | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ | 5/6 |

**Global score : 27/30** — qualité élevée, 1 issue MAJOR documenté avec mitigation acceptable.

### Recommendations

1. **Sprint plan doit séquencer explicitement** B5 et C1 en parallèle (résout M1)
2. **Ajouter dans le PRD ou créer une story dédiée** pour mass operations (résout m2)
3. **Optionnel** : différer D2 (how-to) post-MVP si pression timing

---

## Summary and Recommendations

### Overall Readiness Status

# ✅ **READY FOR IMPLEMENTATION** — avec 3 actions à mener avant sprint planning

L'ensemble PRD + Architecture + Epics est **cohérent, complet à 100% MVP, et techniquement réaliste**. La complexité du projet (multi-tenant, brownfield, signatures eIDAS, migration data) est adressée avec rigueur. 1 issue MAJOR identifiée (forward dep B5→C1) avec mitigation acceptable via parallélisme documenté.

### Score Global

| Dimension | Score | Statut |
|---|---|---|
| **Coverage FRs MVP** | 42/42 (100%) | ✅ |
| **Coverage NFRs** | 24/24 documentées | ✅ |
| **Coverage Architecture** | 100% (8 steps validés) | ✅ |
| **UX Alignment** | partiel (no UX doc, mitigated) | 🟡 |
| **Epic Quality** | 27/30 (1 MAJOR mitigation OK) | ✅ |
| **Brownfield strategy** | bien documentée | ✅ |
| **Compliance (Qualiopi/RGPD/eIDAS)** | adressée | ✅ |

### Critical Issues Requiring Immediate Action

**Aucun blocker absolu.** Les 3 issues prioritaires à traiter AVANT sprint planning :

**🟠 ISSUE #1 — Forward dependency B5 → C1 (Epic B vers Epic C)**
- **Impact** : si on respecte l'ordre Epic A→B→C strict, B5 (émargements signés) ne peut être livré sans C1 (SignatureService)
- **Action** : sprint plan doit **explicitement séquencer** B5 et C1 en parallèle après A2+B1+B2
- **Effort** : aucun (juste séquencement dans sprint plan)

**🟡 ISSUE #2 — Gap traçabilité : Mass operations (sous-PR 2.5 dans Architecture)**
- **Impact** : feature documentée dans Architecture mais **pas dans PRD/Epics**
- **Action** : soit créer une nouvelle story F1 "Mass operations (batch ZIP + batch email)" dans Epic D ou nouvel Epic F, soit modifier PRD pour ajouter FR-DOC-46+
- **Effort** : ~30 min de doc + accord Wissam

**🟡 ISSUE #3 — Blockers Architecture G2 + G1 non-résolus**
- **G2** : Plan de rollback migration data (Winston gate)
- **G1** : Volume historique inconnu (`SELECT COUNT(*) FROM formation_convention_documents`)
- **Action** : à produire avant sous-PR 2.2 (migration data)
- **Effort** : G1 = 5 min query ; G2 = ~1h documentation procédure

### Recommended Next Steps

1. **[BLOQUANT pour sprint planning]** Résoudre ISSUE #2 (Mass operations) : décider si nouvelle story ou modif PRD. Si modif PRD : créer FR-DOC-46/47/48 puis re-vérifier Epic coverage.
2. **[BLOQUANT pour sous-PR 2.2]** Résoudre ISSUE #3 (plan rollback + volume historique) : 
   - Lancer query volume sur prod ou staging
   - Documenter procédure rollback migration data
3. **[Mitigation séquencement]** Le sprint plan doit lister explicitement les stories parallélisables : A1 → A2 → (B0 // B1) → B2 → (B3 // B4 // B6 // B7) puis (B5 // C1) → C2 → C3 puis (D1 // E2 // E3 // E4) puis D2 puis E1.
4. **[Recommandé non bloquant]** TODOs métier Mary à consulter avec Loris quand possible :
   - Volume Tiptap usage (peut tuer ou réduire scope Epic D Story D2)
   - OPCO format exigences (peut ajouter scope post-MVP)
   - Co-traitants conventions
5. **[Recommandé non bloquant]** Exécuter `bmad-create-ux-design` post-PR2 pour futurs modules UI-heavy.

### Final Note

Cette assessment a identifié **3 issues actionables** (1 MAJOR + 2 MINOR) sur **6 catégories** analysées. Les findings montrent une **planification de qualité supérieure** : 100% FRs MVP couverts, architecture validée par Party Mode multi-agents, brownfield strategy documentée avec rollback granulaire.

**Tu peux procéder en confiance** à `bmad-sprint-planning` pour produire le sprint plan qui adressera explicitement les 3 issues ci-dessus dans son séquencement.

**Date assessment** : 2026-05-16/17
**Assessor** : Wissam (proxy Loris VICHOT) + Claude Opus 4.7 (multi-agents BMad)

---

## Resolution Log

### 2026-05-17 — ISSUE #2 résolue

**Action** : Mass Operations formellement intégrées au PRD et Epics avant sprint planning.

**Changes** :
- **`prd-documents.md`** §7.9 nouveau : **FR-DOC-46/47/48** (Mass download ZIP, Mass send email, Mass signature request)
- **`prd-documents.md`** §7.10 (ex 7.9) : Post-MVP renuméroté FR-DOC-49/50/51 (versioning templates, eIDAS-3, queue async batch >200 docs)
- **`epics-documents.md`** : **Epic F nouveau** avec 3 stories (F1/F2/F3, 3.5-5 j-h total)
- **`epics-documents.md`** FR Coverage Map : mis à jour, **48 FRs MVP couverts par 21 stories** (vs 42/18 avant)

**Impact effort total** : 24-33 j-h → **27.5-38 j-h** (+3.5-5 j-h pour Epic F)

**Status final** : **ISSUE #2 fermée**. Reste à traiter ISSUE #3 (G1+G2) avant démarrage sous-PR 2.2 — mais pas avant sprint planning.

**Coverage finale** : **100% des 48 FRs MVP couverts** (was 100% des 42 FRs MVP). 3 FRs Post-MVP (FR-DOC-49/50/51) intentionnellement hors scope.

### Score final post-résolution

| Dimension | Score | Statut |
|---|---|---|
| Coverage FRs MVP | 48/48 (100%) | ✅ |
| Coverage NFRs | 24/24 | ✅ |
| Architecture | 100% (8 steps) | ✅ |
| Epic Quality | 27/30 (1 MAJOR mitigation OK, m2 Mass ops RÉSOLU) | ✅ |
| Traçabilité PRD↔Epics↔Architecture | 100% | ✅ |

**Prêt à enchaîner `bmad-sprint-planning`.**
