import { describe, it, expect, vi, afterEach } from "vitest";
import { FallbackEngine } from "@/lib/services/pdf-engines/fallback-engine";
import type { PDFEngine } from "@/lib/services/pdf-engines/types";

function mockEngine(behavior: "success" | "fail", payload?: Buffer | Error): PDFEngine {
  const render = vi.fn(async () => {
    if (behavior === "fail") {
      throw payload instanceof Error ? payload : new Error("engine failed");
    }
    return payload instanceof Buffer ? payload : Buffer.from("default-pdf");
  });
  return { render } as unknown as PDFEngine;
}

describe("FallbackEngine", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retourne le rendu du primary si succès", async () => {
    const primary = mockEngine("success", Buffer.from("primary-pdf"));
    const fallback = mockEngine("success", Buffer.from("fallback-pdf"));

    const engine = new FallbackEngine({
      primary: { name: "puppeteer", engine: primary },
      fallback: { name: "cloudconvert", engine: fallback },
    });
    const result = await engine.render("<h1>test</h1>");

    expect(result.toString()).toBe("primary-pdf");
    expect(primary.render).toHaveBeenCalledTimes(1);
    expect(fallback.render).not.toHaveBeenCalled();
  });

  it("bascule sur fallback si primary throw", async () => {
    const primary = mockEngine("fail", new Error("Puppeteer down"));
    const fallback = mockEngine("success", Buffer.from("fallback-pdf"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const engine = new FallbackEngine({
      primary: { name: "puppeteer", engine: primary },
      fallback: { name: "cloudconvert", engine: fallback },
    });
    const result = await engine.render("<h1>test</h1>");

    expect(result.toString()).toBe("fallback-pdf");
    expect(primary.render).toHaveBeenCalledTimes(1);
    expect(fallback.render).toHaveBeenCalledTimes(1);

    // Log structuré du basculement
    const events = logSpy.mock.calls
      .map((c) => {
        try {
          return JSON.parse(c[0] as string) as { event?: string };
        } catch {
          return { event: undefined };
        }
      })
      .filter((e) => e.event === "pdf_engine_fallback_triggered");
    expect(events.length).toBe(1);
  });

  it("propage l'erreur si primary ET fallback throw", async () => {
    const primary = mockEngine("fail", new Error("Puppeteer down"));
    const fallback = mockEngine("fail", new Error("CloudConvert quota exceeded"));

    const engine = new FallbackEngine({
      primary: { name: "puppeteer", engine: primary },
      fallback: { name: "cloudconvert", engine: fallback },
    });

    await expect(engine.render("<h1>test</h1>")).rejects.toThrow(
      /CloudConvert quota exceeded/,
    );
    expect(primary.render).toHaveBeenCalledTimes(1);
    expect(fallback.render).toHaveBeenCalledTimes(1);
  });

  it("expose le dernier engine utilisé via getLastEngineUsed", async () => {
    const primary = mockEngine("fail", new Error("oops"));
    const fallback = mockEngine("success", Buffer.from("ok"));

    const engine = new FallbackEngine({
      primary: { name: "puppeteer", engine: primary },
      fallback: { name: "cloudconvert", engine: fallback },
    });
    await engine.render("<h1>x</h1>");
    expect(engine.getLastEngineUsed()).toBe("cloudconvert_fallback");

    // Reset comportement : primary OK
    const primary2 = mockEngine("success", Buffer.from("p2"));
    const engine2 = new FallbackEngine({
      primary: { name: "puppeteer", engine: primary2 },
      fallback: { name: "cloudconvert", engine: fallback },
    });
    await engine2.render("<h1>x</h1>");
    expect(engine2.getLastEngineUsed()).toBe("puppeteer");
  });
});
