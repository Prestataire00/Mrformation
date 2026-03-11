/**
 * Gamma API service
 *
 * Endpoints:
 *   POST /v1.0/generations              → Generate from scratch
 *   POST /v1.0/generations/from-template → Create from existing template
 *   GET  /v1.0/generations/:id           → Poll status
 *   GET  /v1.0/themes                    → List available themes
 *
 * Response flow:
 *   POST → { generationId: "xxx" }
 *   GET  → { generationId, status: "pending"|"completed"|"failed", gammaId, gammaUrl, credits }
 */

const GAMMA_API_BASE = "https://public-api.gamma.app/v1.0";

export interface GammaGenerateResult {
  id: string;
  generationId: string;
  gammaId: string;
  url: string;
  embedUrl: string;
  status: "pending" | "completed" | "failed";
  exportPdf?: string;
  exportPptx?: string;
}

export interface GammaTheme {
  id: string;
  name: string;
  type: "standard" | "custom";
  colorKeywords?: string[];
  toneKeywords?: string[];
}

export interface GammaGenerateOptions {
  /** Theme ID to apply (from GET /themes) */
  themeId?: string;
  /** Number of cards/slides (1-60) */
  numCards?: number;
  /** Text amount: brief, medium, detailed, extensive */
  textAmount?: "brief" | "medium" | "detailed" | "extensive";
  /** Tone descriptor (e.g. "professionnel et pédagogique") */
  tone?: string;
  /** Target audience (e.g. "apprenants en formation professionnelle") */
  audience?: string;
  /** Language code */
  language?: string;
  /** Image source */
  imageSource?: "aiGenerated" | "pictographic" | "pexels" | "webFreeToUse" | "noImages";
  /** Image style descriptor */
  imageStyle?: string;
  /** Additional instructions */
  additionalInstructions?: string;
  /** Export as PDF or PPTX alongside the Gamma URL */
  exportAs?: "pdf" | "pptx";
}

export interface GammaTemplateOptions {
  /** Gamma ID of the template to use */
  gammaId: string;
  /** Prompt describing how to adapt the template */
  prompt: string;
  /** Theme ID override (defaults to template's theme) */
  themeId?: string;
  /** Image style */
  imageStyle?: string;
  /** Export format */
  exportAs?: "pdf" | "pptx";
}

function getApiKey(): string {
  const key = process.env.GAMMA_API_KEY;
  if (!key || key === "votre-cle-gamma") {
    throw new Error("GAMMA_API_KEY non configurée. Ajoutez votre clé dans .env.local");
  }
  return key;
}

function gammaHeaders(): Record<string, string> {
  return {
    "X-API-KEY": getApiKey(),
    "Content-Type": "application/json",
  };
}

/**
 * Build embed URL from gammaUrl.
 * gammaUrl: https://gamma.app/docs/vrg5upbcf196m3z
 * embedUrl: https://gamma.app/embed/vrg5upbcf196m3z
 */
function buildEmbedUrl(gammaUrl: string): string {
  if (!gammaUrl) return "";
  return gammaUrl.replace("/docs/", "/embed/");
}

/* ------------------------------------------------------------------ */
/*  List Themes                                                        */
/* ------------------------------------------------------------------ */

/**
 * Fetch available Gamma themes (paginated, returns all).
 */
export async function listGammaThemes(): Promise<GammaTheme[]> {
  const themes: GammaTheme[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({ limit: "50" });
    if (cursor) params.set("after", cursor);

    const res = await fetch(`${GAMMA_API_BASE}/themes?${params}`, {
      headers: gammaHeaders(),
    });

    if (!res.ok) {
      console.error("[Gamma] GET /themes error:", res.status);
      break;
    }

    const json = await res.json();
    const data = json.data || json;

    if (Array.isArray(data)) {
      themes.push(...data.map((t: Record<string, unknown>) => ({
        id: String(t.id || ""),
        name: String(t.name || ""),
        type: (t.type === "custom" ? "custom" : "standard") as "standard" | "custom",
        colorKeywords: (t.colorKeywords || []) as string[],
        toneKeywords: (t.toneKeywords || []) as string[],
      })));
    }

    if (!json.hasMore) break;
    cursor = json.nextCursor || null;
    if (!cursor) break;
  }

  return themes;
}

/* ------------------------------------------------------------------ */
/*  Generate from scratch                                              */
/* ------------------------------------------------------------------ */

