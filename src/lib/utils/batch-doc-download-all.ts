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
import { fetchBatchZip, hasBatchEndpoint } from "./batch-doc-download";

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

  for (const d of docs) {
    if (hasBatchEndpoint(d.docType)) {
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
