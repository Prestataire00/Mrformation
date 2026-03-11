/**
 * Service d'extraction de texte à partir de documents (PDF, DOCX, PPTX)
 */

import pdfParse from "pdf-parse";
import mammoth from "mammoth";

/**
 * Extrait le texte d'un buffer selon le type de fichier
 */
export async function extractText(
  buffer: Buffer,
  fileType: string
): Promise<{ text: string; metadata: Record<string, unknown> }> {
  switch (fileType) {
    case "pdf":
      return extractFromPDF(buffer);
    case "docx":
      return extractFromDOCX(buffer);
    case "pptx":
      return extractFromPPTX(buffer);
    case "txt":
      return {
        text: buffer.toString("utf-8"),
        metadata: { type: "txt", char_count: buffer.length },
      };
    default:
      throw new Error(`Type de fichier non supporté : ${fileType}`);
  }
}

async function extractFromPDF(
  buffer: Buffer
): Promise<{ text: string; metadata: Record<string, unknown> }> {
  // Strip any bytes before %PDF- header (some files have corrupted headers)
  const pdfHeaderIdx = buffer.indexOf("%PDF-");
  if (pdfHeaderIdx > 0) {
    buffer = buffer.subarray(pdfHeaderIdx);
  }
  const data = await pdfParse(buffer);
  return {
    text: data.text,
    metadata: {
      type: "pdf",
      page_count: data.numpages,
      char_count: data.text.length,
      info: data.info,
    },
  };
}

async function extractFromDOCX(
  buffer: Buffer
): Promise<{ text: string; metadata: Record<string, unknown> }> {
  const result = await mammoth.extractRawText({ buffer });
  return {
    text: result.value,
    metadata: {
      type: "docx",
      char_count: result.value.length,
      messages: result.messages,
    },
  };
}

async function extractFromPPTX(
  buffer: Buffer
): Promise<{ text: string; metadata: Record<string, unknown> }> {
  // officeparser is a CommonJS module
  const { parseOfficeAsync } = await import("officeparser");
  const text = await parseOfficeAsync(buffer);
  return {
    text,
    metadata: {
      type: "pptx",
      char_count: text.length,
    },
  };
}

/**
 * Extract text content from a URL (web page or YouTube video)
 */
export async function extractFromUrl(
  url: string
): Promise<{ text: string; metadata: Record<string, unknown> }> {
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );

  if (ytMatch) {
    return extractFromYouTube(ytMatch[1], url);
  }

  return extractFromWebPage(url);
}

/**
 * Extract transcript from a YouTube video using free transcript APIs
 */
