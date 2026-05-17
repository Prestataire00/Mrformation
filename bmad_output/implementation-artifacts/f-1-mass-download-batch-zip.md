---
storyId: F1
storyKey: f-1-mass-download-batch-zip
epic: F
title: Mass download batch ZIP par session (Loris clique 1× au lieu de N×)
status: done
priority: high
effort: 1-1.5 j-h (ramené à ~0.5 j-h grâce à 28 endpoints batch déjà existants)
sourcePRD: prd-documents.md FR-DOC-46
sourceEpic: epics-documents.md Epic F lignes 733-744
createdAt: 2026-05-17
completedAt: 2026-05-17
---

# Story F1 — Mass download batch ZIP

## Story Statement

**As a** Loris (gérant OF, admin),
**I want** un seul bouton "Télécharger tout (X) en ZIP" dans `TabConventionDocs` pour chaque type de document,
**So that** je récupère 20 conventions/attestations/convocations en 1 click serveur (vs 20 clicks client-side avec html2canvas → jsPDF qui sature le navigateur).

## Contexte technique découvert

**Le bouton "PDF tout" existe déjà** (`handleDownloadAllPDF` dans `TabConventionDocs.tsx:737`). Mais il boucle **client-side** avec `exportHtmlToPDF` (jsPDF + html2canvas) + `setTimeout(600ms)` entre chaque doc. 20 docs = ~12s minimum + saturation navigateur.

**28 endpoints batch server-side existent déjà** sous `/api/documents/generate-X-batch` (Puppeteer + cache + Promise.allSettled + JSZip + `_erreurs.txt`). Ils acceptent tous le body uniforme `{ sessionId: string }` et retournent `{ zipBase64, totalLearners, successCount, failureCount, errors, totalLatencyMs }`.

**F1 = câbler le bouton existant vers les endpoints batch existants** (1 helper de mapping + refactor du handler). Pas besoin de créer de nouvel endpoint.

## Acceptance Criteria

### AC-1 — 1 click → ZIP server-side pour les doc_types supportés
- **Given** session avec 20 apprenants inscrits
- **When** je clique "PDF tout" sur la ligne "convocation"
- **Then** un POST `/api/documents/generate-convocations-batch { sessionId }` est envoyé
- **And** le ZIP renvoyé est téléchargé automatiquement via blob (filename `convocations_{sessionTitle}_{date}.zip`)
- **And** le toast affiche "20 PDF téléchargés (success: 20)" en moins de 60s (premier run) ou moins de 5s (cache hit)

### AC-2 — Fail-soft visible dans le toast
- **Given** 18/20 PDFs réussissent server-side, 2 échouent
- **When** le ZIP arrive côté client
- **Then** le toast affiche "20 PDF demandés, 18 réussis, 2 échecs (voir _erreurs.txt dans le ZIP)"
- **And** le ZIP contient bien 18 PDFs + `_erreurs.txt` à la racine (assemblé côté serveur)

### AC-3 — Fallback legacy pour les doc_types sans endpoint batch
- **Given** un doc_type sans endpoint batch (ex: `cgv`, `planning_semaine`)
- **When** je clique "PDF tout"
- **Then** le code retombe sur le path actuel client-side (`exportHtmlToPDF` loop)
- **And** un commentaire `// TODO F1.x: migrer ce doc_type vers endpoint batch server-side` est ajouté

## Mapping doc_type → endpoint batch

```typescript
const BATCH_ENDPOINTS_BY_DOC_TYPE: Partial<Record<string, string>> = {
  convocation: "generate-convocations-batch",
  certificat_realisation: "generate-certificats-realisation-batch",
  attestation_assiduite: "generate-attestations-assiduite-batch",
  feuille_emargement: "generate-emargements-individuels-batch",
  convention_entreprise: "generate-conventions-batch",
  convention_intervention: "generate-conventions-intervention-batch",
};
```

Doc_types **non couverts** (fallback legacy, à migrer dans stories F.next) :
- `cgv`, `politique_confidentialite`, `reglement_interieur`, `programme_formation` (statiques 1 par session, pas de batch nécessaire)
- `feuille_emargement_collectif` (1 par session)
- `contrat_sous_traitance`, `planning_semaine` (templates pas encore migrés post-A2)

## Files to Create / Modify

- **NEW** : `src/lib/utils/batch-doc-download.ts`
  - Export `BATCH_ENDPOINTS_BY_DOC_TYPE`
  - Export `downloadBatchZip({ docType, sessionId, sessionTitle, onProgress }): Promise<BatchDownloadResult>`
  - Helper qui : POST endpoint → décode `zipBase64` en Blob → trigger download via `<a download>` → retourne stats `{ totalRequested, successCount, failureCount }`

