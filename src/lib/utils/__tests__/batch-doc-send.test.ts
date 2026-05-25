import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  hasBatchSendEndpoint,
  sendBatchEmail,
  BATCH_SEND_ENDPOINTS_BY_DOC_TYPE,
} from "@/lib/utils/batch-doc-send";

describe("hasBatchSendEndpoint", () => {
  it("retourne true pour chaque doc_type listé dans le mapping", () => {
    for (const docType of Object.keys(BATCH_SEND_ENDPOINTS_BY_DOC_TYPE)) {
      expect(hasBatchSendEndpoint(docType)).toBe(true);
    }
  });

  it("retourne false pour un doc_type non listé (statiques 1-par-session)", () => {
    expect(hasBatchSendEndpoint("programme_formation")).toBe(false);
    expect(hasBatchSendEndpoint("doc_inexistant")).toBe(false);
  });

  it("retourne true pour les nouveaux doc_types F1.x/F2.x ajoutés", () => {
    expect(hasBatchSendEndpoint("cgv")).toBe(true);
    expect(hasBatchSendEndpoint("planning_semaine")).toBe(true);
    expect(hasBatchSendEndpoint("bilan_poe")).toBe(true);
    expect(hasBatchSendEndpoint("attestation_aipr")).toBe(true);
    expect(hasBatchSendEndpoint("avis_hab_elec_generique")).toBe(true);
    expect(hasBatchSendEndpoint("avis_hab_elec_h0_b0_initial")).toBe(true);
  });

  it("supporte tous les doc_types couverts par F2 (MVP + extensions F2.1-F2.5)", () => {
    expect(hasBatchSendEndpoint("convocation")).toBe(true);
    expect(hasBatchSendEndpoint("certificat_realisation")).toBe(true);
    expect(hasBatchSendEndpoint("attestation_assiduite")).toBe(true);
    expect(hasBatchSendEndpoint("feuille_emargement")).toBe(true);
    expect(hasBatchSendEndpoint("convention_entreprise")).toBe(true);
    expect(hasBatchSendEndpoint("convention_intervention")).toBe(true);
  });
});

describe("sendBatchEmail", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POST vers l'endpoint mappé avec body { sessionId } et retourne stats", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        totalRequested: 20,
        successCount: 20,
        failureCount: 0,
        errors: [],
        totalLatencyMs: 8500,
      }),
    });

    const result = await sendBatchEmail({
      docType: "convocation",
      sessionId: "session-uuid-123",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/documents/send-convocations-batch-email");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "session-uuid-123", docType: "convocation" }),
    });

    expect(result).toEqual({
      totalRequested: 20,
      successCount: 20,
      failureCount: 0,
      errors: [],
      latencyMs: 8500,
    });
  });

  it("retourne les stats fail-soft avec détail errors", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        totalRequested: 20,
        successCount: 18,
        failureCount: 2,
        errors: [
          { learnerId: "l1", learnerName: "Jean Dupont", error: "Pas d'email" },
          { learnerId: "l2", learnerName: "Marie Martin", error: "Resend timeout" },
        ],
        totalLatencyMs: 9200,
      }),
    });

    const result = await sendBatchEmail({
      docType: "convocation",
      sessionId: "session-uuid-456",
    });

    expect(result.successCount).toBe(18);
    expect(result.failureCount).toBe(2);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toEqual({
      learnerId: "l1",
      learnerName: "Jean Dupont",
      error: "Pas d'email",
    });
  });

  it("throw avec message serveur si fetch !ok", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "RESEND_API_KEY non configurée" }),
    });

    await expect(
      sendBatchEmail({ docType: "convocation", sessionId: "session-uuid" }),
    ).rejects.toThrow("RESEND_API_KEY non configurée");
  });

  it("throw avec message générique si fetch !ok et pas d'error dans le body", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({}),
    });

    await expect(
      sendBatchEmail({ docType: "convocation", sessionId: "session-uuid" }),
    ).rejects.toThrow("Erreur serveur (503)");
  });

  it("throw si doc_type non supporté (sans appeler fetch)", async () => {
    await expect(
      sendBatchEmail({ docType: "doc_inexistant", sessionId: "session-uuid" }),
    ).rejects.toThrow("Aucun endpoint batch-send pour doc_type=doc_inexistant");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
