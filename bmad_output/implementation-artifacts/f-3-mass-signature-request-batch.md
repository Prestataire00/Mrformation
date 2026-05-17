---
storyId: F3
storyKey: f-3-mass-signature-request-batch
epic: F
title: Mass signature request batch (Loris envoie N demandes de signature en 1 click)
status: done
priority: high
effort: 1-1.5 j-h dev
sourcePRD: prd-documents.md FR-DOC-48
sourceEpic: epics-documents.md Epic F lignes 759-770
createdAt: 2026-05-17
completedAt: 2026-05-17
---

# Story F3 — Mass signature request batch

## Story Statement

**As a** Loris (gérant OF, admin),
**I want** un bouton "Demander signature à tous" dans `TabConventionDocs` pour les doc_types signature (convention_entreprise / convention_intervention / contrat_sous_traitance),
**So that** je crée N magic links + envoie N emails en 1 click au lieu de cliquer N fois sur "Envoyer pour signature".

## Contexte technique découvert

- **`/api/documents/sign-request` (single doc) existe déjà** : crée token signing_tokens + update doc (signature_token, signature_requested_at, signer_email) + envoie email Resend avec lien `/sign/{token}` + log email_history.
- **C1 `/api/documents/sign` (target final) déjà unifié** : valide le token → fetch doc → update is_signed/signed_at + audit (signature_ip, signature_user_agent).
- **F3 = clone du single en mode batch** : Promise.allSettled, fail-soft per-recipient.
- **Pas d'attachment PDF** : juste un email texte avec le lien magic (le destinataire ira voir le doc HTML directement dans `/sign/[token]` page).

## Acceptance Criteria

### AC-1 — 1 click → N tokens + N emails
- **Given** session avec 5 entreprises rattachées via `formation_companies`, chacune ayant un doc `convention_entreprise` confirmé non-signé
- **When** Loris clique "Demander signature à tous"
- **Then** un POST `/api/documents/signature-request-batch { sessionId, docType }` est envoyé
- **And** 5 rows `signing_tokens` créés (purpose='document_signature', expires_at = NOW + 30 jours, lié à chaque document_id)
- **And** 5 docs updated : `signature_token`, `signature_requested_at`, `signer_email`, `is_sent=true, sent_at`
- **And** 5 emails partent avec lien magic `/sign/{token}` + insert email_history
- **And** toast : "5 demandes de signature envoyées (X.Xs)"

### AC-2 — Fail-soft per-recipient
- **Given** 4/5 OK, 1 sans email
- **Then** réponse `{ totalRequested: 5, successCount: 4, failureCount: 1, errors: [{ docId, ownerName, error: "Pas d'email" }] }`
- **And** toast : "4/5 envoyés, 1 échec : ABC SARL (Pas d'email)"

### AC-3 — Skip déjà-signés
- **Given** 3 docs déjà signés (`is_signed=true`) sur les 5
- **When** Loris clique
- **Then** seulement les 2 non-signés sont processed (skip silencieux des 3 déjà signés)

## Files to Create / Modify

- **NEW** : `src/app/api/documents/signature-request-batch/route.ts`
  - Body : `{ sessionId, docType }`
  - Charge docs `where session_id=X AND doc_type=Y AND requires_signature=true AND !is_signed`
  - Pour chaque doc → résout signer_email (selon owner_type) → crée token → update doc → envoie email Resend → insert email_history
  - Promise.allSettled fail-soft
  - Retour `{ totalRequested, successCount, failureCount, errors, totalLatencyMs }`

- **NEW** : `src/lib/utils/batch-doc-signature-request.ts`
  - Mapping `SIGNATURE_BATCH_ENDPOINTS_BY_DOC_TYPE` (3 doc_types signature)
  - `hasBatchSignatureRequestEndpoint(docType)` + `requestBatchSignatures({ docType, sessionId })`

- **MODIFY** : `src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx`
  - Nouveau bouton "Demander signature à tous" pour les 3 doc_types signature, visible si ≥1 doc confirmed && !is_signed
  - Handler `handleMassSignatureRequest(docType)` qui appelle le helper

