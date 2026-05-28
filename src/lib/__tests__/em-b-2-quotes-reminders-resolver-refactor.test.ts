import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(
  process.cwd(),
  "src/app/api/crm/quotes/process-reminders/route.ts",
);

const routeSource = readFileSync(ROUTE_PATH, "utf-8");

describe("em-b-2 / em-b-6 — crm/quotes/process-reminders sur resolver unifié", () => {
  it("importe resolveEmailTemplate", () => {
    expect(routeSource).toMatch(
      /import \{ resolveEmailTemplate \} from "@\/lib\/services\/email-template-resolver"/,
    );
  });

  it("post-cleanup em-b-6 : aucun flag USE_TEMPLATE_RESOLVER_QUOTES", () => {
    expect(routeSource).not.toMatch(/USE_TEMPLATE_RESOLVER_QUOTES/);
    expect(routeSource).not.toMatch(/const USE_RESOLVER\s*=/);
  });

  it("post-cleanup em-b-6 : aucune constante TEMPLATES", () => {
    expect(routeSource).not.toMatch(/const TEMPLATES = \{/);
  });

  it("post-cleanup em-b-6 : aucun fallback DB par `type`", () => {
    expect(routeSource).not.toMatch(/\.eq\("type", reminderTemplateKey\)/);
  });

  it("resolver appelé directement (supabase, reminderTemplateKey, quote.entity_id)", () => {
    expect(routeSource).toMatch(
      /resolveEmailTemplate\(\s*supabase,\s*reminderTemplateKey,\s*quote\.entity_id/,
    );
  });

  it("skip + push errors[] sur null (em-c-10 — aligné sur invoices)", () => {
    expect(routeSource).toMatch(/if \(!resolved\)/);
    expect(routeSource).toMatch(/errors\.push\([\s\S]{0,200}introuvable/);
    expect(routeSource).toMatch(/continue/);
  });

  it("variables enrichies couvrent reference, entreprise, prospect, date_echeance, date_validite_clause", () => {
    expect(routeSource).toMatch(/"\{\{reference\}\}": quote\.reference/);
    expect(routeSource).toMatch(/"\{\{entreprise\}\}": prospectName/);
    expect(routeSource).toMatch(/"\{\{prospect\}\}": prospectName/);
    expect(routeSource).toMatch(/"\{\{date_echeance\}\}"/);
    expect(routeSource).toMatch(/"\{\{date_validite_clause\}\}"/);
  });

  it("logique reminderType first/second/final inchangée", () => {
    expect(routeSource).toMatch(/reminderTemplateKey = "reminder_quote_first"/);
    expect(routeSource).toMatch(/reminderTemplateKey = "reminder_quote_second"/);
    expect(routeSource).toMatch(/reminderTemplateKey = "reminder_quote_final"/);
  });

  it("commentaire documente em-b-6 cleanup", () => {
    expect(routeSource).toMatch(/em-b-6/);
  });
});