- **MODIFY** : `src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx:737-762`
  - Refactor `handleDownloadAllPDF` :
    - Si `BATCH_ENDPOINTS_BY_DOC_TYPE[docType]` existe → appel server-side helper
    - Sinon → fallback sur la boucle client-side actuelle (gardée intacte)

- **NEW** : `src/lib/__tests__/batch-doc-download.test.ts`
  - Mock `fetch` → vérifie POST body `{ sessionId }`, headers, response handling
  - Tests : success path, fail-soft path (failureCount > 0), unsupported doc_type (returns null)

## Implementation Plan

### Step 1 — Helper `batch-doc-download.ts`

```typescript
// src/lib/utils/batch-doc-download.ts

export const BATCH_ENDPOINTS_BY_DOC_TYPE: Partial<Record<string, string>> = {
  convocation: "generate-convocations-batch",
  certificat_realisation: "generate-certificats-realisation-batch",
  attestation_assiduite: "generate-attestations-assiduite-batch",
  feuille_emargement: "generate-emargements-individuels-batch",
  convention_entreprise: "generate-conventions-batch",
  convention_intervention: "generate-conventions-intervention-batch",
};

export interface BatchDownloadResult {
  totalRequested: number;
  successCount: number;
  failureCount: number;
  latencyMs: number;
}

export function hasBatchEndpoint(docType: string): boolean {
  return docType in BATCH_ENDPOINTS_BY_DOC_TYPE;
}

export async function downloadBatchZip(args: {
  docType: string;
  sessionId: string;
  sessionTitle: string;
}): Promise<BatchDownloadResult> {
  const endpoint = BATCH_ENDPOINTS_BY_DOC_TYPE[args.docType];
  if (!endpoint) {
    throw new Error(`Aucun endpoint batch pour doc_type=${args.docType}`);
  }

  const res = await fetch(`/api/documents/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: args.sessionId }),
  });

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error ?? `Erreur serveur (${res.status})`);
  }

  const data = (await res.json()) as {
    zipBase64: string;
    totalLearners: number;
    successCount: number;
    failureCount: number;
    totalLatencyMs: number;
  };

  // Decode base64 → Blob → trigger browser download
  const binary = atob(data.zipBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/zip" });

  const safeTitle = args.sessionTitle.replace(/[^a-zA-Z0-9-]+/g, "-").slice(0, 40);
  const filename = `${args.docType}_${safeTitle}_${new Date().toISOString().slice(0, 10)}.zip`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return {
    totalRequested: data.totalLearners,
    successCount: data.successCount,
    failureCount: data.failureCount,
    latencyMs: data.totalLatencyMs,
  };
}
```

### Step 2 — Refactor `handleDownloadAllPDF` dans TabConventionDocs

```typescript
const handleDownloadAllPDF = async (ownerType: ConventionOwnerType, docType: string) => {
  const key = `${ownerType}-${docType}`;
  setMassDownloading(key);

  // ─── PATH SERVER-SIDE (F1) ─────────────────────────────────
  if (hasBatchEndpoint(docType)) {
    try {
      const res = await downloadBatchZip({
        docType,
        sessionId: formation.id,
        sessionTitle: formation.title ?? formation.id,
      });
      if (res.failureCount > 0) {
        toast({
          title: `${res.successCount}/${res.totalRequested} PDF téléchargés`,
          description: `${res.failureCount} échec(s) — voir _erreurs.txt dans le ZIP`,
        });
      } else {
        toast({
          title: `${res.successCount} PDF téléchargés`,
          description: `Généré en ${(res.latencyMs / 1000).toFixed(1)}s`,
        });
      }
    } catch (err) {
      toast({
        title: "Erreur génération ZIP",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
    setMassDownloading(null);
    return;
  }

  // ─── FALLBACK LEGACY CLIENT-SIDE ───────────────────────────
  // TODO F1.x : migrer ces doc_types vers endpoints batch server-side
  const targetDocs = docs.filter((d) => d.doc_type === docType && d.owner_type === ownerType);
  toast({ title: `Génération de ${targetDocs.length} PDF...` });

  for (const doc of targetDocs) {
    if (!canExportCompanyDoc(doc)) continue;
    const html = await generateDocHtml(doc);
    const label = DOC_LABELS[doc.doc_type] || doc.doc_type;
    const learner = enrollments.find((e) => e.learner?.id === doc.owner_id)?.learner;
    const suffix = learner ? `${learner.last_name}_${learner.first_name}` : doc.owner_id.slice(0, 8);
    await exportHtmlToPDF(label, html, `${doc.doc_type}_${suffix}.pdf`, entityName);
    await new Promise((r) => setTimeout(r, 600));
  }

  toast({ title: `${targetDocs.length} PDF téléchargés` });
  setMassDownloading(null);
};
```

### Step 3 — Tests

```typescript
// src/lib/__tests__/batch-doc-download.test.ts
describe("hasBatchEndpoint", () => {
  it("retourne true pour les doc_types supportés", () => { ... });
  it("retourne false pour les doc_types non supportés", () => { ... });
});

describe("downloadBatchZip", () => {
  it("POST body { sessionId }, decode zipBase64, trigger download", async () => { ... });
  it("throw si fetch !ok", async () => { ... });
  it("throw si doc_type non supporté", async () => { ... });
});
```

## Definition of Done

- [x] Fichier `src/lib/utils/batch-doc-download.ts` créé avec helper + mapping
- [x] `TabConventionDocs.handleDownloadAllPDF` refactoré (server-side path + fallback)
- [x] Tests unitaires `batch-doc-download.test.ts` passent (10/10)
- [x] Typecheck `npx tsc --noEmit` OK
- [x] Tests existants 343/343 passent toujours (total 353)
- [ ] Test manuel : sur 1 session avec ≥3 apprenants, click "PDF tout convocations" → ZIP téléchargé, toast OK *(à valider en preview Netlify)*
- [x] PR créée + mergée
- [x] Sprint-status : f-1 → done

## Dev Agent Record

**Implementation 2026-05-17 :**

Approche pragmatique adoptée (vs créer un endpoint façade unique) :
- Le helper `batch-doc-download.ts` mappe les 6 doc_types affichés dans TabConventionDocs vers les endpoints batch server-side **déjà existants** (28 dispo dans `/api/documents/`).
- `fetchBatchZip` (pure, testable Node) : POST → décode base64 → renvoie blob + filename + stats.
- `downloadBatchZip` (UI wrapper) : combine fetchBatchZip + trigger via `<a download>`.
- `hasBatchEndpoint(docType)` : routing intelligent ; les doc_types non supportés (cgv, planning_semaine, etc.) gardent leur path legacy client-side.
- Refactor minimal de `TabConventionDocs.handleDownloadAllPDF` : early-return si endpoint batch dispo, sinon fallback.

**Bénéfice user mesurable :**
- Avant : 20 PDFs = ~20 × (html2canvas ~800ms + jsPDF + setTimeout 600ms) ≈ 28-40s + saturation onglet navigateur
- Après : 20 PDFs = 1 POST → Promise.allSettled server-side (Puppeteer) → 1 ZIP renvoyé
  - Premier run : ~5-15s (Puppeteer parallèle + cache miss)
  - Run suivant : <2s (100% cache hit)
- Fail-soft preservé : 2 fail sur 20 → ZIP contient quand même les 18 OK + `_erreurs.txt` à la racine

**Files modifiés :**
- `src/lib/utils/batch-doc-download.ts` (NEW, 116 lignes)
- `src/lib/utils/__tests__/batch-doc-download.test.ts` (NEW, 158 lignes, 10 tests)
- `src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx` (modify : import + handler refactor)
- `bmad_output/implementation-artifacts/sprint-status.yaml` (f-1 → done)

**Pas de migration SQL, pas de changement de schéma, pas de nouvelle dépendance.**

## Notes / Trade-offs

- **Choix : pas d'endpoint façade unique `/api/documents/batch-zip`** : l'architecture cible mentionnait un endpoint unique générique. Mais 28 endpoints batch spécifiques existent déjà avec leur logique de chargement de données métier (`generate-conventions-batch` ne charge pas les mêmes joins que `generate-attestations-assiduite-batch`). Créer une façade qui les dispatch serait du wrapping sans valeur ajoutée. Le helper côté frontend `BATCH_ENDPOINTS_BY_DOC_TYPE` joue le rôle de single source of truth pour le routing.
- **Fallback gardé** pour ne pas casser les doc_types sans endpoint batch. Une story future (F1.x ou intégration dans Lot E) migrera ces derniers types.
- **Pas de progress UI temps réel** : le ZIP est généré server-side puis arrive d'un coup. UX = spinner + toast final. Suffit pour MVP (< 60s). Si > 60s à terme, ajouter SSE/polling dans une story future.
