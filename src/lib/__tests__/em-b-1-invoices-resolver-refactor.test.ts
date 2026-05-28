import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(
  process.cwd(),
  "src/app/api/invoices/process-reminders/route.ts",
);

const routeSource = readFileSync(ROUTE_PATH, "utf-8");

describe("em-b-1 — Refactor invoices/process-reminders vers resolver", () => {
  it("importe resolveEmailTemplate depuis le service em-a-2", () => {
    expect(routeSource).toMatch(
      /import \{ resolveEmailTemplate \} from "@\/lib\/services\/email-template-resolver"/,
    );
  });

  it("lit le feature flag USE_TEMPLATE_RESOLVER_INVOICES", () => {
    expect(routeSource).toMatch(
      /const USE_RESOLVER = process\.env\.USE_TEMPLATE_RESOLVER_INVOICES === "true"/,
    );
  });

  it("path resolver : appelle resolveEmailTemplate(supabase, reminderTemplateKey, invoice.entity_id)", () => {
    expect(routeSource).toMatch(
      /if \(USE_RESOLVER\)[\s\S]+resolveEmailTemplate\([\s\S]+supabase[\s\S]+reminderTemplateKey[\s\S]+invoice\.entity_id/,
    );
  });

  it("path resolver : skip si retour null (le resolver log déjà email_template_missing)", () => {
    expect(routeSource).toMatch(
      /if \(!resolved\)[\s\S]+template[\s\S]+introuvable[\s\S]+continue/,
    );
  });

  it("path resolver : applique les variables via helper applyVars", () => {
    expect(routeSource).toMatch(/const applyVars = \(s: string\) =>/);
    expect(routeSource).toMatch(/subject = applyVars\(resolved\.subject\)/);
    expect(routeSource).toMatch(/textBody = applyVars\(resolved\.body\)/);
  });

  it("path legacy : DB lookup par `type` conservé (sera supprimé en em-b-6)", () => {
    expect(routeSource).toMatch(/} else {/);
    expect(routeSource).toMatch(
      /\.from\("email_templates"\)[\s\S]+\.eq\("type", reminderTemplateKey\)[\s\S]+\.maybeSingle/,
    );
  });

  it("path legacy : fallback REMINDER_TEMPLATES conservé", () => {
    expect(routeSource).toMatch(
      /const fallback = REMINDER_TEMPLATES\[reminderType\]/,
    );
  });

  it("REMINDER_TEMPLATES constante NON supprimée (cleanup en em-b-6)", () => {
    expect(routeSource).toMatch(/const REMINDER_TEMPLATES = \{/);
    expect(routeSource).toMatch(/first: \{/);
    expect(routeSource).toMatch(/second: \{/);
    expect(routeSource).toMatch(/final: \{/);
  });

  it("commentaire documente le feature flag + plan de cleanup", () => {
    expect(routeSource).toMatch(/Story em-b-1/);
    expect(routeSource).toMatch(/USE_TEMPLATE_RESOLVER_INVOICES/);
    expect(routeSource).toMatch(/em-b-6 cleanup/);
  });

  it("le try/catch enqueueEmail reste protégé par facture (pattern H6 conservé)", () => {
    // Vérifie que la logique reminder_count update est toujours dans le try
    expect(routeSource).toMatch(/try \{[\s\S]+enqueueEmail/);
    expect(routeSource).toMatch(/reminder_count: reminderCount \+ 1/);
  });

  it("logique reminderType / reminderTemplateKey inchangée (clés cohérentes avec seed em-a-3)", () => {
    expect(routeSource).toMatch(/reminderTemplateKey = "reminder_invoice_final"/);
    expect(routeSource).toMatch(/reminderTemplateKey = "reminder_invoice_second"/);
    expect(routeSource).toMatch(/reminderTemplateKey = "reminder_invoice_first"/);
  });
});
