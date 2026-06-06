# Audit pré-implémentation E3-S06 — Batch ops handlers + refetch

**Date :** 2026-06-07
**Source audit :** E3-S04-batch-ops-audit.md (8 batch ops cartographiées)
**Entrée :** E3-S05 mergée (dialog confirmation)
**Sortie :** Plan d'impl détaillé + types partagés + brief E3-S06 prêt à coller

---

## Vue d'ensemble

E3-S06 refactorise les handlers identifiés par E3-S04 pour **garantir robustesse + refetch <2000ms**. Actuel : routes API batch existent (`sendBatchEmail`, `requestBatchSignatures` via utils), mais refetch + error handling varient. Plan : créer helpers de service formation + étendre documents-store avec types partagés + standardiser pattern handlers.

---

## Handlers à refactoriser (4)

### 1. handleMassSendWithPDF (lignes 771-801)

| Aspect | État actuel | Cible E3-S06 |
|--------|-------------|-------------|
| **Signature** | `async (ownerType, docType) => void` | Idem (wrappé dans helper) |
| **Source data mutée** | `documents.is_sent` (via API `/api/documents/send-X-batch-email`) | Idem |
| **Routes appelées** | `sendBatchEmail(args)` (via `utils/batch-doc-send.ts`) | Helper service + refetch |
| **Refetch présent** | ✅ Oui (ligne 800 : `await onRefresh()`) | Garanti <2000ms |
| **Error handling** | try/catch + toast destructive (erreur globale) + partial failures dans toast desc | Étendre : logging structuré par item, console.error avec contexte |
| **Pattern** | Déjà bon | Extraire en helper service `batchSendEmailWithRefetch()` |

**Risque identifié :** Aucun — pattern déjà correct, juste extraction en helper pour réutilisabilité.

**Refactor cible :**
```typescript
// src/lib/services/documents-store.ts — nouvel helper
export async function batchSendEmailWithRefetch(
  args: BatchSendArgs,
  onRefreshFn: () => Promise<void>
): Promise<BatchResult>
```

---

### 2. handleMassSignatureRequest (lignes 872-901)

| Aspect | État actuel | Cible E3-S06 |
|--------|-------------|-------------|
| **Signature** | `async (docType) => void` | Idem (wrappé dans helper) |
| **Source data mutée** | `documents.signature_requested_at`, `documents.metadata.signer_email` (via API `/api/documents/signature-request-batch`) | Idem |
| **Routes appelées** | `requestBatchSignatures(args)` (via `utils/batch-doc-signature-request.ts`) | Helper service + refetch |
| **Refetch présent** | ✅ Oui (ligne 900 : `await onRefresh()`) | Garanti <2000ms |
| **Error handling** | try/catch + toast destructive + partial failures dans toast desc | Étendre : logging structuré par item |
| **Pattern** | Déjà bon | Extraire en helper service `batchRequestSignaturesWithRefetch()` |

**Refactor cible :**
```typescript
// src/lib/services/documents-store.ts — nouvel helper
export async function batchRequestSignaturesWithRefetch(
  args: BatchSignatureArgs,
  onRefreshFn: () => Promise<void>
): Promise<BatchResult>
```

---

### 3. handleMassConfirm (lignes 907-925)

| Aspect | État actuel | Cible E3-S06 |
|--------|-------------|-------------|
| **Signature** | `async (docType, ownerType?) => void` | Idem |
| **Source data mutée** | `documents.status = 'generated'` (via `updateDocsByDocType()` du service documents-store) | Idem |
| **Refetch présent** | ✅ Oui (ligne 924 : `await onRefresh()`) | Garanti <2000ms |
| **Error handling** | result.ok check + toast (ligne 916) | Bon, mais étendre logging |
| **Pattern** | Bon, mais mutation SQL atomic | Passer par helper `batchConfirmDocuments()` |

