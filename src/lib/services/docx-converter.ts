/**
 * Service de conversion .docx → PDF avec support des variables {{...}}.
 *
 * Pipeline :
 *   1. Télécharge le .docx depuis Storage Supabase (URL signée ou publique)
 *   2. Si variables fournies : applique docxtemplater pour remplacer {{xxx}}
 *      → garde 100% des styles Word (logo, tableaux, polices, en-têtes)
 *   3. Convertit le .docx résultant en PDF via CloudConvert (LibreOffice)
 *      → fidélité ~99% au document original
 *
 * Pourquoi pas mammoth → HTML → PDF :
 *   - Mammoth perd les styles complexes (tableaux fusionnés, en-têtes/pieds,
 *     positionnement absolu, polices custom). Résultat PDF dégradé.
 *   - LibreOffice (via CloudConvert) ouvre le .docx natif → conserve tout.
 *
 * Usage :
 *   const pdf = await convertDocxToPdfWithVariables(docxUrl, { nom: "Dupont" });
 *   // → { base64, buffer, sizeBytes }
 */

import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { generatePdfFromDocx, type PdfGenerationResult } from "@/lib/services/pdf-generator";

/**
 * Variables à substituer dans le .docx. Les clés correspondent aux placeholders
 * `{{key}}` dans le document. Valeurs : string, number, ou objets imbriqués.
 */
export type DocxVariables = Record<string, string | number | boolean | null | undefined>;

/**
 * Télécharge un .docx, applique les variables si fournies, puis convertit en PDF.
 *
 * @param docxSourceUrl URL du .docx (Supabase Storage signed URL ou public URL)
 * @param variables Variables à substituer. Si vide/null → conversion directe sans modification.
 * @returns PDF (base64 + buffer + taille) prêt à attacher à un email.
 */
export async function convertDocxToPdfWithVariables(
  docxSourceUrl: string,
  variables?: DocxVariables | null
): Promise<PdfGenerationResult> {
  // 1. Télécharge le .docx
  const response = await fetch(docxSourceUrl);
  if (!response.ok) {
    throw new Error(`docx-converter: HTTP ${response.status} fetching ${docxSourceUrl}`);
  }
  const sourceBuffer = Buffer.from(await response.arrayBuffer());

  // 2. Applique les variables si présentes
  const processedBuffer =
    variables && Object.keys(variables).length > 0
      ? applyVariablesToDocx(sourceBuffer, variables)
      : sourceBuffer;

  // 3. Convertit en PDF via CloudConvert (LibreOffice)
  // On extrait le filename de l'URL pour CloudConvert (utile pour les logs/debug)
  const filename = extractFilename(docxSourceUrl) || "document.docx";
  return generatePdfFromDocx(processedBuffer, filename);
}

/**
 * Applique les variables à un .docx via docxtemplater (remplacement {{key}}).
 * Throws si les placeholders sont invalides ou si le document est corrompu.
 */
export function applyVariablesToDocx(
  docxBuffer: Buffer,
  variables: DocxVariables
): Buffer {
  const zip = new PizZip(docxBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    // Délimiteurs par défaut : {variable}. On force {{variable}} pour
    // matcher la convention Mustache et éviter les conflits avec les
    // accolades naturelles dans les documents.
    delimiters: { start: "{{", end: "}}" },
  });

  // Convertit les valeurs nullish/undefined en chaîne vide pour éviter
  // d'afficher "undefined" dans le PDF.
  const cleanVars: Record<string, string> = {};
  for (const [key, value] of Object.entries(variables)) {
    cleanVars[key] = value == null ? "" : String(value);
  }

  doc.render(cleanVars);

  return doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
}

/**
 * Détecte si un buffer .docx contient au moins un placeholder `{{...}}`.
 * Utile pour décider auto entre "conversion directe" et "templating".
 */
export async function docxHasVariables(docxBuffer: Buffer): Promise<boolean> {
  const zip = new PizZip(docxBuffer);
  const documentXml = zip.files["word/document.xml"];
  if (!documentXml) return false;
  const text = documentXml.asText();
  // Recherche basique : {{ suivi d'un identifiant (alphanumeric + _)
  return /\{\{\s*[a-zA-Z_][\w]*\s*\}\}/.test(text);
}

function extractFilename(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split("/").pop();
    return last && last.endsWith(".docx") ? last : null;
  } catch {
    return null;
  }
}
