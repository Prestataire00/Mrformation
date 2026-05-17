# Design : Remplacer isomorphic-dompurify par sanitize-html (fix définitif ERR_REQUIRE_ESM)

**Date** : 2026-05-17
**Auteur** : Wissam + Claude (analyse post-mortem 3 PRs de patches)
**Statut** : approved
**Story** : Fix définitif de la signature émargement bloquée en prod

## Contexte / Historique

3 PRs (#117, #119, #120) ont tenté de fixer le crash `ERR_REQUIRE_ESM` qui bloque les routes signature en prod. Toutes ont échoué ou exposé un fix fragile :

1. **PR #117** : bump Node 20→22 dans netlify.toml. Insuffisant : Node 22.x (jusqu'à 22.22 en cours) garde `require(esm)` expérimental — flag toujours requis.
2. **PR #119** : `NODE_OPTIONS="--experimental-require-module"` dans `[build.environment]`. Insuffisant : cette section s'applique uniquement au BUILD, pas au RUNTIME des Netlify Functions.
3. **PR #120** : `--max-old-space-size=4096` pour fix OOM build. Fixe le build mais runtime toujours cassé.

**Root cause persistante** : `src/lib/utils/sanitize-svg.ts:1` importe `isomorphic-dompurify` → en runtime serverless, pulle `jsdom` → `html-encoding-sniffer` (CJS) → tente `require('@exodus/bytes')` (ESM only) → crash au module load. Les 3 routes signature (`/api/signatures`, `/api/emargement/sign`, `/api/documents/sign`) plantent au load.

**Pourquoi les workarounds échouent** :
- `linkedom` : DOMPurify devient no-op silencieux → bypass sécurité critique
- `happy-dom` : NodeIterator bug → bypass 2e élément consécutif → bypass sécurité
- Flags Node : fragile, dépend de propagation env vars Netlify aux Lambda runtime

**Décision** : éliminer la dépendance `isomorphic-dompurify` (et toute la chaîne jsdom) au profit de `sanitize-html` (parser pure JS, zéro DOM, ESM/CJS friendly, stand-by Node ecosystem).

## Comportement attendu

Identique à l'existant pour les 5 consumers :
- 3 routes API (`/api/signatures`, `/api/emargement/sign`, `/api/documents/sign`)
- 2 pages client (admin/signatures, learner/sessions/[id]/sign)

`sanitizeSignatureSvg(input)` :
- `""` ou non-string → retourne `""`
- data URL PNG/JPG → retourne tel quel (bypass safe)
- SVG valide → retourne le SVG nettoyé (tags + attrs whitelistés uniquement)
- SVG malveillant (script, foreignObject, iframe, event handlers, javascript: URLs, etc.) → retourne le SVG nettoyé sans le payload XSS

Les 17 tests existants dans `src/lib/utils/__tests__/sanitize-svg.test.ts` continuent de passer (XSS vectors + preservation de SignaturePad output + edge cases).

## Architecture du fix

### Composant 1 — Réécrire `sanitize-svg.ts` avec sanitize-html

Fichier : `src/lib/utils/sanitize-svg.ts`

`sanitize-html` est un sanitizer HTML/XML pour Node (et browser) basé sur `htmlparser2`. Pure JS, zéro DOM. Pattern allowlist similaire à DOMPurify. Supporte SVG via configuration.

Configuration cible :
- `allowedTags` : whitelist 10 tags SVG (svg, path, line, polyline, rect, circle, ellipse, polygon, g, title, desc)
- `allowedAttributes` : whitelist ~25 attributs géométrie + style (d, x, y, cx, cy, r, viewBox, fill, stroke, transform, etc.) sur les balises autorisées
- `allowedSchemes` : vide (pas de href/xlink:href, donc protocoles javascript:/data: non applicables)
- `disallowedTagsMode` : `"discard"` (strip les tags non whitelistés ET leur contenu — équivalent au `KEEP_CONTENT: false` de DOMPurify)
- Note : `sanitize-html` ne supporte pas `xmlns` par défaut → ajout explicite

Pseudo-code :
```typescript
import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = ["svg", "path", "line", "polyline", "rect", "circle", "ellipse", "polygon", "g", "title", "desc"];
const ALLOWED_ATTRS_PER_TAG: Record<string, string[]> = {
  svg: ["xmlns", "viewBox", "width", "height", "fill", "stroke"],
  path: ["d", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "fill", "fill-opacity", "stroke-opacity", "opacity", "transform", "vector-effect"],
  line: ["x1", "y1", "x2", "y2", "stroke", "stroke-width", "transform"],
  // etc. pour chaque tag
};

export function sanitizeSignatureSvg(input: string): string {
  if (!input || typeof input !== "string") return "";
  if (/^data:image\/(png|jpeg|jpg|gif|webp);/i.test(input)) return input;

  return sanitizeHtml(input, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRS_PER_TAG,
    disallowedTagsMode: "discard",
    parser: { xmlMode: true }, // SVG = XML
  });
}
```

### Composant 2 — Mise à jour des deps

`package.json` :
- ➖ `"isomorphic-dompurify": "^3.12.0"` (et toute la chaîne jsdom transitive ~10MB). **Vérifié par grep : 1 seul consumer = `sanitize-svg.ts`** que ce spec réécrit → retrait safe.
- ➕ `"sanitize-html": "^2.17.0"` (~50kb + htmlparser2 ~30kb = ~80kb total)
- ➕ `"@types/sanitize-html": "^2.16.0"` (devDep)
- ✅ `"dompurify": "^3.3.3"` **GARDÉ** : utilisé par 4 fichiers client (TabConventionDocs, admin/emails, admin/documents, learner/documents). Browser-only, pas concerné par le bug Node.
- ✅ `"@types/dompurify": "^3.0.5"` **GARDÉ** : devDep pour les 4 consumers ci-dessus.

### Composant 3 — Cleanup NODE_OPTIONS

Une fois le sanitizer ne crashe plus :
- `netlify.toml` : retirer `NODE_OPTIONS = "--experimental-require-module --max-old-space-size=4096"` (les commentaires + la ligne complète). Plus de flag nécessaire.
- Dashboard Netlify : si `NODE_OPTIONS` env var avait été ajoutée en workaround, la retirer aussi.
- `.nvmrc` : laisser `22` (Node 22 reste valide, c'est la version stable, juste plus de flag nécessaire).
- `netlify.toml` : laisser `NODE_VERSION = "22"`. Pas de raison de re-down.

### Composant 4 — Validation tests existants

Les 17 tests existants dans `src/lib/utils/__tests__/sanitize-svg.test.ts` couvrent :
- 11 XSS vectors (script, foreignObject, onclick, javascript: URI, iframe, object, embed, use, animate, CDATA, XXE)
- 5 preservation cases (path d= , line/polyline/circle/rect/ellipse/polygon/g, viewBox/xmlns/width/height, transform, realistic SignaturePad output)
- 4 edge cases (null/undefined/empty, non-SVG text, data:image/png pass-through, huge input no crash)

Aucun test ne dépend de l'implémentation DOMPurify spécifiquement. Tous testent le COMPORTEMENT (XSS bloqué, valid preserved). Donc ils doivent passer après refactor → filet de sécurité automatique.

Si un test fail à cause d'une nuance de sanitize-html vs DOMPurify (ex: whitespace dans output, ordre attributs) :
- C'est un test fragile → ajuster le test pour tester l'invariant sémantique (présence/absence de motif), pas la string exacte
- Pas un test sécurité → ne PAS le passer en silence

## Tests

### Tests automatisés
Aucun nouveau test à ajouter (17 existants couvrent largement). Vérifier qu'ils passent tous après refactor.

### Tests manuels (Wissam post-deploy)
1. Hard refresh prod (Cmd+Shift+R)
2. **Signature admin direct** : TabEmargements > Signer pour un apprenant → toast "Signature enregistrée"
3. **Signature QR** : scanner QR code émargement → signer → page de succès
4. **Export feuille émargement signée** : bouton "Feuille d'émargement signée" → PDF téléchargé
5. **Export 1 PDF par entreprise** : bouton "1 PDF par entreprise (N)" → N PDFs téléchargés
6. **Export planning hebdo signé** : link "Planning hebdo signé (paysage)" → PDF paysage téléchargé
7. **Export feuille vide** : link "Imprimer une feuille vide" → PDF avec cellules vides

Si l'un des 7 plante → diagnostic ciblé (probablement pas lié au fix sanitize, vu que les autres marcheront).

## Edge cases

- **`xmlns` attribut sur `<svg>`** : sanitize-html par défaut peut le strip car namespace. Le forcer via `allowedAttributes.svg`.
- **`xmlMode: true` dans le parser** : indispensable car SVG est XML, pas HTML (self-closing tags, namespace).
- **Tags imbriqués** : par défaut sanitize-html avec `disallowedTagsMode: "discard"` strip les tags forbidden ET leur contenu (équivalent `KEEP_CONTENT: false` de DOMPurify). Cohérent avec le comportement actuel.
- **Casing tags** : XML case-sensitive. SignaturePad produit lowercase. Whitelist en lowercase. OK.
- **Signature dans cellules vides après refactor** : aucun impact, le sanitizer s'applique à l'input SVG seul (pas au tableau HTML émargement).

## Hors scope

- **Migration des consumers `dompurify` (browser)** : 4 fichiers client utilisent `dompurify` directement (TabConventionDocs, admin/emails, admin/documents, learner/documents). Non concernés par le bug Node (browser n'a pas le problème CJS/ESM). Reste tels quels.
- **Tests E2E Playwright** sur le flow signature : nécessite infra Puppeteer + Supabase de test, hors scope.
- **Audit sécurité externe** du nouveau sanitizer : les 17 tests + sanitize-html battle-tested suffisent pour MVP. Audit Qualiopi peut être demandé plus tard si besoin.

## Risques

- **Comportement légèrement différent de DOMPurify sur edge cases** : risque faible (sanitize-html bien éprouvé), mitigation = les 17 tests.
- **`sanitize-html` ne supporte pas SVG aussi bien que DOMPurify** : risque réel mais limité (notre usage est très restreint : pas de styles inline complexes, pas de `<use>`, pas de filters).
- **Régression sur les signatures existantes en DB** : aucune. Le sanitizer s'applique uniquement à l'ÉCRITURE (sanitize avant INSERT). Les signatures existantes sont relues telles quelles (déjà sanitizées par DOMPurify, donc déjà clean).
- **Retrait isomorphic-dompurify casse autre chose** : grep confirme 1 seul consumer (sanitize-svg.ts). Aucune autre dépendance. Retrait sans risque.

## Definition of Done

- [ ] `src/lib/utils/sanitize-svg.ts` réécrit avec `sanitize-html`
- [ ] `package.json` : `isomorphic-dompurify` retiré, `sanitize-html` + `@types/sanitize-html` ajoutés. `dompurify` + `@types/dompurify` conservés (4 consumers client).
- [ ] `netlify.toml` : ligne `NODE_OPTIONS` + commentaires retirés
- [ ] 17 tests Vitest sanitize-svg passent
- [ ] `npx tsc --noEmit` clean
- [ ] Suite Vitest complète (393+ tests) passe
- [ ] PR créée + mergée
- [ ] Wissam vérifie + retire `NODE_OPTIONS` du dashboard Netlify si présent
- [ ] Wissam tests manuels post-deploy : 7 cas validés