**Refactor cible :**
```typescript
// src/lib/services/documents-store.ts — wrapper existing updateDocsByDocType
export async function batchConfirmDocumentsWithRefetch(
  args: BatchConfirmArgs,
  supabase: SupabaseClient,
  onRefreshFn: () => Promise<void>
): Promise<BatchResult>
```

---

### 4. handleAssignTemplateToAll (lignes 1019-1051)

| Aspect | État actuel | Cible E3-S06 |
|--------|-------------|-------------|
| **Signature** | `async (templateId) => void` | Idem (wrappé dans helper) |
| **Source data mutée** | `documents` table (via `upsertDocsIgnoreDuplicates()` du service documents-store) | Idem |
| **Refetch présent** | ✅ Oui (ligne 1050 : `await onRefresh()`) | Garanti <2000ms |
| **Error handling** | **BUG B3 :** try/catch captée mais toast succès hors du try/catch (s'affiche même après erreur) | **FIX REQUIS** : restructurer logique try/catch/finally |
| **Pattern** | Boucle client-side (map enrollments → rows) puis upsert batch | Extraire map + upsert en helper `batchAssignTemplateToLearners()` |

**Refactor cible :**
```typescript
// src/lib/services/documents-store.ts — nouvel helper
export async function batchAssignTemplateToLearnersWithRefetch(
  args: BatchAssignTemplateArgs,
  supabase: SupabaseClient,
  onRefreshFn: () => Promise<void>
): Promise<BatchResult>
```

---

## Service helpers à créer

### Option A : Étendre `src/lib/services/documents-store.ts`

Ajouter 4 nouveaux exports :

```typescript
// ===== Batch Operations with Refetch (E3-S06) =====

/**
 * Envoie batch emails pour un docType et rafraîchit l'UI.
 * Encapsule sendBatchEmail() + refetch atomiquement.
 */
export async function batchSendEmailWithRefetch(
  supabase: SupabaseClient,
  args: {
    docType: string;
    sessionId: string;
  },
  onRefresh: () => Promise<void>
): Promise<BatchResult>

/**
 * Lance batch signature requests pour un docType et rafraîchit l'UI.
 */
export async function batchRequestSignaturesWithRefetch(
  supabase: SupabaseClient,
  args: {
    docType: string;
    sessionId: string;
  },
  onRefresh: () => Promise<void>
): Promise<BatchResult>

/**
 * Fige (confirme) tous les documents d'un docType et rafraîchit l'UI.
 */
export async function batchConfirmDocumentsWithRefetch(
  supabase: SupabaseClient,
  args: {
    entityId: string;
    sessionId: string;
    docType: string;
    ownerType?: string;
  },
  onRefresh: () => Promise<void>
): Promise<BatchResult>

/**
 * Attribue un template custom à tous les apprenants et rafraîchit l'UI.
 */
export async function batchAssignTemplateToLearnersWithRefetch(
  supabase: SupabaseClient,
  args: {
    entityId: string;
    sessionId: string;
    templateId: string;
    enrollments: Array<{ learner?: { id: string } }>;
  },
  onRefresh: () => Promise<void>
): Promise<BatchResult>
```

**Rationale :** Les 4 helpers partagent le même pattern (try/catch → refetch → error logging) et mutations DB (tous via documents table). Colocalisés dans documents-store.

---

## Types partagés

### Créer `src/lib/types/batch-operations.ts` (nouveau fichier)

```typescript
/**
 * Erreur détaillée d'un item dans une batch operation.
 * Utilisée pour logging structuré + reporting UI.
 */
export interface BatchError {
  itemId: string;        // Document ID, learner ID, etc.
  itemLabel?: string;    // Nom lisible (pour toast)
  error: string;         // Message d'erreur brut
  code?: string;         // Code erreur (ex: "23505" pour duplicate)
  timestamp?: string;
}

/**
 * Résultat standardisé d'une batch operation.
 * Utilisé par tous les helpers (send, signature, confirm, assign).
 */
export interface BatchResult {
  success: boolean;           // Vrai si succès ≥ 1 ET refetch OK
  totalRequested: number;     // Count initial documents/items
  successCount: number;       // Items traités avec succès
  failureCount: number;       // Items échoués
  errors: BatchError[];       // Détails erreurs (max 10 pour toast)
  latencyMs?: number;         // Durée totale (hors refetch)
  refetchLatencyMs?: number;  // Durée refetch seule
}

/**
 * Mapping item → handler display name (toast, logging).
 */
export type ItemLabelResolver = (itemId: string, context?: unknown) => string;
```

### Implémenter dans `src/lib/services/documents-store.ts`

```typescript
import type { BatchError, BatchResult } from "@/lib/types/batch-operations";

// Constants pour logging structuré
const BATCH_ERROR_LOG_PREFIX = "[BatchOperation]";

// Helper interne : format erreur pour logging
function formatBatchError(err: unknown, itemId: string, label?: string): BatchError {
  return {
    itemId,
    itemLabel: label,
    error: err instanceof Error ? err.message : String(err),
    code: (err as { code?: string }).code,
    timestamp: new Date().toISOString(),
  };
}

// Helper interne : log structuré console
function logBatchError(op: string, error: BatchError) {
  console.error(`${BATCH_ERROR_LOG_PREFIX} ${op} — ${error.itemLabel ?? error.itemId}:`, error.error);
}
```

---

## Plan d'impl détaillé

### Étape 1 : Créer types + service signatures (½ jour)

**Fichiers à créer :**
- `src/lib/types/batch-operations.ts` : `BatchError`, `BatchResult`

**Fichiers à modifier :**
- `src/lib/services/documents-store.ts` : ajouter import + helpers skeleton

**Tests :**
- `src/lib/services/__tests__/documents-store.test.ts` : unit test structure BatchResult

---

### Étape 2 : Implémenter 4 helpers (1 jour)

**Impl ordre :**
1. `batchSendEmailWithRefetch()` — le plus simple (wrapping sendBatchEmail + refetch)
2. `batchRequestSignaturesWithRefetch()` — idem
3. `batchConfirmDocumentsWithRefetch()` — wrapping updateDocsByDocType + refetch
4. `batchAssignTemplateToLearnersWithRefetch()` — **FIX B3** : restructurer try/catch

**Chaque helper :**
```typescript
const t0 = Date.now();
try {
  // 1. Appel opération (API ou DB service)
  const opResult = await sendBatchEmail(...);  // ou autre
  const opLatency = Date.now() - t0;
  
  // 2. Refetch
  const t1 = Date.now();
  await onRefresh();
  const refetchLatency = Date.now() - t1;
  
  // 3. Logging structuré
  if (opResult.failureCount > 0) {
    opResult.errors.forEach(err => logBatchError("SendEmail", err));
  }
  
  // 4. Retour standardisé
  return {
    success: opResult.successCount > 0 && refetchLatency < 2000,
    totalRequested: opResult.totalRequested,
    successCount: opResult.successCount,
    failureCount: opResult.failureCount,
    errors: opResult.errors,
    latencyMs: opLatency,
    refetchLatencyMs: refetchLatency,
  };
} catch (err) {
  console.error(`${BATCH_ERROR_LOG_PREFIX} SendEmail — fatal:`, err);
  return {
    success: false,
    totalRequested: 0,
    successCount: 0,
    failureCount: 1,
    errors: [{ itemId: "batch", error: err instanceof Error ? err.message : String(err) }],
    latencyMs: Date.now() - t0,
  };
}
```

**Tests :**
- Mock sendBatchEmail, updateDocsByDocType, etc.
- Vérifier refetch appelé
- Vérifier latency fields populés
- Vérifier error logging structuré

---

### Étape 3 : Refactor handlers TabConventionDocs (½ jour)

**Fichier :** `src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx`

**Avant (handleMassSendWithPDF, ligne 771) :**
```typescript
const handleMassSendWithPDF = async (ownerType: ConventionOwnerType, docType: string) => {
  const key = `${ownerType}-${docType}`;
  setMassSending(key);
  try {
    const res = await sendBatchEmail({ docType, sessionId: formation.id });
    // toast logic
  } catch (err) {
    // error toast
  }
  setMassSending(null);
  await onRefresh();
};
```

**Après (Refactored) :**
```typescript
const handleMassSendWithPDF = async (ownerType: ConventionOwnerType, docType: string) => {
  const key = `${ownerType}-${docType}`;
  setMassSending(key);
  try {
    const result = await batchSendEmailWithRefetch(
      supabase,
      { docType, sessionId: formation.id },
      onRefresh
    );
    
    const summary = `${result.successCount}/${result.totalRequested} ${DOC_LABELS_PLURAL[docType]} envoyés`;
    if (result.failureCount > 0) {
      const sample = result.errors.slice(0, 3).map(e => `${e.itemLabel} (${e.error})`).join(", ");
      toast({
        title: summary,
        description: `${result.failureCount} échec(s) : ${sample}${result.errors.length > 3 ? "…" : ""}`,
      });
    } else {
      toast({ title: summary, description: `Envoyé en ${(result.latencyMs / 1000).toFixed(1)}s` });
    }
  } catch (err) {
    toast({
      title: "Erreur envoi batch",
      description: err instanceof Error ? err.message : String(err),
      variant: "destructive",
    });
  } finally {
    setMassSending(null);
  }
};
```

**Handlers à refactor :**
1. `handleMassSendWithPDF` → `batchSendEmailWithRefetch`
2. `handleMassSignatureRequest` → `batchRequestSignaturesWithRefetch`
3. `handleMassConfirm` → `batchConfirmDocumentsWithRefetch`
4. `handleAssignTemplateToAll` → `batchAssignTemplateToLearnersWithRefetch` (**FIX B3**)

---

### Étape 4 : Tests intégration quantifiés (½ jour)

**Criteria AC E3-S06 :**
> Batch op déclenchée sur 10 documents, polling /status retourne count mis à jour. Table refetch observable **<2000ms** post-completion backend, avec indicateur visuel (toast + row highlight fade-out). Count succès/échec matche audit log backend.

**Tests :**
1. **Unit tests** : `documents-store.test.ts` couvrant 4 helpers
2. **Intégration scenario** :
   - Créer 10 documents `status='draft'`
   - Appeler `batchConfirmDocumentsWithRefetch(...)`
   - Mesurer `Date.now()` pre/post refetch
   - Vérifier `documents.status` = `'generated'` via query directe
   - Assert refetch latency < 2000ms
3. **Toast UI** : vérifier counts affichés == BatchResult counts
4. **Logging** : vérifier console.error appelé pour chaque erreur item

**Fichier test :** `src/app/(dashboard)/admin/formations/[id]/__tests__/TabConventionDocs.integration.test.ts` (nouveau)

---

## Risques

| Risque | Likelihood | Mitigation |
|--------|-----------|-----------|
| Refetch >2000ms due to DB load | Basse | Ajouter `console.warn()` si refetchLatencyMs > 2000 dans helper + dashboard monitoring |
| Partial failures non reportés au user | Moyenne | Intégration test quantifiée (étape 4) confirme counts matchent |
| Legacy handleMassSend (doublon) non refactorisé | Basse | Auditer si ligne 928 encore utilisée — sinon retirer ; si utilisée, refactor identique |
| Service role key requis pour certaines ops | Basse | Documenter dans helper JSDoc que `supabase` doit être client auth (pas service role) |

---

## Brief E3-S06 prêt à coller

```
## E3-S06 — Batch ops handlers + refetch

**FR mapping** : FR-B-03 (handlers)

**Persona** : admin

**User story** : En tant qu'admin, je veux que les résultats des batch operations 
se reflètent immédiatement dans l'UI sans reload, avec logging structuré des 
erreurs pour debug.

**Pre-conditions** : E3-S04 + E3-S05 mergées.

**Acceptance criteria** :

1. Nouveau fichier `src/lib/types/batch-operations.ts` exporte :
   - `BatchError` : { itemId, itemLabel?, error, code?, timestamp? }
   - `BatchResult` : { success, totalRequested, successCount, failureCount, errors[], latencyMs?, refetchLatencyMs? }

2. Service `src/lib/services/documents-store.ts` étendu avec 4 helpers :
   - `batchSendEmailWithRefetch(supabase, args, onRefresh): Promise<BatchResult>`
   - `batchRequestSignaturesWithRefetch(supabase, args, onRefresh): Promise<BatchResult>`
   - `batchConfirmDocumentsWithRefetch(supabase, args, onRefresh): Promise<BatchResult>`
   - `batchAssignTemplateToLearnersWithRefetch(supabase, args, onRefresh): Promise<BatchResult>`
   
   Chaque helper :
   - Enveloppe logique métier (sendBatchEmail, updateDocsByDocType, etc.)
   - Appelle `await onRefresh()` post-operation
   - Accumule erreurs dans `BatchError[]` avec itemLabel
   - Mesure latency pre/post refetch
   - Log structuré : `console.error("[BatchOperation] OperationName — itemLabel: error")`

3. Handlers TabConventionDocs refactorisés pour appeler les 4 helpers :
   - `handleMassSendWithPDF` → `batchSendEmailWithRefetch`
   - `handleMassSignatureRequest` → `batchRequestSignaturesWithRefetch`
   - `handleMassConfirm` → `batchConfirmDocumentsWithRefetch`
   - `handleAssignTemplateToAll` → `batchAssignTemplateToLearnersWithRefetch` (FIX B3)
   
   Chaque handler : loading state → try/catch → toast résumé (X succès, Y erreurs) 
   → `await refetch()` (preserve filters) → console.error structuré sur erreur

4. Toast results affichent : `${result.successCount}/${result.totalRequested} items 
   opération`, + description `${result.failureCount} échec(s) : sample errors…`

5. Tests intégration quantifiés :
   - Batch op sur 10 documents → refetch observable <2000ms
   - Count succès/échec dans toast == BatchResult
   - Logging console capturé pour chaque erreur item
   - Refetch latency mesuré dans BatchResult.refetchLatencyMs

**Files affected** :
- `src/lib/types/batch-operations.ts` (nouveau)
- `src/lib/services/documents-store.ts` (extend)
- `src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx` (modify)

**Effort** : M-L (3-4j) — Risk : Moyen

**DoD** : 4 helpers actifs, refetch <2000ms confirmé, toasts informatifs, 
logging structuré, tests intégration pass.
```

---

## Appendix : Anti-hallucination check

✅ **Handlers identifiés via E3-S04 audit :** 
- handleMassSendWithPDF (ligne 771) — trouvé dans TabConventionDocs.tsx
- handleMassSignatureRequest (ligne 872) — trouvé dans TabConventionDocs.tsx
- handleMassConfirm (ligne 907) — trouvé dans TabConventionDocs.tsx
- handleAssignTemplateToAll (ligne 1019) — trouvé dans TabConventionDocs.tsx

✅ **Routes API batch existantes :** 
- /api/documents/send-convocations-batch-email (et autres send-*-batch-email)
- /api/documents/signature-request-batch
- /api/documents/generate-*-batch

✅ **Utils batch clients existants :**
- sendBatchEmail() @ src/lib/utils/batch-doc-send.ts
- requestBatchSignatures() @ src/lib/utils/batch-doc-signature-request.ts
- downloadBatchZip() @ src/lib/utils/batch-doc-download.ts

✅ **Service documents-store existant :**
- updateDocsByDocType() — ligne 150+ dans documents-store.ts
- updateDocsForOwner() — idem
- upsertDocsIgnoreDuplicates() — idem
- insertDocs() — idem

✅ **Aucun hallucination détectée** — tous les handlers, routes, et services 
cités existent et sont branchés dans le code actuel.

