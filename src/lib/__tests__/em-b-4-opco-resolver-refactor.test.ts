import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(
  process.cwd(),
  "src/app/api/formations/automation-rules/run-cron/route.ts",
);

const routeSource = readFileSync(ROUTE_PATH, "utf-8");

describe("em-b-4 — Refactor OPCO branch dans run-cron vers resolver", () => {
  it("importe resolveEmailTemplate", () => {
    expect(routeSource).toMatch(
      /import \{ resolveEmailTemplate \} from "@\/lib\/services\/email-template-resolver"/,
    );
  });

  it("lit le feature flag USE_TEMPLATE_RESOLVER_OPCO", () => {
    expect(routeSource).toMatch(
      /const USE_RESOLVER_OPCO = process\.env\.USE_TEMPLATE_RESOLVER_OPCO === "true"/,
    );
  });

  it("path resolver : appelle resolveEmailTemplate(supabase, 'opco_deposit', entity.id) AVANT le loop admins", () => {
    expect(routeSource).toMatch(
      /if \(USE_RESOLVER_OPCO\)\s*\{\s*const resolved = await resolveEmailTemplate\(\s*supabase,\s*"opco_deposit",\s*entity\.id/,
    );
  });

  it("path resolver : fail-soft sur null avec log error + fallback hardcoded", () => {
    expect(routeSource).toMatch(/if \(resolved\)\s*\{/);
    expect(routeSource).toMatch(/console\.error\([\s\S]{0,80}automation OPCO[\s\S]{0,200}fallback hardcoded/);
  });

  it("applyOpcoVars factorisé sur 5 variables (prenom_admin, opco_name, formation, date_debut, entite)", () => {
    expect(routeSource).toMatch(/const applyOpcoVars = \(s: string\) =>/);
    expect(routeSource).toMatch(/\{\{prenom_admin\}\}/);
    expect(routeSource).toMatch(/\{\{opco_name\}\}/);
    expect(routeSource).toMatch(/\{\{formation\}\}/);
    expect(routeSource).toMatch(/\{\{date_debut\}\}/);
    expect(routeSource).toMatch(/\{\{entite\}\}/);
  });

  it("le subject est appliqué via applyOpcoVars si template trouvé, sinon hardcoded", () => {
    expect(routeSource).toMatch(
      /opcoSubjectTpl[\s\S]+applyOpcoVars\(opcoSubjectTpl\)[\s\S]+Rappel : demande OPCO à déposer/,
    );
  });

  it("le body est appliqué via applyOpcoVars si template trouvé, sinon hardcoded inline", () => {
    expect(routeSource).toMatch(
      /opcoBodyTpl[\s\S]+applyOpcoVars\(opcoBodyTpl\)[\s\S]+La demande de prise en charge OPCO/,
    );
  });

  it("hardcoded inline conservé en fallback (sera supprimé em-b-6)", () => {
    expect(routeSource).toMatch(/Rappel : demande OPCO à déposer/);
    expect(routeSource).toMatch(/La demande de prise en charge OPCO/);
  });

  it("le resolver est appelé 1 SEULE FOIS par entité avant le loop admins (pas N fois)", () => {
    // Le call resolveEmailTemplate doit être avant `for (const admin of admins`
    const resolverIdx = routeSource.indexOf("resolveEmailTemplate");
    const forLoopIdx = routeSource.indexOf("for (const admin of admins");
    expect(resolverIdx).toBeGreaterThan(0);
    expect(forLoopIdx).toBeGreaterThan(resolverIdx);
  });

  it("documente em-b-4 + plan cleanup em-b-6", () => {
    expect(routeSource).toMatch(/Story em-b-4/);
    expect(routeSource).toMatch(/em-b-6/);
  });
});
