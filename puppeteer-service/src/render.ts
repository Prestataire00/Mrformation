// Logique Puppeteer : browser partagé (1 instance) + render page par requête.
//
// Le browser est démarré au premier appel (`getBrowser()`) puis réutilisé pour
// tous les rendus. Chaque rendu ouvre une nouvelle Page (isolée) et la ferme
// systématiquement, même en cas d'erreur, pour éviter les leaks mémoire.

import puppeteer, { type Browser } from "puppeteer";

interface PdfOptions {
  format?: "A4" | "Letter" | "Legal";
  margins?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
  headerTemplate?: string;
  footerTemplate?: string;
  printBackground?: boolean;
  displayHeaderFooter?: boolean;
  landscape?: boolean;
}

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (browserPromise) return browserPromise;
  // Args recommandés pour Docker/containers où le sandbox Chromium ne marche pas.
  browserPromise = puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
  return browserPromise;
}

export async function getChromiumVersion(): Promise<string> {
  const browser = await getBrowser();
  return browser.version();
}

export async function shutdownBrowser(): Promise<void> {
  if (!browserPromise) return;
  try {
    const browser = await browserPromise;
    await browser.close();
  } catch {
    /* ignore : browser already closed */
  } finally {
    browserPromise = null;
  }
}

export async function renderPdf(
  html: string,
  opts: Record<string, unknown>,
): Promise<Buffer> {
  const options = opts as PdfOptions;
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // `waitUntil: networkidle0` attend que toutes les images/polices web soient
    // chargées avant de capturer le PDF. Critical pour les templates avec logos.
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30_000 });

    const pdf = await page.pdf({
      format: options.format ?? "A4",
      printBackground: options.printBackground ?? true,
      displayHeaderFooter:
        options.displayHeaderFooter ??
        Boolean(options.headerTemplate || options.footerTemplate),
      headerTemplate: options.headerTemplate ?? "",
      footerTemplate: options.footerTemplate ?? "",
      landscape: options.landscape ?? false,
      margin: {
        top: options.margins?.top ?? "20mm",
        right: options.margins?.right ?? "15mm",
        bottom: options.margins?.bottom ?? "20mm",
        left: options.margins?.left ?? "15mm",
      },
      preferCSSPageSize: false,
    });

    return Buffer.from(pdf);
  } finally {
    // Toujours fermer la page, même si page.pdf() jette.
    await page.close().catch(() => {
      /* swallow : on est déjà en train de cleanup */
    });
  }
}
