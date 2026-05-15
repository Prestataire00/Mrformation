/**
 * `CloudConvertEngine` — implémentation `PDFEngine` qui délègue au service
 * CloudConvert SaaS via le code existant `pdf-generator.ts`.
 *
 * Utilisé en FALLBACK quand `PuppeteerEngine` est down (Story A2). Sera
 * progressivement remplacé par Puppeteer self-hosted en run-rate, mais
 * conservé comme filet de sécurité opérationnel.
 */

import type { PDFEngine, PDFRenderOptions } from "@/lib/services/pdf-engines/types";
import { generatePdfFromHtml } from "@/lib/services/pdf-generator";

export class CloudConvertEngine implements PDFEngine {
  async render(html: string, options?: PDFRenderOptions): Promise<Buffer> {
    const result = await generatePdfFromHtml(html, {
      format: options?.format ?? "A4",
      landscape: options?.landscape ?? false,
      margin: {
        top: cssToInches(options?.margins?.top, 0.79),
        right: cssToInches(options?.margins?.right, 0.79),
        bottom: cssToInches(options?.margins?.bottom, 0.79),
        left: cssToInches(options?.margins?.left, 0.79),
      },
    });
    return result.buffer;
  }
}

/**
 * Convertit une valeur CSS de marge ("20mm", "1in", "2.54cm", "75px") en
 * inches (unité attendue par CloudConvert). Retourne `defaultInches` si la
 * valeur est absente ou non parseable.
 *
 * Note : CloudConvert n'accepte que des inches numériques. PuppeteerEngine
 * accepte directement les strings CSS — d'où cette divergence d'interface
 * masquée derrière `CloudConvertEngine`.
 */
function cssToInches(value: string | undefined, defaultInches: number): number {
  if (!value) return defaultInches;
  const trimmed = value.trim().toLowerCase();
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*(mm|cm|in|px)?$/);
  if (!match) return defaultInches;
  const num = parseFloat(match[1]);
  const unit = match[2] ?? "mm"; // défaut mm (cohérent avec PuppeteerEngine "20mm")
  switch (unit) {
    case "in":
      return num;
    case "cm":
      return num / 2.54;
    case "mm":
      return num / 25.4;
    case "px":
      // 96 px = 1 in (convention web)
      return num / 96;
    default:
      return defaultInches;
  }
}