- **NEW** : `src/lib/utils/__tests__/batch-doc-signature-request.test.ts`
  - Mock fetch → vérifier POST body, response handling, errors

## Definition of Done

- [x] Endpoint `signature-request-batch/route.ts` créé
- [x] Helper `batch-doc-signature-request.ts` créé
- [x] Bouton + handler dans TabConventionDocs (2 boutons : entreprises + formateurs)
- [x] Tests unitaires passent (8/8)
- [x] Typecheck OK
- [x] Tests existants 361/361 passent toujours (total 369)
- [x] PR créée + mergée
- [x] Sprint-status : f-3 → done, epic-f → done (3/3 + 5 extensions F2.x done)

## Dev Agent Record

**Implementation 2026-05-17 :**

- **Endpoint `/api/documents/signature-request-batch`** (~280 lignes) :
  - Body `{ sessionId, docType }` avec validation que docType ∈ {convention_entreprise, convention_intervention, contrat_sous_traitance}
  - Charge session + formation_companies + formation_trainers + enrollments en 1 query (joins)
  - Charge docs candidats `where doc_type=X AND requires_signature=true AND !is_signed`
  - Pour chaque doc (Promise.allSettled) :
    1. Résout `signer_email` selon `owner_type` (primary contact client / trainer.email / learner.email)
    2. INSERT signing_tokens (purpose='document_signature', expires_at = NOW + 30j)
    3. UPDATE formation_convention_documents (signature_token, signature_requested_at, signer_email, is_sent, sent_at)
    4. Envoie email Resend avec bouton CTA "Signer le document" pointant vers `/sign/{token}`
    5. INSERT email_history (best-effort)
  - Skip silencieux des docs déjà signés (filtre SQL `is_signed=false`)
  - Pas d'attachment PDF (juste le lien magic — le destinataire verra le doc sur `/sign/[token]`)

- **Helper frontend `batch-doc-signature-request.ts`** (~70 lignes) :
  - Set `SIGNATURE_BATCH_SUPPORTED_DOC_TYPES` (3 doc_types)
  - `hasBatchSignatureRequestEndpoint()` + `requestBatchSignatures({docType, sessionId})`

- **UI TabConventionDocs** :
  - State `massRequestingSig`
  - Handler `handleMassSignatureRequest(docType)` avec toast détaillé success/fail
  - 2 nouveaux boutons "Demander signature à tous" (orange) à côté de "Envoyer tout" dans les sections Entreprises et Formateurs
  - Icon `PenLine` cohérent avec le bouton single-doc existant

**Bénéfice user :**
- Avant : pour signer N conventions, Loris clique N fois sur "Envoyer pour signature" (1 par doc)
- Après : 1 click → N tokens + N emails en parallèle Resend + N updates docs → 3-5s typique

**Pas via batch-email-handler.ts** : F3 a une logique métier propre (création token + update multi-champs) qui mérite son endpoint dédié. Le helper sert pour le pattern "génère PDF + envoie email avec pj". Tentative de fusion serait du sur-engineering.

**Files modifiés :**
- `src/app/api/documents/signature-request-batch/route.ts` (NEW)
- `src/lib/utils/batch-doc-signature-request.ts` (NEW)
- `src/lib/utils/__tests__/batch-doc-signature-request.test.ts` (NEW, 8 tests)
- `src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx` (state + handler + 2 boutons)
- `bmad_output/implementation-artifacts/sprint-status.yaml` (f-3 → done, epic-f → done)

## Notes

- **expires_at = 30 jours** (aligné avec `/api/documents/sign-request` single, mieux pour UX Loris vs 7 jours de l'epic — sessions parfois planifiées 1-2 mois à l'avance).
- **Pas via batch-email-handler.ts** : F3 a une logique spécifique (token + update doc multi-champs) qui mérite son endpoint dédié. Le helper sert pour le pattern "génère PDF + envoie email avec pj".
- **`requires_signature` calculé client-side** : doc_type ∈ REQUIRES_SIGNATURE_TYPES (constante TabConventionDocs). Côté serveur on filtre via la colonne `requires_signature` qui est settée à l'init.
