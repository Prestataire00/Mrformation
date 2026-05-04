/**
 * Service de génération PDF côté serveur via CloudConvert.
 *
 * CloudConvert est une API SaaS qui héberge LibreOffice + Chrome headless +
 * autres convertisseurs. On l'utilise pour :
 *   - HTML → PDF (Chrome headless)
 *   - .docx → PDF (LibreOffice, fidélité ~99%) — voir docx-converter.ts
 *
 * Pourquoi CloudConvert et pas Puppeteer self-hosted maintenant :
 *   - Bundle Netlify Functions limité (Chromium = 50-60 MB)
 *   - Cold start Puppeteer = 5-10 sec → mange le timeout 10s
 *   - Migration prévue vers Railway < 1 mois → on switchera vers Puppeteer
 *     natif (5 lignes à changer dans ce seul fichier)
 *
 * Pour migrer vers Puppeteer (sur Railway) :
 *   1. npm install puppeteer
 *   2. Remplacer `convertHtmlToPdfViaCloudConvert` par une version qui utilise
 *      puppeteer.launch() → page.setContent(html) → page.pdf()
 *   3. Garder la même signature, le reste de l'app continue à marcher
 *
 * Configuration :
 *   - CLOUDCONVERT_API_KEY : clé d'API (Netlify Env Vars + .env.local)
 */

import CloudConvert from "cloudconvert";

export interface PdfGenerationOptions {
  /** Format papier. Défaut : A4. */
  format?: "A4" | "Letter" | "Legal";
  /** Orientation. Défaut : portrait. */
  landscape?: boolean;
  /** Marges en inches (CloudConvert exige un nombre, pas une string). Défaut : 0.79in (~20mm). */
  margin?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
}

export interface PdfGenerationResult {
  /** Contenu PDF en base64 (prêt à attacher à un email Resend). */
  base64: string;
  /** Buffer du PDF (pour stream/écriture fichier). */
  buffer: Buffer;
  /** Taille du PDF en bytes (pour monitoring). */
  sizeBytes: number;
}

let cachedClient: CloudConvert | null = null;

/**
 * Client CloudConvert mémoïsé. Throw si CLOUDCONVERT_API_KEY absent.
 */
function getCloudConvertClient(): CloudConvert {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.CLOUDCONVERT_API_KEY;
  if (!apiKey) {
    throw new Error(
      "CLOUDCONVERT_API_KEY manquant. Configurer la variable d'environnement (Netlify Env Vars + .env.local)."
    );
  }
  cachedClient = new CloudConvert(apiKey);
  return cachedClient;
}

/**
 * Génère un PDF à partir d'un contenu HTML complet (avec balises <html>, <head>, <body>).
 *
 * @param html Document HTML complet. Inclure les styles CSS dans <style> ou inline.
 * @param options Format, orientation, marges.
 * @returns PDF (base64 + buffer + taille).
 * @throws Error si CLOUDCONVERT_API_KEY manquante ou si la conversion échoue.
 */
export async function generatePdfFromHtml(
  html: string,
  options: PdfGenerationOptions = {}
): Promise<PdfGenerationResult> {
  const buffer = await convertHtmlToPdfViaCloudConvert(html, options);
  return {
    base64: buffer.toString("base64"),
    buffer,
    sizeBytes: buffer.byteLength,
  };
}

/**
 * Helper : génère un PDF à partir d'un fragment HTML (sans <html><body>).
 * Wrappe automatiquement dans un document complet avec styles par défaut.
 */
