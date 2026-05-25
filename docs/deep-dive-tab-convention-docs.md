# Deep-Dive — Onglet Documents > Conventions (TabConventionDocs)

> **Date** : 2026-05-25
> **Branche** : main (post-merge des 3 chantiers Automatisations + Qualiopi + Résumé)
> **Cible** : `src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx` (2101 LOC — le plus gros sous-composant Tab*) + son écosystème
> **Méthode** : BMAD `document-project` — deep-dive exhaustif. Fan-out massif vu la complexité.
> **Identifié dans** : [docs/audit-organisation-formation.md](audit-organisation-formation.md) comme « R3 — prochain candidat à solidification »

---

## 1. Vue d'ensemble

L'onglet « Documents > Conventions » est le **plus complexe** de la fiche formation : il gère **tous les documents Qualiopi** générés pour une session — conventions formation, conventions intervention formateur, convocations, certificats de réalisation, attestations d'assiduité, plus **23 documents secondaires** (habilitations électriques, AIPR, certificats travail hauteur, autorisations image, chartes, etc.).

Pour chaque document, l'admin peut :
- **Générer** un PDF (template HTML système OU template Word custom uploadé)
- **Prévisualiser** le PDF
- **Figer** (confirmer) le doc avec une date
- **Envoyer** par email à l'apprenant/entreprise/formateur
- **Faire signer** (canvas inline, token public, signature eIDAS)
- **Exporter en masse** (ZIP) ou envoyer en masse (batch email)

C'est aussi le tab qui **interagit le plus avec le système** :
- 114 routes API sous `/api/documents/*`
- 11 services lib (`documents-store`, `pdf-generator`, `docx-converter`, `email-attachments-resolver`, `email-queue`, `batch-doc-*`, etc.)
- 38 templates HTML système (~8 030 LOC)
- 4 tables Supabase actives + 1 legacy en cours de retrait
- Couplage avec les **automatisations** (envoi auto par règle on `trigger_type`)
- Cache PDF (clé = `session_updated_at + doc_hash`)

**État synthétique : fonctionnel à ~65 %.** Le composant marche, mais cumule les patterns "fragile" :
- **5+ violations multi-tenant critiques** (UPDATE/SELECT sans `entity_id` filter)
- **14 `onRefresh()` fire-and-forget** systémiques
- **3 casts `as unknown as`**, dont 1 qui produit silencieusement du undefined
- **2 TODOs Story F1.x/F2.x** = boucles client-side de 600-800ms × N docs (sous-optimal)
- **Aucun découpage** : 2 101 LOC monolithiques dans un seul fichier
- **2 handlers sans try/catch** sur des UPDATE Supabase
- **2 console.error silencieuses** sans feedback toast

---

## 2. Architecture

### 2.1 Découpage fonctionnel du composant (2 101 LOC)

| Range | Zone | Description |
|---|---|---|
| 1-54 | Imports | 55 imports : React, lucide, shadcn, services, hooks, composants spécialisés |
| 61-250 | Constantes | DOC_COLORS, DOC_LABELS, DOC_SHORT, DEFAULT_LEARNER_DOCS, STATIC_DOCS, DEFAULT_COMPANY_DOCS, DEFAULT_TRAINER_DOCS, REQUIRES_SIGNATURE_TYPES |
| 253-296 | Component + state | 14 useState (saving clé composée, dates, templates, matrixView, previewDoc, emailPreview, etc.) |
| 302-443 | Fetch & init | `fetchTemplates()` + `initializeDefaultDocs()` (crée les docs par défaut pour chaque owner_type) |
| 444-531 | Validation & context | `canExportCompanyDoc()`, `generateDocHtml()` (résout templates + signatures) |
| 533-633 | View + Confirm/Reset | `handleView`, `handleConfirm`, `handleResetConfirm`, `handleConfirmWithDate` |
| 635-723 | Email preview & send | `handleSendPreview` (génère PDF + dialog), `handleSendConfirmed` (envoi) |
| 725-857 | Mass send | `handleMassSendWithPDF()` — dual server-side OU client-side fallback (800ms/doc) |
| 859-922 | Mass download ZIP | `handleDownloadAllPDF()` — dual server-side OU client-side fallback (600ms/doc) |
| 924-1134 | Mass & individual signature | `handleMassSignatureRequest`, `handleSendForSignature` |
| 1012-1102 | Doc assignment & templating | `handleMassConfirm`, `handleConfirmAllForOwner`, `handleAddCustomDoc`, `handleAssignTemplateToAll` |
| 1136-1321 | Render helpers | `renderStatusBadge`, `renderDocRow`, `renderStaticDocRow`, `renderAddCustomDoc` |
| 1325-1391 | Owner section | `renderOwnerSection()` (itère defaultDocTypes + STATIC + custom) |
| 1393-1506 | Matrix data prep | docProgress, learnerMatrix, companyMatrix, trainerMatrix, secondaryDocs |
| 1515-1703 | Matrix view (JSX) | Vue Matrice (vue par défaut, 3 sections + secondaire) |
| 1708-1928 | Detail view (JSX) | Vue Détail (mass actions + sections par owner) |
| 1933-2005 | Secondary docs section | Documents secondaires (h-22) groupés par destinataire |
| 2007-2098 | Dialogs | Preview document, Email preview, Incomplete data, Secondary catalog |

