# Onglet Documents — « Tout télécharger » (ZIP) + actions en masse visibles — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre les actions en masse par type (Figer / Télécharger / Envoyer) visibles dans la vue par défaut de l'onglet Documents, et ajouter un vrai bouton « Tout télécharger (ZIP) » qui agrège **tous** les documents d'une session (tous types) en un seul ZIP.

**Architecture :** Orchestrateur **côté client** (Approche A) qui réutilise les ~28 endpoints `generate-*-batch` existants (1 appel par type → ZIP par type → fusionnés via JSZip en un ZIP maître à sous-dossiers), plus `generate-from-template` pour les documents communs/custom. Un composant présentationnel `BulkDocActionsPanel` remonte les actions par type au-dessus du sélecteur Matrice/Détail. Aucun changement SQL/RLS : les endpoints portent déjà le filtrage `entity_id`.

**Tech Stack :** Next.js 14 (App Router), TypeScript strict, React, JSZip 3.10.1, Vitest 3, shadcn/ui.

**Spec :** `docs/superpowers/specs/2026-06-21-documents-tout-telecharger-design.md`

---

## File Structure

- **Créer**
  - `src/lib/utils/batch-doc-download-all.ts` — orchestrateur pur + classification (Brique 2). Responsabilité unique : à partir d'une liste de docs, produire le ZIP maître agrégé. Aucun import UI.
  - `src/lib/utils/__tests__/batch-doc-download-all.test.ts` — tests Vitest (mock `fetch`).
  - `src/app/(dashboard)/admin/formations/[id]/_components/BulkDocActionsPanel.tsx` — composant présentationnel (Brique 3). Aucune logique métier, tout en props.
- **Modifier**
  - `src/lib/utils/batch-doc-download.ts` — étendre `BATCH_ENDPOINTS_BY_DOC_TYPE` de 6 → 28 types (Brique 1).
  - `src/lib/utils/__tests__/batch-doc-download.test.ts` — garde-fou couverture de carte.
  - `src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx` — brancher le panneau + bouton global, retirer les blocs inline redondants.

