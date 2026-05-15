import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PuppeteerEngine } from "@/lib/services/pdf-engines/puppeteer-engine";

const BASE_URL = "https://test-puppeteer.up.railway.app";
const SECRET = "test-secret-abc";

describe("PuppeteerEngine", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("appelle /render avec le Bearer token et retourne le buffer PDF", async () => {
    const fakePdf = Buffer.from("PDF binary content");
    fetchMock.mockResolvedValueOnce(
      new Response(fakePdf, {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      }),
    );

    const engine = new PuppeteerEngine({ baseUrl: BASE_URL, secret: SECRET });
    const result = await engine.render("<h1>Hello</h1>", { format: "A4" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/render`);
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`Bearer ${SECRET}`);
    expect(headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.html).toBe("<h1>Hello</h1>");
    expect(body.options).toEqual({ format: "A4" });

    expect(result).toBeInstanceOf(Buffer);
    expect(result.toString()).toBe("PDF binary content");
  });

  it("ignore le slash final du baseUrl", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(Buffer.from("x"), { status: 200 }),
    );

    const engine = new PuppeteerEngine({ baseUrl: `${BASE_URL}/`, secret: SECRET });
    await engine.render("<h1>x</h1>");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/render`); // pas de // double
  });

  it("throw si le sidecar renvoie 401 (auth invalide)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const engine = new PuppeteerEngine({ baseUrl: BASE_URL, secret: "wrong" });
    await expect(engine.render("<h1>x</h1>")).rejects.toThrow(/401|Unauthorized/);
  });

  it("throw si le sidecar renvoie 500 (erreur Puppeteer)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Chromium crashed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const engine = new PuppeteerEngine({ baseUrl: BASE_URL, secret: SECRET });
    await expect(engine.render("<h1>x</h1>")).rejects.toThrow(/Chromium crashed|500/);
  });

  it("retry exponential 2 fois en cas d'erreur réseau", async () => {
    // Premier appel : fail réseau. Deuxième : fail réseau. Troisième : succès.
    fetchMock
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockRejectedValueOnce(new Error("ETIMEDOUT"))
      .mockResolvedValueOnce(new Response(Buffer.from("OK"), { status: 200 }));

    const engine = new PuppeteerEngine({
      baseUrl: BASE_URL,
      secret: SECRET,
      retries: 2,
      // Backoff réduit pour le test (sinon le test attend des secondes)
      backoffBaseMs: 1,
    });
    const result = await engine.render("<h1>x</h1>");

    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    expect(result.toString()).toBe("OK");
  });

  it("throw après épuisement des retries", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const engine = new PuppeteerEngine({
      baseUrl: BASE_URL,
      secret: SECRET,
      retries: 2,
      backoffBaseMs: 1,
    });
    await expect(engine.render("<h1>x</h1>")).rejects.toThrow(/ECONNREFUSED/);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it("respecte le timeout de 30s par défaut", async () => {
    // On vérifie que `signal` AbortController est passé au fetch.
    fetchMock.mockResolvedValueOnce(
      new Response(Buffer.from("x"), { status: 200 }),
    );

    const engine = new PuppeteerEngine({ baseUrl: BASE_URL, secret: SECRET });
    await engine.render("<h1>x</h1>");

    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it("transmet les options de rendu (margins, headers, footers) au sidecar", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(Buffer.from("x"), { status: 200 }),
    );

    const engine = new PuppeteerEngine({ baseUrl: BASE_URL, secret: SECRET });
    await engine.render("<h1>x</h1>", {
      format: "Letter",
      margins: { top: "10mm", left: "5mm" },
      headerTemplate: "<div>HEAD</div>",
      footerTemplate: "<div>FOOT</div>",
      printBackground: false,
      landscape: true,
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.options).toEqual({
      format: "Letter",
      margins: { top: "10mm", left: "5mm" },
      headerTemplate: "<div>HEAD</div>",
      footerTemplate: "<div>FOOT</div>",
      printBackground: false,
      landscape: true,
    });
  });
});
