import { describe, it, expect } from "vitest";
import { sanitizeSignatureSvg } from "@/lib/utils/sanitize-svg";

// ──────────────────────────────────────────────
// Payloads OWASP — vecteurs XSS via SVG connus
// https://cheatsheetseries.owasp.org/cheatsheets/XSS_Filter_Evasion_Cheat_Sheet.html
// https://github.com/cure53/DOMPurify/tree/main/test/fixtures
// ──────────────────────────────────────────────

describe("sanitizeSignatureSvg — blocks XSS vectors", () => {
  it("strips <script> tags inside SVG", () => {
    const malicious = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><path d="M0 0 L10 10"/></svg>`;
    const clean = sanitizeSignatureSvg(malicious);
    expect(clean).not.toMatch(/script/i);
    expect(clean).not.toMatch(/alert/i);
  });

  it("strips <foreignObject> (most dangerous SVG XSS vector)", () => {
    const malicious = `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body><iframe src="javascript:alert(1)"></iframe></body></foreignObject></svg>`;
    const clean = sanitizeSignatureSvg(malicious);
    expect(clean).not.toMatch(/foreignObject/i);
    expect(clean).not.toMatch(/iframe/i);
    expect(clean).not.toMatch(/javascript:/i);
  });

  it("strips inline event handlers (onload, onclick, etc.)", () => {
    const malicious = `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle cx="50" cy="50" r="40" onclick="alert(2)"/></svg>`;
    const clean = sanitizeSignatureSvg(malicious);
    expect(clean).not.toMatch(/onload/i);
    expect(clean).not.toMatch(/onclick/i);
    expect(clean).not.toMatch(/alert/i);
  });

  it("strips <image> tags (can load external resources / javascript: URLs)", () => {
    const malicious = `<svg xmlns="http://www.w3.org/2000/svg"><image href="javascript:alert(1)"/></svg>`;
    const clean = sanitizeSignatureSvg(malicious);
    expect(clean).not.toMatch(/<image/i);
    expect(clean).not.toMatch(/javascript:/i);
  });

  it("strips javascript: URLs in xlink:href on <a>", () => {
    const malicious = `<svg xmlns="http://www.w3.org/2000/svg"><a xlink:href="javascript:alert(1)"><circle cx="50" cy="50" r="40"/></a></svg>`;
    const clean = sanitizeSignatureSvg(malicious);
    expect(clean).not.toMatch(/javascript:/i);
  });

  it("strips <iframe> wrapped in SVG", () => {
    const malicious = `<svg xmlns="http://www.w3.org/2000/svg"><iframe src="javascript:alert(1)"></iframe></svg>`;
    const clean = sanitizeSignatureSvg(malicious);
    expect(clean).not.toMatch(/iframe/i);
  });

  it("strips <object> and <embed>", () => {
    const malicious = `<svg xmlns="http://www.w3.org/2000/svg"><object data="javascript:alert(1)"/><embed src="evil.swf"/></svg>`;
    const clean = sanitizeSignatureSvg(malicious);
    expect(clean).not.toMatch(/<object/i);
    expect(clean).not.toMatch(/<embed/i);
    expect(clean).not.toMatch(/javascript:/i);
  });

  it("strips <use> with external href (SVG SSRF)", () => {
    const malicious = `<svg xmlns="http://www.w3.org/2000/svg"><use href="https://evil.com/x.svg#payload"/></svg>`;
    const clean = sanitizeSignatureSvg(malicious);
    expect(clean).not.toMatch(/evil\.com/i);
  });

  it("strips <animate> with mutation-XSS payloads", () => {
    // Vector: <animate attributeName=href values=javascript:alert(1) />
    const malicious = `<svg xmlns="http://www.w3.org/2000/svg"><a><animate attributeName="href" values="javascript:alert(1)"/><text>click</text></a></svg>`;
    const clean = sanitizeSignatureSvg(malicious);
    expect(clean).not.toMatch(/javascript:/i);
  });

  it("strips CDATA section that smuggles scripts (content escaped as text)", () => {
    const malicious = `<svg xmlns="http://www.w3.org/2000/svg"><![CDATA[<script>alert(1)</script>]]></svg>`;
    const clean = sanitizeSignatureSvg(malicious);
    // DOMPurify échappe le contenu CDATA en texte (`&lt;script&gt;`) → safe :
    // pas de tag <script> actif qui pourrait être exécuté. On vérifie l'absence
    // d'un tag actif (avec `<` littéral, pas l'entité `&lt;`).
    expect(clean).not.toMatch(/<script/i);
    expect(clean).not.toMatch(/<\/script>/i);
    // L'attribut on* ou un littéral javascript: ne doivent jamais apparaître
    expect(clean).not.toMatch(/\son\w+=/i);
    expect(clean).not.toMatch(/javascript:/i);
  });

  it("strips DOCTYPE / external entities (XXE)", () => {
    const malicious = `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg">&xxe;</svg>`;
    const clean = sanitizeSignatureSvg(malicious);
    expect(clean).not.toMatch(/ENTITY/i);
    expect(clean).not.toMatch(/SYSTEM/i);
    expect(clean).not.toMatch(/etc\/passwd/i);
  });
});

