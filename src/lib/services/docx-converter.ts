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
import { ALIAS_TO_VARIABLE_KEY } from "@/lib/utils/resolve-variables";

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
 * Normalise un libellé Sellsy pour le lookup dans `ALIAS_TO_VARIABLE_KEY`.
 *
 * Word « embellit » automatiquement le texte tapé par l'utilisateur :
 *   - l'apostrophe droite `'` devient l'apostrophe typographique `’` (U+2019) ;
 *   - des espaces insécables (U+00A0) se glissent avant `%`, `:` ou dans les
 *     libellés.
 * Sans normalisation, `[%Nom de l’apprenant%]` (courbe) ne matcherait jamais la
 * clé `"Nom de l'apprenant"` (droite) du map → balise laissée en clair. On
 * ramène donc les deux côtés (libellé tapé + clés du map) à une forme canonique.
 */
function normalizeLabel(raw: string): string {
  return String(raw)
    .replace(/[‘’‛′]/g, "'") // apostrophes courbes/prime → droite
    .replace(/ /g, " ") // espace insécable → espace normal
    .replace(/\s+/g, " ") // espaces multiples → un seul
    .trim();
}

/**
 * Construit le map `libellé normalisé → valeur` à partir des variables passées
 * (indexées par clé technique) et de `ALIAS_TO_VARIABLE_KEY`.
 *
 * On n'inclut QUE les libellés dont la clé technique a une valeur fournie : les
 * autres tomberont dans le `nullGetter` et resteront affichés `[%…%]` (parité
 * avec le résolveur HTML, utile pour repérer une balise mal orthographiée).
 */
function buildLabelMap(cleanVars: Record<string, string>): Record<string, string> {
  const labelMap: Record<string, string> = {};
  for (const [label, braced] of Object.entries(ALIAS_TO_VARIABLE_KEY)) {
    const techKey = braced.replace(/^\{\{|\}\}$/g, "");
    if (Object.prototype.hasOwnProperty.call(cleanVars, techKey)) {
      labelMap[normalizeLabel(label)] = cleanVars[techKey];
    }
  }
  return labelMap;
}

/**
 * Applique les variables à un .docx via docxtemplater.
 *
 * Supporte DEUX formats de balises, sur deux passes successives :
 *   1. `{{cle_technique}}` — convention Mustache historique (templates déjà
 *      migrés, power users).
 *   2. `[%Libellé en français%]` — convention Sellsy/Loris affichée dans l'UI
 *      (`documents/how-to`, `documents/variables`). C'est ce que l'utilisateur
 *      tape dans son Word importé. Converti à la volée via le map d'alias.
 *
 * Chaque passe s'appuie sur le moteur de délimiteurs de docxtemplater, qui
 * recoud les runs XML AVANT de chercher les balises : une balise éclatée par
 * Word en plusieurs runs (styles, correction orthographique…) est donc bien
 * détectée — ce qu'un simple regex sur le XML brut raterait.
 *
 * Throws si le document est corrompu sur la passe `{{…}}`. Une erreur sur la
 * passe `[%…%]` (ex. délimiteur orphelin dans le doc) est capturée et le
 * résultat de la 1ʳᵉ passe est renvoyé (non-régression : au pire les `[%…%]`
 * restent non résolus, comme avant ce correctif).
 */
export function applyVariablesToDocx(
  docxBuffer: Buffer,
  variables: DocxVariables
): Buffer {
  // Convertit les valeurs nullish/undefined en chaîne vide pour éviter
  // d'afficher "undefined" dans le PDF.
  const cleanVars: Record<string, string> = {};
  for (const [key, value] of Object.entries(variables)) {
    cleanVars[key] = value == null ? "" : String(value);
  }

  // ── Passe 1 : format {{cle_technique}} ──
  const docTech = new Docxtemplater(new PizZip(docxBuffer), {
    paragraphLoop: true,
    linebreaks: true,
    // Délimiteurs par défaut : {variable}. On force {{variable}} pour
    // matcher la convention Mustache et éviter les conflits avec les
    // accolades naturelles dans les documents.
    delimiters: { start: "{{", end: "}}" },
  });
  docTech.render(cleanVars);
  const afterTech = docTech.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });

  // ── Passe 2 : format [%Libellé en français%] (alias Sellsy) ──
  const labelMap = buildLabelMap(cleanVars);
  try {
    const docAlias = new Docxtemplater(new PizZip(afterTech), {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "[%", end: "%]" },
      // Lookup exact sur le libellé normalisé (les clés contiennent espaces,
      // apostrophes et accents → on court-circuite le parseur d'expression
      // par défaut qui buterait dessus).
      parser: (tag: string) => ({
        get: (scope: Record<string, string>) => scope[normalizeLabel(tag)],
      }),
      // Libellé inconnu (absent du map) → on le réaffiche tel quel pour audit,
      // au lieu de le vider silencieusement.
      nullGetter: (part: { value?: string; module?: string }) =>
        part.module ? "" : `[%${part.value ?? ""}%]`,
    });
    docAlias.render(labelMap);
    return docAlias.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
  } catch (err) {
    console.warn(
      "[docx-converter] passe alias [%…%] échouée, fallback sur le résultat {{…}} :",
      err instanceof Error ? err.message : err
    );
    return afterTech;
  }
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
