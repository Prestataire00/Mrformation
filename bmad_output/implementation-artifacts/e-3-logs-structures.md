---
storyId: E3
storyKey: e-3-logs-structures
epic: E
title: Logs structurés pour events document_*
status: done
priority: med
effort: 0.5 j-h
sourcePRD: prd-documents.md FR-DOC-39
sourceEpic: epics-documents.md Epic E
createdAt: 2026-05-15
completedAt: 2026-05-17
---

# Story E3 — Logs structurés

## Statement

**As a** Loris (gérant OF) + dev équipe,
**I want** que tous les events `document_*` (sent, signed, failed, signature_requested) émettent des logs structurés JSON via `logEvent()`,
**So that** on peut grep dans Netlify Logs pour diagnostic / alerting prod (ex: `event="document_failed"` pour voir tous les échecs Resend).

## Contexte technique

`src/lib/logger.ts` expose déjà `logEvent(event, context)` qui émet `console.log(JSON.stringify({event, ts, ...context}))`. Format grep-able dans Netlify.

**Events existants AVANT cette story** :
- `document_generated` (DocumentGenerationService) ✅
- `document_failed` (DocumentGenerationService, sur erreur engine PDF) ✅

**Events manquants après audit** :
- `document_sent` (batch email + single sign-request)
- `document_signed` (C1 `/api/documents/sign`)
- `document_signature_requested` (nouveau pour F3)
- `document_failed` pour les actions `send_email` / `sign` / `signature_request`
- Summaries `batch_send_summary` + `batch_signature_request_summary`

## Implementation

3 fichiers instrumentés :

### 1. `src/lib/services/batch-email-handler.ts` (couvre 6 endpoints F2.x)
- Pour chaque task fulfilled : `document_sent` avec `{entity_id, doc_type, session_id, owner_id, owner_type, recipient_email, resend_id, latency_ms}`
- Pour chaque task rejected : `document_failed` avec `{entity_id, doc_type, ..., action: "send_email", error_message}`
- Global : `batch_send_summary` avec `{entity_id, doc_type, total, success, failure, latency_ms}`

### 2. `src/app/api/documents/signature-request-batch/route.ts` (F3)
- Pour chaque doc fulfilled : `document_signature_requested` avec `{entity_id, doc_type, doc_id, owner_id, owner_type, recipient_email, expires_at, latency_ms}`
- Pour chaque rejected : `document_failed` action `signature_request`
- Global : `batch_signature_request_summary`

### 3. `src/app/api/documents/sign/route.ts` (C1)
- Sur succès signature : `document_signed` avec `{entity_id, doc_type, session_id, doc_id, owner_id, owner_type, signer_type, already_signed, latency_ms}`
- Catch global : `document_failed` action `sign`

## Definition of Done

- [x] `batch-email-handler.ts` émet `document_sent` / `document_failed` / `batch_send_summary` (couvre les 6 endpoints F2.x)
- [x] `signature-request-batch/route.ts` émet `document_signature_requested` / `document_failed` / `batch_signature_request_summary`
- [x] `/api/documents/sign` C1 émet `document_signed` + `document_failed` (action='sign')
- [x] Typecheck OK
- [x] Tests existants 369/369 passent toujours
- [x] PR créée + mergée
- [x] Sprint-status : e-3 → done

## Notes / Trade-offs

- **`sign-request` single non instrumenté** : volontairement out-of-scope MVP — l'endpoint single est moins utilisé que les batch maintenant que F3 existe. Ajout futur dans E3.1 si besoin (~10 min).
- **Pas de tests unitaires logEvent** : c'est du `console.log` JSON pur, déjà couvert par l'usage e2e (visible dans Netlify Logs). Tester `logEvent` reviendrait à tester `console.log`.
- **Format payload uniforme** : `{ entity_id, doc_type, session_id, doc_id?, owner_id?, owner_type?, latency_ms, [action], [error_message] }`. Permet de grep par `event="X"` ou `entity_id="Y"` dans Netlify.
- **`document_failed` partout** : même nom d'event que DocumentGenerationService → permet de monitor TOUS les types de failures en 1 query (`event="document_failed"`), filtrable par `action` (`generate` / `send_email` / `sign` / `signature_request`).
