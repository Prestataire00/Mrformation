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