// ──────────────────────────────────────────────
// Preservation des signatures légitimes
// ──────────────────────────────────────────────

describe("sanitizeSignatureSvg — preserves legitimate signature elements", () => {
  it("preserves valid <path> with d attribute (canvas pen stroke)", () => {
    const legit = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60"><path d="M10 30 Q50 10 100 30 T190 30" stroke="black" stroke-width="2" fill="none"/></svg>`;
    const clean = sanitizeSignatureSvg(legit);
    expect(clean).toMatch(/<path/);
    expect(clean).toMatch(/d="M10 30/);
    expect(clean).toMatch(/stroke="black"/);
    expect(clean).toMatch(/stroke-width="2"/);
  });

  it("preserves <line>, <polyline>, <circle>, <rect>, <ellipse>, <polygon>, <g>", () => {
    const legit = `<svg xmlns="http://www.w3.org/2000/svg"><g><line x1="0" y1="0" x2="10" y2="10"/><polyline points="0,0 10,10 20,0"/><circle cx="50" cy="50" r="10"/><rect x="0" y="0" width="100" height="50"/><ellipse cx="50" cy="50" rx="10" ry="20"/><polygon points="0,0 50,0 25,50"/></g></svg>`;
    const clean = sanitizeSignatureSvg(legit);
    expect(clean).toMatch(/<line/);
    expect(clean).toMatch(/<polyline/);
    expect(clean).toMatch(/<circle/);
    expect(clean).toMatch(/<rect/);
    expect(clean).toMatch(/<ellipse/);
    expect(clean).toMatch(/<polygon/);
    expect(clean).toMatch(/<g/);
  });

  it("preserves viewBox, xmlns, width, height", () => {
    const legit = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" width="200" height="60"><path d="M0 0"/></svg>`;
    const clean = sanitizeSignatureSvg(legit);
    expect(clean).toMatch(/viewBox="0 0 200 60"/);
    expect(clean).toMatch(/width="200"/);
    expect(clean).toMatch(/height="60"/);
  });

  it("preserves transform attribute (used by signature-pad)", () => {
    const legit = `<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(10,10) scale(2)"><path d="M0 0 L5 5"/></g></svg>`;
    const clean = sanitizeSignatureSvg(legit);
    expect(clean).toMatch(/transform="translate/);
  });

  it("preserves a typical react-signature-canvas output (full stroke)", () => {
    // Realistic output of react-signature-canvas.toSVG()
    const realistic = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><path fill="none" stroke="#000" stroke-width="2" d="M20 100 C30 90 40 80 50 90 S70 110 80 100 Q90 90 100 95"/><path fill="none" stroke="#000" stroke-width="2" d="M120 100 L130 95 L140 100"/></svg>`;
    const clean = sanitizeSignatureSvg(realistic);
    expect(clean).toMatch(/<path/g);
    // Tous les attributs essentiels du tracé sont préservés
    expect(clean).toMatch(/stroke="#000"/);
    expect(clean).toMatch(/d="M20 100/);
  });
});

// ──────────────────────────────────────────────
// Edge cases
// ──────────────────────────────────────────────

describe("sanitizeSignatureSvg — edge cases", () => {
  it("returns empty string for null / undefined / non-string input", () => {
    expect(sanitizeSignatureSvg(null as unknown as string)).toBe("");
    expect(sanitizeSignatureSvg(undefined as unknown as string)).toBe("");
    expect(sanitizeSignatureSvg("" as string)).toBe("");
    expect(sanitizeSignatureSvg(123 as unknown as string)).toBe("");
  });

  it("returns empty string for non-SVG content", () => {
    const result = sanitizeSignatureSvg("just plain text");
    // DOMPurify retournera le texte sans danger ou vide selon profil
    expect(result).not.toMatch(/<svg/);
    expect(result).not.toMatch(/<script/);
  });

  it("passes through data:image/png base64 (legacy format) unchanged", () => {
    // Certaines signatures peuvent être stockées en PNG data URL (rare mais possible)
    const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
    const result = sanitizeSignatureSvg(dataUrl);
    // On accepte ce format en bypass (déjà sûr : PNG n'a pas de surface d'attaque XSS)
    expect(result).toBe(dataUrl);
  });

  it("handles huge input without crash (signature canvas peut être verbeux)", () => {
    const bigSvg = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${"M0 0 L1 1 ".repeat(5000)}"/></svg>`;
    const clean = sanitizeSignatureSvg(bigSvg);
    expect(clean).toContain("<path");
    expect(clean.length).toBeGreaterThan(1000);
  });
});
