import DOMPurify from "isomorphic-dompurify";

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
 * Stratégie :
 *  - Whitelist STRICTE de tags (uniquement éléments de tracé)
 *  - Whitelist d'attributs (géométrie + style basique, pas d'event handlers,
 *    pas de href/xlink:href qui peuvent porter `javascript:`)
 *  - DOMPurify gère intrinsèquement les CDATA, DOCTYPE, entités XXE, mutations
 *
 * Tags refusés (forbidden) : script, foreignObject, iframe, object, embed,
 *   image, use, a, animate, animateTransform, animateMotion, set, link, meta,
 *   style (peut contenir url(javascript:))
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

const ALLOWED_ATTR = [
  // Géométrie
  "d", "x", "y", "x1", "y1", "x2", "y2",
  "cx", "cy", "r", "rx", "ry",
  "points", "width", "height", "viewBox",
  // Namespace
  "xmlns",
  // Style basique (pas d'href / xlink:href)
  "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset",
  "transform", "opacity", "fill-opacity", "stroke-opacity",
  "vector-effect",
];

const FORBID_TAGS = [
  "script", "foreignObject", "iframe", "object", "embed",
  "image", "use", "a", "animate", "animateTransform", "animateMotion",
  "set", "link", "meta", "style", "handler", "listener",
];

/**
 * Sanitize une signature SVG. Retourne :
 *  - "" si l'input n'est pas une string non vide
 *  - L'input tel quel si c'est une data URL PNG/JPG (déjà safe)
 *  - Le SVG nettoyé par DOMPurify sinon
 */
export function sanitizeSignatureSvg(input: string): string {
  if (!input || typeof input !== "string") return "";

  // Bypass pour les data URLs raster (PNG/JPG) — pas de surface XSS sur ces formats.
  // Note : on n'accepte PAS `data:image/svg+xml` en bypass (un SVG encodé en base64
  // contenant du XSS est tout autant dangereux qu'un SVG brut).
  if (/^data:image\/(png|jpeg|jpg|gif|webp);/i.test(input)) {
    return input;
  }

  const cleaned = DOMPurify.sanitize(input, {
    USE_PROFILES: { svg: true, svgFilters: false },
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS,
    // Bloque tout attribut commençant par "on" (event handlers)
    // + href/xlink:href (peuvent porter javascript:)
    FORBID_ATTR: ["href", "xlink:href"],
    // Protections supplémentaires
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    KEEP_CONTENT: false,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });

  // DOMPurify peut retourner une string ou TrustedHTML selon la config
  return typeof cleaned === "string" ? cleaned : String(cleaned);
}
