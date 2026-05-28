import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(
  process.cwd(),
  "src/app/api/crm/quotes/process-reminders/route.ts",
);

const routeSource = readFileSync(ROUTE_PATH, "utf-8");

describe("em-b-2 — Refactor crm/quotes/process-reminders vers resolver", () => {
  it("importe resolveEmailTemplate", () => {
    expect(routeSource).toMatch(
      /import \{ resolveEmailTemplate \} from "@\/lib\/services\/email-template-resolver"/,
    );
  });

  it("lit le feature flag USE_TEMPLATE_RESOLVER_QUOTES (distinct des invoices)", () => {
    expect(routeSource).toMatch(
      /const USE_RESOLVER = process\.env\.USE_TEMPLATE_RESOLVER_QUOTES === "true"/,
    );
  });

  it("path resolver : appelle resolveEmailTemplate(supabase, reminderTemplateKey, quote.entity_id)", () => {
    expect(routeSource).toMatch(
      /if \(USE_RESOLVER\)[\s\S]+resolveEmailTemplate\([\s\S]+supabase[\s\S]+reminderTemplateKey[\s\S]+quote\.entity_id/,
    );
  });

  it("path resolver : skip + warn console si null", () => {
    expect(routeSource).toMatch(
      /if \(!resolved\)[\s\S]+\[quote-reminders\][\s\S]+introuvable[\s\S]+continue/,
    );
  });

  it("path resolver : applique les variables via applyVars factorisé", () => {
    expect(routeSource).toMatch(/const applyVars = \(s: string\) =>/);
    expect(routeSource).toMatch(/subject = applyVars\(resolved\.subject\)/);
    expect(routeSource).toMatch(/textBody = applyVars\(resolved\.body\)/);
  });

  it("path legacy : DB lookup `type` + fallback TEMPLATES conservés", () => {
    expect(routeSource).toMatch(/} else {/);
    expect(routeSource).toMatch(
      /\.from\("email_templates"\)[\s\S]+\.eq\("type", reminderTemplateKey\)/,
    );
    expect(routeSource).toMatch(/const fallback = TEMPLATES\[reminderType\]/);
  });

  it("TEMPLATES constante non supprimée (cleanup em-b-6)", () => {
    expect(routeSource).toMatch(/const TEMPLATES = \{/);
  });

  it("vars includent reference / entreprise / prospect / date_echeance / date_validite_clause", () => {
    expect(routeSource).toMatch(/"\{\{reference\}\}": quote\.reference/);
    expect(routeSource).toMatch(/"\{\{entreprise\}\}": prospectName/);
    expect(routeSource).toMatch(/"\{\{prospect\}\}": prospectName/);
    expect(routeSource).toMatch(/"\{\{date_echeance\}\}"/);
    expect(routeSource).toMatch(/"\{\{date_validite_clause\}\}"/);
  });

  it("logique reminderType (first/second/final) inchangée", () => {
    expect(routeSource).toMatch(/reminderTemplateKey = "reminder_quote_final"/);
    expect(routeSource).toMatch(/reminderTemplateKey = "reminder_quote_second"/);
    expect(routeSource).toMatch(/reminderTemplateKey = "reminder_quote_first"/);
  });

  it("documente le feature flag + plan de cleanup em-b-6", () => {
    expect(routeSource).toMatch(/Story em-b-2/);
    expect(routeSource).toMatch(/USE_TEMPLATE_RESOLVER_QUOTES/);
    expect(routeSource).toMatch(/em-b-6/);
  });
});
