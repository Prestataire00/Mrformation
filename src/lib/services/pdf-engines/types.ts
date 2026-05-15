/**
 * Interface unique d'un moteur de génération PDF.
 *
 * Permet de découpler le code applicatif du backend de rendu (Puppeteer
 * self-hosted, CloudConvert SaaS, ou autre alternatif futur). Toutes les
 * implémentations doivent respecter le même contrat : `render(html, options)`
 * retourne un Buffer PDF binaire.
 *
 * Story de tête A1 — cf `bmad_output/planning-artifacts/epics-documents.md`.
 */

export interface PdfMargins {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
}

export type PdfFormat = "A4" | "Letter" | "Legal";

export interface PDFRenderOptions {
  /** Format papier. Défaut A4. */
  format?: PdfFormat;
  /** Marges (chaînes CSS valides type "20mm", "1in"). */
  margins?: PdfMargins;
  /** Template HTML d'en-tête (utilise les classes Puppeteer : pageNumber, totalPages…). */
  headerTemplate?: string;
  /** Template HTML de pied de page. */
  footerTemplate?: string;
  /** Imprimer les backgrounds CSS (logos, dégradés). Défaut true. */
  printBackground?: boolean;
  /** Forcer l'affichage header/footer même si templates vides. Défaut auto. */
  displayHeaderFooter?: boolean;
  /** Mode paysage. Défaut false (portrait). */
  landscape?: boolean;
}

export interface PDFEngine {
  /**
   * Génère un PDF depuis du HTML. Doit retourner un Buffer binaire prêt
   * à uploader/stream. Doit throw sur erreur (pas de retour null/undefined).
   *
   * @param html Le HTML complet (avec `<html>`, `<body>`, polices, CSS).
   * @param options Options de rendu (format, marges, headers, etc.).
   */
  render(html: string, options?: PDFRenderOptions): Promise<Buffer>;
}
