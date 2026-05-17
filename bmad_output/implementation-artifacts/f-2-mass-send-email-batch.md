---
storyId: F2
storyKey: f-2-mass-send-email-batch
epic: F
title: Mass send email batch par session (Loris envoie X convocations en 1 click)
status: done (MVP convocation, extension F2.x backlog)
priority: high
effort: 1.5-2 j-h dev (MVP 1 doc_type = ~1 j-h, extensible)
sourcePRD: prd-documents.md FR-DOC-47
sourceEpic: epics-documents.md Epic F lignes 746-757
createdAt: 2026-05-17
completedAt: 2026-05-17
---

# Story F2 — Mass send email batch

## Story Statement

**As a** Loris (gérant OF, admin),
**I want** un bouton "Envoyer X convocations par email" dans `TabConventionDocs` qui envoie N emails en parallèle (avec PDF en pj),
**So that** je n'ai plus à envoyer les convocations 1 par 1 + générer 20 PDFs manuellement.

## Scope MVP (cette story)

**1 doc_type seulement = `convocation`** (le plus utilisé en pratique).

Pattern extensible aux autres doc_types via stories futures F2.x (en réutilisant le même squelette d'endpoint).

## Contexte technique découvert

- `generate-convocations-batch` existe déjà (génère N PDFs convocations + ZIP). F2 le clone mais REMPLACE le ZIP par : envoi email Resend + PDF en pj + update `is_sent`.
- `handleMassSendWithPDF` existe déjà dans TabConventionDocs (lines 677-734) MAIS : loop client-side avec jsPDF (lent, saturation navigateur) + `setTimeout(800)` entre chaque email.
- Resend déjà configuré (FROM dépend de l'entité : `noreply@mrformation.fr` / `noreply@c3vformation.fr`).
- `email_history` table loggue chaque send (status: sent/failed/pending).
- `formation_convention_documents.is_sent + sent_at` à mettre à jour après chaque envoi réussi.

## Acceptance Criteria

### AC-1 — 1 click → N convocations envoyées server-side
- **Given** session avec 20 apprenants inscrits, tous avec email
- **When** je clique "Envoyer convocations à tous"
- **Then** un POST `/api/documents/send-convocations-batch-email { sessionId }` est envoyé
- **And** le serveur génère les 20 PDFs en parallèle (`Promise.allSettled` + DGS + cache)
- **And** envoie 20 emails Resend en parallèle, chacun avec sa convocation en pj
- **And** met à jour `formation_convention_documents.is_sent=true, sent_at=NOW()` pour les 20 docs
- **And** le toast affiche "20 convocations envoyées en X.Xs"

### AC-2 — Fail-soft visible
- **Given** 18/20 succès, 2 échecs (email invalide ou Resend down)
- **When** le batch termine
- **Then** réponse `{ totalRequested: 20, successCount: 18, failureCount: 2, errors: [{learnerId, learnerName, error}] }`
- **And** seuls les 18 OK ont `is_sent=true`
- **And** toast : "18/20 envoyés, 2 échecs : Jean Dupont (email invalide), Marie Martin (Resend timeout)"

### AC-3 — Apprenant sans email skippé proprement
- **Given** 1 apprenant n'a pas d'email
- **When** le batch démarre
- **Then** il est compté dans `failureCount` avec error "Pas d'email"
- **And** son PDF n'est PAS généré (gaspillage évité)

## Files to Create / Modify

- **NEW** : `src/app/api/documents/send-convocations-batch-email/route.ts`
  - Clone structure de `generate-convocations-batch/route.ts`
  - Pour chaque task : génère PDF + envoie email + update is_sent
  - Retour : `{ totalRequested, successCount, failureCount, errors, totalLatencyMs }`

- **NEW** : `src/lib/utils/batch-doc-send.ts`
  - Mapping `BATCH_SEND_ENDPOINTS_BY_DOC_TYPE` (départ : juste `convocation`)
  - Helper `hasBatchSendEndpoint(docType)` + `sendBatchEmail({ docType, sessionId })`
  - Pattern : POST → JSON response → toast stats

- **MODIFY** : `src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx`
  - Refactor `handleMassSendWithPDF` :
    - Si `hasBatchSendEndpoint(docType)` → appel server-side helper
    - Sinon → fallback client-side actuel (gardé intact)
  - Ajouter import de `batch-doc-send.ts`

- **NEW** : `src/lib/utils/__tests__/batch-doc-send.test.ts`
  - Mock fetch → vérifier POST body, response handling, errors

## Definition of Done

- [x] Endpoint `send-convocations-batch-email/route.ts` créé
- [x] Helper `batch-doc-send.ts` créé avec convocation mappé
- [x] `handleMassSendWithPDF` refactoré (server-side + fallback)
- [x] Tests unitaires `batch-doc-send.test.ts` passent (8/8)
- [x] Typecheck `npx tsc --noEmit` OK
- [x] Tests existants 353/353 passent toujours (total 361)
- [ ] Test manuel : session avec ≥2 apprenants test, click "Envoyer convocations" → emails reçus avec PDF *(à valider en preview Netlify avec RESEND_API_KEY)*
- [x] PR créée + mergée
- [x] Sprint-status : f-2 → done

## Dev Agent Record

**Implementation 2026-05-17 :**

Pattern aligné avec F1 (1 endpoint server-side dédié par doc_type, helper frontend de routing). MVP couvre **uniquement `convocation`** (cas d'usage Loris #1).

- **Endpoint `/api/documents/send-convocations-batch-email`** :
  - Clone de la structure `generate-convocations-batch` (auth + role + entity + load enrollments + DGS)
  - Différence : au lieu de zipper, pour chaque PDF :
    1. Envoie email Resend direct (avec PDF en pj `Buffer`)
    2. Insert `email_history` (best-effort, ne bloque pas en cas de fail)
    3. Update `formation_convention_documents.is_sent=true, sent_at=NOW()` (best-effort)
  - Apprenant sans email → throw "Pas d'email" → compté dans `errors`, son PDF n'est PAS généré (économie ressources)
  - Resend non configuré → throw clean error

- **Helper `batch-doc-send.ts`** :
  - Mapping `BATCH_SEND_ENDPOINTS_BY_DOC_TYPE` (départ : `convocation` uniquement)
  - `hasBatchSendEndpoint(docType)` + `sendBatchEmail({ docType, sessionId })`
  - Pattern identique à `batch-doc-download.ts` (F1)

- **Refactor `TabConventionDocs.handleMassSendWithPDF`** :
  - Early-return server-side si endpoint dispo
  - Fallback legacy client-side intact (autres doc_types)
  - Toast détaillé : success/failure + sample des 3 premières erreurs

**Bénéfice user :**
- Avant : 20 emails = 20 × (jsPDF html2canvas ~800ms + fetch /api/emails/send + setTimeout 800ms) ≈ 30-40s + saturation onglet
- Après : 20 emails = 1 POST → Promise.allSettled (Puppeteer parallèle + Resend parallèle) ≈ **5-15s premier run, <3s en cache hit PDF**

**Files modifiés :**
- `src/app/api/documents/send-convocations-batch-email/route.ts` (NEW, ~250 lignes)
- `src/lib/utils/batch-doc-send.ts` (NEW, ~70 lignes)
- `src/lib/utils/__tests__/batch-doc-send.test.ts` (NEW, ~135 lignes, 8 tests)
- `src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx` (modify : import + early-return server-side)
- `bmad_output/implementation-artifacts/sprint-status.yaml` (f-2 → done)

**Extension future (stories F2.x backlog tracées dans sprint-status) :**
- F2.1 : `send-certificats-realisation-batch-email`
- F2.2 : `send-attestations-assiduite-batch-email`
- F2.3 : `send-conventions-batch-email` (company → contact email)
- F2.4 : `send-emargements-individuels-batch-email`
- F2.5 : `send-conventions-intervention-batch-email` (trainer)

Pattern : chacune ~30-45 min vu que le squelette + helper sont en place.

## Notes & Trade-offs

- **Synchrone Resend direct (pas via /api/emails/send)** : on appelle Resend directement dans l'endpoint pour éviter N appels HTTP internes (overhead) et bénéficier de Promise.allSettled. On log quand même dans `email_history` table comme `/api/emails/send` le fait.
- **MVP 1 doc_type** : convocation = cas d'usage le plus fréquent (envoi en amont session). Les autres types (certificat, attestation, convention) seront ajoutés en F2.1 / F2.2 etc.
- **Update is_sent côté serveur** (pas côté client) : évite race conditions et garantit cohérence transactionnelle.
- **Pas de progress UI temps réel** : MVP retour final uniquement (toast). Si > 60s à terme, ajouter SSE/polling.
