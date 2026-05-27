# Deep-Dive — Page admin `/admin/documents` (LMS MR/C3V Formation)

> **Date** : 2026-05-27
> **Branche** : `main` à `b5fe03c` (post-merge Sous-chantier 4 Émargement Volet E)
> **Auteur** : audit BMAD `document-project`
> **Périmètre lu** : 4 pages dashboard (3 141 LOC), 129 routes API `/api/documents/*`,
> 38 templates HTML système (8 037 LOC), 2 services (514 + 193 LOC),
> 1 hook (145 LOC), 5 migrations SQL, 3 tables Supabase actives,
> 3 listes de constantes côté composant (12 + 3 + 14 entrées).
> **Contexte user** (Wissam, verbatim) : *"C'est une catastrophe il faut tout repenser."*
> Priorités explicitement cochées : **UX confuse + doublons templates**.
> Explicitement **non** prioritaires : refacto archi (2 340 LOC), perf, bugs purs.

---

## 0. Synthèse exécutive (10 lignes)

`/admin/documents` est **fonctionnel à ~55 %** : la machinerie marche (upload .docx,
édition Tiptap, génération PDF via CloudConvert, envoi worker queue) mais la
**surface visible** est devenue une mosaïque de **trois systèmes empilés** sans
ménage de cohérence :

1. **Templates officiels hardcodés dans la page** (constante `OFFICIAL_TEMPLATES`, 12 entrées,
   décorrélée du registry système `SYSTEM_TEMPLATES_BY_DOC_TYPE` qui en a 39).
2. **Templates système HTML** (38 fichiers dans `src/lib/templates/`) — **invisibles
   à l'admin** sauf via cliquage "Aperçu" depuis un onglet bien caché.