/**
 * Generate a Gamma deck for a chapter (from scratch).
 * Enhanced with theme, language, tone, image options.
 */
export async function generateGammaChapterDeck(
  markdown: string,
  options?: GammaGenerateOptions
): Promise<GammaGenerateResult> {
  console.log("[Gamma] Starting generation, content length:", markdown.length);

  // Build request body with all supported parameters
  const body: Record<string, unknown> = {
    inputText: markdown,
    textMode: "condense",
    format: "presentation",
  };

  // Apply options
  if (options?.themeId) body.themeId = options.themeId;
  if (options?.numCards) body.numCards = options.numCards;
  if (options?.additionalInstructions) body.additionalInstructions = options.additionalInstructions;
  if (options?.exportAs) body.exportAs = options.exportAs;

  // Text options
  const textOptions: Record<string, unknown> = {};
  if (options?.textAmount) textOptions.amount = options.textAmount;
  if (options?.tone) textOptions.tone = options.tone;
  if (options?.audience) textOptions.audience = options.audience;
  textOptions.language = options?.language || "fr";
  if (Object.keys(textOptions).length > 0) body.textOptions = textOptions;

  // Image options
  const imageOptions: Record<string, unknown> = {};
  if (options?.imageSource) imageOptions.source = options.imageSource;
  if (options?.imageStyle) imageOptions.style = options.imageStyle;
  if (Object.keys(imageOptions).length > 0) body.imageOptions = imageOptions;

  const res = await fetch(`${GAMMA_API_BASE}/generations`, {
    method: "POST",
    headers: gammaHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("[Gamma] POST error:", res.status, errorText);
    throw new Error(`Gamma API error ${res.status}: ${errorText}`);
  }

  const postData = await res.json();
  console.log("[Gamma] POST response (full):", JSON.stringify(postData));

  const generationId: string =
    postData.generationId ||
    postData.generation_id ||
    postData.id ||
    postData.jobId ||
    "";
  if (!generationId) {
    throw new Error(`Gamma API: no generationId in response. Raw: ${JSON.stringify(postData)}`);
  }

  console.log("[Gamma] Polling for completion, id:", generationId);
  return await pollGammaGeneration(generationId);
}

/* ------------------------------------------------------------------ */
/*  Create from Template                                               */
/* ------------------------------------------------------------------ */

/**
 * Create a Gamma deck from an existing template.
 * Uses POST /v1.0/generations/from-template
 */
export async function createGammaFromTemplate(
  options: GammaTemplateOptions
): Promise<GammaGenerateResult> {
  console.log("[Gamma] Creating from template:", options.gammaId, "prompt length:", options.prompt.length);

  const body: Record<string, unknown> = {
    gammaId: options.gammaId,
    prompt: options.prompt,
  };

  if (options.themeId) body.themeId = options.themeId;
  if (options.exportAs) body.exportAs = options.exportAs;
  if (options.imageStyle) {
    body.imageOptions = { style: options.imageStyle };
  }

  const res = await fetch(`${GAMMA_API_BASE}/generations/from-template`, {
    method: "POST",
    headers: gammaHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("[Gamma] POST from-template error:", res.status, errorText);
    throw new Error(`Gamma API from-template error ${res.status}: ${errorText}`);
  }

  const postData = await res.json();
  console.log("[Gamma] from-template response:", JSON.stringify(postData));

  const generationId: string = postData.generationId || postData.id || "";
  if (!generationId) {
    throw new Error("Gamma API: no generationId in from-template response");
  }

  console.log("[Gamma] Polling for completion, id:", generationId);
  return await pollGammaGeneration(generationId);
}

/* ------------------------------------------------------------------ */
/*  Polling                                                            */
/* ------------------------------------------------------------------ */

/**
 * Poll until status is "completed" or "failed" (max ~2 minutes).
 */
async function pollGammaGeneration(generationId: string): Promise<GammaGenerateResult> {
  const maxAttempts = 40;
  const delayMs = 3000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, delayMs));

    try {
      const res = await fetch(`${GAMMA_API_BASE}/generations/${generationId}`, {
        headers: gammaHeaders(),
      });

      if (!res.ok) {
        console.warn(`[Gamma] Poll ${i + 1} HTTP error: ${res.status}`);
        continue;
      }

      const data = await res.json();
      console.log(`[Gamma] Poll ${i + 1}/${maxAttempts}:`, JSON.stringify(data));

      const status = data.status || "pending";

      if (status === "completed") {
        // Gamma API may return the URL in different fields depending on version
        const gammaUrl =
          data.gammaUrl ||
          data.url ||
          data.deckUrl ||
          data.deck_url ||
          data.gammaLink ||
          data.link ||
          "";
        const gammaId =
          data.gammaId ||
          data.deckId ||
          data.deck_id ||
          data.id ||
          "";
        const embedUrl = buildEmbedUrl(gammaUrl);

        // exportUrl is the real PPTX export URL from Gamma API
        let downloadLink: string | undefined =
          data.exportUrl ||
          data.downloadLink ||
          data.exportPptx ||
          data.exportPptxUrl ||
          data.pptx_url ||
          data.pptxUrl ||
          undefined;

        // If no exportUrl yet, do up to 3 extra polls with short delay
        if (!downloadLink) {
          for (let extra = 0; extra < 3; extra++) {
            await new Promise((r) => setTimeout(r, 2000));
            try {
              const extraRes = await fetch(`${GAMMA_API_BASE}/generations/${generationId}`, { headers: gammaHeaders() });
              if (extraRes.ok) {
                const extraData = await extraRes.json();
                console.log(`[Gamma] Extra poll ${extra + 1}:`, JSON.stringify(extraData));
                downloadLink =
                  extraData.exportUrl ||
                  extraData.downloadLink ||
                  extraData.exportPptx ||
                  extraData.exportPptxUrl ||
                  extraData.pptx_url ||
                  extraData.pptxUrl ||
                  undefined;
                if (downloadLink) break;
              }
            } catch (err) {
              console.warn(`[Gamma] Extra poll ${extra + 1} error:`, err);
            }
          }
        }

        console.log("[Gamma] COMPLETED:", { gammaUrl, embedUrl, gammaId, downloadLink, rawData: JSON.stringify(data) });

        return {
          id: generationId,
          generationId,
          gammaId,
          url: gammaUrl,
          embedUrl,
          status: "completed",
          exportPdf: data.exportPdf || data.exportPdfUrl || data.pdf_url || undefined,
          exportPptx: downloadLink,
        };
      }

      if (status === "failed") {
        console.error("[Gamma] Generation FAILED:", data);
        return {
          id: generationId,
          generationId,
          gammaId: "",
          url: "",
          embedUrl: "",
          status: "failed",
        };
      }

      // status === "pending" → continue polling
    } catch (err) {
      console.warn(`[Gamma] Poll ${i + 1} error:`, err);
    }
  }

  console.warn("[Gamma] Timed out after", maxAttempts, "attempts for:", generationId);
  return { id: generationId, generationId, gammaId: "", url: "", embedUrl: "", status: "pending" };
}

