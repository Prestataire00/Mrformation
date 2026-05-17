import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  hasBatchSignatureRequestEndpoint,
  requestBatchSignatures,
  SIGNATURE_BATCH_SUPPORTED_DOC_TYPES,
} from "@/lib/utils/batch-doc-signature-request";

describe("hasBatchSignatureRequestEndpoint", () => {
  it("retourne true pour les 3 doc_types signature", () => {
    expect(hasBatchSignatureRequestEndpoint("convention_entreprise")).toBe(true);
    expect(hasBatchSignatureRequestEndpoint("convention_intervention")).toBe(true);
    expect(hasBatchSignatureRequestEndpoint("contrat_sous_traitance")).toBe(true);
  });

  it("retourne false pour les doc_types non-signature", () => {
    expect(hasBatchSignatureRequestEndpoint("convocation")).toBe(false);
    expect(hasBatchSignatureRequestEndpoint("certificat_realisation")).toBe(false);
    expect(hasBatchSignatureRequestEndpoint("cgv")).toBe(false);
    expect(hasBatchSignatureRequestEndpoint("doc_inexistant")).toBe(false);
  });

  it("le set de doc_types supportés est exactement de taille 3", () => {
    expect(SIGNATURE_BATCH_SUPPORTED_DOC_TYPES.size).toBe(3);
  });
});

describe("requestBatchSignatures", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POST vers /api/documents/signature-request-batch avec body { sessionId, docType }", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        totalRequested: 5,
        successCount: 5,
        failureCount: 0,
        errors: [],
        totalLatencyMs: 3200,
      }),
    });

    const result = await requestBatchSignatures({
      docType: "convention_entreprise",
      sessionId: "session-uuid-123",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/documents/signature-request-batch");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "session-uuid-123", docType: "convention_entreprise" }),
    });

    expect(result).toEqual({
      totalRequested: 5,
      successCount: 5,
      failureCount: 0,
      errors: [],
      latencyMs: 3200,
    });
  });

  it("retourne les stats fail-soft avec détail errors", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        totalRequested: 5,
        successCount: 4,
        failureCount: 1,
        errors: [{ docId: "doc-1", ownerName: "ABC SARL", error: "Pas d'email" }],
        totalLatencyMs: 2800,
      }),
    });

    const result = await requestBatchSignatures({
      docType: "convention_entreprise",
      sessionId: "session-uuid",
    });

    expect(result.failureCount).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toEqual({ docId: "doc-1", ownerName: "ABC SARL", error: "Pas d'email" });
  });

  it("throw avec message serveur si fetch !ok", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "RESEND_API_KEY non configurée" }),
    });

    await expect(
      requestBatchSignatures({ docType: "convention_entreprise", sessionId: "session-uuid" }),
    ).rejects.toThrow("RESEND_API_KEY non configurée");
  });

  it("throw avec message générique si fetch !ok et pas d'error dans le body", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({}),
    });

    await expect(
      requestBatchSignatures({ docType: "convention_entreprise", sessionId: "session-uuid" }),
    ).rejects.toThrow("Erreur serveur (503)");
  });

  it("throw si doc_type non supporté (sans appeler fetch)", async () => {
    await expect(
      requestBatchSignatures({ docType: "convocation", sessionId: "session-uuid" }),
    ).rejects.toThrow("doc_type non supporté pour signature batch : convocation");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