export async function generatePdfFromFragment(
  bodyHtml: string,
  title: string,
  options: PdfGenerationOptions = {}
): Promise<PdfGenerationResult> {
  const fullHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: Helvetica, Arial, sans-serif; font-size: 12pt; line-height: 1.6; color: #1e293b; margin: 0; padding: 0; }
  h1 { font-size: 18pt; font-weight: 700; margin: 16px 0 8px; }
  h2 { font-size: 15pt; font-weight: 600; margin: 14px 0 6px; }
  h3 { font-size: 13pt; font-weight: 600; margin: 12px 0 6px; }
  p { margin: 0 0 10px; }
  ul, ol { margin: 0 0 10px 20px; padding: 0; }
  li { margin-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left; }
  th { background: #f1f5f9; font-weight: 600; }
  strong { font-weight: 600; }
  em { font-style: italic; }
  hr { border: 0; border-top: 1px solid #cbd5e1; margin: 20px 0; }
  .signature-block { margin-top: 40px; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;

  return generatePdfFromHtml(fullHtml, options);
}

/**
 * Convertit un buffer .docx en PDF via CloudConvert (LibreOffice).
 * Fidélité ~99% (logo, tableaux, polices, en-têtes/pieds).
 */
export async function generatePdfFromDocx(
  docxBuffer: Buffer,
  filename = "document.docx"
): Promise<PdfGenerationResult> {
  const buffer = await convertDocxToPdfViaCloudConvert(docxBuffer, filename);
  return {
    base64: buffer.toString("base64"),
    buffer,
    sizeBytes: buffer.byteLength,
  };
}

// ────────────────────────────────────────────────────────────────────
// Implémentation CloudConvert
// ────────────────────────────────────────────────────────────────────

/**
 * Workflow CloudConvert pour HTML→PDF :
 *   1. Crée un job avec 3 tasks : import-base64 (HTML) → convert (Chrome) → export-url
 *   2. Attend la fin du job (CloudConvert poll en interne via SDK)
 *   3. Télécharge le PDF depuis l'URL signée
 */
async function convertHtmlToPdfViaCloudConvert(
  html: string,
  options: PdfGenerationOptions
): Promise<Buffer> {
  const cc = getCloudConvertClient();
  const margin = options.margin ?? {};

  const job = await cc.jobs.create({
    tasks: {
      "import-html": {
        operation: "import/base64",
        file: Buffer.from(html, "utf8").toString("base64"),
        filename: "document.html",
      },
      "convert-to-pdf": {
        operation: "convert",
        input: "import-html",
        input_format: "html",
        output_format: "pdf",
        engine: "chrome",
        page_orientation: options.landscape ? "landscape" : "portrait",
        page_size: options.format ?? "A4",
        margin_top: margin.top ?? 0.79,
        margin_right: margin.right ?? 0.79,
        margin_bottom: margin.bottom ?? 0.79,
        margin_left: margin.left ?? 0.79,
      },
      "export-pdf": {
        operation: "export/url",
        input: "convert-to-pdf",
      },
    },
  });

  return waitAndDownload(cc, job.id, "export-pdf");
}

/**
 * Workflow CloudConvert pour .docx→PDF (via LibreOffice) :
 *   1. Crée un job : import-base64 (.docx) → convert (libreoffice) → export-url
 *   2. Attend la fin du job
 *   3. Télécharge le PDF
 */
async function convertDocxToPdfViaCloudConvert(
  docxBuffer: Buffer,
  filename: string
): Promise<Buffer> {
  const cc = getCloudConvertClient();

  const job = await cc.jobs.create({
    tasks: {
      "import-docx": {
        operation: "import/base64",
        file: docxBuffer.toString("base64"),
        filename,
      },
      "convert-to-pdf": {
        operation: "convert",
        input: "import-docx",
        input_format: "docx",
        output_format: "pdf",
        engine: "libreoffice",
      },
      "export-pdf": {
        operation: "export/url",
        input: "convert-to-pdf",
      },
    },
  });

  return waitAndDownload(cc, job.id, "export-pdf");
}

async function waitAndDownload(
  cc: CloudConvert,
  jobId: string,
  exportTaskName: string
): Promise<Buffer> {
  const completedJob = await cc.jobs.wait(jobId);

  // Récupère la task d'export terminée pour obtenir l'URL signée
  const exportTask = completedJob.tasks.find(
    (t) => t.name === exportTaskName && t.status === "finished"
  );

  if (!exportTask?.result?.files?.[0]?.url) {
    const errored = completedJob.tasks.find((t) => t.status === "error");
    const reason = errored?.message ?? "Export task introuvable ou non terminée";
    throw new Error(`CloudConvert: ${reason}`);
  }

  const fileUrl = exportTask.result.files[0].url;
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`CloudConvert download HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
