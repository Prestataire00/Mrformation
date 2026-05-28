import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(
  process.cwd(),
  "src/app/api/invoices/process-reminders/route.ts",
);

const routeSource = readFileSync(ROUTE_PATH, "utf-8");

describe("em-b-1 / em-b-6 — invoices/process-reminders sur resolver unifié", () => {
  it("importe resolveEmailTemplate", () => {
    expect(routeSource).toMatch(
      /import \{ resolveEmailTemplate \} from "@\/lib\/services\/email-template-resolver"/,
    );
  });

  it("post-cleanup em-b-6 : aucun flag USE_TEMPLATE_RESOLVER_INVOICES", () => {
    expect(routeSource).not.toMatch(/USE_TEMPLATE_RESOLVER_INVOICES/);
    expect(routeSource).not.toMatch(/const USE_RESOLVER\s*=/);
  });

  it("post-cleanup em-b-6 : aucune constante REMINDER_TEMPLATES", () => {
    expect(routeSource).not.toMatch(/const REMINDER_TEMPLATES/);
  });

  it("post-cleanup em-b-6 : aucun fallback DB par `type`", () => {
    expect(routeSource).not.toMatch(/\.eq\("type", reminderTemplateKey\)/);
  });

  it("resolver appelé directement avec (supabase, reminderTemplateKey, invoice.entity_id)", () => {
    expect(routeSource).toMatch(
      /resolveEmailTemplate\(\s*supabase,\s*reminderTemplateKey,\s*invoice\.entity_id/,
    );
  });

  it("skip + log error sur null retour (le resolver log déjà email_template_missing)", () => {
    expect(routeSource).toMatch(/if \(!resolved\)/);
    expect(routeSource).toMatch(/introuvable[\s\S]{0,80}continue/);
  });

  it("applique les variables via applyVars factorisé", () => {
    expect(routeSource).toMatch(/const applyVars = \(s: string\) =>/);
    expect(routeSource).toMatch(/subject = applyVars\(resolved\.subject\)/);
    expect(routeSource).toMatch(/textBody = applyVars\(resolved\.body\)/);
  });

  it("pattern H6 try/catch enqueueEmail conservé", () => {
    expect(routeSource).toMatch(/try \{[\s\S]+?enqueueEmail/);
    expect(routeSource).toMatch(/reminder_count: reminderCount \+ 1/);
  });

  it("logique reminderTemplateKey first/second/final cohérente avec seed em-a-3", () => {
    expect(routeSource).toMatch(/reminderTemplateKey = "reminder_invoice_first"/);
    expect(routeSource).toMatch(/reminderTemplateKey = "reminder_invoice_second"/);
    expect(routeSource).toMatch(/reminderTemplateKey = "reminder_invoice_final"/);
  });

  it("commentaire documente em-b-6 cleanup", () => {
    expect(routeSource).toMatch(/em-b-6/);
  });
});
