/**
 * Mass-download helper pour TabConventionDocs (Story F1).
 *
 * Mappe les doc_types affichés dans la matrix vers les endpoints batch
 * server-side existants (Puppeteer + cache + JSZip + fail-soft). Évite
 * la boucle client-side jsPDF/html2canvas qui sature le navigateur.
 *
 * Les doc_types non listés ici retombent sur le path legacy client-side
 * dans `TabConventionDocs.handleDownloadAllPDF`.
 */

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

export interface BatchZipPayload {
  blob: Blob;
  filename: string;
  stats: BatchDownloadResult;
}

interface DownloadArgs {
  docType: string;
  sessionId: string;
  sessionTitle: string;
}

interface BatchApiResponse {
  zipBase64: string;
  totalLearners: number;
  successCount: number;
  failureCount: number;
  totalLatencyMs: number;
}

export function hasBatchEndpoint(docType: string): boolean {
  return docType in BATCH_ENDPOINTS_BY_DOC_TYPE;
}

/**
 * Pure : POST + décode → renvoie le blob + filename + stats.
 * Testable en environment Node (pas de DOM requis).
 */
export async function fetchBatchZip(args: DownloadArgs): Promise<BatchZipPayload> {
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

  const data = (await res.json()) as BatchApiResponse;

  return {
    blob: base64ToBlob(data.zipBase64, "application/zip"),
    filename: buildZipFilename(args),
    stats: {
      totalRequested: data.totalLearners,
      successCount: data.successCount,
      failureCount: data.failureCount,
      latencyMs: data.totalLatencyMs,
    },
  };
}

/**
 * Helper UI : fetch + déclenche le download via `<a download>`.
 * Nécessite un environnement avec `document` et `URL.createObjectURL`.
 */
export async function downloadBatchZip(args: DownloadArgs): Promise<BatchDownloadResult> {
  const payload = await fetchBatchZip(args);
  triggerBrowserDownload(payload.blob, payload.filename);
  return payload.stats;
}

export function buildZipFilename(args: DownloadArgs): string {
  const safeTitle = args.sessionTitle.replace(/[^a-zA-Z0-9-]+/g, "-").slice(0, 40) || "session";
  const date = new Date().toISOString().slice(0, 10);
  return `${args.docType}_${safeTitle}_${date}.zip`;
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
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
