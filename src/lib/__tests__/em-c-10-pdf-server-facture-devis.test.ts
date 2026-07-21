import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const RESOLVER_PATH = resolve(
  process.cwd(),
  "src/lib/services/email-attachments-resolver.ts",
);
const FACTURE_TEMPLATE_PATH = resolve(
  process.cwd(),
  "src/lib/templates/facture-email.ts",
);
const DEVIS_TEMPLATE_PATH = resolve(
  process.cwd(),
  "src/lib/templates/devis-email.ts",
);
const QUOTES_REMINDERS_PATH = resolve(
  process.cwd(),
  "src/app/api/crm/quotes/process-reminders/route.ts",
);

const resolverSource = readFileSync(RESOLVER_PATH, "utf-8");
const factureTemplate = readFileSync(FACTURE_TEMPLATE_PATH, "utf-8");
const devisTemplate = readFileSync(DEVIS_TEMPLATE_PATH, "utf-8");
const quotesReminders = readFileSync(QUOTES_REMINDERS_PATH, "utf-8");

describe("em-c-10 — Génération PDF serveur facture + devis (Puppeteer)", () => {
  describe("Template HTML facture (src/lib/templates/facture-email.ts)", () => {
    it("exporte FACTURE_HTML", () => {
      expect(factureTemplate).toMatch(/export const FACTURE_HTML/);
    });

    it("contient les variables Mustache critiques", () => {
      expect(factureTemplate).toMatch(/\{\{entity_name\}\}/);
      expect(factureTemplate).toMatch(/\{\{reference\}\}/);
      expect(factureTemplate).toMatch(/\{\{lines_rows_html\}\}/);
      expect(factureTemplate).toMatch(/\{\{total_ht_fr\}\}/);
      expect(factureTemplate).toMatch(/\{\{total_ttc_fr\}\}/);
      expect(factureTemplate).toMatch(/\{\{doc_title\}\}/);
      expect(factureTemplate).toMatch(/\{\{recipient_name\}\}/);
      expect(factureTemplate).toMatch(/\{\{mentions_legales_html\}\}/);
    });

    it("inclut une page A4 print-ready", () => {
      expect(factureTemplate).toMatch(/@page \{ size: A4/);
    });
  });

  describe("Template HTML devis (src/lib/templates/devis-email.ts)", () => {
    it("exporte DEVIS_HTML", () => {
      expect(devisTemplate).toMatch(/export const DEVIS_HTML/);
    });

    it("contient les variables Mustache critiques", () => {
      expect(devisTemplate).toMatch(/\{\{entity_name\}\}/);
      expect(devisTemplate).toMatch(/\{\{reference\}\}/);
      expect(devisTemplate).toMatch(/\{\{valid_until_fr\}\}/);
      expect(devisTemplate).toMatch(/\{\{lines_rows_html\}\}/);
      expect(devisTemplate).toMatch(/\{\{total_ttc_fr\}\}/);
      expect(devisTemplate).toMatch(/\{\{recipient_name\}\}/);
    });

    it("inclut une page A4 print-ready", () => {
      expect(devisTemplate).toMatch(/@page \{ size: A4/);
    });
  });

  describe("Resolver email-attachments-resolver.ts", () => {
    it("resolveFacture appelle generatePdfFromFragment avec le HTML rendu", () => {
      expect(resolverSource).toMatch(/async function resolveFacture/);
      expect(resolverSource).toMatch(
        /async function resolveFacture[\s\S]{0,2500}?await generatePdfFromFragment\(html, "Facture"\)/,
      );
    });

    it("resolveDevis appelle generatePdfFromFragment avec le HTML rendu", () => {
      expect(resolverSource).toMatch(/async function resolveDevis/);
      expect(resolverSource).toMatch(
        /async function resolveDevis[\s\S]{0,2500}?await generatePdfFromFragment\(html, "Devis"\)/,
      );
    });

    it("renderFactureHtml charge invoice + entity + session + lines via Supabase", () => {
      expect(resolverSource).toMatch(/async function renderFactureHtml/);
      expect(resolverSource).toMatch(
        /renderFactureHtml[\s\S]{0,2000}?from\("formation_invoices"\)/,
      );
      expect(resolverSource).toMatch(
        /renderFactureHtml[\s\S]{0,2000}?from\("entities"\)/,
      );
      expect(resolverSource).toMatch(
        /renderFactureHtml[\s\S]{0,2000}?from\("sessions"\)/,
      );
      expect(resolverSource).toMatch(
        /renderFactureHtml[\s\S]{0,2000}?from\("formation_invoice_lines"\)/,
      );
    });

    it("renderDevisHtml charge quote + entity + recipient (client OR prospect) + lines", () => {
      expect(resolverSource).toMatch(/async function renderDevisHtml/);
      expect(resolverSource).toMatch(
        /renderDevisHtml[\s\S]{0,2000}?from\("crm_quotes"\)/,
      );
      expect(resolverSource).toMatch(
        /renderDevisHtml[\s\S]{0,2500}?from\("crm_quote_lines"\)/,
      );
      // Branchement client OR prospect
      expect(resolverSource).toMatch(
        /renderDevisHtml[\s\S]{0,2500}?from\("clients"\)[\s\S]{0,500}?from\("crm_prospects"\)/,
      );
    });

    it("substituteVars remplace {{var}} (Mustache simple)", () => {
      expect(resolverSource).toMatch(/function substituteVars/);
      expect(resolverSource).toMatch(/replaceAll\(`\{\{\$\{k\}\}\}`/);
    });

    it("calcule TVA et totaux (HT, TVA, TTC) côté serveur", () => {
      // tvaExempt → 0, sinon tvaRate
      expect(resolverSource).toMatch(/tvaExempt[\s\S]{0,200}?tvaRate/);
      expect(resolverSource).toMatch(/totalHT \+ tvaAmount/);
    });

    it("defaults safe : champs entity manquants ne crashent pas (chaines vides)", () => {
      expect(resolverSource).toMatch(/function safeStr/);
      expect(resolverSource).toMatch(/safeStr\(e\.address\)/);
      expect(resolverSource).toMatch(/safeStr\(e\.siret\)/);
    });

    it("échappe le HTML utilisateur pour éviter injection", () => {
      expect(resolverSource).toMatch(/function htmlEscape/);
      expect(resolverSource).toMatch(/htmlEscape\(safeStr\(invoice\.recipient_name\)\)/);
    });

    it("log structuré email_attachment_facture_generated avec latency_ms + size_bytes", () => {
      expect(resolverSource).toMatch(/event: "email_attachment_facture_generated"/);
      expect(resolverSource).toMatch(/latency_ms:/);
      expect(resolverSource).toMatch(/size_bytes:/);
    });

    it("log structuré email_attachment_devis_generated avec latency_ms + size_bytes", () => {
      expect(resolverSource).toMatch(/event: "email_attachment_devis_generated"/);
    });

    it("ne log plus les pending_implementation (em-c-9 stub supprimé)", () => {
      expect(resolverSource).not.toMatch(
        /email_attachment_facture_pending_implementation/,
      );
      expect(resolverSource).not.toMatch(
        /email_attachment_devis_pending_implementation/,
      );
    });

    it("retourne null + log critical en cas d'erreur génération PDF", () => {
      expect(resolverSource).toMatch(
        /email_attachment_facture_generation_failed[\s\S]{0,200}?level: "critical"/,
      );
      expect(resolverSource).toMatch(
        /email_attachment_devis_generation_failed[\s\S]{0,200}?level: "critical"/,
      );
    });
  });

  describe("Refactor crm/quotes/process-reminders vers enqueueEmail", () => {
    it("importe enqueueEmail (plus de Resend direct dans la queue)", () => {
      expect(quotesReminders).toMatch(
        /import \{ enqueueEmail \} from "@\/lib\/services\/email-queue"/,
      );
    });

    it("ne fait plus d'appel resend.emails.send", () => {
      expect(quotesReminders).not.toMatch(/resend\.emails\.send/);
    });

    it("ne fait plus d'insert direct sur email_history (enqueueEmail s'en charge)", () => {
      expect(quotesReminders).not.toMatch(/from\("email_history"\)/);
    });

    it("construit attachments depuis resolved.attachment_doc_types pour devis", () => {
      expect(quotesReminders).toMatch(
        /const attachments: Array<\{ type: "devis"; payload: \{ quote_id: string \} \}> = \[\]/,
      );
      expect(quotesReminders).toMatch(
        /docTypes\.includes\("devis"\)[\s\S]{0,300}?attachments\.push\(\{[\s\S]{0,150}?type: "devis"[\s\S]{0,150}?payload: \{ quote_id: quote\.id \}/,
      );
    });

    it("passe attachments dans enqueueEmail si non vide", () => {
      expect(quotesReminders).toMatch(
        /attachments: attachments\.length > 0 \? attachments : undefined/,
      );
    });

    it("n'incrémente pas reminder_count si l'enqueue échoue (try/catch par devis)", () => {
      expect(quotesReminders).toMatch(
        /enqueueEmail\(supabase[\s\S]{0,500}?reminder_count: reminderCount \+ 1[\s\S]{0,500}?catch \(enqueueErr/,
      );
    });

    it("commentaire documente la migration em-c-10", () => {
      expect(quotesReminders).toMatch(/em-c-10/);
    });
  });
});
