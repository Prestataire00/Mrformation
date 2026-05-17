import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  hasBatchEndpoint,
  fetchBatchZip,
  buildZipFilename,
  BATCH_ENDPOINTS_BY_DOC_TYPE,
} from "@/lib/utils/batch-doc-download";

describe("hasBatchEndpoint", () => {
  it("retourne true pour chaque doc_type listé dans le mapping", () => {
    for (const docType of Object.keys(BATCH_ENDPOINTS_BY_DOC_TYPE)) {
      expect(hasBatchEndpoint(docType)).toBe(true);
    }
  });

  it("retourne false pour un doc_type non listé", () => {
    expect(hasBatchEndpoint("cgv")).toBe(false);
    expect(hasBatchEndpoint("planning_semaine")).toBe(false);
    expect(hasBatchEndpoint("doc_inexistant")).toBe(false);
  });
});

describe("buildZipFilename", () => {
  it("nettoie le titre de session (caractères spéciaux → tirets, accents virés)", () => {
    const filename = buildZipFilename({
      docType: "convocation",
      sessionId: "s",
      sessionTitle: "Formation été 2026 (B1V) – session #1",
    });
    expect(filename).toMatch(/^convocation_Formation-t-2026-B1V-session-1_\d{4}-\d{2}-\d{2}\.zip$/);
  });

  it("fallback `session` si titre vide", () => {
    const filename = buildZipFilename({ docType: "convocation", sessionId: "s", sessionTitle: "" });
    expect(filename).toMatch(/^convocation_session_\d{4}-\d{2}-\d{2}\.zip$/);
  });

  it("tronque les titres très longs (>40 chars)", () => {
    const longTitle = "A".repeat(60);
    const filename = buildZipFilename({
      docType: "convocation",
      sessionId: "s",
      sessionTitle: longTitle,
    });
    const titlePart = filename.split("_")[1];
    expect(titlePart.length).toBeLessThanOrEqual(40);
  });
});

describe("fetchBatchZip", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POST vers l'endpoint mappé avec body { sessionId } et retourne blob + stats", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        zipBase64: btoa("fake-zip-bytes"),
        totalLearners: 20,
        successCount: 20,
        failureCount: 0,
        totalLatencyMs: 4500,
      }),
    });

    const result = await fetchBatchZip({
      docType: "convocation",
      sessionId: "session-uuid-123",
      sessionTitle: "Formation Habilitation B1V",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/documents/generate-convocations-batch");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "session-uuid-123" }),
    });

    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.type).toBe("application/zip");
    expect(result.blob.size).toBe(14); // "fake-zip-bytes".length

    expect(result.filename).toMatch(/^convocation_Formation-Habilitation-B1V_\d{4}-\d{2}-\d{2}\.zip$/);

    expect(result.stats).toEqual({
      totalRequested: 20,
      successCount: 20,
      failureCount: 0,
      latencyMs: 4500,
    });
  });

  it("retourne les stats fail-soft (failureCount > 0) quand le serveur en signale", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        zipBase64: btoa("partial-zip"),
        totalLearners: 20,
        successCount: 18,
        failureCount: 2,
        totalLatencyMs: 5200,
      }),
    });

    const result = await fetchBatchZip({
      docType: "certificat_realisation",
      sessionId: "session-uuid-456",
      sessionTitle: "Session INTER",
    });

    expect(result.stats.failureCount).toBe(2);
    expect(result.stats.successCount).toBe(18);
    expect(result.blob.size).toBeGreaterThan(0); // ZIP partiel quand même
  });

  it("throw avec message serveur si fetch !ok", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "Engine Puppeteer indisponible" }),
    });

    await expect(
      fetchBatchZip({
        docType: "convocation",
        sessionId: "session-uuid",
        sessionTitle: "Test",
      }),
    ).rejects.toThrow("Engine Puppeteer indisponible");
  });

  it("throw avec message générique si fetch !ok et pas d'error dans le body", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({}),
    });

    await expect(
      fetchBatchZip({
        docType: "convocation",
        sessionId: "session-uuid",
        sessionTitle: "Test",
      }),
    ).rejects.toThrow("Erreur serveur (503)");
  });

  it("throw si doc_type non supporté (sans appeler fetch)", async () => {
    await expect(
      fetchBatchZip({
        docType: "doc_type_inexistant",
        sessionId: "session-uuid",
        sessionTitle: "Test",
      }),
    ).rejects.toThrow("Aucun endpoint batch pour doc_type=doc_type_inexistant");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
