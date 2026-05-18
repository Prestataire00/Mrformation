/**
 * Mass signature request helper pour TabConventionDocs (Story F3).
 *
 * Pour chaque doc_type "signature" (convention_entreprise / intervention),
 * envoie une demande de signature batch : N magic links créés + N emails
 * envoyés en parallèle server-side.
 *
 * Le destinataire arrive sur `/sign/{token}` qui appelle ensuite
 * `/api/documents/sign` (C1 unified) pour la signature elle-même.
 */

export const SIGNATURE_BATCH_SUPPORTED_DOC_TYPES = new Set<string>([
  "convention_entreprise",
  "convention_intervention",
]);

export interface BatchSignatureRequestResult {
  totalRequested: number;
  successCount: number;
  failureCount: number;
  errors: Array<{ docId: string; ownerName: string; error: string }>;
  latencyMs: number;
}

interface RequestArgs {
  docType: string;
  sessionId: string;
}

interface BatchSignatureApiResponse {
  totalRequested: number;
  successCount: number;
  failureCount: number;
  errors: Array<{ docId: string; ownerName: string; error: string }>;
  totalLatencyMs: number;
}

export function hasBatchSignatureRequestEndpoint(docType: string): boolean {
  return SIGNATURE_BATCH_SUPPORTED_DOC_TYPES.has(docType);
}

export async function requestBatchSignatures(args: RequestArgs): Promise<BatchSignatureRequestResult> {
  if (!hasBatchSignatureRequestEndpoint(args.docType)) {
    throw new Error(`doc_type non supporté pour signature batch : ${args.docType}`);
  }

  const res = await fetch("/api/documents/signature-request-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: args.sessionId, docType: args.docType }),
  });

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error ?? `Erreur serveur (${res.status})`);
  }

  const data = (await res.json()) as BatchSignatureApiResponse;

  return {
    totalRequested: data.totalRequested,
    successCount: data.successCount,
    failureCount: data.failureCount,
    errors: data.errors,
    latencyMs: data.totalLatencyMs,
  };
}
