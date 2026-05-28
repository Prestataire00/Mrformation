import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(
  process.cwd(),
  "src/app/api/formations/automation-rules/run-cron/route.ts",
);

const routeSource = readFileSync(ROUTE_PATH, "utf-8");

describe("em-b-4 / em-b-6 — OPCO branch run-cron sur resolver unifié", () => {
  it("importe resolveEmailTemplate", () => {
    expect(routeSource).toMatch(
      /import \{ resolveEmailTemplate \} from "@\/lib\/services\/email-template-resolver"/,
    );
  });

  it("post-cleanup em-b-6 : aucun flag USE_TEMPLATE_RESOLVER_OPCO", () => {
    expect(routeSource).not.toMatch(/USE_TEMPLATE_RESOLVER_OPCO/);
    expect(routeSource).not.toMatch(/const USE_RESOLVER_OPCO/);
  });

  it("resolver appelé directement (sans gate flag) AVANT le loop admins", () => {
    expect(routeSource).toMatch(
      /resolveEmailTemplate\(\s*supabase,\s*"opco_deposit",\s*entity\.id/,
    );
    const resolverIdx = routeSource.indexOf("resolveEmailTemplate");
    const forLoopIdx = routeSource.indexOf("for (const admin of admins");
    expect(resolverIdx).toBeGreaterThan(0);
    expect(forLoopIdx).toBeGreaterThan(resolverIdx);
  });

  it("fail-soft sur null : log error + fallback hardcoded inline conservé (contexte critique URSSAF)", () => {
    expect(routeSource).toMatch(/if \(resolvedOpco\)/);
    expect(routeSource).toMatch(/console\.error[\s\S]{0,200}automation OPCO[\s\S]{0,200}fallback hardcoded/);
    expect(routeSource).toMatch(/Rappel : demande OPCO à déposer/);
    expect(routeSource).toMatch(/La demande de prise en charge OPCO/);
  });

  it("applyOpcoVars factorisé sur 5 variables (prenom_admin, opco_name, formation, date_debut, entite)", () => {
    expect(routeSource).toMatch(/const applyOpcoVars = \(s: string\) =>/);
    expect(routeSource).toMatch(/\{\{prenom_admin\}\}/);
    expect(routeSource).toMatch(/\{\{opco_name\}\}/);
    expect(routeSource).toMatch(/\{\{formation\}\}/);
    expect(routeSource).toMatch(/\{\{date_debut\}\}/);
    expect(routeSource).toMatch(/\{\{entite\}\}/);
  });

  it("subject appliqué via applyOpcoVars si template trouvé, sinon hardcoded", () => {
    expect(routeSource).toMatch(/opcoSubjectTpl[\s\S]{0,400}applyOpcoVars\(opcoSubjectTpl\)/);
  });

  it("body appliqué via applyOpcoVars si template trouvé, sinon hardcoded", () => {
    expect(routeSource).toMatch(/opcoBodyTpl[\s\S]{0,400}applyOpcoVars\(opcoBodyTpl\)/);
  });

  it("documente em-b-6 cleanup", () => {
    expect(routeSource).toMatch(/em-b-6/);
  });
});
