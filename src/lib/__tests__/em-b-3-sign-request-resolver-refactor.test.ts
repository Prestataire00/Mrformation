import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(
  process.cwd(),
  "src/app/api/crm/quotes/sign-request/route.ts",
);

const routeSource = readFileSync(ROUTE_PATH, "utf-8");

describe("em-b-3 / em-b-6 — crm/quotes/sign-request sur resolver unifié", () => {
  it("importe resolveEmailTemplate", () => {
    expect(routeSource).toMatch(
      /import \{ resolveEmailTemplate \} from "@\/lib\/services\/email-template-resolver"/,
    );
  });

  it("post-cleanup em-b-6 : aucun flag USE_TEMPLATE_RESOLVER_SIGN_REQUEST", () => {
    expect(routeSource).not.toMatch(/USE_TEMPLATE_RESOLVER_SIGN_REQUEST/);
    expect(routeSource).not.toMatch(/const USE_RESOLVER\s*=/);
  });

  it("post-cleanup em-b-6 : aucun fallback DB par `type`", () => {
    expect(routeSource).not.toMatch(/\.eq\("type", "quote_sign_request"\)/);
  });

  it("cascade 3-niveaux conservée : custom_subject/body → resolver → fallback hardcoded", () => {
    // Niveau 1 : custom user input prioritaire
    expect(routeSource).toMatch(/if \(custom_subject && custom_body\)/);
    expect(routeSource).toMatch(/subject = custom_subject/);

    // Niveau 2 : resolver
    expect(routeSource).toMatch(
      /resolveEmailTemplate\(\s*serviceDb,\s*"quote_sign_request",\s*quote\.entity_id/,
    );

    // Niveau 3 : fallback hardcoded inline (contexte user-triggered fail-soft)
    expect(routeSource).toMatch(/console\.error[\s\S]{0,300}fallback hardcoded/);
    expect(routeSource).toMatch(/Veuillez trouver notre proposition commerciale/);
  });

  it("applyVars factorisé pour les 6 variables", () => {
    expect(routeSource).toMatch(/const applyVars/);
    expect(routeSource).toMatch(/\\\{\\\{reference\\\}\\\}/);
    expect(routeSource).toMatch(/\\\{\\\{montant\\\}\\\}/);
    expect(routeSource).toMatch(/\\\{\\\{destinataire\\\}\\\}/);
    expect(routeSource).toMatch(/\\\{\\\{lien_signature\\\}\\\}/);
    expect(routeSource).toMatch(/\\\{\\\{date_validite\\\}\\\}/);
    expect(routeSource).toMatch(/\\\{\\\{entite\\\}\\\}/);
  });

  it("custom path ne touche QUE lien_signature (autres vars déjà résolues UI)", () => {
    expect(routeSource).toMatch(
      /custom_body\.replace\(\/\\\{\\\{lien_signature\\\}\\\}\/g, signUrl\)/,
    );
  });

  it("documente em-b-6 cleanup", () => {
    expect(routeSource).toMatch(/em-b-6/);
  });
});
