/**
 * `PuppeteerEngine` — implémentation de `PDFEngine` qui délègue le rendu PDF
 * au sidecar Puppeteer self-hosted (cf `puppeteer-service/` dans ce repo,
 * déployé sur Railway).
 *
 * Story de tête A1. Cf `bmad_output/planning-artifacts/epics-documents.md`.
 *
 * Retries : par défaut 2 retries avec backoff exponentiel sur erreurs réseau
 * (pas sur les erreurs HTTP — un 4xx ne mérite pas un retry). Timeout 30s par
 * tentative via AbortController.
 */

import type { PDFEngine, PDFRenderOptions } from "@/lib/services/pdf-engines/types";

export interface PuppeteerEngineConfig {
  /** URL du sidecar Puppeteer (ex : https://mr-formation-pdf.up.railway.app). */
  baseUrl: string;
  /** Bearer secret pour l'auth. Cf env var `PDF_SERVICE_SECRET`. */
  secret: string;
  /** Nombre de retries en cas d'erreur réseau. Défaut 2. */
  retries?: number;
  /** Backoff exponential de base en ms. Défaut 500ms. Réduit pour tests. */
  backoffBaseMs?: number;
  /** Timeout par tentative en ms. Défaut 30s. */
  timeoutMs?: number;
}

export class PuppeteerEngine implements PDFEngine {
  private readonly baseUrl: string;
  private readonly secret: string;
  private readonly retries: number;
  private readonly backoffBaseMs: number;
  private readonly timeoutMs: number;

  constructor(config: PuppeteerEngineConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, ""); // strip trailing slash
    this.secret = config.secret;
    this.retries = config.retries ?? 2;
    this.backoffBaseMs = config.backoffBaseMs ?? 500;
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  async render(html: string, options?: PDFRenderOptions): Promise<Buffer> {
    let lastError: unknown;
    const maxAttempts = this.retries + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await this.attemptRender(html, options);
      } catch (err) {
        lastError = err;
        // Retry only on network errors (fetch reject), not HTTP errors.
        if (!isNetworkError(err) || attempt === maxAttempts - 1) {
          throw err;
        }
        // Backoff exponential : base * 2^attempt
        const delay = this.backoffBaseMs * 2 ** attempt;
        await sleep(delay);
      }
    }
    // Unreachable normally, mais TypeScript a besoin du throw final.
    throw lastError;
  }

  private async attemptRender(
    html: string,
    options?: PDFRenderOptions,
  ): Promise<Buffer> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/render`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ html, options: options ?? {} }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response
          .text()
          .catch(() => `HTTP ${response.status}`);
        throw new Error(
          `Puppeteer sidecar returned ${response.status}: ${errBody}`,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

/** Détecte une erreur réseau (fetch reject) vs une erreur HTTP (response 4xx/5xx). */
function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // Errors thrown via fetch reject : ECONNREFUSED, ETIMEDOUT, AbortError, etc.
  // Errors thrown sur HTTP non-OK contiennent "Puppeteer sidecar returned".
  return !err.message.startsWith("Puppeteer sidecar returned");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
