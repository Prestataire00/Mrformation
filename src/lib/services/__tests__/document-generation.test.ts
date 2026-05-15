import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DocumentGenerationService,
  type DocumentGenerationInput,
} from "@/lib/services/document-generation";
import type { PDFEngine } from "@/lib/services/pdf-engines/types";
import type { SupabaseClient } from "@supabase/supabase-js";

function makePdfEngine(buffer: Buffer): PDFEngine {
  return {
    render: vi.fn(async () => buffer),
  };
}

function makeSupabaseMock(opts: {
  cachedBuffer?: Buffer | null;
  uploadFails?: boolean;
}): SupabaseClient {
  const downloadMock = vi.fn(async () => {
    if (opts.cachedBuffer) {
      // Le SDK Supabase Storage retourne un Blob côté browser, mais en Node
      // on peut renvoyer un objet `{ arrayBuffer: () => ArrayBuffer }`.
      return {
        data: {
          arrayBuffer: async () =>
            opts.cachedBuffer!.buffer.slice(
              opts.cachedBuffer!.byteOffset,
              opts.cachedBuffer!.byteOffset + opts.cachedBuffer!.byteLength,
            ),
        },
        error: null,
      };
    }
    return { data: null, error: { message: "not found" } };
  });

  const uploadMock = vi.fn(async () => {
    if (opts.uploadFails) {
      return { data: null, error: { message: "upload failed" } };
    }
    return { data: { path: "ok" }, error: null };
  });

  const from = vi.fn(() => ({
    download: downloadMock,
    upload: uploadMock,
  }));

  return { storage: { from } } as unknown as SupabaseClient;
}

const baseInput: DocumentGenerationInput = {
  entityId: "entity-uuid-1",
  docType: "convention_entreprise",
  html: "<h1>Hello</h1>",
  cacheInputs: {
    template_id: "tpl-1",
    session_id: "session-1",
    template_updated_at: "2026-01-01T00:00:00Z",
    session_updated_at: "2026-01-01T00:00:00Z",
  },
};

describe("DocumentGenerationService", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cache miss → appelle engine, upload cache, retourne PDF + metrics", async () => {
    const generatedPdf = Buffer.from("generated-pdf-content");
    const engine = makePdfEngine(generatedPdf);
    const supabase = makeSupabaseMock({ cachedBuffer: null });

    const service = new DocumentGenerationService({ engine, supabase });
    const result = await service.generate(baseInput);

    expect(result.cacheHit).toBe(false);
    expect(result.buffer.toString()).toBe("generated-pdf-content");
    expect(result.fileSizeBytes).toBe(generatedPdf.byteLength);
    expect(result.engineUsed).toBeDefined();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(engine.render).toHaveBeenCalledTimes(1);

    // logEvent("document_generated") émis
    const events = consoleLogSpy.mock.calls
      .map((c) => {
        try {
          return JSON.parse(c[0] as string) as Record<string, unknown>;
        } catch {
          return {};
        }
      })
      .filter((e) => e.event === "document_generated");
    expect(events.length).toBe(1);
    const ev = events[0];
    expect(ev.entity_id).toBe("entity-uuid-1");
    expect(ev.doc_type).toBe("convention_entreprise");
    expect(ev.cache_hit).toBe(false);
    expect(ev.file_size_bytes).toBe(generatedPdf.byteLength);
  });

  it("cache hit → ne touche pas l'engine, retourne PDF du cache + cacheHit=true", async () => {
    const cached = Buffer.from("cached-pdf");
    const engine = makePdfEngine(Buffer.from("would-not-be-called"));
    const supabase = makeSupabaseMock({ cachedBuffer: cached });

    const service = new DocumentGenerationService({ engine, supabase });
    const result = await service.generate(baseInput);

    expect(result.cacheHit).toBe(true);
    expect(result.buffer.toString()).toBe("cached-pdf");
    expect(result.engineUsed).toBe("cache_hit");
    expect(engine.render).not.toHaveBeenCalled();

    const events = consoleLogSpy.mock.calls
      .map((c) => {
        try {
          return JSON.parse(c[0] as string) as Record<string, unknown>;
        } catch {
          return {};
        }
      })
      .filter((e) => e.event === "document_generated");
    expect(events[0].cache_hit).toBe(true);
    expect(events[0].engine_used).toBe("cache_hit");
  });

  it("propage l'erreur si l'engine throw + émet document_failed", async () => {
    const engine: PDFEngine = {
      render: vi.fn(async () => {
        throw new Error("Puppeteer crashed");
      }),
    };
    const supabase = makeSupabaseMock({ cachedBuffer: null });

    const service = new DocumentGenerationService({ engine, supabase });
    await expect(service.generate(baseInput)).rejects.toThrow(/Puppeteer crashed/);

    const events = consoleLogSpy.mock.calls
      .map((c) => {
        try {
          return JSON.parse(c[0] as string) as Record<string, unknown>;
        } catch {
          return {};
        }
      })
      .filter((e) => e.event === "document_failed");
    expect(events.length).toBe(1);
    expect(events[0].error_message).toMatch(/Puppeteer crashed/);
  });

  it("upload cache silencieux : si l'upload échoue, retourne quand même le PDF", async () => {
    const generated = Buffer.from("pdf-body");
    const engine = makePdfEngine(generated);
    const supabase = makeSupabaseMock({ cachedBuffer: null, uploadFails: true });

    const service = new DocumentGenerationService({ engine, supabase });
    const result = await service.generate(baseInput);

    expect(result.buffer.toString()).toBe("pdf-body");
    expect(result.cacheHit).toBe(false);
  });

  it("passe les options de rendu à l'engine", async () => {
    const generated = Buffer.from("pdf");
    const engine = makePdfEngine(generated);
    const supabase = makeSupabaseMock({ cachedBuffer: null });

    const service = new DocumentGenerationService({ engine, supabase });
    await service.generate({
      ...baseInput,
      options: { format: "Letter", landscape: true, margins: { top: "30mm" } },
    });

    expect(engine.render).toHaveBeenCalledWith(baseInput.html, {
      format: "Letter",
      landscape: true,
      margins: { top: "30mm" },
    });
  });
});