### 2.2 Inventaire des fichiers de l'écosystème

| Catégorie | Compte | Volume |
|---|---|---|
| **Composant principal** | 1 | 2 101 LOC |
| **Composants annexes** | 3 | DocMatrixSection (118), SecondaryDocCatalogDialog (320), SignaturePad (178) |
| **Routes API `/api/documents/*`** | **114** endpoints | Voir §2.3 |
| **Services `src/lib/services/`** | 11 | 955 LOC cumulés |
| **Templates HTML système** | 38 fichiers | 8 030 LOC cumulés |
| **Tables Supabase** | 4 actives + 1 legacy | Voir §2.4 |
| **Tests** | 8 unitaires + 1 e2e | ~700 LOC |

### 2.3 Routes API — découpage

Les **114 routes** suivent un pattern strict :

| Pattern | Compte | Exemple |
|---|---|---|
| `generate-{doc_type}` (individuel) | ~30 | `generate-convocation`, `generate-convention`, `generate-certificat-realisation` |
| `generate-{doc_type}-mock` (preview admin) | ~25 | `generate-convocation-mock` |
| `generate-{doc_type}s-batch` (génération en masse) | ~25 | `generate-convocations-batch`, `generate-attestations-assiduite-batch` |
| `send-{doc_type}s-batch-email` (envoi en masse) | **6 seulement** | F2.1 → F2.5 + F2.x extensions |
| Signature / token / sign-* | 7 | `sign`, `sign-request`, `sign-status`, `signature-request-batch`, `process-sign-reminders` |
| Documents utilitaires | 6 | `generate`, `generate-from-template`, `preview-docx`, `extract-docx-variables`, `upload-template`, `track-view`, `send-to-recipient`, `attribute-secondary` |

**Goulot d'étranglement** : les routes `send-*-batch-email` ne couvrent **que 6 doc_types sur ~30** (les Stories F2.1 à F2.5 + quelques extensions). Pour les autres (cgv, planning_semaine, beaucoup de secondaires…), le composant **fallback en boucle client** (cf §4 — TODOs Story F.x).

### 2.4 Tables Supabase

| Table | Statut | Rôle |
|---|---|---|
| `documents` | ✅ Active (depuis 2026-05-15) | Table unifiée. doc_type + source_table + source_id + owner_type + owner_id + status + file_url + signature_data |
| `formation_convention_documents` | ⚠ Legacy (à dropper) | Table riche historique. Migration b-3 à b-7 en cours via `backfill_documents_from_legacy.sql` |
| `document_templates` | ✅ Active | Templates Word custom uploadés (DOCX, mode editable vs docx_fidelity) |
| `document_signatures` | ✅ Active | Signatures canvas inline (SVG) liées à `document_id` |
| `signing_tokens` | ✅ Active | Tokens pour signature électronique externalisée (URLs publiques expiring) |

### 2.5 Templates HTML système (38 fichiers)

Tous registrés dans [src/lib/templates/registry.ts](src/lib/templates/registry.ts) (476 LOC) avec :
```ts
{
  html: TEMPLATE_HTML,
  footer: FOOTER_TEMPLATE,
  ownerType: "learner" | "trainer" | "company" | "session",
  qualiopiBlocking: boolean,
}
```

