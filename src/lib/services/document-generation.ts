/**
 * `DocumentGenerationService` — point d'entrée unique pour la génération PDF.
 *
 * Story A2 du refactor Documents (cf `bmad_output/planning-artifacts/epics-documents.md`).
 *
 * Séquence pour chaque appel `generate()` :
 *   1. Hash de cache calculé via `pdf-cache.ts::computeCacheKey(cacheInputs)`.
 *   2. Lookup `getCachedPdf()` dans le bucket Supabase `pdf-cache`.
 *   3. Cache hit → retourne le PDF cache + logEvent + engineUsed='cache_hit'.
 *   4. Cache miss → appelle `engine.render(html, options)` → upload cache → retourne.
 *   5. Log `document_generated` avec metrics dans tous les cas.
 *   6. Sur erreur engine → log `document_failed` + rethrow.
 *
 * Le service NE TOUCHE PAS la table `documents` aujourd'hui — ça vient en
 * Lot B (B1 crée la table, B3-B7 ajoutent les INSERTs par doc_type). A2 est
 * purement la couche moteur + cache + observabilité.
 */

import { logEvent } from "@/lib/logger";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeCacheKey,
  getCachedPdf,
  setCachedPdf,
  type CacheKeyInputs,
} from "@/lib/services/pdf-cache";
import {
  FallbackEngine,
  type EngineUsedTag,
} from "@/lib/services/pdf-engines/fallback-engine";
import type {
  PDFEngine,
  PDFRenderOptions,
} from "@/lib/services/pdf-engines/types";

export interface DocumentGenerationInput {
  /** UUID de l'entité (multi-tenant). Utilisé pour le path Storage du cache. */
  entityId: string;
  /** Type fonctionnel du document (`convention_entreprise`, `emargement`, …).
   *  Utilisé pour les logs et la traçabilité, pas pour la résolution de template
   *  (la résolution arrivera en Story B0 via un wrapper haut-niveau). */
  docType: string;
  /** HTML complet à rendre (avec `<html>`, `<head>`, `<body>`). */
  html: string;
  /** Options de rendu (format, marges, headers, …) transmises à l'engine. */
  options?: PDFRenderOptions;
  /** Inputs entrant dans le hash de cache (voir `CacheKeyInputs` dans pdf-cache.ts). */
  cacheInputs: Omit<CacheKeyInputs, "entity_id">;
}

export interface DocumentGenerationResult {
  buffer: Buffer;
  cacheHit: boolean;
  /** "puppeteer" | "cloudconvert" | "cloudconvert_fallback" | "cache_hit" */
  engineUsed: EngineUsedTag | "cache_hit";
  fileSizeBytes: number;
  latencyMs: number;
}

export interface DocumentGenerationServiceConfig {
  /** Le moteur PDF principal (typiquement `FallbackEngine` Puppeteer→CloudConvert). */
  engine: PDFEngine;
  /** Client Supabase pour le bucket cache. Doit avoir accès au bucket `pdf-cache`. */
  supabase: SupabaseClient;
}

export class DocumentGenerationService {
  private readonly engine: PDFEngine;
  private readonly supabase: SupabaseClient;

  constructor(config: DocumentGenerationServiceConfig) {
    this.engine = config.engine;
    this.supabase = config.supabase;
  }

  async generate(input: DocumentGenerationInput): Promise<DocumentGenerationResult> {
    const startedAt = Date.now();
    const cacheKey = computeCacheKey({
      entity_id: input.entityId,
      ...input.cacheInputs,
    });

    try {
      // 1. Cache lookup
      const cached = await getCachedPdf(this.supabase, input.entityId, cacheKey);
      if (cached) {
        const result: DocumentGenerationResult = {
          buffer: cached,
          cacheHit: true,
          engineUsed: "cache_hit",
          fileSizeBytes: cached.byteLength,
          latencyMs: Date.now() - startedAt,
        };
        this.logGenerated(input, result);
        return result;
      }

      // 2. Cache miss → render via engine
      const buffer = await this.engine.render(input.html, input.options);

      // 3. Upload cache (silent fail — on ne bloque pas si Storage HS)
      await setCachedPdf(this.supabase, input.entityId, cacheKey, buffer);

      const engineUsed: EngineUsedTag =
        this.engine instanceof FallbackEngine
          ? this.engine.getLastEngineUsed()
          : "puppeteer";

      const result: DocumentGenerationResult = {
        buffer,
        cacheHit: false,
        engineUsed,
        fileSizeBytes: buffer.byteLength,
        latencyMs: Date.now() - startedAt,
      };
      this.logGenerated(input, result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logEvent("document_failed", {
        entity_id: input.entityId,
        doc_type: input.docType,
        error_message: message,
        latency_ms: Date.now() - startedAt,
      });
      throw err;
    }
  }

  private logGenerated(
    input: DocumentGenerationInput,
    result: DocumentGenerationResult,
  ): void {
    logEvent("document_generated", {
      entity_id: input.entityId,
      doc_type: input.docType,
      cache_hit: result.cacheHit,
      engine_used: result.engineUsed,
      file_size_bytes: result.fileSizeBytes,
      latency_ms: result.latencyMs,
    });
  }
}

/**
 * Factory : construit le `DocumentGenerationService` configuré selon l'env.
 *
 * Variable d'env `PDF_ENGINE_PREFERENCE` :
 *   - `puppeteer` : utilise UNIQUEMENT Puppeteer (pas de fallback). Plante si down.
 *   - `cloudconvert` : utilise UNIQUEMENT CloudConvert (utile pour rollback rapide).
 *   - `auto` (défaut) : Puppeteer primary + CloudConvert fallback automatique.
 *
 * Variables d'env requises :
 *   - `PDF_SERVICE_URL`, `PDF_SERVICE_SECRET` : sidecar Puppeteer Railway
 *   - `CLOUDCONVERT_API_KEY` : clé CloudConvert (déjà existant)
 */
export function createDefaultEngine(): PDFEngine {
  // Imports dynamiques pour éviter de charger CloudConvert si on n'en a pas besoin.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PuppeteerEngine } = require("@/lib/services/pdf-engines/puppeteer-engine");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { CloudConvertEngine } = require("@/lib/services/pdf-engines/cloudconvert-engine");

  const preference = process.env.PDF_ENGINE_PREFERENCE ?? "auto";

  const puppeteerUrl = process.env.PDF_SERVICE_URL;
  const puppeteerSecret = process.env.PDF_SERVICE_SECRET;

  if (preference === "cloudconvert") {
    return new CloudConvertEngine();
  }

  // Puppeteer seul ou Fallback : on a besoin de l'URL et du secret.
  if (!puppeteerUrl || !puppeteerSecret) {
    // Si Puppeteer pas configuré, on retombe sur CloudConvert direct.
    return new CloudConvertEngine();
  }

  const puppeteer = new PuppeteerEngine({
    baseUrl: puppeteerUrl,
    secret: puppeteerSecret,
  });

  if (preference === "puppeteer") {
    return puppeteer;
  }

  // "auto" — wrap Puppeteer + fallback CloudConvert
  return new FallbackEngine({
    primary: { name: "puppeteer", engine: puppeteer },
    fallback: { name: "cloudconvert", engine: new CloudConvertEngine() },
  });
}
