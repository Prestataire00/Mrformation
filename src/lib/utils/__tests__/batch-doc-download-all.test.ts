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
