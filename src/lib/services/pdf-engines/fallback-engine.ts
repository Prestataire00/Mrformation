/**
 * `FallbackEngine` — wrappe deux moteurs PDF : un primary (Puppeteer en run-rate)
 * et un fallback (CloudConvert si Puppeteer down). Essaie le primary, bascule
 * sur fallback uniquement si le primary throw.
 *
 * Logue `pdf_engine_fallback_triggered` à chaque basculement pour permettre le
 * monitoring (alerte si trop de basculements → Puppeteer sidecar instable).
 */

import { logEvent } from "@/lib/logger";
import type { PDFEngine, PDFRenderOptions } from "@/lib/services/pdf-engines/types";

export type EngineName = "puppeteer" | "cloudconvert";
export type EngineUsedTag = "puppeteer" | "cloudconvert" | "cloudconvert_fallback";

export interface NamedEngine {
  name: EngineName;
  engine: PDFEngine;
}

export interface FallbackEngineConfig {
  primary: NamedEngine;
  fallback: NamedEngine;
}

export class FallbackEngine implements PDFEngine {
  private readonly primary: NamedEngine;
  private readonly fallback: NamedEngine;
  private lastEngineUsed: EngineUsedTag = "puppeteer";

  constructor(config: FallbackEngineConfig) {
    this.primary = config.primary;
    this.fallback = config.fallback;
  }

  async render(html: string, options?: PDFRenderOptions): Promise<Buffer> {
    try {
      const buffer = await this.primary.engine.render(html, options);
      this.lastEngineUsed = this.primary.name;
      return buffer;
    } catch (primaryErr) {
      const message =
        primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      logEvent("pdf_engine_fallback_triggered", {
        primary: this.primary.name,
        fallback: this.fallback.name,
        primary_error: message,
      });

      // On laisse le fallback throw librement — le caller gérera l'erreur finale.
      const buffer = await this.fallback.engine.render(html, options);
      // Tag spécial pour distinguer "fallback utilisé" de "engine principal".
      this.lastEngineUsed =
        this.fallback.name === "cloudconvert"
          ? "cloudconvert_fallback"
          : this.fallback.name;
      return buffer;
    }
  }

  /**
   * Retourne le tag du moteur effectivement utilisé lors du dernier `render()`.
   * Utilisé par `DocumentGenerationService` pour la métrique `engine_used`.
   */
  getLastEngineUsed(): EngineUsedTag {
    return this.lastEngineUsed;
  }
}