**Mapping `doc_type` (UI) → endpoint `generate-*-batch`** — vérifié contre le code (chaque route prend `{ sessionId }` et renvoie `{ zipBase64 }`). `charte_formateur`, `planning_semaine`, `reponses_evaluations`, `reponses_satisfaction_session` sont **exclus** (pas d'endpoint session-scopé : `charte_formateur` génère pour toute l'entité ; les 3 autres n'ont pas de `generate-*-batch`). Ils passent par le fallback `generate-from-template` de l'orchestrateur.

---

## Task 1 : Étendre la carte de téléchargement (Brique 1)

**Files:**
- Modify: `src/lib/utils/batch-doc-download.ts:12-19`
- Test: `src/lib/utils/__tests__/batch-doc-download.test.ts`

- [ ] **Step 1 : Écrire le test garde-fou (échoue)**

Ajouter ce bloc à la fin de `src/lib/utils/__tests__/batch-doc-download.test.ts` :

```ts
describe("BATCH_ENDPOINTS_BY_DOC_TYPE — couverture", () => {
  // Types nominatifs ayant un endpoint generate-*-batch session-scopé.
  // Source : src/app/api/documents/generate-*-batch (vérifié : body { sessionId } → { zipBase64 }).
  const EXPECTED: Record<string, string> = {
    convocation: "generate-convocations-batch",
    certificat_realisation: "generate-certificats-realisation-batch",
    attestation_assiduite: "generate-attestations-assiduite-batch",
    feuille_emargement: "generate-emargements-individuels-batch",
    feuille_emargement_collectif: "generate-emargements-batch",
    convention_entreprise: "generate-conventions-batch",
    convention_intervention: "generate-conventions-intervention-batch",
    avis_hab_elec_generique: "generate-avis-habilitation-electrique-batch",
    avis_hab_elec_b0_bf_bs: "generate-avis-habilitation-electrique-b0-bf-bs-batch",
    avis_hab_elec_b1v_b2v_br: "generate-avis-habilitation-electrique-b1v-b2v-br-batch",
    avis_hab_elec_bf_hf: "generate-avis-habilitation-electrique-bf-hf-batch",
    avis_hab_elec_bt: "generate-avis-habilitation-electrique-bt-batch",
    avis_hab_elec_bt_ht: "generate-avis-habilitation-electrique-bt-ht-batch",
    avis_hab_elec_h0_b0: "generate-avis-habilitation-electrique-h0-b0-batch",
    avis_hab_elec_h0_b0_bf_hf_bs: "generate-avis-habilitation-electrique-h0-b0-bf-hf-bs-batch",
    avis_hab_elec_h0_b0_initial: "generate-avis-habilitation-electrique-h0-b0-initial-batch",
    attestation_aipr: "generate-attestations-aipr-batch",
    attestation_competences: "generate-attestations-competences-batch",
    attestation_abandon_formation: "generate-attestations-abandon-batch",
    certificat_travail_hauteur: "generate-certificats-travail-hauteur-batch",
    certificat_diplome: "generate-certificats-diplome-batch",
    autorisation_image: "generate-autorisations-image-batch",
    decharge_responsabilite: "generate-decharges-responsabilite-batch",
    lettre_decharge_responsabilite: "generate-lettres-decharge-batch",
    contrat_engagement_stagiaire: "generate-contrats-engagement-batch",
    bilan_poe: "generate-bilans-poe-batch",
    resultats_evaluations: "generate-resultats-evaluations-batch",
  };

  it("mappe chaque type nominatif vers son endpoint generate-*-batch", () => {
    for (const [docType, endpoint] of Object.entries(EXPECTED)) {
      expect(BATCH_ENDPOINTS_BY_DOC_TYPE[docType]).toBe(endpoint);
    }
  });

  it("n'inclut PAS les types non session-scopés (charte_formateur entité-wide, planning_semaine, reponses_*)", () => {
    expect(BATCH_ENDPOINTS_BY_DOC_TYPE["charte_formateur"]).toBeUndefined();
    expect(BATCH_ENDPOINTS_BY_DOC_TYPE["planning_semaine"]).toBeUndefined();
    expect(BATCH_ENDPOINTS_BY_DOC_TYPE["reponses_evaluations"]).toBeUndefined();
    expect(BATCH_ENDPOINTS_BY_DOC_TYPE["reponses_satisfaction_session"]).toBeUndefined();
  });
});
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `npx vitest run src/lib/utils/__tests__/batch-doc-download.test.ts`
Expected: FAIL — `BATCH_ENDPOINTS_BY_DOC_TYPE["feuille_emargement_collectif"]` (et les ~21 nouveaux) sont `undefined`.

- [ ] **Step 3 : Étendre la carte**

Dans `src/lib/utils/batch-doc-download.ts`, remplacer le bloc `export const BATCH_ENDPOINTS_BY_DOC_TYPE = { ... }` (lignes 12-19) par :

```ts
export const BATCH_ENDPOINTS_BY_DOC_TYPE: Partial<Record<string, string>> = {
  // Documents apprenants / entreprises / formateurs (originaux)
  convocation: "generate-convocations-batch",
  certificat_realisation: "generate-certificats-realisation-batch",
  attestation_assiduite: "generate-attestations-assiduite-batch",
  feuille_emargement: "generate-emargements-individuels-batch",
  feuille_emargement_collectif: "generate-emargements-batch",
  convention_entreprise: "generate-conventions-batch",
  convention_intervention: "generate-conventions-intervention-batch",
  // Habilitation électrique (9 variantes → 9 endpoints dédiés)
  avis_hab_elec_generique: "generate-avis-habilitation-electrique-batch",
  avis_hab_elec_b0_bf_bs: "generate-avis-habilitation-electrique-b0-bf-bs-batch",
  avis_hab_elec_b1v_b2v_br: "generate-avis-habilitation-electrique-b1v-b2v-br-batch",
  avis_hab_elec_bf_hf: "generate-avis-habilitation-electrique-bf-hf-batch",
  avis_hab_elec_bt: "generate-avis-habilitation-electrique-bt-batch",
  avis_hab_elec_bt_ht: "generate-avis-habilitation-electrique-bt-ht-batch",
  avis_hab_elec_h0_b0: "generate-avis-habilitation-electrique-h0-b0-batch",
  avis_hab_elec_h0_b0_bf_hf_bs: "generate-avis-habilitation-electrique-h0-b0-bf-hf-bs-batch",
  avis_hab_elec_h0_b0_initial: "generate-avis-habilitation-electrique-h0-b0-initial-batch",
  // Attestations métier
  attestation_aipr: "generate-attestations-aipr-batch",
  attestation_competences: "generate-attestations-competences-batch",
  attestation_abandon_formation: "generate-attestations-abandon-batch",
  certificat_travail_hauteur: "generate-certificats-travail-hauteur-batch",
  certificat_diplome: "generate-certificats-diplome-batch",
  // Documents administratifs
  autorisation_image: "generate-autorisations-image-batch",
  decharge_responsabilite: "generate-decharges-responsabilite-batch",
  lettre_decharge_responsabilite: "generate-lettres-decharge-batch",
  contrat_engagement_stagiaire: "generate-contrats-engagement-batch",
  // Pédagogie / Évaluation
  bilan_poe: "generate-bilans-poe-batch",
  resultats_evaluations: "generate-resultats-evaluations-batch",
  // EXCLUS volontairement (pas d'endpoint session-scopé) :
  //   charte_formateur (génère pour toute l'entité), planning_semaine,
  //   reponses_evaluations, reponses_satisfaction_session.
  //   → traités via le fallback generate-from-template de l'orchestrateur.
};
```

- [ ] **Step 4 : Lancer le test, vérifier le succès**

Run: `npx vitest run src/lib/utils/__tests__/batch-doc-download.test.ts`
Expected: PASS (tous les `describe`, y compris les tests pré-existants `hasBatchEndpoint`/`fetchBatchZip`).

> Note : le test pré-existant `hasBatchEndpoint("planning_semaine")` doit retourner `false` (planning_semaine est exclu) — toujours vert.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/utils/batch-doc-download.ts src/lib/utils/__tests__/batch-doc-download.test.ts
git commit -m "feat(documents): étend la carte de téléchargement batch à 26 types

Mappe tous les doc_types nominatifs ayant un endpoint generate-*-batch
session-scopé (habilitations, attestations métier, administratifs, éval).
Effet : le bouton 'Télécharger' par type apparaît pour les secondaires.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 : Orchestrateur global + classification (Brique 2)

**Files:**
- Create: `src/lib/utils/batch-doc-download-all.ts`
- Test: `src/lib/utils/__tests__/batch-doc-download-all.test.ts`

- [ ] **Step 1 : S'assurer que jszip est une dépendance directe**

JSZip 3.10.1 est déjà présent (`node_modules/jszip`) et importé par les routes serveur, mais absent de `package.json`. Le rendre explicite :

Run: `npm install jszip@3.10.1 --save-exact`
Expected: `package.json` gagne `"jszip": "3.10.1"` dans `dependencies`, pas d'autre changement de version.

- [ ] **Step 2 : Écrire les tests de l'orchestrateur (échouent)**

Créer `src/lib/utils/__tests__/batch-doc-download-all.test.ts` :

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import JSZip from "jszip";
import {
  buildAllSessionDocsZip,
  buildDownloadAllArgs,
  buildAllZipFilename,
  type RawSessionDoc,
} from "@/lib/utils/batch-doc-download-all";

// Construit un zipBase64 (comme le renvoient les endpoints generate-*-batch)
async function makeZipBase64(files: Record<string, string>): Promise<string> {
  const z = new JSZip();
  for (const [name, content] of Object.entries(files)) z.file(name, content);
  return z.generateAsync({ type: "base64" });
}

// Liste les chemins (hors dossiers) d'un blob ZIP
async function listZipPaths(blob: Blob): Promise<string[]> {
  const z = await JSZip.loadAsync(await blob.arrayBuffer());
  const paths: string[] = [];
  z.forEach((path, entry) => { if (!entry.dir) paths.push(path); });
  return paths.sort();
}

const NOW = new Date("2026-06-21T10:00:00Z");

describe("buildAllZipFilename", () => {
  it("nettoie le titre et ajoute la date", () => {
    expect(buildAllZipFilename("Formation été (B1V) #1", NOW))
      .toBe("Documents_Formation-t-B1V-1_2026-06-21.zip");
  });
  it("fallback 'session' si titre vide", () => {
    expect(buildAllZipFilename("", NOW)).toBe("Documents_session_2026-06-21.zip");
  });
});

describe("buildDownloadAllArgs — classification", () => {
  const opts = {
    sessionId: "sess-1",
    sessionTitle: "Ma session",
    now: NOW,
    staticDocTypes: ["cgv", "reglement_interieur"],
    folderLabel: (dt: string) => dt.toUpperCase(),
    fileLabel: (dt: string) => dt.toUpperCase(),
  };

  it("range les types batch dans batchTypes (dédupliqués) avec leur dossier", () => {
    const docs: RawSessionDoc[] = [
      { docType: "convocation", ownerType: "learner", ownerId: "l1", ownerName: "DUPONT Jean", templateId: null, customLabel: null },
      { docType: "convocation", ownerType: "learner", ownerId: "l2", ownerName: "MARTIN Eve", templateId: null, customLabel: null },
    ];
    const args = buildDownloadAllArgs(docs, opts);
    expect(args.batchTypes).toEqual(["convocation"]);
    expect(args.batchFolders).toEqual({ convocation: "CONVOCATION" });
    expect(args.commonDocs).toEqual([]);
    expect(args.individualDocs).toEqual([]);
  });

  it("dédoublonne les communs (1 entrée par type, dossier Communs)", () => {
    const docs: RawSessionDoc[] = [
      { docType: "cgv", ownerType: "learner", ownerId: "l1", ownerName: "DUPONT", templateId: null, customLabel: null },
      { docType: "cgv", ownerType: "learner", ownerId: "l2", ownerName: "MARTIN", templateId: null, customLabel: null },
    ];
    const args = buildDownloadAllArgs(docs, opts);
    expect(args.commonDocs).toEqual([{ docType: "cgv", folder: "Communs", filename: "CGV.pdf" }]);
  });

  it("range custom & types non-batch dans individualDocs (1 par doc)", () => {
    const docs: RawSessionDoc[] = [
      { docType: "custom", ownerType: "learner", ownerId: "l1", ownerName: "DUPONT Jean", templateId: "tpl-9", customLabel: "Mon doc" },
      { docType: "charte_formateur", ownerType: "trainer", ownerId: "t1", ownerName: "PAUL Roy", templateId: null, customLabel: null },
    ];
    const args = buildDownloadAllArgs(docs, opts);
    expect(args.individualDocs).toEqual([
      { docType: "custom", folder: "Documents personnalisés", filename: "Mon doc - DUPONT Jean.pdf", templateId: "tpl-9", ownerType: "learner", ownerId: "l1" },
      { docType: "charte_formateur", folder: "CHARTE_FORMATEUR", filename: "CHARTE_FORMATEUR - PAUL Roy.pdf", templateId: null, ownerType: "trainer", ownerId: "t1" },
    ]);
  });
});

describe("buildAllSessionDocsZip", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); global.fetch = fetchMock as unknown as typeof fetch; });
  afterEach(() => { vi.restoreAllMocks(); });

  it("fusionne les ZIP batch en sous-dossiers par type", async () => {
    const zipB64 = await makeZipBase64({ "DUPONT.pdf": "a", "MARTIN.pdf": "b" });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ zipBase64: zipB64, totalLearners: 2, successCount: 2, failureCount: 0, totalLatencyMs: 100 }),
    });

    const { blob, result } = await buildAllSessionDocsZip({
      sessionId: "s", sessionTitle: "S", now: NOW, concurrency: 2,
      batchTypes: ["certificat_realisation"],
      batchFolders: { certificat_realisation: "Certificats" },
      commonDocs: [], individualDocs: [],
    });

    expect(await listZipPaths(blob)).toEqual(["Certificats/DUPONT.pdf", "Certificats/MARTIN.pdf"]);
    expect(result.totalFiles).toBe(2);
    expect(result.failedTypes).toBe(0);
  });

  it("fail-soft : un type échoue, les autres passent + _erreurs.txt présent", async () => {
    const zipB64 = await makeZipBase64({ "OK.pdf": "x" });
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("generate-convocations-batch")) {
        return { ok: true, json: async () => ({ zipBase64: zipB64, totalLearners: 1, successCount: 1, failureCount: 0, totalLatencyMs: 1 }) };
      }
      return { ok: false, status: 500, json: async () => ({ error: "Boom" }) };
    });

    const { blob, result } = await buildAllSessionDocsZip({
      sessionId: "s", sessionTitle: "S", now: NOW,
      batchTypes: ["convocation", "certificat_realisation"],
      batchFolders: { convocation: "Convocations", certificat_realisation: "Certificats" },
      commonDocs: [], individualDocs: [],
    });

    const paths = await listZipPaths(blob);
    expect(paths).toContain("Convocations/OK.pdf");
    expect(paths).toContain("_erreurs.txt");
    expect(result.failedTypes).toBe(1);
    expect(result.successTypes).toBe(1);
  });

  it("lève une erreur si TOUTES les unités échouent", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: "down" }) });
    await expect(buildAllSessionDocsZip({
      sessionId: "s", sessionTitle: "S", now: NOW,
      batchTypes: ["convocation"], batchFolders: { convocation: "Convocations" },
      commonDocs: [], individualDocs: [],
    })).rejects.toThrow(/Échec total/);
  });

  it("ajoute les communs comme PDF unique sous leur dossier", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ base64: btoa("PDFDATA"), filename: "x.pdf", sizeBytes: 7 }) });
    const { blob, result } = await buildAllSessionDocsZip({
      sessionId: "s", sessionTitle: "S", now: NOW,
      batchTypes: [], batchFolders: {},
      commonDocs: [{ docType: "cgv", folder: "Communs", filename: "CGV.pdf" }],
      individualDocs: [],
    });
    expect(await listZipPaths(blob)).toEqual(["Communs/CGV.pdf"]);
    expect(result.totalFiles).toBe(1);
  });
});
```

- [ ] **Step 3 : Lancer les tests, vérifier l'échec**

Run: `npx vitest run src/lib/utils/__tests__/batch-doc-download-all.test.ts`
Expected: FAIL — `Cannot find module '@/lib/utils/batch-doc-download-all'`.

- [ ] **Step 4 : Implémenter l'orchestrateur**

Créer `src/lib/utils/batch-doc-download-all.ts` :

```ts
/**
 * Orchestrateur « Tout télécharger » (Approche A — cf spec
 * 2026-06-21-documents-tout-telecharger-design.md).
 *
 * Agrège TOUS les documents d'une session en un seul ZIP maître à sous-dossiers,
 * en réutilisant les endpoints generate-*-batch (1 appel/type) + generate-from-template
 * (communs & docs individuels sans endpoint batch). Fail-soft : un échec n'empêche
 * pas les autres ; un échec total lève une erreur (pas de ZIP vide).
 *
 * Pur (hors `triggerBrowserDownload`) → testable avec un mock `fetch`.
 */

import JSZip from "jszip";
import { fetchBatchZip } from "./batch-doc-download";

export interface RawSessionDoc {
  docType: string;
  ownerType: "learner" | "company" | "trainer";
  ownerId: string;
  ownerName: string;
  templateId: string | null;
  customLabel: string | null;
}

export interface CommonDocInput {
  docType: string;
  folder: string;
  filename: string;
}

export interface IndividualDocInput {
  docType: string;
  folder: string;
  filename: string;
  templateId: string | null;
  ownerType: "learner" | "company" | "trainer";
  ownerId: string;
}

export interface DownloadAllArgs {
  sessionId: string;
  sessionTitle: string;
  now: Date;
  batchTypes: string[];
  batchFolders: Record<string, string>;
  commonDocs: CommonDocInput[];
  individualDocs: IndividualDocInput[];
  concurrency?: number;
}

export interface DownloadAllResult {
  totalTypes: number;
  successTypes: number;
  failedTypes: number;
  totalFiles: number;
}

export interface BuildAllOutput {
  blob: Blob;
  filename: string;
  result: DownloadAllResult;
}

interface ClassifyOpts {
  sessionId: string;
  sessionTitle: string;
  now: Date;
  staticDocTypes: string[];
  folderLabel: (docType: string) => string;
  fileLabel: (docType: string) => string;
}

function sanitizeFileLabel(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "-").trim() || "document";
}

export function buildAllZipFilename(sessionTitle: string, now: Date): string {
  const safe = sessionTitle.replace(/[^a-zA-Z0-9-]+/g, "-").slice(0, 40) || "session";
  const date = now.toISOString().slice(0, 10);
  return `Documents_${safe}_${date}.zip`;
}

/**
 * Classe les docs d'une session en 3 familles pour l'orchestrateur :
 * - batchTypes : types avec endpoint session-scopé (1 appel couvre tous les owners)
 * - commonDocs : documents communs (1 PDF par type, dédupliqué)
 * - individualDocs : custom + types sans endpoint batch (1 PDF par doc)
 */
export function buildDownloadAllArgs(docs: RawSessionDoc[], opts: ClassifyOpts): DownloadAllArgs {
  const batchTypesSet = new Set<string>();
  const batchFolders: Record<string, string> = {};
  const commonDocs: CommonDocInput[] = [];
  const seenCommon = new Set<string>();
  const individualDocs: IndividualDocInput[] = [];

  // Import dynamique évité : on duplique le check via la carte importée.
  // hasBatchEndpoint vient de batch-doc-download (réexporté ci-dessous).
  for (const d of docs) {
    if (hasBatchEndpointInternal(d.docType)) {
      batchTypesSet.add(d.docType);
      batchFolders[d.docType] = opts.folderLabel(d.docType);
    } else if (opts.staticDocTypes.includes(d.docType)) {
      if (!seenCommon.has(d.docType)) {
        seenCommon.add(d.docType);
        commonDocs.push({ docType: d.docType, folder: "Communs", filename: `${opts.fileLabel(d.docType)}.pdf` });
      }
    } else {
      const base = d.customLabel || opts.fileLabel(d.docType);
      individualDocs.push({
        docType: d.docType,
        folder: d.templateId ? "Documents personnalisés" : opts.folderLabel(d.docType),
        filename: `${sanitizeFileLabel(base)} - ${sanitizeFileLabel(d.ownerName)}.pdf`,
        templateId: d.templateId,
        ownerType: d.ownerType,
        ownerId: d.ownerId,
      });
    }
  }

  return {
    sessionId: opts.sessionId,
    sessionTitle: opts.sessionTitle,
    now: opts.now,
    batchTypes: [...batchTypesSet],
    batchFolders,
    commonDocs,
    individualDocs,
  };
}

// Ré-import local pour éviter une dépendance circulaire de typage.
import { hasBatchEndpoint as hasBatchEndpointInternal } from "./batch-doc-download";

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function generateSinglePdf(p: {
  sessionId: string;
  docType?: string;
  templateId?: string | null;
  ownerType?: "learner" | "company" | "trainer";
  ownerId?: string;
}): Promise<string> {
  const context: Record<string, string> = { session_id: p.sessionId };
  if (p.ownerType === "learner" && p.ownerId) context.learner_id = p.ownerId;
  if (p.ownerType === "company" && p.ownerId) context.client_id = p.ownerId;
  if (p.ownerType === "trainer" && p.ownerId) context.trainer_id = p.ownerId;

  const res = await fetch("/api/documents/generate-from-template", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      doc_type: p.templateId ? undefined : p.docType,
      template_id: p.templateId ?? undefined,
      context,
      force: true,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Échec génération PDF");
  return json.base64 as string;
}

async function runPool(units: Array<() => Promise<void>>, concurrency: number): Promise<void> {
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrency, units.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < units.length) {
      const idx = cursor++;
      await units[idx]();
    }
  });
  await Promise.all(workers);
}

export async function buildAllSessionDocsZip(args: DownloadAllArgs): Promise<BuildAllOutput> {
  const master = new JSZip();
  const errors: string[] = [];
  let totalFiles = 0;
  let successTypes = 0;
  let failedTypes = 0;

  const units: Array<() => Promise<void>> = [];

  // 1. Types avec endpoint batch
  for (const docType of args.batchTypes) {
    units.push(async () => {
      try {
        const { blob } = await fetchBatchZip({ docType, sessionId: args.sessionId, sessionTitle: args.sessionTitle });
        const inner = await JSZip.loadAsync(await blob.arrayBuffer());
        const folder = args.batchFolders[docType] ?? docType;
        const filePromises: Promise<void>[] = [];
        inner.forEach((path, entry) => {
          if (entry.dir) return;
          filePromises.push((async () => {
            const content = await entry.async("uint8array");
            master.file(`${folder}/${path}`, content);
            totalFiles++;
          })());
        });
        await Promise.all(filePromises);
        successTypes++;
      } catch (e) {
        failedTypes++;
        errors.push(`[${docType}] ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  // 2. Documents communs (1 PDF par type)
  for (const c of args.commonDocs) {
    units.push(async () => {
      try {
        const base64 = await generateSinglePdf({ sessionId: args.sessionId, docType: c.docType });
        master.file(`${c.folder}/${c.filename}`, base64ToUint8(base64));
        totalFiles++;
        successTypes++;
      } catch (e) {
        failedTypes++;
        errors.push(`[${c.docType}] ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  // 3. Documents individuels (custom + types sans endpoint batch)
  for (const d of args.individualDocs) {
    units.push(async () => {
      try {
        const base64 = await generateSinglePdf({
          sessionId: args.sessionId,
          docType: d.templateId ? undefined : d.docType,
          templateId: d.templateId,
          ownerType: d.ownerType,
          ownerId: d.ownerId,
        });
        master.file(`${d.folder}/${d.filename}`, base64ToUint8(base64));
        totalFiles++;
        successTypes++;
      } catch (e) {
        failedTypes++;
        errors.push(`[${d.docType}/${d.ownerId}] ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  const totalTypes = units.length;
  await runPool(units, args.concurrency ?? 4);

  if (totalTypes > 0 && failedTypes === totalTypes) {
    throw new Error(`Échec total du téléchargement (${failedTypes} unité(s)). ${errors.slice(0, 3).join(" | ")}`);
  }
  if (errors.length > 0) {
    master.file("_erreurs.txt", errors.join("\n"));
  }

  const blob = await master.generateAsync({ type: "blob" });
  return {
    blob,
    filename: buildAllZipFilename(args.sessionTitle, args.now),
    result: { totalTypes, successTypes, failedTypes, totalFiles },
  };
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadAllSessionDocs(args: DownloadAllArgs): Promise<DownloadAllResult> {
  const { blob, filename, result } = await buildAllSessionDocsZip(args);
  triggerBrowserDownload(blob, filename);
  return result;
}
```

> Note : le double `import` de `batch-doc-download` (un en tête, un avant `base64ToUint8`) est volontairement scindé pour la lisibilité ; l'engineer peut les fusionner en un seul `import { fetchBatchZip, hasBatchEndpoint } from "./batch-doc-download";` en tête de fichier et renommer `hasBatchEndpointInternal` → `hasBatchEndpoint`. Faire ce regroupement maintenant.

- [ ] **Step 5 : Fusionner les imports (propreté)**

En tête de `batch-doc-download-all.ts`, remplacer `import { fetchBatchZip } from "./batch-doc-download";` par :
```ts
import { fetchBatchZip, hasBatchEndpoint } from "./batch-doc-download";
```
Supprimer la ligne `import { hasBatchEndpoint as hasBatchEndpointInternal } from "./batch-doc-download";` et renommer l'appel `hasBatchEndpointInternal(d.docType)` → `hasBatchEndpoint(d.docType)` dans `buildDownloadAllArgs`.

- [ ] **Step 6 : Lancer les tests, vérifier le succès**

Run: `npx vitest run src/lib/utils/__tests__/batch-doc-download-all.test.ts`
Expected: PASS (les 4 `describe`).

- [ ] **Step 7 : Vérifier le typage strict**

Run: `npx tsc --noEmit`
Expected: aucune erreur dans `batch-doc-download-all.ts`.

- [ ] **Step 8 : Commit**

```bash
git add src/lib/utils/batch-doc-download-all.ts src/lib/utils/__tests__/batch-doc-download-all.test.ts package.json package-lock.json
git commit -m "feat(documents): orchestrateur 'Tout télécharger' (ZIP agrégé tous types)

Réutilise les endpoints generate-*-batch + generate-from-template, fusionne
via JSZip en un ZIP maître à sous-dossiers. Fail-soft (_erreurs.txt), lève si
échec total. Pur & testé (4 describe).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 : Composant BulkDocActionsPanel (Brique 3 — présentation)

**Files:**
- Create: `src/app/(dashboard)/admin/formations/[id]/_components/BulkDocActionsPanel.tsx`

- [ ] **Step 1 : Créer le composant présentationnel**

Créer `src/app/(dashboard)/admin/formations/[id]/_components/BulkDocActionsPanel.tsx` :

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, Download, Send, PenLine, ChevronDown, ChevronUp } from "lucide-react";

export interface BulkDocRow {
  docType: string;
  label: string;
  count: number;
  canDownload: boolean;
  canSend: boolean;
  signable: boolean;
}

export interface BulkDocGroup {
  ownerType: "learner" | "company" | "trainer";
  ownerLabel: string;
  rows: BulkDocRow[];
}

interface Props {
  groups: BulkDocGroup[];
  savingKey: string | null;
  massSending: string | null;
  massDownloading: string | null;
  massRequestingSig: string | null;
  onConfirmAll: (docType: string, ownerType: "learner" | "company" | "trainer") => void;
  onDownloadAll: (ownerType: "learner" | "company" | "trainer", docType: string) => void;
  onSendAll: (ownerType: "learner" | "company" | "trainer", docType: string) => void;
  onRequestSignature: (docType: string) => void;
}

export function BulkDocActionsPanel({
  groups, savingKey, massSending, massDownloading, massRequestingSig,
  onConfirmAll, onDownloadAll, onSendAll, onRequestSignature,
}: Props) {
  const [open, setOpen] = useState(true);
  const visibleGroups = groups.filter((g) => g.rows.length > 0);
  if (visibleGroups.length === 0) return null;

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b text-left"
      >
        <span className="text-sm font-medium">Actions en masse</span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="divide-y">
          {visibleGroups.map((group) => (
            <div key={group.ownerType} className="px-4 py-2 space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.ownerLabel}</p>
              {group.rows.map((row) => {
                const key = `${group.ownerType}-${row.docType}`;
                const isConfirming = savingKey === `mass-confirm-${row.docType}`;
                const isSending = massSending === key;
                const isDownloading = massDownloading === key;
                const isSigning = massRequestingSig === row.docType;
                return (
                  <div key={row.docType} className="flex items-center justify-between py-1 gap-2">
                    <span className="text-xs font-medium text-muted-foreground truncate">
                      {row.label} <span className="text-gray-400">({row.count})</span>
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      <Button
                        size="sm" variant="outline" className="h-6 text-xs gap-1"
                        onClick={() => onConfirmAll(row.docType, group.ownerType)}
                        disabled={isConfirming}
                        title={`Figer tous les ${row.label.toLowerCase()}`}
                      >
                        {isConfirming && <Loader2 className="h-3 w-3 animate-spin" />}
                        <CheckCircle className="h-3 w-3" /> Tout figer
                      </Button>
                      {row.canDownload && (
                        <Button
                          size="sm" variant="ghost" className="h-6 text-xs gap-1"
                          onClick={() => onDownloadAll(group.ownerType, row.docType)}
                          disabled={massDownloading !== null}
                          title={`ZIP de tous les ${row.label.toLowerCase()}`}
                        >
                          {isDownloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                          Télécharger ({row.count})
                        </Button>
                      )}
                      {row.canSend && (
                        <Button
                          size="sm" variant="outline" className="h-6 text-xs gap-1"
                          onClick={() => onSendAll(group.ownerType, row.docType)}
                          disabled={massSending !== null}
                        >
                          {isSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                          Envoyer tout
                        </Button>
                      )}
                      {row.signable && (
                        <Button
                          size="sm" variant="outline"
                          className="h-6 text-xs gap-1 border-orange-300 text-orange-700 hover:bg-orange-50"
                          onClick={() => onRequestSignature(row.docType)}
                          disabled={massRequestingSig !== null}
                          title="Crée un magic link de signature (valide 30 jours)"
                        >
                          {isSigning ? <Loader2 className="h-3 w-3 animate-spin" /> : <PenLine className="h-3 w-3" />}
                          Demander signature
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2 : Vérifier la compilation du composant isolé**

Run: `npx tsc --noEmit`
Expected: aucune erreur dans `BulkDocActionsPanel.tsx` (le composant n'est pas encore monté — c'est attendu, pas d'erreur « unused »).

- [ ] **Step 3 : Commit**

```bash
git add "src/app/(dashboard)/admin/formations/[id]/_components/BulkDocActionsPanel.tsx"
git commit -m "feat(documents): composant présentationnel BulkDocActionsPanel

Panneau repliable, 1 ligne/type, boutons Tout figer / Télécharger (N) /
Envoyer tout / Demander signature. Tout en props (réutilisable 2 vues).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 : Brancher panneau + bouton global, retirer les blocs inline

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx`

- [ ] **Step 1 : Imports**

En haut de `TabConventionDocs.tsx`, ajouter après l'import de `DocMatrixSection` (ligne ~52) :

```tsx
import { BulkDocActionsPanel, type BulkDocGroup } from "./BulkDocActionsPanel";
import {
  buildDownloadAllArgs,
  downloadAllSessionDocs,
  type RawSessionDoc,
} from "@/lib/utils/batch-doc-download-all";
```

- [ ] **Step 2 : État + handler du téléchargement global**

Après la ligne `const [massRequestingSig, setMassRequestingSig] = useState<string | null>(null);` (~ligne 280), ajouter :

```tsx
const [downloadingAll, setDownloadingAll] = useState(false);
```

Puis, juste avant `// ===== MASS SIGNATURE REQUEST (Story F3) =====` (~ligne 908), ajouter le handler :

```tsx
// ===== TOUT TÉLÉCHARGER (ZIP agrégé tous types) — spec 2026-06-21 =====
const handleDownloadAllSession = async () => {
  if (docs.length === 0) return;
  setDownloadingAll(true);
  const t0 = Date.now();
  try {
    const raw: RawSessionDoc[] = docs.map((d) => {
      const info = getOwnerInfo(d);
      return {
        docType: d.doc_type,
        ownerType: d.owner_type as "learner" | "company" | "trainer",
        ownerId: d.owner_id,
        ownerName: info.name,
        templateId: d.template_id ?? null,
        customLabel: d.custom_label ?? null,
      };
    });
    const args = buildDownloadAllArgs(raw, {
      sessionId: formation.id,
      sessionTitle: formation.title ?? formation.id,
      now: new Date(),
      staticDocTypes: STATIC_DOCS as unknown as string[],
      folderLabel: (dt) => DOC_LABELS[dt] ?? dt,
      fileLabel: (dt) => DOC_LABELS[dt] ?? dt,
    });
    const res = await downloadAllSessionDocs(args);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (res.failedTypes > 0) {
      toast({
        title: `${res.totalFiles} document(s) téléchargé(s)`,
        description: `${res.failedTypes} en échec — voir _erreurs.txt (généré en ${secs}s)`,
      });
    } else {
      toast({
        title: `${res.totalFiles} document(s) téléchargé(s)`,
        description: `${res.successTypes} type(s) — généré en ${secs}s`,
      });
    }
  } catch (err) {
    toast({
      title: "Erreur téléchargement global",
      description: err instanceof Error ? err.message : String(err),
      variant: "destructive",
    });
  } finally {
    setDownloadingAll(false);
  }
};
```

- [ ] **Step 3 : Construire les groupes pour le panneau**

Juste avant `const isInitializing = ...` (~ligne 1404), ajouter le calcul des groupes (réutilise `hasBatchEndpoint`/`hasBatchSendEndpoint`/`hasBatchSignatureRequestEndpoint`/`REQUIRES_SIGNATURE_TYPES`, déjà importés) :

```tsx
// Groupes pour le panneau d'actions en masse (visible dans les 2 vues)
const bulkGroups: BulkDocGroup[] = (() => {
  const countOf = (ownerType: ConventionOwnerType, docType: string) =>
    docs.filter((d) => d.owner_type === ownerType && d.doc_type === docType).length;

  const buildRows = (ownerType: ConventionOwnerType, docTypes: readonly string[]) =>
    docTypes
      .map((dt) => ({
        docType: dt,
        label: DOC_LABELS_PLURAL[dt] ?? DOC_LABELS[dt] ?? dt,
        count: countOf(ownerType, dt),
        canDownload: hasBatchEndpoint(dt),
        canSend: hasBatchSendEndpoint(dt),
        signable: REQUIRES_SIGNATURE_TYPES.includes(dt as ConventionDocType) && hasBatchSignatureRequestEndpoint(dt),
      }))
      .filter((r) => r.count > 0);

  const secondaryByOwner = (ownerType: ConventionOwnerType) =>
    secondaryDocTypesPresent
      .map((dt) => ({
        docType: dt,
        label: DOC_LABELS[dt] ?? dt,
        count: countOf(ownerType, dt),
        canDownload: hasBatchEndpoint(dt),
        canSend: hasBatchSendEndpoint(dt),
        signable: hasBatchSignatureRequestEndpoint(dt),
      }))
      .filter((r) => r.count > 0);

  return [
    {
      ownerType: "learner" as const,
      ownerLabel: "Apprenants",
      rows: [...buildRows("learner", DEFAULT_LEARNER_DOCS), ...secondaryByOwner("learner")],
    },
    {
      ownerType: "company" as const,
      ownerLabel: "Entreprises",
      rows: [...buildRows("company", DEFAULT_COMPANY_DOCS), ...secondaryByOwner("company")],
    },
    {
      ownerType: "trainer" as const,
      ownerLabel: "Formateurs",
      rows: [...buildRows("trainer", DEFAULT_TRAINER_DOCS), ...secondaryByOwner("trainer")],
    },
  ];
})();
```

- [ ] **Step 4 : Ajouter le bouton global dans la barre Quick Actions**

Dans la barre Quick Actions, juste après le `<Button>` « Tout figer » global (le bloc se terminant par `Tout figer</Button>` ~ligne 1610) et avant le bouton « Ajouter doc secondaire », insérer :

```tsx
<Button
  size="sm"
  variant="outline"
  className="text-xs h-7 gap-1"
  onClick={handleDownloadAllSession}
  disabled={downloadingAll || docs.length === 0}
  title="Tous les documents de la session en un seul ZIP"
>
  {downloadingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
  Tout télécharger (ZIP)
</Button>
```

- [ ] **Step 5 : Monter le panneau sous la barre Quick Actions**

Juste après la fermeture de la barre Quick Actions (`</div>` qui suit le toggle Matrice/Détail, ~ligne 1639) et AVANT `{/* ═══ VUE MATRICE ... ═══ */}`, insérer :

```tsx
{/* Actions en masse — visibles dans les 2 vues (spec 2026-06-21) */}
<BulkDocActionsPanel
  groups={bulkGroups}
  savingKey={saving}
  massSending={massSending}
  massDownloading={massDownloading}
  massRequestingSig={massRequestingSig}
  onConfirmAll={(docType, ownerType) => handleMassConfirm(docType as ConventionDocType, ownerType)}
  onDownloadAll={(ownerType, docType) => handleDownloadAllPDF(ownerType, docType)}
  onSendAll={(ownerType, docType) => handleMassSendWithPDF(ownerType, docType)}
  onRequestSignature={(docType) => handleMassSignatureRequest(docType)}
/>
```

- [ ] **Step 6 : Retirer les blocs inline redondants de la vue Détail**

Dans le bloc `{!matrixView && ( <> ... </> )}` :

1. **Supprimer** tout le bloc `{/* Mass actions — compact */}` jusqu'à sa `</div>` fermante — c'est l'ancien encart « Actions en masse — documents par défaut » + « Autres documents (masse) » (de `<div className="border rounded-lg overflow-hidden">` contenant `Actions en masse — documents par défaut` jusqu'au `</div>` avant `{/* ===== APPRENANTS ===== */}`). Conserver la sous-section « Autres documents (masse) » (Attribuer à tous / Tout figer custom) **en la déplaçant** juste au-dessus de la section Apprenants (elle ne fait pas doublon avec le panneau). 

2. Dans la section **Apprenants**, supprimer le bloc `{/* Lot G : Actions en masse — 1 ligne par doc_type apprenant. ... */}` (le `{enrollments.length > 0 && ( <div className="px-4 py-2 space-y-1.5 border-b bg-muted/20"> ... </div> )}`). Idem pour **Entreprises** (`{/* Lot G : Actions en masse par doc_type entreprise */}`) et **Formateurs** (`{/* Lot G : Actions en masse par doc_type formateur */}`).

3. Dans la section **Documents secondaires**, supprimer le bloc `{/* Actions en masse — une ligne par type secondaire présent */}` (`<div className="px-4 py-2 space-y-1.5 border-b bg-muted/20"> ... </div>`). Conserver la liste groupée par destinataire.

> Ces 5 blocs sont désormais couverts par `BulkDocActionsPanel` (visible dans les 2 vues). Ne PAS toucher aux `renderOwnerSection` ni aux lignes de docs individuelles.

- [ ] **Step 7 : Vérifier qu'aucune référence morte ne subsiste**

Run: `npx tsc --noEmit`
Expected: aucune erreur. Si `massSending`/`massDownloading`/`hasBatchSendEndpoint` etc. deviennent « unused », c'est qu'un retrait a été trop large — ils restent utilisés par le panneau et les handlers. Corriger le cas échéant.

- [ ] **Step 8 : Lint**

Run: `npm run lint`
Expected: 0 erreur sur `TabConventionDocs.tsx` et `BulkDocActionsPanel.tsx` (warnings pré-existants tolérés).

- [ ] **Step 9 : Build complet**

Run: `npm run build`
Expected: build Next.js OK (compilation TypeScript + pages).

- [ ] **Step 10 : Commit**

```bash
git add "src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx"
git commit -m "feat(documents): panneau actions en masse visible + bouton Tout télécharger

Remonte les actions par type (Figer/Télécharger(N)/Envoyer) au-dessus du
toggle Matrice/Détail → visibles dans la vue par défaut. Ajoute le bouton
global 'Tout télécharger (ZIP)'. Retire les 5 blocs inline redondants.
Résout le retour Loris (PDF Tous ne sortait que les convocations).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 : Vérification finale

- [ ] **Step 1 : Suite de tests complète**

Run: `npx vitest run src/lib/utils/__tests__/batch-doc-download.test.ts src/lib/utils/__tests__/batch-doc-download-all.test.ts`
Expected: tous les tests PASS.

- [ ] **Step 2 : Vérification manuelle (prod-like requise car moteur PDF = sidecar prod)**

Sur une session de test avec apprenants + entreprise + (si possible) un doc secondaire :
1. Vue **Matrice** (par défaut) : le panneau « Actions en masse » est visible, avec une ligne par type présent et les boutons Figer / Télécharger (N) / Envoyer.
2. Cliquer « Télécharger (N) » sur **Certificats** → un ZIP de certificats se télécharge (pas des convocations).
3. Cliquer « Tout télécharger (ZIP) » → un ZIP unique `Documents_<session>_<date>.zip` avec sous-dossiers par type (Convocations/, Certificats/, …, Communs/).
4. Basculer en vue **Détail** : le panneau reste visible et fonctionnel ; plus de blocs d'actions en masse dupliqués dans les sections.

> Le rendu PDF réel n'est testable qu'en prod (FallbackEngine = sidecar Puppeteer → CloudConvert). En local, les appels batch peuvent échouer → le ZIP contient `_erreurs.txt` : c'est attendu hors prod, pas un bug.

- [ ] **Step 3 : Finaliser la branche**

Utiliser la skill `superpowers:finishing-a-development-branch` (push + PR vers `main`, vert only — cf. workflow projet).

---

## Self-Review (rempli par l'auteur du plan)

**Couverture du spec :**
- §3 Brique 1 (carte étendue) → Task 1 ✅
- §3 Brique 2 (orchestrateur, fail-soft, _erreurs.txt, throw-if-all-fail, communs single) → Task 2 ✅
- §3 Brique 3 (panneau toujours visible + bouton global + labels « Télécharger (N) » / « Tout télécharger (ZIP) ») → Tasks 3-4 ✅
- §3 « retirer les blocs inline » → Task 4 Step 6 ✅
- §5 edge cases (bouton désactivé si 0 doc ; conventions INTER déléguées au serveur ; types sans endpoint via fallback) → Task 4 Step 2 (`disabled`) + Task 2 (fallback `individualDocs`) ✅
- §6 tests → Tasks 1-2 ✅
- §7 hors-scope (aucun endpoint serveur, aucun SQL, boutons séparés) → respecté ✅

**Cohérence des types :** `RawSessionDoc`, `DownloadAllArgs`, `BulkDocGroup`/`BulkDocRow` définis en Task 2/3, réutilisés à l'identique en Task 4. `handleMassConfirm(docType, ownerType)`, `handleDownloadAllPDF(ownerType, docType)`, `handleMassSendWithPDF(ownerType, docType)`, `handleMassSignatureRequest(docType)` : signatures conformes au code existant de `TabConventionDocs.tsx`. ✅

**Placeholders :** aucun TODO/TBD ; tout le code est fourni ; mapping `doc_type → endpoint` sourcé et vérifié contre le système de fichiers. ✅