async function extractFromYouTube(
  videoId: string,
  originalUrl: string
): Promise<{ text: string; metadata: Record<string, unknown> }> {
  // Try multiple transcript extraction methods

  // Method 1: YouTube's internal timedtext API (via page scraping for captions)
  try {
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
    });
    const html = await pageRes.text();

    // Extract video title
    const titleMatch = html.match(/<title>([^<]*)<\/title>/);
    const videoTitle = titleMatch ? titleMatch[1].replace(" - YouTube", "").trim() : "Vidéo YouTube";

    // Extract captions URL from page data
    // The JSON is embedded in JS, so we need a greedy match for the array
    const captionsMatch = html.match(/"captionTracks":\s*(\[[\s\S]*?\])(?=\s*[,}\]])/);
    if (captionsMatch) {
      // Unescape unicode sequences like \u0026 that YouTube embeds in the JS
      const rawJson = captionsMatch[1].replace(/\\u0026/g, "&").replace(/\\"/g, '"');
      let captionTracks: { baseUrl: string; languageCode: string; name?: { simpleText?: string } }[];
      try {
        captionTracks = JSON.parse(rawJson);
      } catch {
        // Try with a broader regex: grab until the closing bracket more carefully
        const broader = html.match(/"captionTracks":\s*(\[[\s\S]*?\])\s*[,}]/);
        if (broader) {
          const raw2 = broader[1].replace(/\\u0026/g, "&").replace(/\\"/g, '"');
          captionTracks = JSON.parse(raw2);
        } else {
          captionTracks = [];
        }
      }

      // Prefer French, then auto-generated French, then English, then first available
      const frTrack = captionTracks.find((t) => t.languageCode === "fr" && !t.name?.simpleText?.includes("auto"));
      const frAutoTrack = captionTracks.find((t) => t.languageCode === "fr");
      const enTrack = captionTracks.find((t) => t.languageCode === "en");
      const track = frTrack || frAutoTrack || enTrack || captionTracks[0];

      if (track) {
        // Ensure the baseUrl is properly unescaped
        const baseUrl = track.baseUrl.replace(/\\u0026/g, "&").replace(/&amp;/g, "&");

        // Try json3 format first, fall back to srv3 (XML)
        let transcriptLines: string[] = [];

        try {
          const captionRes = await fetch(baseUrl + "&fmt=json3");
          const captionText = await captionRes.text();
          if (captionText.trim().startsWith("{")) {
            const captionData = JSON.parse(captionText) as { events?: { segs?: { utf8: string }[] }[] };
            if (captionData.events) {
              transcriptLines = captionData.events
                .filter((e) => e.segs)
                .map((e) => e.segs!.map((s) => s.utf8).join(""))
                .filter((l) => l.trim());
            }
          }
        } catch {
          // json3 failed, try srv3 (XML)
        }

        // Fallback: srv3 XML format
        if (transcriptLines.length === 0) {
          try {
            const xmlRes = await fetch(baseUrl + "&fmt=srv3");
            const xmlText = await xmlRes.text();
            // Extract text from <p> tags in srv3 XML
            const pMatches = xmlText.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
            for (const m of pMatches) {
              const line = m[1].replace(/<[^>]+>/g, "").trim();
              if (line) transcriptLines.push(line);
            }
          } catch {
            // srv3 also failed
          }
        }

        if (transcriptLines.length > 0) {
          // Group into paragraphs (~every 10 lines)
          const paragraphs: string[] = [];
          for (let i = 0; i < transcriptLines.length; i += 10) {
            paragraphs.push(transcriptLines.slice(i, i + 10).join(" "));
          }

          const text = `# ${videoTitle}\n\nTranscription de la vidéo YouTube\nSource : ${originalUrl}\n\n${paragraphs.join("\n\n")}`;

          return {
            text,
            metadata: {
              type: "youtube",
              video_id: videoId,
              title: videoTitle,
              language: track.languageCode,
              char_count: text.length,
            },
          };
        }
      }
    }

    // Fallback: try to get description from page
    const descMatch = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
    if (descMatch) {
      const description = descMatch[1]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");

      const text = `# ${videoTitle}\n\nDescription de la vidéo YouTube\nSource : ${originalUrl}\n\n${description}`;

      return {
        text,
        metadata: {
          type: "youtube",
          video_id: videoId,
          title: videoTitle,
          source: "description",
          char_count: text.length,
        },
      };
    }

    throw new Error("Impossible d'extraire la transcription YouTube. Vérifiez que la vidéo a des sous-titres activés.");
  } catch (err) {
    if (err instanceof Error && err.message.includes("transcription")) throw err;
    throw new Error(`Erreur extraction YouTube: ${err instanceof Error ? err.message : "erreur inconnue"}`);
  }
}

/**
 * Extract text content from a web page by fetching HTML and stripping tags
 */
async function extractFromWebPage(
  url: string
): Promise<{ text: string; metadata: Record<string, unknown> }> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; LMSBot/1.0)",
      Accept: "text/html,application/xhtml+xml,*/*",
      "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`Impossible d'accéder à l'URL (${res.status})`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("application/xhtml")) {
    // Maybe it's a downloadable document
    if (contentType.includes("application/pdf")) {
      const buffer = Buffer.from(await res.arrayBuffer());
      return extractFromPDF(buffer);
    }
    throw new Error(`Type de contenu non supporté: ${contentType}`);
  }

  const html = await res.text();

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const pageTitle = titleMatch ? titleMatch[1].trim() : new URL(url).hostname;

  // Extract main content: try article, main, then body
  let content = "";
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);

  if (articleMatch) {
    content = articleMatch[1];
  } else if (mainMatch) {
    content = mainMatch[1];
  } else {
    // Get body content, excluding script/style/nav/header/footer
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    content = bodyMatch ? bodyMatch[1] : html;
  }

  // Remove unwanted tags
  content = content
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // Convert some HTML to text-friendly format
  content = content
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<h[1-6][^>]*>/gi, "\n\n## ")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ") // Strip remaining tags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (content.length < 100) {
    throw new Error("Contenu extrait trop court. La page est peut-être protégée ou dynamique (JavaScript requis).");
  }

  const text = `# ${pageTitle}\n\nSource : ${url}\n\n${content}`;

  return {
    text,
    metadata: {
      type: "webpage",
      url,
      title: pageTitle,
      char_count: text.length,
    },
  };
}

/**
 * Découpe le texte en chunks basés sur les paragraphes
 */
export function chunkText(text: string, maxChars: number = 8000): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if ((current + "\n\n" + para).length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/**
 * Estime le nombre de tokens pour du texte français
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Détecte le type de fichier depuis l'extension
 */
export function getFileType(fileName: string): string | null {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const supported: Record<string, string> = {
    pdf: "pdf",
    docx: "docx",
    doc: "docx",
    pptx: "pptx",
    ppt: "pptx",
    txt: "txt",
  };
  return supported[ext || ""] || null;
}