**Distribution** :
- **11 templates primaires Qualiopi** (convention_*, convocation, certificat_realisation, attestation_assiduite, emargement_*, programme, reglement_interieur, cgv, politique_rgpd)
- **9 variantes habilitation électrique** (avis_hab_elec_generique + 8 variantes B0/B1V/BF/BT/BT_HT/H0_B0/etc.)
- **5 attestations métier** (aipr, competences, abandon_formation, travail_hauteur, diplome)
- **5 docs administratifs signables** (autorisation_image, decharge_responsabilite, lettre_decharge, charte_formateur, contrat_engagement_stagiaire)
- **4 docs pédagogie/évaluation** (bilan_poe, reponses_evaluations, reponses_satisfaction_session, resultats_evaluations)
- **4 docs auxiliaires non-signables** (feuille_emargement_vierge, planning_hebdo_signe, etc.)

### 2.6 Templates Word custom (mode editable vs docx_fidelity)

Stockés dans la table `document_templates` :
- **`editable`** : le template est édité dans le navigateur (?)
- **`docx_fidelity`** : le `.docx` est conservé tel quel, **les placeholders `[%Var%]` sont substitués via docxtemplater puis converti en PDF par CloudConvert** (LibreOffice → PDF, fidélité ~99 %)

Cf [src/lib/services/email-attachments-resolver.ts:104-112](src/lib/services/email-attachments-resolver.ts) qui montre le pipeline `uploaded_docx` → `convertDocxToPdfWithVariables`.

### 2.7 Signature électronique — 3 pipelines coexistent

**Pipeline A — Canvas inline (`document_signatures`)**
- Composant `SignaturePad` (SVG canvas)
- Stocke `signature_data` en SVG dans la table `document_signatures`
- Utilisé pour les émargements (par créneau)

**Pipeline B — Token public (`signing_tokens` + table `documents.signature_token`)**
- Route POST `/api/documents/sign-request` génère un token UUID
- Lien public envoyé par email : `/sign?token=...`
- Le destinataire signe sans login
- Stocke la signature dans `documents.signature_data` + IP + user_agent
- Pour : conventions formation, conventions intervention

**Pipeline C — Signature eIDAS (`signature_method = "qualified_eidas"`)**
- Schéma BDD existe (`signature_method`, `signature_token_expires_at`)
- Pas évident de voir l'intégration runtime — probablement à brancher avec un provider externe (DocuSign, Yousign, etc.)

### 2.8 Cache PDF (`pdf-cache.ts`)

