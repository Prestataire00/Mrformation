import sanitizeHtml from "sanitize-html";

/**
 * Sanitize une signature SVG provenant d'un utilisateur (apprenant, formateur,
 * client) avant rendu en HTML ou encodage en `data:image/svg+xml`.
 *
 * Vecteur d'attaque corrigé :
 *  Un signataire peut injecter du SVG malveillant dans `signature_data`
 *  (table `signatures` / `document_signatures`). Sans sanitization, ce SVG
 *  s'exécute :
 *    - Au rendu PDF (via signatureToDataUrl → data:image/svg+xml)
 *    - Dans l'UI admin/learner/trainer via `dangerouslySetInnerHTML`
 *
 * Implémentation : `sanitize-html` (pure JS, htmlparser2, zéro dépendance
 * DOM/jsdom). Remplace l'ancien `isomorphic-dompurify` qui crashait au
 * load module sur Netlify Functions Node 22.x via la chaîne :
 *   isomorphic-dompurify → jsdom → html-encoding-sniffer (CJS) →
 *   require('@exodus/bytes') (ESM only) → ERR_REQUIRE_ESM.
 *
 * Stratégie :
 *  - Whitelist STRICTE de tags (uniquement éléments de tracé SVG)
 *  - Whitelist d'attributs par tag (géométrie + style basique)
 *  - Pas de href/xlink:href (peuvent porter `javascript:`)
 *  - Pas d'event handlers (on*)
 *  - Mode XML pour respecter SVG (self-closing, case)
 *
 * Tags refusés par défaut (non listés dans allowedTags) :
 *   script, foreignObject, iframe, object, embed, image, use, a, animate,
 *   animateTransform, animateMotion, set, link, meta, style.
 */

const ALLOWED_TAGS = [
  "svg",
  "path",
  "line",
  "polyline",
  "rect",
  "circle",
  "ellipse",
  "polygon",
  "g",
  "title",
  "desc",
];

// Attributs autorisés par tag. Pattern recommandé par sanitize-html (vs global).
// Couvre exactement les besoins de react-signature-canvas.toSVG() + nos templates.
const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  svg: ["xmlns", "viewBox", "width", "height", "fill", "stroke"],
  path: [
    "d",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-miterlimit",
    "stroke-dasharray",
    "stroke-dashoffset",
    "fill",
    "fill-opacity",
    "stroke-opacity",
    "opacity",
    "transform",
    "vector-effect",
  ],
  line: ["x1", "y1", "x2", "y2", "stroke", "stroke-width", "stroke-linecap", "transform", "opacity"],
  polyline: ["points", "fill", "stroke", "stroke-width", "stroke-linecap", "transform", "opacity"],
  rect: ["x", "y", "width", "height", "fill", "stroke", "stroke-width", "rx", "ry", "transform", "opacity"],
  circle: ["cx", "cy", "r", "fill", "stroke", "stroke-width", "transform", "opacity"],
  ellipse: ["cx", "cy", "rx", "ry", "fill", "stroke", "stroke-width", "transform", "opacity"],
  polygon: ["points", "fill", "stroke", "stroke-width", "transform", "opacity"],
  g: ["transform", "fill", "stroke", "opacity"],
  title: [],
  desc: [],
};

/**
 * Sanitize une signature SVG. Retourne :
 *  - "" si l'input n'est pas une string non vide
 *  - L'input tel quel si c'est une data URL PNG/JPG (déjà safe)
 *  - Le SVG nettoyé par sanitize-html sinon
 */
export function sanitizeSignatureSvg(input: string): string {
  if (!input || typeof input !== "string") return "";

  // Bypass pour les data URLs raster (PNG/JPG) — pas de surface XSS sur ces formats.
  // Note : on n'accepte PAS `data:image/svg+xml` en bypass (un SVG encodé en base64
  // contenant du XSS est tout autant dangereux qu'un SVG brut).
  if (/^data:image\/(png|jpeg|jpg|gif|webp);/i.test(input)) {
    return input;
  }

  return sanitizeHtml(input, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    // Strip tags non whitelistés ET leur contenu (équivalent KEEP_CONTENT:false de DOMPurify)
    disallowedTagsMode: "discard",
    // SVG = XML (self-closing tags, case-sensitive). Sans ça, htmlparser2 traite
    // l'input comme HTML5 et casse les self-closing balises SVG.
    parser: { xmlMode: true },
  });
}