/* ------------------------------------------------------------------ */
/*  Re-fetch fresh download URL (for expired PPTX links)              */
/* ------------------------------------------------------------------ */

/**
 * Re-fetch the export URL for a generation (PPTX or PDF).
 * For PDF: derives from the PPTX exportUrl by replacing /pptx/ → /pdf/.
 * Returns both the URL and raw response fields for debugging.
 * @param generationId The generation ID stored in gamma_deck_id
 */
export async function exportGammaDeckFresh(
  generationId: string
): Promise<{ url: string | null; rawFields: Record<string, string> }> {
  try {
    const res = await fetch(`${GAMMA_API_BASE}/generations/${generationId}`, {
      headers: gammaHeaders(),
    });
    if (!res.ok) {
      console.warn("[Gamma] exportGammaDeckFresh HTTP error:", res.status);
      return { url: null, rawFields: { httpStatus: String(res.status) } };
    }
    const data = await res.json();
    console.log("[Gamma] exportGammaDeckFresh raw response:", JSON.stringify(data));

    const url: string | null =
      data.exportUrl ||
      data.downloadLink ||
      data.exportPptx ||
      data.exportPptxUrl ||
      data.pptx_url ||
      data.pptxUrl ||
      null;

    // Expose all top-level keys with truncated string values for debugging
    const rawFields = Object.fromEntries(
      Object.keys(data).map((k) => [
        k,
        typeof data[k] === "string"
          ? (data[k] as string).substring(0, 100)
          : typeof data[k],
      ])
    ) as Record<string, string>;
    return { url, rawFields };
  } catch (err) {
    console.warn("[Gamma] exportGammaDeckFresh error:", err);
    return { url: null, rawFields: { error: String(err) } };
  }
}
