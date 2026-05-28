import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(
  process.cwd(),
  "src/app/api/crm/quotes/sign-request/route.ts",
);

const routeSource = readFileSync(ROUTE_PATH, "utf-8");

describe("em-b-3 — Refactor crm/quotes/sign-request vers resolver", () => {
  it("importe resolveEmailTemplate", () => {
    expect(routeSource).toMatch(
      /import \{ resolveEmailTemplate \} from "@\/lib\/services\/email-template-resolver"/,
    );
  });

  it("lit le feature flag USE_TEMPLATE_RESOLVER_SIGN_REQUEST", () => {
    expect(routeSource).toMatch(
      /const USE_RESOLVER = process\.env\.USE_TEMPLATE_RESOLVER_SIGN_REQUEST === "true"/,
    );
  });

  it("path resolver : appelle resolveEmailTemplate(serviceDb, 'quote_sign_request', quote.entity_id)", () => {
    expect(routeSource).toMatch(
      /resolveEmailTemplate\([\s\S]+serviceDb[\s\S]+"quote_sign_request"[\s\S]+quote\.entity_id/,
    );
  });

  it("path resolver : fail-soft sur null (log + fallback hardcoded car contexte critique user-triggered)", () => {
    expect(routeSource).toMatch(
      /if \(resolved\)[\s\S]+} else \{[\s\S]+console\.error[\s\S]+fallback hardcoded/,
    );
  });

  it("path custom_subject/custom_body reste prioritaire dans les 2 modes", () => {
    expect(routeSource).toMatch(/if \(custom_subject && custom_body\)[\s\S]+subject = custom_subject/);
  });

  it("path legacy DB par `type` conservé (cleanup em-b-6)", () => {
    expect(routeSource).toMatch(
      /\.from\("email_templates"\)[\s\S]+\.eq\("type", "quote_sign_request"\)/,
    );
  });

  it("applyVars factorisé pour les 3 paths (custom n'utilise que lien_signature)", () => {
    expect(routeSource).toMatch(/const applyVars = \(s: string\) =>/);
    // Custom path ne fait QUE lien_signature (l'utilisateur a déjà résolu les autres dans la preview)
    expect(routeSource).toMatch(
      /custom_body\.replace\(\/\\\{\\\{lien_signature\\\}\\\}\/g, signUrl\)/,
    );
  });

  it("applyVars couvre les 6 variables : reference, montant, destinataire, lien_signature, date_validite, entite", () => {
    expect(routeSource).toMatch(/\\\{\\\{reference\\\}\\\}/);
    expect(routeSource).toMatch(/\\\{\\\{montant\\\}\\\}/);
    expect(routeSource).toMatch(/\\\{\\\{destinataire\\\}\\\}/);
    expect(routeSource).toMatch(/\\\{\\\{lien_signature\\\}\\\}/);
    expect(routeSource).toMatch(/\\\{\\\{date_validite\\\}\\\}/);
    expect(routeSource).toMatch(/\\\{\\\{entite\\\}\\\}/);
  });

  it("fallback hardcoded conservé 2 fois (resolver null path + legacy null path)", () => {
    const matches = routeSource.match(/Veuillez trouver notre proposition commerciale/g);
    expect(matches?.length).toBeGreaterThanOrEqual(2);
  });

  it("documente em-b-3 + plan cleanup em-b-6", () => {
    expect(routeSource).toMatch(/Story em-b-3/);
    expect(routeSource).toMatch(/em-b-6/);
  });
});
