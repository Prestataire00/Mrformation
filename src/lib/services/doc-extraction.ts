/**
 * Service d'extraction de texte à partir de documents (PDF, DOCX, PPTX)
 */

import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

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

// Common headers for YouTube requests — includes consent cookie to bypass EU GDPR page
const YT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  "Cookie": "CONSENT=YES+cb.20210328-17-p0.fr+FX+667; SOCS=CAESEwgDEgk0ODE3Nzk3MjkaAmZyIAEaBgiA_LyaBg",
};

/**
 * Parse transcript lines from captions XML (srv1/srv3)
 */
function parseXmlTranscript(xml: string): string[] {
  const lines: string[] = [];
  const matches = xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/gi);
  for (const m of matches) {
    const line = m[1]
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
      .replace(/<[^>]+>/g, "").trim();
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * Build a readable text from transcript lines (one paragraph every ~10 lines)
 */
function linesToParagraphs(lines: string[], groupSize = 10): string {
  const paragraphs: string[] = [];
  for (let i = 0; i < lines.length; i += groupSize) {
    const chunk = lines.slice(i, i + groupSize).join(" ");
    if (chunk.trim()) paragraphs.push(chunk);
  }
  return paragraphs.join("\n\n");
}

/**
 * Extract transcript from a YouTube video
 * Method 1: Python youtube-transcript-api (most reliable, handles anti-bot) — tried FIRST
 * Method 2: ytInitialPlayerResponse JSON embedded in page HTML
 * Fallback: description only
 */
async function extractFromYouTube(
  videoId: string,
  originalUrl: string
): Promise<{ text: string; metadata: Record<string, unknown> }> {
  let videoTitle = "Vidéo YouTube";
  let descriptionFallback: string | null = null;

  // Fetch page to get title and description (used as fallback)
  // Also try Method 2 (ytInitialPlayerResponse) as a secondary path
  try {
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, { headers: YT_HEADERS });
    const pageHtml = await pageRes.text();

    const titleMatch = pageHtml.match(/<title>([^<]*)<\/title>/);
    if (titleMatch) videoTitle = titleMatch[1].replace(" - YouTube", "").trim();

    const descMatch = pageHtml.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
    if (descMatch) {
      descriptionFallback = descMatch[1]
        .replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
  } catch { /* page fetch failed, continue with default title */ }

  // Method 1: Python youtube-transcript-api (most reliable — handles anti-bot)
  try {
    const pyScript = `
import sys, json
from youtube_transcript_api import YouTubeTranscriptApi
api = YouTubeTranscriptApi()
video_id = sys.argv[1]
try:
    t = api.fetch(video_id, languages=['fr', 'en'])
except Exception:
    t = api.fetch(video_id)
print(json.dumps([{'text': s.text, 'start': s.start} for s in t]))
`.trim();

    // Candidates for python3 binary — Next.js may have a restricted PATH
    const pythonCandidates = [
      process.env.PYTHON3_PATH,
      "/usr/local/opt/python@3.13/bin/python3.13",
      "/usr/local/opt/python@3.12/bin/python3.12",
      "/usr/local/bin/python3",
      "/usr/bin/python3",
      "python3",
    ].filter(Boolean) as string[];

    let stdout = "";
    let lastError = "";
    for (const py of pythonCandidates) {
      try {
        const result = await execFileAsync(py, ["-c", pyScript, videoId], {
          timeout: 30000,
          env: { ...process.env, PATH: `/usr/local/opt/python@3.13/bin:/usr/local/opt/python@3.12/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ""}` },
        });
        stdout = result.stdout;
        console.log(`[YouTube] Python transcript OK with ${py}, segments: ${stdout.substring(0, 100)}`);
        break;
      } catch (e) {
        lastError = String(e);
        console.warn(`[YouTube] Python candidate ${py} failed:`, lastError.substring(0, 200));
      }
    }

    if (stdout.trim()) {
      const segments: { text: string; start: number }[] = JSON.parse(stdout.trim());
      if (segments.length > 0) {
        const lines = segments.map((s) => s.text.trim()).filter(Boolean);
        const text = `# ${videoTitle}\n\nTranscription complète de la vidéo YouTube\nSource : ${originalUrl}\n\n${linesToParagraphs(lines)}`;
        return {
          text,
          metadata: { type: "youtube", video_id: videoId, title: videoTitle, segment_count: segments.length, char_count: text.length },
        };
      }
    }
    console.warn("[YouTube] Python method returned no segments, trying page-based method");
  } catch (e) {
    console.warn("[YouTube] Python method error:", String(e).substring(0, 200));
  }

  // Method 2: parse ytInitialPlayerResponse from page HTML
  try {
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, { headers: YT_HEADERS });
    const pageHtml = await pageRes.text();

    const marker = "ytInitialPlayerResponse = ";
    const idx = pageHtml.indexOf(marker);
    if (idx !== -1) {
      const start = idx + marker.length;
      let depth = 0, end = start;
      for (let i = start; i < pageHtml.length; i++) {
        if (pageHtml[i] === "{") depth++;
        else if (pageHtml[i] === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
      }
      const playerData = JSON.parse(pageHtml.substring(start, end));
      const tracks: { baseUrl: string; languageCode: string; name?: { simpleText?: string } }[] =
        playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];

      const frTrack = tracks.find((t) => t.languageCode === "fr" && !t.name?.simpleText?.toLowerCase().includes("auto"));
      const frAutoTrack = tracks.find((t) => t.languageCode === "fr");
      const enTrack = tracks.find((t) => t.languageCode === "en");
      const track = frTrack || frAutoTrack || enTrack || tracks[0];

      if (track) {
        let lines: string[] = [];

        try {
          const res = await fetch(track.baseUrl + "&fmt=json3", { headers: YT_HEADERS });
          const json = await res.json() as { events?: { segs?: { utf8: string }[] }[] };
          if (json.events) {
            lines = json.events
              .filter((e) => e.segs)
              .flatMap((e) => e.segs!.map((s) => s.utf8.trim()))
              .filter(Boolean);
          }
        } catch { /* try xml */ }

        if (lines.length === 0) {
          try {
            const res = await fetch(track.baseUrl, { headers: YT_HEADERS });
            lines = parseXmlTranscript(await res.text());
          } catch { /* xml also failed */ }
        }

        if (lines.length > 0) {
          const text = `# ${videoTitle}\n\nTranscription de la vidéo YouTube\nSource : ${originalUrl}\n\n${linesToParagraphs(lines)}`;
          return {
            text,
            metadata: { type: "youtube", video_id: videoId, title: videoTitle, language: track.languageCode, char_count: text.length },
          };
        }
      }
    }
  } catch { /* Method 2 failed */ }

  // Final fallback: description only
  if (descriptionFallback && descriptionFallback.length > 50) {
    const text = `# ${videoTitle}\n\nDescription de la vidéo YouTube\nSource : ${originalUrl}\n\n${descriptionFallback}`;
    return {
      text,
      metadata: {
        type: "youtube", video_id: videoId, title: videoTitle, source: "description",
        transcript_available: false, char_count: text.length,
        warning: "Aucun sous-titre disponible pour cette vidéo. Seule la description a été extraite. Le contenu généré sera limité.",
      },
    };
  }

  throw new Error("Impossible d'extraire la transcription YouTube. Vérifiez que la vidéo a des sous-titres activés.");
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