[src/lib/services/pdf-cache.ts](src/lib/services/pdf-cache.ts) (~109 LOC) :
- Clé de cache = hash SHA-256 de `(html_template + variables_resolved)`
- Invalidation **automatique** quand `sessions.updated_at` change (toute modification de la session bumpe ce timestamp via trigger ou explicite, cf [services/formation-companies.ts:54](src/lib/services/formation-companies.ts) qui force `updated_at: new Date().toISOString()` lors d'un sync `total_price`)

**Conséquence** : un changement de prix dans le Résumé invalide tout le cache PDF (acceptable, on régénère à la demande).

---

## 3. Comment ça marche aujourd'hui — Parcours utilisateur

### 3.1 Initialisation (au chargement du tab)

1. `fetchTemplates()` (ligne 303) charge les templates custom de l'entité
2. `initializeDefaultDocs()` (ligne 330) crée les docs par défaut pour chaque destinataire (learners, companies, trainers) selon `DEFAULT_LEARNER_DOCS`, `DEFAULT_COMPANY_DOCS`, `DEFAULT_TRAINER_DOCS`
3. Les rows sont insérées dans `documents` avec `status="draft"`

### 3.2 Vue Matrice (par défaut)

Grille **3 sections** (Apprenants × Entreprises × Formateurs) × **types de documents**. Chaque cellule affiche le statut (draft / generated / sent / signed) avec un code couleur.

Cliquer sur une cellule → ouvre le PDF preview du document.

Section secondaire en bas : documents secondaires h-22 groupés par destinataire.

### 3.3 Vue Détail (toggle)

Pour chaque section (Apprenants / Entreprises / Formateurs) :
- Listing des destinataires
- Pour chaque destinataire × type de doc : 1 ligne avec actions (Voir / Figer / Envoyer / Signer)
- Mass actions : « Tout figer » / « Envoyer tout » / « PDF tout » / « Demander signature à tous »

### 3.4 Génération d'un PDF

Flux : bouton « Voir » → `handleView()` → `useDocumentGeneration().generateDocument()` → POST `/api/documents/generate-{type}` ou `/api/documents/generate-from-template` (selon template custom).

Le serveur :
1. Résout les variables via [src/lib/utils/resolve-variables.ts](src/lib/utils/resolve-variables.ts) (~1641 LOC — toutes les variables `{{nom_apprenant}}`, `{{titre_formation}}`, `{{date_today}}`, etc.)
2. Soit rend le template HTML système → PDF via Puppeteer/CloudConvert
3. Soit substitue les placeholders DOCX → convertit en PDF via CloudConvert (LibreOffice)
4. Upload le PDF sur Supabase Storage
5. Update le row `documents` avec `file_url`, `file_hash`, `status="generated"`

### 3.5 Envoi par email

Flux : bouton « Envoyer » → `handleSendPreview()` génère le PDF en base64 → ouvre `EmailPreviewDialog` (subject + body modifiables) → `handleSendConfirmed()` POST `/api/emails/send` → l'email_queue prend le relais (worker async) → marque `status="sent"`.

### 3.6 Signature

Flux signature externalisée : bouton « Demander signature » → `handleSendForSignature()` → POST `/api/documents/sign-request` :
1. Génère un token UUID
2. Crée un row dans `signing_tokens` (expire dans X jours)
3. Envoie un email au signataire avec un lien `/sign?token=...`
4. Le destinataire signe sur une page publique (sans login)
5. Au signing : update `documents.signature_data` + `signed_at` + `signed_by` + `signature_ip` + `signature_user_agent` + `status="signed"`

### 3.7 Mass actions

**Mass send** : `handleMassSendWithPDF(ownerType, docType)` :
- Si `hasBatchSendEndpoint(docType)` → POST `/api/documents/send-{type}s-batch-email` (server-side optimisé)
- Sinon → **fallback boucle client** : pour chaque doc, générer le PDF puis POST `/api/emails/send`, avec **800 ms de delay** entre chaque (rate limit Resend)

**Mass download ZIP** : `handleDownloadAllPDF()` :
- Si `hasBatchEndpoint(docType)` → POST `/api/documents/generate-{type}s-batch` (renvoie un ZIP)
- Sinon → **fallback boucle client** : génère chaque PDF avec jsPDF, **600 ms de delay** entre

### 3.8 Couplage avec les Automatisations

Quand l'admin clique « Terminer la formation » (header de page.tsx), l'orchestrateur déclenche `trigger_type: "on_session_completion"` (cf [page.tsx:175-181](src/app/(dashboard)/admin/formations/[id]/page.tsx#L175-L181)).

Si une règle d'automatisation est configurée dans `TabAutomation` pour ce trigger (ex: « Envoyer certificats J+1 fin »), le moteur de [src/lib/automation/execute-rule.ts](src/lib/automation/execute-rule.ts) :
1. Itère sur les destinataires (learners de la session)
2. Pour chaque destinataire, génère le PDF + enqueue l'email (avec `EmailAttachmentDescriptor` qui pointe vers le doc_type)
3. Le worker `process-scheduled-emails` envoie l'email + le PDF en pièce jointe

Lien : `email-attachments-resolver.ts` est appelé par le worker au moment de l'envoi, lui-même appelant `pdf-generator.ts` ou `docx-converter.ts` selon le type d'attachement.

---

## 4. État des lieux — ce qui marche, ce qui ne marche pas

### 4.1 ✅ Ce qui fonctionne réellement

- **Génération de PDF** pour 38 types via templates HTML système — pipeline robuste avec cache
- **Templates Word custom** (docx_fidelity via CloudConvert) — fidélité ~99 %
- **Signature canvas inline** (émargements par créneau)
- **Signature électronique externalisée** (token public, lien email, page `/sign`)
- **Variables résolues** : ~46 variables disponibles (nom_apprenant, titre_formation, dates, prix, signatures, logo, etc.)
- **Cache PDF** invalidé proprement quand session.updated_at change
- **6 routes batch email** server-side optimisées (Stories F2.1–F2.5 + 1 extension)
- **Documents secondaires** (h-22, 23 types) : catalogue + attribution + génération
- **Vue Matrice + Vue Détail** : 2 modes d'affichage cohérents
- **Compteurs succeeded/failed** sur les mass actions (cf chantier Résumé Tâche 8 — pattern repris ici dans `handleMassSendWithPDF`)
- **Tests** : 8 unitaires (~700 LOC) + 1 e2e (signatures)

### 4.2 🔴 BUGS CRITIQUES

#### B1 — 5 UPDATE Supabase sans `entity_id` filter (violation CLAUDE.md)

Pattern identifié sur les `documents.update()` :

| Ligne | Handler | Contexte |
|---|---|---|
| 960-966 | `handleMassConfirm` | `update().eq("source_table", "sessions").eq("source_id", formation.id).eq("doc_type", docType).eq("status", "draft")` — **manque entity_id** |
| 1016-1022 | `handleConfirmAllForOwner` | `update().eq("source_id", formation.id).eq("owner_type", ownerType).eq("owner_id", ownerId)` — **manque entity_id** |
| 1576-1580 | Inline (mass confirm UI) | idem — **manque entity_id** |
| 1796-1801 | Inline (confirm custom docs) | idem — **manque entity_id** |

**Risque** : si un attaquant forge l'URL avec un `formation.id` d'une autre entité (RLS allow_all en prod), les UPDATE affectent les docs cross-tenant.

**Fix** : ajouter `.eq("entity_id", formation.entity_id)` partout. Idéalement, extraire un service `updateDocsForOwner(supabase, entityId, sessionId, ownerType, ownerId, patch)` dans `documents-store.ts`.

#### B2 — `document_templates.select()` par ID sans `entity_id` (ligne 508)

```ts
// generateDocHtml() ligne ~508
const { data: tpl } = await supabase
  .from("document_templates")
  .select("...")
  .eq("id", doc.template_id)
  .single();
```

**Risque** : si on connaît un `template_id` d'une autre entité (UUIDs prédictibles ou fuite), on charge ce template et on génère un PDF avec.

**Fix** : ajouter `.eq("entity_id", formation.entity_id)`.

#### B3 — `document_signatures.select()` par `document_id` sans `entity_id` (ligne 472)

```ts
const { data } = await supabase
  .from("document_signatures")
  .select("signer_name, signed_at")
  .eq("document_id", doc.id)
  .order("signed_at", { ascending: false })
  .limit(1);
```

**Risque** : si `doc.id` est tamperé (XSS, manipulation API), on charge une signature d'une autre entité.

**Fix** : check préalable que `doc.entity_id === formation.entity_id` (le composant a déjà accès à `formation.entity_id`).

#### B4 — Cast `as unknown as Record<string, string>` ligne 1140

```ts
const renderStatusBadge = (doc: FormationConventionDocument | undefined) => {
  if (!doc) return null;
  const signerEmail = (doc as unknown as Record<string, string>).signer_email;
  // ...
```

**Problème** : `FormationConventionDocument` n'a **pas de prop `signer_email`** (ce champ existe dans `document_signatures.signer_name` après jointure, pas dans `documents` directement). Le cast produit **silencieusement `undefined`**. Conséquence : `title={signerEmail ? ... : "Envoyé pour signature"}` affiche toujours le fallback.

**Impact UX** : le tooltip du badge « En attente » indique « Envoyé pour signature » au lieu du vrai nom du signataire. Fonctionnalité partiellement cassée mais non détectée (juste perte d'info).

**Fix** : soit étendre `FormationConventionDocument` avec `signer_email?: string | null` quand on attache le résultat de la jointure, soit retirer le `title` et afficher le signer dans une autre UI.

### 4.3 🟠 BUGS MAJEURS

#### M1 — 14 `onRefresh()` sans `await` (fire-and-forget systémique)

Identifiés aux lignes : 596, 610, 628, 722, 800, 856, 972, 1009, 1028, 1059, 1101, 1127, 1854, 2096.

**Pattern** : pareil que dans le chantier Résumé (M2 résolu) — les handlers terminent par `onRefresh()` sans `await`, créant race conditions entre la mutation et le re-fetch.

#### M2 — 2 handlers SANS try/catch sur des UPDATE Supabase

- [`handleMassConfirm` (ligne 958)](src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx#L958)
- [`handleConfirmAllForOwner` (ligne 1013)](src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx#L1013)

Si Supabase renvoie une erreur, le résultat est ignoré (pas de toast d'erreur, pas de rollback UI).

#### M3 — `catch {}` vide ligne 844 dans la boucle PDF

```ts
for (const doc of targetDocs) {
  try {
    const html = await generateDocHtml(doc);
    const base64 = await exportHtmlToPDFBase64(...);
    const res = await fetch("/api/emails/send", {...});
    // ...
  } catch { /* swallow */ }  // ← ligne 844
}
```

Le doc est **silencieusement skippé** sans incrémenter `failed++`. L'utilisateur voit un compteur « N réussis, 0 échecs » alors qu'en réalité X docs ont planté.

#### M4 — 2 `console.error` silencieuses (lignes 427, 1096)

- Ligne 427 : `initializeDefaultDocs` — si l'INSERT des docs par défaut échoue, console.error mais **pas de toast**. L'admin pense que la session est prête mais aucun doc n'est créé.
- Ligne 1096 : `handleAssignTemplateToAll` upsert failure — pas de toast. L'utilisateur croit que l'attribution a réussi.

#### M5 — 3 casts `as unknown as` (B4 + 2 autres)

| Ligne | Cast | Raison |
|---|---|---|
| 1140 | `as unknown as Record<string, string>` | `signer_email` manquant dans le type — **bug fonctionnel** (cf B4) |
| 1629 | `DEFAULT_LEARNER_DOCS as unknown as string[]` | DocMatrixSection attend `string[]`, on a un union `ConventionDocType[]` |
| 1643 | `DEFAULT_COMPANY_DOCS as unknown as string[]` | idem |
| 1657 | `DEFAULT_TRAINER_DOCS as unknown as string[]` | idem |

(Le subagent a identifié 3 mais il y en a 4 en réalité.) Les 3 derniers (1629/1643/1657) sont des incompatibilités de signature avec `DocMatrixSection`. Fix : modifier la signature du composant pour accepter `ConventionDocType[]` ou exporter le type comme `readonly string[]`.

#### M6 — TODOs Story F1.x (ligne 899) et F2.x (ligne 805)

Ces TODOs documentent une **dette architecturale connue** :

**TODO F2.x (L805)** dans `handleMassSendWithPDF()` : pour les doc_types sans route `send-{type}s-batch-email`, le composant **fallback en boucle client** :
```ts
for (const doc of targetDocs) {
  const html = await generateDocHtml(doc);
  const base64 = await exportHtmlToPDFBase64(...);  // jsPDF côté client
  await fetch("/api/emails/send", { body: { ..., attachment: base64 } });
  await new Promise(r => setTimeout(r, 800));  // rate limit Resend
}
```

Pour une formation à 30 apprenants × 1 doc à envoyer = ~24 secondes de blocage navigateur.

**TODO F1.x (L899)** dans `handleDownloadAllPDF()` : idem pour les ZIP, avec 600 ms/doc.

**Doc_types non migrés** (utilisent encore le fallback client) :
- `cgv`, `reglement_interieur`, `politique_confidentialite` (Story F1.x)
- `planning_semaine`, `feuille_emargement_vierge`, `bilan_poe` (Story F1.x)
- Beaucoup de secondaires h-22 (Story F2.x extensions) sauf si déjà migrés

**Fix proposé** : créer les routes manquantes en suivant le pattern existant (`/api/documents/send-{type}s-batch-email` + `/api/documents/generate-{type}s-batch`). Effort : ~30 min par doc_type × ~15 doc_types non migrés = ~7-8 heures.

### 4.4 🟡 DETTE & WARNINGS

- **Monolithe 2 101 LOC** dans un seul fichier `.tsx`. Le pattern `sections/` adopté pour TabResume serait bénéfique ici (Sections : Matrix, DetailLearners, DetailCompanies, DetailTrainers, SecondaryDocs, Dialogs).
- **Constantes locales redondantes** (DOC_COLORS, DOC_LABELS, etc., lignes 61-250) — devraient être dans `src/lib/templates/registry.ts` ou un `doc-types-metadata.ts` partagé.
- **Pattern de fetch templates inline** au lieu d'un service (lignes 307-316) — incohérent avec l'usage de `documents-store` pour les autres opérations.
- **8 appels Supabase inline** dans le composant (au lieu de passer par services). Cohérence à améliorer.
- **Aucun test unitaire** sur le composant TabConventionDocs lui-même (juste les services).
- **`STATIC_DOCS` hardcodés** (cgv, politique_confidentialite, reglement_interieur, programme_formation) — pourraient être dérivés du registry via un flag `ownerType === "session"`.
- **`useState saving: string | null` avec clés composées** (`reset-{id}`, `send-{id}`, `confirm-all-{id}`, etc.) — pattern fragile, devrait être un `Map<string, boolean>` typé.
- **Pas d'AbortController** sur les fetchs longs (PDF generation, batch email).
- **`legacy formation_convention_documents`** : encore référencée dans certains imports — la migration b-3 à b-7 n'est pas terminée. Mention explicite dans le README/migration docs nécessaire.

### 4.5 🔵 OBSERVATIONS UX

- **Vue Matrice par défaut** : très lisible, mais cliquer sur une cellule ouvre un PDF — pas évident sans onboarding.
- **Mass actions** : disponibles dans Vue Détail seulement, pas dans Matrix.
- **Pas d'historique des envois** : si on envoie un certificat, qu'on le re-envoie, on n'a pas de trace.
- **Pas de prévisualisation du contenu de l'email** dans le dialog Mass Send (juste le compteur N docs concernés).
- **Documents secondaires** dans une section repliable en bas — pas évident qu'on peut les attribuer.

---

## 5. Cartographie des risques et priorité

| # | Sévérité | Risque | Effort | Bénéfice |
|---|---|---|---|---|
| B1 | 🔴 critique | 5 UPDATE Supabase sans entity_id | S | Sécurité multi-tenant |
| B2 | 🔴 critique | document_templates select sans entity_id | XS | Sécurité |
| B3 | 🔴 critique | document_signatures select sans entity_id | XS | Sécurité |
| B4 | 🔴 critique | Cast `as unknown as` ligne 1140 — signer_email silencieusement undefined | XS | Bug UX caché |
| M1 | 🟠 majeur | 14 onRefresh() fire-and-forget | XS audit + S fix | Race conditions |
| M2 | 🟠 majeur | 2 handlers sans try/catch | XS | Robustesse |
| M3 | 🟠 majeur | catch {} vide ligne 844 | XS | Visibility |
| M4 | 🟠 majeur | 2 console.error silencieux | XS | UX |
| M5 | 🟠 majeur | 3 casts `as unknown as` (3/4 sont signature DocMatrixSection) | S | Type safety |
| M6 | 🟠 majeur | TODOs F1.x/F2.x — boucles client 600-800ms × N | L (~7-8h) | UX + perf |
| D1 | 🟡 dette | Monolithe 2 101 LOC | XL (refacto sections/) | Maintenabilité |
| D2 | 🟡 dette | Constantes locales redondantes | M | DRY |
| D3 | 🟡 dette | 8 appels Supabase inline (vs services) | M | Consistance |
| D4 | 🟡 dette | Aucun test sur le composant | M | Couverture |
| D5 | 🟡 dette | Pas d'AbortController | S | Hygiène React |
| D6 | 🟡 dette | Legacy table références | M | Migration finale |

---

## 6. Pistes de chantier (à valider)

### Piste A — Sécurité multi-tenant (résout B1-B3)

Audit transverse + ajout systématique de `.eq("entity_id", formation.entity_id)` sur les 7 queries identifiées. Extraire dans `documents-store.ts` les helpers manquants :
- `updateDocsForOwner(supabase, entityId, sessionId, ownerType, ownerId, patch)`
- `updateDocsByDocType(supabase, entityId, sessionId, docType, status, patch)`
- `getTemplateById(supabase, entityId, templateId)` (au lieu de fetch inline)

### Piste B — Type safety (résout B4 + M5)

- Étendre `FormationConventionDocument` avec `signer_email?: string | null` quand la jointure est faite côté query (page.tsx)
- Modifier `DocMatrixSection` pour accepter `ConventionDocType[] | string[]` ou exporter le type
- Audit transverse `as unknown as` dans TabConventionDocs et fichiers liés

### Piste C — Robustesse (résout M1-M4)

- `await onRefresh()` partout (14 occurrences)
- try/catch sur `handleMassConfirm` et `handleConfirmAllForOwner`
- Compteur `failed++` dans le `catch {}` vide ligne 844
- Toasts d'erreur sur les 2 console.error (M4)

### Piste D — Stories F1.x / F2.x (résout M6) — gros chantier

Créer les routes manquantes `send-{type}s-batch-email` pour :
- cgv, reglement_interieur, politique_confidentialite, planning_semaine, feuille_emargement_vierge, bilan_poe, etc.

Pour chaque, suivre le pattern existant de `send-certificats-realisation-batch-email`. Effort : ~30 min × ~15 doc_types = ~7-8 heures. Bénéfice UX : suppression des fallback 800 ms × N.

### Piste E — Découpage du composant (D1)

Suivre le pattern `sections/` de TabResume :
```
TabConventionDocs.tsx  (orchestrateur ~200 LOC)
└── sections/
    ├── ConventionMatrix.tsx        (vue Matrice ~300 LOC)
    ├── ConventionDetail.tsx         (vue Détail orchestratrice ~150 LOC)
    ├── ConventionDetailLearners.tsx (~300 LOC)
    ├── ConventionDetailCompanies.tsx (~250 LOC)
    ├── ConventionDetailTrainers.tsx (~250 LOC)
    ├── ConventionSecondaryDocs.tsx  (~250 LOC)
    ├── ConventionDialogs.tsx        (PDF preview + Email preview ~200 LOC)
    └── helpers/
        ├── doc-types-metadata.ts    (DOC_COLORS, DOC_LABELS centralisés)
        └── handlers/                 (extraits du composant)
```

Énorme refacto. À faire idéalement APRÈS Pistes A-C (qui ne bougent pas l'architecture).

### Piste F — Tests (résout D4)

- Tests unitaires sur `documents-store.ts` (les nouveaux helpers de Piste A)
- Tests sur `useDocumentGeneration` hook
- Tests e2e sur les flows critiques (génération certificat + envoi + signature)

---

## 7. Plan d'action recommandé

### Quick wins (1 PR, ~1 jour)

- **Piste A complète** (B1-B3) — extraire helpers + audit entity_id
- **Piste C** (M1-M4) — audit await + try/catch + visibility

### Chantier intermédiaire (1 PR, 1-2 jours)

- **Piste B** (B4 + M5) — typage signer_email + audit casts
- **Piste F partiel** — tests sur les nouveaux helpers de Piste A

### Chantier de fond (1 PR, 7-8h)

- **Piste D** (M6) — créer les ~15 routes batch email manquantes (Stories F1.x/F2.x). Sortie : disparition complète des fallback client-side.

### Refacto architectural (1 PR, 2-3 jours) — pas obligatoire

- **Piste E** (D1) — découper en `sections/`. À faire quand le composant aura encore besoin d'évoluer.

---

## 8. Synthèse en 1 paragraphe

`TabConventionDocs` est un **monolithe critique** (2 101 LOC, le plus gros tab) qui orchestre **toute la documentation Qualiopi** d'une formation. Sa surface fonctionnelle est énorme (38 templates HTML, 114 routes API, 3 pipelines de signature, cache PDF, couplage automatisations) et il fonctionne globalement. Mais **6 risques de sécurité multi-tenant** (UPDATE Supabase + SELECT templates sans `entity_id` filter), **14 `onRefresh()` fire-and-forget**, **2 handlers sans try/catch**, et **2 TODOs Story F.x** qui forcent des **fallback client de 600-800 ms × N docs** font de ce tab le **prochain candidat évident à solidifier**. Aucune rupture du parcours utilisateur, mais des risques cachés à fort impact si exploités ou si la formation a beaucoup de destinataires. Plan d'action : 3 PRs étalées sur **~2-3 jours** couvrent les pistes A (sécurité), B (typage), C (robustesse), et un PR de fond de **7-8 heures** pour les Stories F1.x/F2.x. Le découpage en `sections/` (Piste E) est nice-to-have et peut attendre.

---

## 9. Annexes — Stories F1.x / F2.x état détaillé

### F2.x — Stories DÉPLOYÉES (5 routes server-side)

| Story | Endpoint | Doc_type |
|---|---|---|
| F2.1 | `send-certificats-realisation-batch-email` | certificat_realisation |
| F2.2 | `send-attestations-assiduite-batch-email` | attestation_assiduite |
| F2.3 | `send-conventions-batch-email` | convention_entreprise |
| F2.4 | `send-emargements-individuels-batch-email` | feuille_emargement |
| F2.5 | `send-conventions-intervention-batch-email` | convention_intervention |

Extension : `send-convocations-batch-email` (en + des 5 Stories F2)

### F1.x — Doc_types en attente (utilisent fallback client)

| Doc_type | Route generate | Route batch | Route send-batch-email |
|---|---|---|---|
| cgv | ✅ | ❌ | ❌ |
| reglement_interieur | ✅ | ❌ | ❌ |
| politique_confidentialite | ✅ | ❌ | ❌ |
| planning_semaine | ❌ | ❌ | ❌ |
| feuille_emargement_vierge | ❌ | ❌ | ❌ |
| bilan_poe | ✅ | ✅ | ❌ |
| reponses_evaluations | ✅ | ❌ | ❌ |
| reponses_satisfaction_session | ✅ | ❌ | ❌ |
| resultats_evaluations | ✅ | ✅ | ❌ |
| 9 variantes habilitation_electrique | ✅ | ✅ | ❌ |
| 5 attestations métier | ✅ | ✅ (4/5) | ❌ |
| 5 docs administratifs signables | ✅ | ✅ | ❌ |

**~15 doc_types** sans route `send-*-batch-email` → boucle client systématique.

---

**Fin du deep-dive.** Prêt à enchaîner sur le brainstorming + plan + exécution du chantier de solidification (pattern Qualiopi/Résumé identique).