3. **Templates custom DB** (`document_templates` table, mode `editable` ou
   `docx_fidelity`), peuplée par 3 chemins différents (création vierge, "Utiliser
   comme base", import .docx) qui n'aboutissent pas au même résultat.

**Score global : 4.5 / 10.** Le module est techniquement vivant, le code respecte
le filtre `entity_id` sur les lectures principales (3 violations résiduelles, voir §6),
mais le **modèle mental est cassé** côté UX : 3 listes de constantes en doublon,
4 onglets ambigus, 2 pages satellites (`how-to/`, `import/`) **non liées depuis
la racine** (orphelines), vocabulaire flottant (`certificat` vs `certificat_realisation`
vs `certificat_diplome`, `convention` vs `convention_entreprise`, `attestation` vs
`attestation_assiduite`, `decharge` vs `lettre_decharge`). **Verdict honnête :
"tout repenser" est une exagération côté code (la plomberie marche),
mais "tout repenser" côté IA = oui, l'admin perd 30+ minutes à comprendre
quoi cliquer pour la première fois.**

**Top 3 problèmes critiques** :
1. **Doublons sémantiques massifs** : `OFFICIAL_TEMPLATES` (page racine) vs `DOC_TYPE_OPTIONS`
   (page import) vs `SYSTEM_TEMPLATES_BY_DOC_TYPE` (registry) vs `STARTER_TEMPLATES` (page
   racine) — 4 listes décorrélées qui couvrent ~80 % les mêmes documents avec des
   clés différentes (`certificat` vs `certificat_realisation`, `convention` vs
   `convention_entreprise`, `attestation` vs `attestation_assiduite`).
2. **Pages satellites orphelines** : `/admin/documents/how-to` et `/admin/documents/import`
   ne sont **pas linkées** depuis la racine `/admin/documents`. Seul `variables/` a un
   lien microscopique en header. L'utilisateur ne peut PAS découvrir ces pages.
3. **Onglet "Templates officiels" trompeur** : les 12 entrées hardcodées sont des
   **stubs visuels** (objets `OfficialTemplate` en mémoire) sans contenu, sans ID DB.
   "Aperçu" appelle le registry système, "Utiliser comme base" crée un clone DB,
   mais les 2 boutons font des choses radicalement différentes sans signalisation
   visuelle de cette différence.

---

## 1. Inventaire technique exhaustif

### 1.1 Les 4 pages

| Fichier | LOC | Responsabilité | État local |
|---|---|---|---|
| `documents/page.tsx` | **2 340** | Cœur : 4 onglets, 4 dialogs, CRUD templates, génération `generated_documents`, envoi par worker | **27 useState** : `templates`, `templatesLoading`, `templateSearch`, `typeFilter`, `generatedDocs`, `docsLoading`, `docSearch`, `sessions`, `clients`, `learners`, `activeTab`, `templateDialogOpen`, `showStarterPicker`, `editingTemplate`, `templateForm`, `saving`, `defaultDialog`, `defaultDocTypeChoice`, `savingDefault`, `detectedVariables`, `detectingVariables`, `sendDialogOpen`, `sendDialogTemplate`, `sendStep`, `sendTargetType`, `sendLearnerId`, `sendSessionId`, `sendSubject`, `sendBody`, `sending`, `deleteDialogOpen`, `templateToDelete`, `deleting`, `generateDialogOpen`, `generateForm`, `generating`, `previewContent`, `showPreview`, `sigAvailability`, `previewDialogOpen`, `previewTemplate`, `clientDocs`, `clientDocsLoading`, `clientDocSearch` |
| `documents/how-to/page.tsx` | 262 | Guide pas-à-pas (5 étapes) pour upload custom .docx + assistant troubleshooting | `none` (page 100% statique) |
| `documents/variables/page.tsx` | 167 | Catalogue 83 variables `[%…%]` (filtre par catégorie + search + copy-to-clipboard) | 2 useState : `search`, `activeCategory` |
| `documents/import/page.tsx` | 372 | Upload batch .docx/.doc/.pdf vers `/api/documents/templates/import` (drag-drop + queue UI) | 3 useState : `uploads`, `isUploading`, `isDragOver` |
| **Total** | **3 141** | | |

### 1.2 Architecture des 4 onglets de `page.tsx`

| Onglet | `value` | Contenu | Source de données |
|---|---|---|---|
| **Templates officiels** | `official` | 12 cards groupées par catégorie (Apprenant / Entreprise / Formateur / Commun) | Constante hardcodée `OFFICIAL_TEMPLATES` (page.tsx:176-193) |
| **Mes modèles** | `custom` | Grid cards des templates DB où `is_system === false`. CRUD complet. | `supabase.from("document_templates").select("*")` |
| **Documents générés** | `generated` | Tableau groupé par type (Contrat/Certificat/Émargement/Facture/Autre) | `supabase.from("generated_documents")` |
| **Documents clients** | `client-docs` | Tableau groupé par client (BPF, contrats…) | `supabase.from("client_documents")` |

3 boutons "actions rapides" en haut de page (avant les onglets) :
1. **Importer un document Word** (`handleImportDocx` — input file picker inline)
2. **Créer un modèle vierge** (`openAddTemplate` — ouvre starter picker)
3. **Envoyer à un apprenant** (`setActiveTab("custom")` + toast — **NON-FONCTIONNEL** :
   le bouton change juste d'onglet et affiche un toast, l'admin doit alors trouver
   un modèle et cliquer "Envoyer" depuis sa card).

### 1.3 Composants sous-jacents

| Composant | Fichier | LOC | Rôle |
|---|---|---|---|
| `BackToFormationLink` | `src/components/ui/back-to-formation-link.tsx` | 38 | Breadcrumb conditionnel via query params `from=formation&from_id=…` |
| `RichTextEditor` (Tiptap) | `src/components/editor/RichTextEditor.tsx` | ~80 | Éditeur HTML pour mode `editable`. Variables passées depuis page.tsx |
| `EditorToolbar` | `src/components/editor/EditorToolbar.tsx` | ? | Barre d'outils variable picker pour Tiptap |
| `VariableNode` (Tiptap extension) | `src/components/editor/extensions/variable-node.ts` | ? | Custom node pour rendre `{{xxx}}` dans Tiptap |
| `IncompleteDataDialog` | `src/components/dialogs/IncompleteDataDialog.tsx` | ? | Affichée sur 422 INCOMPLETE_DATA depuis `useDocumentGeneration` (pas utilisée dans `/admin/documents` directement — c'est pour TabConventionDocs) |

**Aucun sous-composant dédié** à `/admin/documents` (pas de dossier `_components/`).
Tout le code des 4 onglets + 4 dialogs vit dans le seul fichier `page.tsx` 2 340 LOC.
Pattern divergent vs autres pages admin qui découpent (cf. `formations/[id]/_components/`).

### 1.4 Routes API `/api/documents/*` — inventaire complet

**Total : 129 endpoints** sous `/api/documents/`. Pattern strict :

| Pattern | Compte | Exemples |
|---|---|---|
| `generate-{doc_type}` (individuel) | ~33 | `generate-convention`, `generate-convocation`, `generate-attestation-aipr` |
| `generate-{doc_type}-mock` (preview admin pour vérifier le rendu) | **32** | `generate-convocation-mock`, `generate-attestation-aipr-echec-mock` (1 cas spécifique : mock pour scénario d'échec AIPR) |
| `generate-{doc_type}s-batch` (génération masse pour toute la session) | **50** | `generate-convocations-batch`, `generate-attestations-competences-batch` |
| `send-{doc_type}s-batch-email` (envoi worker queue) | **23** | `send-conventions-batch-email`, `send-attestations-aipr-batch-email` |
| Signature (token + sign + reminders) | 5 | `sign`, `sign-request`, `sign-status`, `signature-request-batch`, `process-sign-reminders` |
| **Utilitaires globaux** | 7 | `generate`, `generate-from-template` (route pivot), `preview-docx`, `extract-docx-variables`, `upload-template`, `track-view`, `send-to-recipient`, `attribute-secondary`, `templates/import` |

**Découpage critique** : la route `generate-from-template` (POST `/api/documents/generate-from-template`)
est le **point d'entrée unifié** appelé par le hook `useDocumentGeneration`. Elle résout :
1. `template_id` ou `doc_type` → `SystemTemplate` (registry) ou `document_templates` row
2. `context` (session/learner/client/trainer IDs) → `ResolveContext` complet
3. Validation Qualiopi (variables manquantes → 422 INCOMPLETE_DATA si `qualiopiBlocking: true`)
4. Rendu HTML + footer via `resolveDocumentVariables`
5. `DocumentGenerationService.generate()` → cache lookup → engine (Puppeteer / CloudConvert)
6. Retour `{ base64, filename, cached, warnings }`

**Goulot fréquent** : les routes `generate-{type}` individuelles dupliquent en partie ce flow,
créées avant l'unification. Plusieurs auraient pu disparaître au profit de `generate-from-template`
mais sont conservées pour compatibilité avec les call sites Story F1.x/F2.x (cf. deep-dive TabConventionDocs).

### 1.5 Services + helpers

| Fichier | LOC | Rôle |
|---|---|---|
| `src/lib/services/documents-store.ts` | **514** | CRUD unifié table `documents` (nouvelle table B1). Mapping `documents` row ↔ legacy `FormationConventionDocument` shape pour compat UI. Exports : `getDocsForSession`, `insertDocs`, `markDocConfirmed`, `markDocSent`, `markDocSigned`, `setSignatureTracking`, `incrementReminderCount`, etc. **Aucun usage direct par `/admin/documents/page.tsx`** (cette page parle encore à `generated_documents` ancienne table). |
| `src/lib/services/document-generation.ts` | 193 | `DocumentGenerationService` : cache lookup PDF (bucket `pdf-cache`) → engine PDF (Puppeteer/CloudConvert via FallbackEngine) → upload cache → metrics. |
| `src/lib/services/docx-converter.ts` | 115 | Conversion .docx → PDF via CloudConvert (LibreOffice backend). |
| `src/lib/services/doc-extraction.ts` | ? | Extraction texte / variables depuis .docx. |
| `src/lib/utils/resolve-variables.ts` | **1 641** | Cœur du resolver : 83 variables `[%…%]`/`{{…}}`, `ResolveContext`, fonctions helpers (formatDate, formatMoney, signatures inline…). |
| `src/lib/utils/document-status.ts` | 32 | `mapStatusToFlags()` : status `documents.status` → flags `is_confirmed/is_sent/is_signed`. |
| `src/lib/utils/batch-doc-download.ts` | 119 | Helper client-side : génère PDF en boucle pour tous les apprenants d'une session. |
| `src/lib/utils/batch-doc-send.ts` | 98 | Helper client-side : envoie email en boucle. |
| `src/lib/utils/batch-doc-signature-request.ts` | 73 | Helper client-side : demande signature en boucle. |
| `src/lib/templates/registry.ts` | 483 | Registry centralisé `SYSTEM_TEMPLATES_BY_DOC_TYPE` (39 entrées), function `renderSystemTemplate(docType, data)`. |
| `src/lib/template-variables.ts` | 167 | Catalogue 83 variables typées (categorie, label, exemple, availableIn) consommé par `documents/variables/page.tsx`. |
| `src/lib/migrate-templates.ts` | ? | Helpers `plainTextToHtml`, `isHtmlContent`. |
| `src/lib/pdf-export.ts` | ? | `exportToPDF`, `exportHtmlToPDF` (client-side jsPDF). |
| **Total services + utils** | **~3 600** | |

### 1.6 Hooks personnalisés

| Hook | Fichier | LOC | Usage `/admin/documents` |
|---|---|---|---|
| `useDocumentGeneration` | `src/hooks/useDocumentGeneration.tsx` | 145 | **NON utilisé** dans `/admin/documents/page.tsx`. Page racine appelle `supabase.from("generated_documents").insert(...)` en direct (legacy). Le hook est réservé à TabConventionDocs et test-convention. |
| `useDebounce` | `src/hooks/useDebounce.ts` | ? | Non utilisé dans `/admin/documents`. |

### 1.7 Templates HTML système — inventaire exhaustif

**38 fichiers** dans `src/lib/templates/` totalisant **8 037 LOC**.

| Catégorie | Fichiers | Mapping `doc_type` registry |
|---|---|---|
| **Qualiopi essentiels (5)** | `convocation-apprenant.ts`, `certificat-realisation.ts`, `attestation-assiduite.ts`, `emargement-individuel.ts`, `emargement-collectif.ts` | `convocation`, `certificat_realisation`, `attestation_assiduite`, `feuille_emargement`, `feuille_emargement_collectif` |
| **Conventions (2)** | `convention-entreprise.ts`, `convention-intervention.ts` | `convention_entreprise`, `convention_intervention` |
| **Documents communs (4)** | `cgv.ts`, `reglement-interieur.ts`, `politique-rgpd.ts`, `programme-formation.ts` | `cgv`, `reglement_interieur`, `politique_confidentialite`, `programme_formation` |
| **Émargements vierges/planning (2)** | `feuille-emargement-vierge.ts`, `planning-hebdo-signe.ts` | `feuille_emargement_vierge`, `planning_hebdo_signe` (+ alias `planning_semaine`) |
| **Habilitations électriques (9 variantes)** | `avis-habilitation-electrique.ts` + 8 spécialisations (`-b0-bf-bs`, `-b1v-b2v-br`, `-bf-hf`, `-bt`, `-bt-ht`, `-h0-b0`, `-h0-b0-bf-hf-bs`, `-h0-b0-initial`) | `avis_hab_elec_generique`, `avis_hab_elec_b0_bf_bs`, etc. (9 entrées registry) |
| **Attestations métier (4)** | `attestation-aipr.ts`, `attestation-competences.ts`, `attestation-abandon-formation.ts`, `certificat-travail-hauteur.ts` | `attestation_aipr`, `attestation_competences`, `attestation_abandon_formation`, `certificat_travail_hauteur` |
| **Documents administratifs (5)** | `certificat-diplome.ts`, `autorisation-image.ts`, `decharge-responsabilite.ts`, `lettre-decharge-responsabilite.ts` ⚠, `charte-formateur.ts`, `contrat-engagement-stagiaire.ts` | `certificat_diplome`, `autorisation_image`, `decharge_responsabilite`, `lettre_decharge_responsabilite`, `charte_formateur`, `contrat_engagement_stagiaire` |
| **Pédagogie / Évaluation (4)** | `bilan-poe.ts`, `reponses-evaluations.ts`, `reponses-satisfaction-session.ts`, `resultats-evaluations.ts` | `bilan_poe`, `reponses_evaluations`, `reponses_satisfaction_session`, `resultats_evaluations` |
| **Catalogue secondaires** | `secondary-categories.ts` | 204 LOC : taxonomie pour SecondaryDocCatalogDialog (h-22) |
| **Registry** | `registry.ts` | 483 LOC : 39 entrées `SYSTEM_TEMPLATES_BY_DOC_TYPE` |

**Doublons concrets identifiés** :

1. **`decharge-responsabilite.ts` (144 LOC) vs `lettre-decharge-responsabilite.ts` (150 LOC)** :
   les **deux fichiers** portent le titre HTML `<title>Lettre de décharge de responsabilité</title>`
   et `<h1 class="title">Lettre de décharge de responsabilité</h1>`. Le registry expose
   **les deux** comme `doc_type` distincts (`decharge_responsabilite` et `lettre_decharge_responsabilite`).
   **Verdict : doublon réel à supprimer.** Probablement issu d'un refactor à mi-chemin.

2. **`emargement-individuel.ts` vs `feuille-emargement-vierge.ts` vs `emargement-collectif.ts`** :
   3 fichiers émargement, mais sémantiques différentes (individuel signé / vierge à imprimer /
   collectif). Pas un doublon à dropper — confusion utilisateur possible mais légitime.

3. **Famille attestations (4 fichiers)** : `attestation-assiduite` (Qualiopi),
   `attestation-aipr` (métier), `attestation-competences` (métier), `attestation-abandon-formation`
   (cas spécifique). Pas de doublon technique mais l'utilisateur lit "Attestation d'assiduité"
   ×2 dans certains contextes parce que :
   - L'admin voit "Attestation d'assiduité" dans OFFICIAL_TEMPLATES (page racine, onglet 1)
   - L'admin voit aussi "Attestation d'assiduité" dans le dropdown import (`DOC_TYPE_OPTIONS.value = "attestation"`, label "Attestation d'assiduité")
   - **C'est la même chose**, mais l'admin ne le sait pas et croit avoir 2 entrées (verbatim Wissam).

4. **Famille certificats (3 fichiers)** : `certificat-realisation`, `certificat-travail-hauteur`,
   `certificat-diplome`. Plus le STARTER_TEMPLATES.id="certificat" (starter générique mini-HTML
   de 5 lignes pour la création d'un nouveau template). **C'est le doublon "Certificat de réalisation ×2"
   de Wissam** : il voit "Certificat de réalisation" en card OFFICIAL_TEMPLATES + "Certificat de réalisation"
   dans le starter picker, sans comprendre que ce sont deux concepts différents (1 stub visuel
   vs 1 contenu HTML de départ pour personnaliser).

5. **Famille conventions (2 fichiers + 1 starter)** : `convention-entreprise`,
   `convention-intervention`, + STARTER_TEMPLATES.id="convention" (contenu minimal). **C'est
   le doublon "Convention de formation ×2"**. Le STARTER "Convention de formation" ne mappe
   à RIEN dans le registry — il sert juste de point de départ pour créer un template custom
   from scratch. Mais l'admin lit "Convention de formation" ET "Convention entreprise" ET
   "Convention intervention" et est perdu sur la sémantique.

**Templates orphelins** (présents dans `src/lib/templates/` mais **non référencés par OFFICIAL_TEMPLATES** et donc invisibles depuis l'onglet "Templates officiels") :

- `attestation-aipr`, `attestation-competences`, `attestation-abandon-formation`
- `avis-habilitation-electrique` et ses 8 variantes
- `autorisation-image`, `decharge-responsabilite`, `lettre-decharge-responsabilite`
- `bilan-poe`, `charte-formateur`, `contrat-engagement-stagiaire`
- `certificat-travail-hauteur`, `certificat-diplome`
- `feuille-emargement-vierge`, `planning-hebdo-signe`
- `reponses-evaluations`, `reponses-satisfaction-session`, `resultats-evaluations`

→ **27 templates système existent mais ne sont PAS exposés** dans la page racine `/admin/documents`.
Ils sont accessibles uniquement depuis `TabConventionDocs` (catalogue secondaires) ou la
page `test-convention`. Si l'admin veut générer une `attestation_aipr` depuis cette page,
il ne peut pas — l'onglet "Templates officiels" ne la liste pas.

**Templates manquants** :

- Pas de template "Facture" système (alors que `TYPE_LABELS.invoice = "Facture"` est listé partout).
  L'admin qui filtre sur "Facture" n'a aucune entrée par défaut.
- Pas de template "Devis" système (présent dans `DOC_TYPE_OPTIONS` import → "devis" — orphelin).
- Pas de "Bon de commande", "Bon de livraison", "Reçu" — workflows compta absents.

### 1.8 Tables Supabase

| Table | LOC schéma | Colonnes critiques | entity_id ? | Relations |
|---|---|---|---|---|
| `document_templates` | 292-300 + 5 migrations | `id`, `entity_id` (NOT NULL), `name`, `type`, `content`, `variables` JSONB, **`is_system`** BOOL, **`system_key`** TEXT, **`source_docx_url`**, **`source_docx_path`**, **`mode`** (`editable`/`docx_fidelity`/`pdf_fidelity`), **`default_for_doc_type`** TEXT, `uploaded_at`, `uploaded_by` | ✅ Direct (FK CASCADE) | RLS multi-tenant OK |
| `generated_documents` | 305-315 | `id`, `template_id` (FK), `session_id`, `client_id`, `learner_id`, `name`, `content`, `file_url`, `created_at` | **❌ Pas de colonne entity_id directe** | Filtrage entity_id transite par `template_id → document_templates.entity_id` ; **fragile** côté code applicatif |
| `client_documents` | 1019-1057 | `id`, `client_id` (FK), `name`, `type` (`contract/agreement/invoice/quote/bpf/certificate/other`), `file_url`, `notes`, `created_at` | **❌ Pas de colonne entity_id directe** | Filtrage transite par `client_id → clients.entity_id` ; RLS le fait, mais la query côté page.tsx ne re-filtre **PAS** explicitement |
| `documents` (table unifiée B1) | migration `add_documents_unified_table.sql` | `id`, `entity_id` NOT NULL, `doc_type`, `template_id`, `source_table` (sessions/quotes/invoices/enrollments), `source_id`, `owner_type` (learner/company/trainer/session/client/financier), `owner_id`, `status` (draft/generated/sent/signed/cancelled), `metadata` JSONB | ✅ Direct | **Coexiste avec `generated_documents` + `formation_convention_documents`** pendant phase B (90j shadow). `/admin/documents/page.tsx` n'utilise **PAS** cette table. |

### 1.9 Migrations SQL touchant document_templates

| Migration | Effet |
|---|---|
| `add_document_templates_system.sql` (2026-04-03) | Ajoute `is_system`, `system_key`, `source_docx_url`. Seed 11 templates système par entité. |
| `add_document_templates_mode.sql` | Ajoute `mode` (`editable`/`docx_fidelity`) + `source_docx_path`. |
| `add_document_templates_import_fields.sql` | Champs liés à l'import (uploaded_at, uploaded_by). |
| `add_default_document_templates.sql` | Seed initial. |
| `add_default_for_doc_type.sql` | Ajoute `default_for_doc_type` TEXT + UNIQUE INDEX `(entity_id, default_for_doc_type)`. |
| `add_documents_unified_table.sql` | Crée la nouvelle table `documents` (en parallèle pour l'instant). |

---

## 2. Audit UX / Parcours utilisateur — section prioritaire

### 2.1 Parcours A — "Je veux ajouter un document personnalisé"

**Réalité observée** (l'admin part de `/admin/documents`) :

1. La racine affiche **3 boutons "actions rapides"** au-dessus des onglets :
   "Importer un document Word", "Créer un modèle vierge", "Envoyer à un apprenant".
2. Il y a aussi un **onglet "Mes modèles"** avec un bouton secondaire "Nouveau modèle" +
   "Importer .docx" en haut à droite.
3. → **3 chemins différents** pour "créer un template custom" :
   - **A.1** Bouton "Importer un document Word" (racine) → input file → `upload-template` API
     → state interne `mode: "docx_fidelity"` → dialog d'édition de métadonnées (nom + type) +
     iframe d'aperçu PDF du .docx + panneau de droite "Variables disponibles" → bouton "Créer".
   - **A.2** Bouton "Créer un modèle vierge" (racine) → ouvre `templateDialogOpen=true` +
     `showStarterPicker=true` → écran de choix (3 starters + page vierge) → après choix,
     ouvre l'éditeur Tiptap → bouton "Créer".
   - **A.3** Page satellite `/admin/documents/import` → drag-drop batch .docx/.doc/.pdf →
     `/api/documents/templates/import` (route séparée, pas la même que A.1 qui appelle
     `/api/documents/upload-template`).

**Verdict : 🚨 cassé / confus**.

- **3 actions "créer un template" qui font des choses légèrement différentes**, exposées
  sans hiérarchie ni signalisation visuelle de "quand utiliser laquelle".
- A.1 appelle `/api/documents/upload-template` ; A.3 appelle `/api/documents/templates/import`
  qui upload AUSSI une seule fois (boucle interne) — **les deux endpoints existent en
  parallèle** avec ~80 % de code dupliqué.
- La page satellite A.3 (`/admin/documents/import`) est **orpheline** : aucun lien depuis
  la racine `/admin/documents`, pas de breadcrumb, pas de tab. Découverte uniquement
  via `/admin/documents/how-to/page.tsx:163` (qui est elle-même orpheline) ou en tapant
  l'URL directement.
- Le starter picker A.2 propose 3 templates (`convocation`, `convention`, `certificat`)
  mais ces 3 starters mappent à des starters HTML minimaux de 5 lignes, **pas** aux beaux
  templates système 200+ LOC du registry. L'admin qui pense créer "une nouvelle Convocation
  inspirée de la convocation officielle" obtient en réalité un mini-HTML de 5 lignes
  totalement décorrélé du beau template Loris.

**Clicks utilisateur naïf pour "créer ma convention personnalisée à partir de la convention officielle"** :
1. Arrive sur `/admin/documents`
2. Voit "Templates officiels" / "Mes modèles" → comprend qu'il faut partir d'un officiel
3. Clique l'onglet "Templates officiels" → trouve "CONVENTION ENTREPRISE" card
4. Voit boutons "Aperçu" et "Utiliser comme base" → clique "Utiliser comme base"
5. Le code (page.tsx:1176-1207) : appelle `renderSystemTemplate("convention_entreprise", demoData)`,
   INSERT dans `document_templates` avec `system_key="convention_entreprise"` + le HTML résolu
   sur **données démo** (formation fictive "Marseille", apprenant fictif), bascule sur l'onglet
   "Mes modèles", ouvre l'éditeur de cette nouvelle entrée.
6. L'admin se retrouve dans Tiptap avec du HTML pré-rempli **basé sur des données démo**
   ("Marseille", "Jean Martin"…) qu'il doit nettoyer manuellement avant d'insérer ses
   propres variables `{{…}}`.

**Total clicks : 5-6, mais résultat partiellement faux** (données démo dans le HTML).

### 2.2 Parcours B — "Je veux générer un nouveau document depuis un template"

**Réalité observée** :

1. **Bouton "Envoyer à un apprenant"** (action rapide 3) → setActiveTab("custom") + toast
   "Choisissez un modèle". L'admin doit alors trouver un modèle dans l'onglet "Mes modèles"
   et cliquer "Envoyer" sur sa card. → **Step inutile** : pourquoi ne pas afficher direct
   un picker de modèle ?
2. Sinon, sur chaque card de "Mes modèles", **2 boutons** : "Aperçu" + "Envoyer".
3. Bouton "Envoyer" → `openSendDialog(template)` → modal 2 étapes :
   - Étape 1 : choix destinataire (un apprenant / une session entière) + sujet + corps email
   - Étape 2 : récap + bouton "Confirmer l'envoi" → POST `/api/documents/send-to-recipient`
4. Le worker traite l'envoi async (toast "5 min max").

**Verdict : ⚠ confus** mais **fonctionnel**.

Le workflow Envoyer est cohérent et le dialog 2-étapes est bien fait. **Mais** :
- Il n'y a **aucun moyen depuis l'onglet "Templates officiels"** d'envoyer directement un
  document officiel à un apprenant. Le bouton "Utiliser comme base" force la création d'un
  template custom intermédiaire — étape gaspillée pour 80 % des cas (l'admin veut le doc
  officiel tel quel).
- **Le dialog "Générate Document"** (page.tsx:2165-2319) existe mais n'est jamais ouvert
  depuis l'UI ! `openGenerateDialog` n'est pas appelé. C'est du **code mort** : ~155 LOC
  de dialog (form template+name+session+client+learner+preview signature avail) **branché
  sur rien**. Probablement vestige d'une version précédente de l'UX.

### 2.3 Parcours C — "Je veux modifier un template existant"

**Réalité observée** :

1. Onglet "Mes modèles" → card → menu kebab → "Modifier" → `openEditTemplate(t)` → dialog d'édition
   - Si `mode === "editable"` : éditeur Tiptap + preview HTML live
   - Si `mode === "docx_fidelity"` : iframe aperçu PDF + assistant variables (pas d'édition côté
     plateforme — l'admin doit télécharger, modifier dans Word, ré-uploader via "Remplacer")
2. Onglet "Templates officiels" → "Modifier ma version" (visible **uniquement si un dbTemplate
   match** par `system_key === ot.id` OR substring match du nom, page.tsx:1109-1111).

**Verdict : ⚠ confus**.

- Le match `t.name.toLowerCase().includes(ot.name.toLowerCase().slice(0, 15))` (substring
  match sur 15 caractères du nom officiel) est **fragile** : l'admin qui renomme son
  template custom "Convocation 2026" ne retrouvera plus le lien depuis l'onglet officiel.
- Pas d'édition possible pour les modes `docx_fidelity` au sens "éditer le contenu" — il
  faut nécessairement Word + Replace cycle.
- Le mode `pdf_fidelity` (introduit par la route templates/import) **n'est pas géré**
  côté UI : la condition `mode === "docx_fidelity"` exclut les PDFs uploadés. Comportement
  pour PDF importé = tombe dans le else (mode "editable") → essaie d'afficher Tiptap sur
  un contenu vide → **état cassé**.

### 2.4 Parcours D — "Je veux importer des documents depuis fichier"

**Réalité observée** :

1. Le user qui arrive sur `/admin/documents` voit 3 actions rapides : la **première** est
   "Importer un document Word" (`handleImportDocx`) — c'est un **input file picker inline
   single-file** qui upload et ouvre le dialog d'édition.
2. **Aucune mention** depuis cette racine d'une page d'import dédiée. La page
   `/admin/documents/import/page.tsx` (372 LOC) existe et propose **batch upload** (.docx, .doc, .pdf)
   avec drag-drop, queue UI avec status par fichier, type-picker par fichier, checkbox
   "défaut pour ce type" — **fonctionnalité bien plus riche** mais **inaccessible** sauf URL
   directe.
3. Le seul lien vers `/admin/documents/import` se trouve dans `/admin/documents/how-to/page.tsx`
   (étape 4) et `/admin/documents/import/page.tsx` est sur la sidebar ? **Non**, sidebar n'a
   que "Documents" → `/admin/documents` (Sidebar.tsx:130). Donc page import = orpheline.

**Verdict : 🚨 cassé**.

La page `/admin/documents/import` est **invisible** pour l'admin. Le code est meilleur que
l'inline picker `handleImportDocx` (UI dédiée, validation par fichier, mode batch, gestion
d'erreur par fichier) mais inaccessible. L'admin utilise donc systématiquement la version
single-file inférieure depuis la racine.

### 2.5 Parcours E — "Je veux comprendre les variables disponibles"

**Réalité observée** :

1. Depuis `/admin/documents`, en header en haut à droite, mini-lien gris
   `Toutes les variables` (page.tsx:1016-1018) → `/admin/documents/variables`.
2. Lien visuellement secondaire (text-xs text-gray-500). Facilement raté.
3. La page `/variables` est **bien faite** : 83 variables, filtre par catégorie, search,
   click-to-copy, exemples de rendu, distinction `tech_placeholder` vs `placeholder`.

**Verdict : ✅ fluide une fois trouvée**, mais 🚨 **découvrabilité catastrophique**.

Le lien est minuscule, dans le header, gris sur blanc, à côté d'un autre mini-lien
"Infos organisme". L'admin qui est dans l'éditeur Tiptap pour personnaliser un template
ne sait pas qu'il existe un catalogue accessible. Le dialog d'édition **embarque** une mini-liste
de variables (page.tsx:1798-1815) avec 17 entrées hardcodées (`AVAILABLE_VARIABLES` const)
qui n'est PAS synchronisée avec les 83 du catalogue. Donc l'admin voit 17 variables dans
l'éditeur, et n'a aucun moyen de découvrir les 66 autres sauf en quittant le dialog,
remontant en haut, cliquant le lien microscopique.

**Cas typique de double source de vérité non-synchronisée** :
- `AVAILABLE_VARIABLES` (page.tsx:112-130) : 17 entrées
- `TEMPLATE_VARIABLES` (template-variables.ts) : 83 entrées
- Idem dupliqué dans `src/app/(dashboard)/admin/emails/page.tsx:119` (autre `AVAILABLE_VARIABLES`).

### 2.6 Parcours F — "Je veux comprendre comment utiliser cette page"

**Réalité observée** :

1. `/admin/documents/how-to/page.tsx` (262 LOC) existe : guide pas-à-pas 5 étapes, screenshots
   en ASCII, troubleshooting des erreurs fréquentes. **Très bien fait**.
2. **Aucun lien vers cette page depuis la racine** `/admin/documents/page.tsx`. Ni bouton "Aide",
   ni icône `?`, ni mention dans le header.
3. Le seul moyen d'arriver dessus est : taper l'URL `/admin/documents/how-to` ou cliquer
   depuis `/admin/documents/import` (qui est elle-même orpheline). **Boucle d'orphelines** :
   how-to → import / variables ; import → how-to / variables ; mais aucune de ces 3 n'est
   linkée depuis la racine.

**Verdict : 🚨 cassé**. Le guide existe, est bon, et n'est jamais vu.

### 2.7 Tableau récap parcours utilisateur

| Parcours | Verdict | Bloquant |
|---|---|---|
| A — Ajouter doc personnalisé | 🚨 cassé | 3 chemins concurrents non hiérarchisés |
| B — Générer nouveau doc | ⚠ confus | Pas de generate-direct depuis officiels, dialog Generate mort |
| C — Modifier template existant | ⚠ confus | Match `is_system` fragile, mode `pdf_fidelity` non géré |
| D — Importer batch | 🚨 cassé | Page `/import/` orpheline |
| E — Comprendre variables | 🚨 cassé | Lien microscopique + 2 sources de vérité non-sync |
| F — Comprendre la page | 🚨 cassé | Page `/how-to/` orpheline |

**Sur 6 parcours, 4 sont 🚨 cassés et 2 ⚠ confus. Zéro fluide.**

---

## 3. Audit templates / doublons — section prioritaire

### 3.1 Les 4 listes de constantes en parallèle

| Liste | Fichier | Lignes | Compte | Rôle |
|---|---|---|---|---|
| `OFFICIAL_TEMPLATES` | `documents/page.tsx` | 176-193 | **12** | Cards affichées dans onglet "Templates officiels" |
| `STARTER_TEMPLATES` | `documents/page.tsx` | 216-241 | **3** | Picker initial dans dialog "Nouveau modèle" |
| `DOC_TYPE_OPTIONS` | `documents/import/page.tsx` | 30-45 | **14** | Dropdown type dans import batch |
| `AVAILABLE_VARIABLES` | `documents/page.tsx` | 112-130 | 17 | Variables proposées dans éditeur Tiptap |
| `SYSTEM_TEMPLATES_BY_DOC_TYPE` | `lib/templates/registry.ts` | 179-415 | **39** | Source de vérité backend pour rendu PDF |
| `TEMPLATE_VARIABLES` | `lib/template-variables.ts` | catalogue | **83** | Source de vérité catalogue variables |

**Aucune** de ces 4 listes côté page n'est dérivée de `SYSTEM_TEMPLATES_BY_DOC_TYPE` du registry.
Toutes sont hardcodées en parallèle, avec des **clés différentes** :

| Concept | OFFICIAL_TEMPLATES.id | STARTER_TEMPLATES.id | DOC_TYPE_OPTIONS.value | Registry doc_type |
|---|---|---|---|---|
| Convocation apprenant | `convocation` | `convocation` | `convocation` | `convocation` ✅ |
| Certificat de réalisation | `certificat_realisation` | `certificat` ❌ | `certificat` ❌ | `certificat_realisation` |
| Attestation d'assiduité | `attestation_assiduite` | absent | `attestation` ❌ | `attestation_assiduite` |
| Convention entreprise | `convention_entreprise` | `convention` ❌ | `convention_entreprise` | `convention_entreprise` |
| Convention intervention | `convention_intervention` | absent | `convention_intervention` | `convention_intervention` |
| Feuille émargement individuel | `feuille_emargement` | absent | `emargement_individuel` ❌ | `feuille_emargement` |
| Feuille émargement collectif | `feuille_emargement_collectif` | absent | `emargement_collectif` ❌ | `feuille_emargement_collectif` |
| Programme | `programme_formation` | absent | `programme` ❌ | `programme_formation` |
| Règlement intérieur | `reglement_interieur` | absent | `reglement` ❌ | `reglement_interieur` |

→ **9 doc_types sur 12 ont au moins 1 incohérence de clé entre les 4 listes**. C'est la
source mécanique des "doublons" perçus par Wissam : un même concept apparaît 2-3 fois
avec des noms presque identiques mais des IDs incompatibles.

### 3.2 Doublons fichiers HTML système

| Doublon | Fichiers | Action recommandée |
|---|---|---|
| `decharge-responsabilite` vs `lettre-decharge-responsabilite` | 144 + 150 LOC, même `<title>`, même `<h1>` | **DROP** `lettre-decharge-responsabilite.ts` + alias registry → garder `decharge-responsabilite.ts` seul |
| `contrat_sous_traitance` (déjà supprimé) | n/a | Déjà fait (commentaire registry.ts:222-225) ; pas de fichier orphelin |
| `planning-hebdo-signe` alias `planning_semaine` | 1 seul fichier, 2 doc_types pointent dessus | OK — alias intentionnel, mais à expliciter dans UI |
| `feuille_emargement` (`emargement-individuel.ts`) vs `feuille_emargement_vierge` (`feuille-emargement-vierge.ts`) | sémantiquement différents | Pas un doublon — mais nommage trompeur, renommer `feuille_emargement` → `feuille_emargement_individuel` pour cohérence avec `feuille_emargement_collectif` |

### 3.3 Templates orphelins (système mais invisibles depuis racine)

**27 templates** du registry ne sont pas dans `OFFICIAL_TEMPLATES`. Voir §1.7.

Conséquence : l'admin qui veut générer un `avis_hab_elec_b0_bf_bs` ne peut PAS le faire
depuis `/admin/documents`. Il doit aller dans la fiche d'une formation → tab "Documents" →
"Documents secondaires" → catalogue. **C'est cohérent par design** (les secondaires sont
attribués par formation) mais cela signifie que la page racine **n'est pas un catalogue
exhaustif**, contrairement à son intitulé "Documents" qui le suggère.

### 3.4 Templates manquants

- **Facture / Devis** : type listé dans `TYPE_LABELS` (page.tsx:88-93), filtrable, mais aucun
  template système. L'admin qui filtre "Facture" obtient toujours une liste vide.
- **Bon de commande / Reçu de paiement** : workflows compta absents (le module Finances de la
  fiche formation a ses propres docs mais pas exposés ici).

### 3.5 Vocabulaire incohérent

| Terme A | Terme B | Contexte |
|---|---|---|
| "Convention" | "Convention de formation" | STARTER vs OFFICIAL — pas le même objet |
| "Convention entreprise" | "Convention apprenant" | DOC_TYPE_OPTIONS liste les 2 mais le registry n'a pas `convention_apprenant` ! Orphelin. |
| "Convention intervention" | "Contrat de sous-traitance" | Le `<title>` du HTML système dit "Contrat de sous-traitance de formation" mais la card UI dit "CONVENTION D'INTERVENTION". Wissam a déjà drop `contrat_sous_traitance` (commentaire registry.ts:222-225) mais le `<title>` HTML restant trahit la transition |
| "Certificat" | "Certificat de réalisation" / "Certificat de diplôme" / "Certificat de travail en hauteur" | 4 entités différentes, abréviations contextuelles non-stables |
| "Attestation" | "Attestation d'assiduité" / "Attestation AIPR" / "Attestation de compétences" / "Attestation d'abandon" | Idem |
| "Émargement" | "Feuille d'émargement" / "Feuille d'émargement collectif" / "Feuille d'émargement individuel" / "Feuille d'émargement vierge" / "Émargement collectif" / "Émargement individuel" | 6 variantes dont 2 doublons sémantiques (`feuille_emargement` = "individuel" par convention non-écrite) |
| "Avis habilitation électrique" | 9 sous-variantes | Acceptable (chaque sous-variante est un cas réglementaire distinct) mais la card listing les 9 = lourd |
| "Décharge" | "Lettre de décharge de responsabilité" / "Décharge de responsabilité" | Doublon réel cf §3.2 |

---

## 4. Audit technique (allégé)

### 4.1 Bugs critiques sécurité multi-tenant

#### B.1 — `generated_documents` insert sans entity_id direct (page.tsx:937-945)

```ts
const { data: insertedDoc, error } = await supabase.from("generated_documents").insert({
  template_id: generateForm.template_id,
  session_id: generateForm.session_id || null,
  client_id: generateForm.client_id || null,
  learner_id: generateForm.learner_id || null,
  name: generateForm.name.trim(),
  content: finalContent,
  file_url: null,
}).select("id").single();
```

La table `generated_documents` n'a **pas** de colonne `entity_id` (schema.sql:305-315).
Le filtrage transite par `template_id → document_templates.entity_id`. Si `template_id`
n'appartient pas à l'entité active, l'INSERT passe quand même (RLS sur SELECT mais pas sur
INSERT WITH CHECK approprié). Le risque : un admin super_admin qui bascule d'entité peut
créer un doc lié à un template de l'autre entité.

**Note** : le `handleGenerate` n'est **jamais appelé** depuis l'UI (cf §2.2), donc bug
théorique. Mais le code mort doit être supprimé OU sécurisé.

#### B.2 — `client_documents` SELECT sans filtre `entity_id` (page.tsx:577-585)

```ts
const fetchClientDocs = useCallback(async () => {
  setClientDocsLoading(true);
  const { data, error } = await supabase
    .from("client_documents")
    .select("*, client:clients(company_name)")
    .order("created_at", { ascending: false });
  if (!error) setClientDocs((data as ClientDocument[]) || []);
  setClientDocsLoading(false);
}, []);
```

**Aucun `.eq("entity_id", entityId)`** ni `.eq("clients.entity_id", entityId)`. Le filtrage
transite uniquement par RLS Supabase (`client_documents_admin_all` policy : `client_id IN
(SELECT id FROM clients WHERE entity_id = user_entity_id())`). **Côté super_admin qui a
plusieurs entités**, la policy retourne TOUS les docs des entités où super_admin a un profile,
pas l'entité **active**. Risque : super_admin voit tous les `client_documents` de MR + C3V
dans l'onglet "Documents clients", sans respect de la sélection d'entité courante.

#### B.3 — `fetchGeneratedDocs` filtre post-fetch côté client (page.tsx:545-560)

```ts
const { data, error } = await supabase.from("generated_documents")
  .select("*, template:document_templates(name, type, entity_id), ...")
  .order("created_at", { ascending: false });
// ...
const all = (data as GeneratedDocumentFull[]) || [];
const filtered = entityId ? all.filter((d) => d.template?.entity_id === entityId) : all;
```

Le filtrage entité se fait **côté JS**, après que Supabase ait retourné toutes les lignes.
Avantage : robuste vis-à-vis du super_admin. Désavantage : **toutes les lignes circulent
sur le wire**. Si une entité a 10 000 docs et l'autre 100 000, le navigateur de l'admin
charge 110 000 rows pour en afficher 10 000. Coût bande passante × N admins × frequence.

### 4.2 Bugs critiques fonctionnels

#### F.1 — Code mort `Generate Document Dialog` (page.tsx:2165-2319)

155 LOC de dialog (form + signature availability + preview + handleGenerate) **jamais
ouvert**. `openGenerateDialog` n'a pas de callsite UI. À **supprimer** ou exposer.

#### F.2 — Mode `pdf_fidelity` non géré côté UI

La route `templates/import` (route.ts:111-119) crée des templates avec `mode = "pdf_fidelity"`
quand le fichier est un .pdf. Mais l'éditeur UI (page.tsx:1715, 1830) ne teste que
`mode === "docx_fidelity"` vs (else) `editable`. Un template PDF importé tombe dans le else,
essaie d'afficher Tiptap sur contenu vide → état cassé silencieux.

#### F.3 — `handleSendDocument` post send : pas de refetch UI

```ts
const handleSendDocument = async () => {
  // ...
  toast({ title: `${result.enqueued} email(s) programmé(s)`, ... });
  setSendDialogOpen(false);
} // pas de fetchGeneratedDocs() ni fetchTemplates()
```

L'onglet "Documents générés" ne se rafraîchit pas après envoi. L'admin doit recharger
manuellement la page pour voir le doc dans la liste. Pas critique car le doc est créé
côté worker async, mais frustrant.

### 4.3 Dette technique mesurée

| Métrique | Compte |
|---|---|
| Lignes totales `documents/page.tsx` | **2 340** |
| Nombre de `useState` dans page.tsx | **27** |
| Nombre de `(x: any)` dans page.tsx | **6** (lignes 875, 876, 923, 924, 960, 968 — tous sur `signatures` table — typage trivial à corriger) |
| Nombre de `as unknown as` | **6** (lignes 603, 604, 623, 1110, 1147, 1183 — workarounds pour `is_system`, `system_key`, `mode`, `default_for_doc_type` absents du type `DocumentTemplate`) |
| Nombre de `try {} catch {}` blocks | 6 (sains, tous avec toast d'erreur) |
| Nombre de `console.error/warn/log` | 8 (4 errors techniques OK, 3 logs debug à virer en prod : `[saveTemplate] payload`, `[saveTemplate] INSERT OK`, `[send-document] errors`) |
| Routes API `/api/documents/*` | **129** (32 mock + 50 batch + 23 send-batch + 24 individuels + 7 utilitaires + 5 signature + duplicats résiduels Story F.x) |
| Constantes de templates parallèles | **4** (OFFICIAL + STARTER + DOC_TYPE_OPTIONS + AVAILABLE_VARIABLES) |
| Templates HTML système | **38 fichiers** / **8 037 LOC** / **39 doc_types** registry |
| Doublons fichiers HTML | **1 réel** (`decharge-responsabilite` ≈ `lettre-decharge-responsabilite`) |
| Templates orphelins (registry mais pas OFFICIAL) | **27** |
| Tests Vitest couvrant `/admin/documents` | **0** (les 5 fichiers test couvrent services/utils, pas la page) |
| Tests e2e couvrant `/admin/documents` | **0** |

### 4.4 Petits patterns à corriger

- **Trop de relances `await fetchTemplates()` après chaque action** : 4 occurrences dans
  page.tsx (lignes 373, 789, 806, 1196). Pas un bug, mais coûte un round-trip Supabase à chaque
  fois. Optimisable en update local state.
- **Sanitization HTML inconsistante** : `sanitizeHtml` (page.tsx:25-28) utilise DOMPurify
  uniquement côté client (`typeof window !== "undefined"`). Côté SSR, retourne le HTML brut.
  Pas critique (la page est `"use client"`) mais l'hydratation peut révéler le HTML brut
  pendant une fraction de seconde.
- **L'éditeur Tiptap reçoit `AVAILABLE_VARIABLES` (17 entrées)** alors que le catalogue
  en a 83 (cf §2.5). À synchroniser.

---

## 5. Plan d'action priorisé

Vu les priorités explicites de Wissam (UX + templates >> archi/perf), j'organise en **5 volets**
qu'on peut faire dans l'ordre 1→5 ou parallèlement par paire.

### Volet 1 — Nettoyage templates + cohérence vocabulaire (quick win)

**Périmètre** :
- Dérive `OFFICIAL_TEMPLATES` depuis le registry `SYSTEM_TEMPLATES_BY_DOC_TYPE` au lieu de
  hardcoder une liste parallèle. Crée un mapping `category` + `categoryLabel` côté registry.
- Aligne les clés : `STARTER_TEMPLATES.id` `convocation/convention/certificat` → `convocation/convention_entreprise/certificat_realisation` (cohérent registry).
- Aligne `DOC_TYPE_OPTIONS.value` (import page) sur les clés registry : `attestation` → `attestation_assiduite`, `certificat` → `certificat_realisation`, `convention_apprenant` → drop (orphelin), `programme` → `programme_formation`, `reglement` → `reglement_interieur`, `emargement_individuel` → `feuille_emargement`, `emargement_collectif` → `feuille_emargement_collectif`.
- DROP `lettre-decharge-responsabilite.ts` + son entrée registry. Migre les usages.
- Aligne `AVAILABLE_VARIABLES` (page.tsx) sur `TEMPLATE_VARIABLES` du catalogue (83 entrées).
- Renomme `feuille_emargement` → `feuille_emargement_individuel` (cohérent avec `_collectif`).
  ⚠ migration nécessaire (UPDATE `document_templates.system_key`, UPDATE `documents.doc_type`,
  UPDATE call sites des routes API).

**Estimation** : 6-8 h (lecture + diff + migration SQL + tests manuels).
**Risque prod** : ⚠ moyen — renommage `feuille_emargement` peut casser des call sites batch
existants. À tester sur dev avant. Sinon les autres changements (cohérence dropdowns) sont
sûrs.
**Impact UX** : 🔥 fort — résout la perception de doublons par Wissam.

### Volet 2 — Refonte UX page racine `/admin/documents` (cœur)

**Périmètre** :
- **Reorganise les actions rapides** : remplace les 3 boutons actuels par 2 boutons explicites :
  "Importer mon template Word" → redirige vers `/admin/documents/import` (au lieu d'un picker
  inline single-file), "Créer un template depuis zéro" → ouvre dialog Tiptap.
- **Drop l'onglet "Templates officiels"** dans son état actuel (juste 12 cards stubs).
  Remplace par un **catalogue dérivé du registry** avec **39 cards** (toutes les entrées
  registry, filtrables par owner_type/qualiopiBlocking). Chaque card a 2 boutons :
  "Aperçu" + **"Envoyer ce document"** (nouveau : envoie le doc officiel tel quel sans
  passer par "Utiliser comme base").
- **Drop le bouton "Envoyer à un apprenant"** action rapide (gaspillé, change juste d'onglet).
- **Ajoute un bouton "Aide"** visible (icône `?` ou bouton outline "Comment ça marche")
  → link vers `/admin/documents/how-to`.
- **Promeut le lien "Toutes les variables"** au rang de bouton outline visible (cf
  équivalent dans `how-to/page.tsx`).
- **Supprime le dialog "Generate Document"** mort (-155 LOC).
- **Supprime la map `OFFICIAL_TEMPLATES` hardcodée** au profit du registry.
- **Renomme l'onglet "Mes modèles"** → "Mes templates personnalisés" (cohérent avec ce
  que l'admin a uploadé).
- **Renomme l'onglet "Documents générés"** → "Documents envoyés" ou "Historique" (cohérent
  avec ce que la table contient : des docs vraiment générés/envoyés à des destinataires).

**Estimation** : 12-18 h (le plus gros).
**Risque prod** : ⚠ moyen — ré-organisation visuelle, mais le code sous-jacent reste.
À piloter avec validation Wissam pas-à-pas.
**Impact UX** : 🔥🔥 très fort — résout 4/6 parcours cassés.

### Volet 3 — Découvrabilité satellites (`how-to`, `import`, `variables`)

**Périmètre** :
- Linke les 3 pages satellites depuis le header de `/admin/documents` (bandeau navigation
  ou cards "Outils") : `how-to` (icône `?`), `import` (icône upload), `variables` (icône
  list).
- Ajoute un breadcrumb "Documents > Comment faire" en tête de `how-to/page.tsx`.
- Idem pour `import/page.tsx` et `variables/page.tsx`.
- Dans le dialog d'édition Tiptap, remplace la mini-liste `AVAILABLE_VARIABLES` par un
  lien "Voir tout le catalogue (83 variables)" → ouvre `/admin/documents/variables` dans
  un nouvel onglet OU dialog modal embarqué.
- Drop le bouton "Importer .docx" secondaire de l'onglet "Mes modèles" → redirige vers
  `/admin/documents/import`.

**Estimation** : 3-4 h.
**Risque prod** : ✅ faible — pure navigation/links.
**Impact UX** : 🔥 fort — débloque parcours D, E, F.

### Volet 4 — Sécurité multi-tenant

**Périmètre** :
- B.1 — Soit supprime le `handleGenerate` mort (et le dialog), soit ajoute `entity_id` aux
  filtres + valide que `template_id` ∈ entity courante.
- B.2 — Ajoute filtre explicite côté JS : `.from("client_documents").select("...").eq("client.entity_id", entityId)`
  via la jointure foreign-table.
- B.3 — Migre `fetchGeneratedDocs` pour filtrer côté Supabase en utilisant la table unifiée
  `documents` (qui a `entity_id` direct) au lieu de `generated_documents`. ⚠ nécessite
  d'abord une bascule vers documents-store pour cette page.
- Audit RLS de `generated_documents` : ajouter une policy INSERT/UPDATE qui vérifie
  `template_id IN (SELECT id FROM document_templates WHERE entity_id = user_entity_id())`.

**Estimation** : 4-6 h.
**Risque prod** : ⚠ moyen — affecte des queries en prod, à tester.
**Impact UX** : ✅ aucun pour l'admin (silencieux). Mais nécessaire pour intégrité
multi-tenant.

### Volet 5 — Refacto architectural (NON prioritaire selon Wissam)

**Périmètre** :
- Découpe `page.tsx` 2 340 LOC en sous-composants `_components/` :
  `OfficialTemplatesTab.tsx`, `CustomTemplatesTab.tsx`, `GeneratedDocumentsTab.tsx`,
  `ClientDocumentsTab.tsx`, `TemplateEditorDialog.tsx`, `SendDocumentDialog.tsx`,
  `DefaultDocTypeDialog.tsx`, `OfficialTemplateCard.tsx`, `CustomTemplateCard.tsx`.
- Extrait les 27 `useState` en **3 hooks custom** : `useTemplates()`, `useGeneratedDocs()`,
  `useClientDocs()`.
- Migre les call Supabase inline vers `src/lib/services/documents-store.ts` (déjà créé,
  partiellement utilisé en TabConventionDocs).
- Type proprement `DocumentTemplate` avec tous les champs (`is_system`, `system_key`,
  `mode`, `source_docx_url`, `source_docx_path`, `default_for_doc_type`) → supprime
  les 6 casts `as unknown as`.

**Estimation** : 16-24 h.
**Risque prod** : ⚠ moyen-haut — gros refacto, risque régression. À faire après
volets 1-3 stabilisés.
**Impact UX** : ✅ aucun (interne). Bénéfice maintenance long terme.

### Volet 6 — Tests Vitest (bonus)

**Périmètre** :
- Test resolver variables (`resolve-variables.ts`) sur les 83 entrées catalogue.
- Test mapping OFFICIAL_TEMPLATES → registry (post-volet 1).
- Test workflow `handleSendDocument` → POST send-to-recipient (mock fetch).
- Test isolation entity_id sur fetchTemplates, fetchClientDocs (post-volet 4).
- Test e2e Playwright sur 1 parcours critique : "Admin upload .docx puis envoie à un apprenant".

**Estimation** : 6-10 h.
**Risque prod** : ✅ aucun.
**Impact UX** : ✅ aucun (filet long terme).

---

## 6. Conclusion + recommandation

### 6.1 Score final : **4.5 / 10**

**Justification chiffrée** :

| Critère | Note | Poids |
|---|---|---|
| Fonctionnel : la machinerie marche-t-elle ? | 7/10 | (CRUD OK, upload OK, génération OK, envoi worker OK) |
| Sécurité multi-tenant | 6/10 | (3 violations résiduelles, dont 2 sur du code mort/peu utilisé) |
| Cohérence interne (vocabulaire, sources de vérité) | 2/10 | (4 listes parallèles non-sync, 9/12 incohérences de clés) |
| Découvrabilité | 2/10 | (3 pages satellites orphelines, lien microscopique vers variables) |
| Cohérence UX (parcours utilisateur) | 3/10 | (4 parcours cassés sur 6) |
| Qualité du code | 6/10 | (catch blocks OK, types corrects sauf 12 casts, console.log debug oubliés) |
| Tests | 1/10 | (0 test couvre cette page directement) |
| **Moyenne pondérée** | **4.5/10** | |

### 6.2 Verdict honnête : "tout repenser" — vrai ou faux ?

**Côté code applicatif** : **non**, la plomberie est solide. Le registry système (39 templates
HTML), le service `documents-store`, le hook `useDocumentGeneration`, le DocumentGenerationService
avec cache, le worker queue email, les 129 routes API — tout cela marche. Le tab
`TabConventionDocs` (déjà solidifié) en témoigne : 8/10 post-refacto.

**Côté UX et organisation visible** : **oui**, il faut "repenser" — pas dans le sens "réécrire
le code" mais dans le sens "aligner les sources de vérité, supprimer les doublons, hiérarchiser
les workflows, exposer ce qui est invisible". Le module est devenu un **catalogue de 6 mois
de features ajoutées sans ménage** : starter picker (vieux), official templates (post-h-X),
import batch (récent), variables catalogue (récent), how-to (récent), dialog send-to-recipient
(Phase 3 UX v2), default_for_doc_type (récent). Chaque feature a été ajoutée correctement,
mais l'ensemble n'a jamais été retravaillé pour cohérence.

**Décision** : Wissam a raison de dire "il faut tout repenser" — mais **côté surface UX**, pas
côté implémentation.

### 6.3 Ordre recommandé des chantiers

**Phase 1 (cette semaine, 9-12 h)** : Volet 1 + Volet 3
→ Quick wins de nettoyage : aligne les vocabulaires, supprime le doublon `lettre-decharge`,
linke les satellites. **L'admin verra immédiatement la cohérence revenir.**

**Phase 2 (semaine suivante, 12-18 h)** : Volet 2
→ Refonte UX racine. C'est le **cœur du chantier**. À piloter pas à pas avec Wissam
(checkpoint UX validés). Le bouton "Envoyer ce document" sur card officielle = the
killer feature qui résout 80 % du parcours.

**Phase 3 (après validation Phase 2, 4-6 h)** : Volet 4
→ Sécurité multi-tenant. Silent mais nécessaire. Faisable en parallèle si on a un dev
solo qui se concentre.

**Phase 4 (optionnelle, 16-24 h)** : Volet 5
→ Refacto architectural. À **décliner pour l'instant** vu la priorité Wissam.
À déclencher uniquement si les volets 1-3 ont causé trop de modifications cumulées
et que le fichier `page.tsx` devient impossible à maintenir.

**Phase 5 (continue, 6-10 h)** : Volet 6
→ Tests Vitest, à ajouter au fil des PRs.

### 6.4 Total effort

| Phase | Volets | Heures | Priorité |
|---|---|---|---|
| 1 | V1 + V3 | 9-12 h | 🔥🔥 HIGH |
| 2 | V2 | 12-18 h | 🔥🔥🔥 CRITICAL |
| 3 | V4 | 4-6 h | 🔥 MEDIUM |
| 4 | V5 | 16-24 h | optionnel — DEFER |
| 5 | V6 | 6-10 h | bonus |
| **MVP solidification** (P1+P2+P3) | | **25-36 h** | |
| **Avec refacto + tests** | | **47-70 h** | |

**Recommandation finale** : commencer par **Volet 1 + Volet 3 en parallèle** (un dev sur
templates/vocabulaire, un dev sur navigation/découvrabilité). Si dev solo, faire Volet 1
d'abord (3 jours), puis Volet 3 (1 jour), puis Volet 2 (3-4 jours), puis Volet 4 (1 jour).
**Total MVP = 8-10 jours-dev.** Très réaliste, et l'admin perçoit le changement dès la
fin du Volet 1.

---

## Annexe A — Inventaire fichiers lus

```
/Users/wissam/Desktop/lms-platform/src/app/(dashboard)/admin/documents/page.tsx          2340 LOC
/Users/wissam/Desktop/lms-platform/src/app/(dashboard)/admin/documents/how-to/page.tsx    262 LOC
/Users/wissam/Desktop/lms-platform/src/app/(dashboard)/admin/documents/variables/page.tsx 167 LOC
/Users/wissam/Desktop/lms-platform/src/app/(dashboard)/admin/documents/import/page.tsx    372 LOC
/Users/wissam/Desktop/lms-platform/src/lib/templates/registry.ts                          483 LOC
/Users/wissam/Desktop/lms-platform/src/lib/templates/*.ts (38 fichiers)                  8037 LOC
/Users/wissam/Desktop/lms-platform/src/lib/template-variables.ts                          167 LOC
/Users/wissam/Desktop/lms-platform/src/lib/utils/resolve-variables.ts                    1641 LOC
/Users/wissam/Desktop/lms-platform/src/lib/utils/document-status.ts                        32 LOC
/Users/wissam/Desktop/lms-platform/src/lib/utils/batch-doc-*.ts                           290 LOC
/Users/wissam/Desktop/lms-platform/src/lib/services/documents-store.ts                    514 LOC
/Users/wissam/Desktop/lms-platform/src/lib/services/document-generation.ts                193 LOC
/Users/wissam/Desktop/lms-platform/src/lib/services/docx-converter.ts                     115 LOC
/Users/wissam/Desktop/lms-platform/src/hooks/useDocumentGeneration.tsx                    145 LOC
/Users/wissam/Desktop/lms-platform/src/components/ui/back-to-formation-link.tsx            38 LOC
/Users/wissam/Desktop/lms-platform/src/app/api/documents/templates/import/route.ts        ~220 LOC
/Users/wissam/Desktop/lms-platform/src/app/api/documents/extract-docx-variables/route.ts  ~80 LOC
/Users/wissam/Desktop/lms-platform/supabase/schema.sql (sections relevantes)              ~150 LOC
/Users/wissam/Desktop/lms-platform/supabase/migrations/add_document_templates_*.sql       6 fichiers
                                                                                          ────────
                                          Total lu / examiné                            ~15 250 LOC
```

## Annexe B — 129 routes API `/api/documents/*` (catalogue)

(Groupes — détail des noms cf §1.4 ou `ls src/app/api/documents/`)

- 33 `generate-{doc_type}` individuels
- 32 `generate-{doc_type}-mock`
- 50 `generate-{doc_type}s-batch`
- 23 `send-{doc_type}s-batch-email`
- 5 signature (`sign`, `sign-request`, `sign-status`, `signature-request-batch`, `process-sign-reminders`)
- 9 utilitaires (`generate`, `generate-from-template`, `preview-docx`, `extract-docx-variables`,
  `upload-template`, `track-view`, `send-to-recipient`, `attribute-secondary`, `templates/import`)

→ **129 endpoints**. La plupart sont du **copy-paste de boilerplate** (~80 % des batchs et
mocks suivent le même squelette). Volet 5 (refacto) pourrait ramener ce nombre à ~10 endpoints
unifiés avec `doc_type` en query param. Mais hors priorité Wissam.
