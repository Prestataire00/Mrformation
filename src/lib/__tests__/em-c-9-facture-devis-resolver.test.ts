import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const RESOLVER_PATH = resolve(
  process.cwd(),
  "src/lib/services/email-attachments-resolver.ts",
);
const INVOICES_REMINDERS_PATH = resolve(
  process.cwd(),
  "src/app/api/invoices/process-reminders/route.ts",
);

const resolverSource = readFileSync(RESOLVER_PATH, "utf-8");
const invoicesReminders = readFileSync(INVOICES_REMINDERS_PATH, "utf-8");

describe("em-c-9 — Scaffold facture/devis (resolver + wiring invoices/process-reminders)", () => {
  describe("Resolver email-attachments-resolver.ts", () => {
    it("dispatch facture vers resolveFacture(supabase, desc.payload.invoice_id)", () => {
      expect(resolverSource).toMatch(
        /if \(desc\.type === "facture"\)[\s\S]{0,200}?resolveFacture\(supabase, desc\.payload\.invoice_id\)/,
      );
    });

    it("dispatch devis vers resolveDevis(supabase, desc.payload.quote_id)", () => {
      expect(resolverSource).toMatch(
        /if \(desc\.type === "devis"\)[\s\S]{0,200}?resolveDevis\(supabase, desc\.payload\.quote_id\)/,
      );
    });

    it("resolveFacture retourne null + log critical (gen PDF différée em-c-10)", () => {
      expect(resolverSource).toMatch(/async function resolveFacture/);
      expect(resolverSource).toMatch(
        /email_attachment_facture_pending_implementation/,
      );
      // Retourne null pour l'instant
      expect(resolverSource).toMatch(
        /resolveFacture[\s\S]{0,800}?return null;/,
      );
    });

    it("resolveDevis retourne null + log critical (gen PDF différée em-c-10)", () => {
      expect(resolverSource).toMatch(/async function resolveDevis/);
      expect(resolverSource).toMatch(
        /email_attachment_devis_pending_implementation/,
      );
      expect(resolverSource).toMatch(
        /resolveDevis[\s\S]{0,800}?return null;/,
      );
    });

    it("documente le scope em-c-9 vs em-c-10 (gen PDF non encore implémentée)", () => {
      expect(resolverSource).toMatch(/em-c-9/);
      expect(resolverSource).toMatch(/em-c-10/);
      expect(resolverSource).toMatch(
        /génération PDF[\s\S]{0,80}?non encore implémentée/i,
      );
    });
  });

  describe("Wiring invoices/process-reminders", () => {
    it("construit attachments depuis resolved.attachment_doc_types", () => {
      expect(invoicesReminders).toMatch(
        /const attachments: Array<\{ type: "facture"; payload: \{ invoice_id: string \} \}> = \[\]/,
      );
      expect(invoicesReminders).toMatch(
        /docTypes\.includes\("facture"\)[\s\S]{0,200}?attachments\.push\(\{[\s\S]{0,150}?type: "facture"[\s\S]{0,150}?payload: \{ invoice_id: invoice\.id \}/,
      );
    });

    it("passe attachments dans enqueueEmail si non vide", () => {
      expect(invoicesReminders).toMatch(
        /attachments: attachments\.length > 0 \? attachments : undefined/,
      );
    });

    it("commentaire documente le scope em-c-9 + référence em-c-10", () => {
      expect(invoicesReminders).toMatch(/em-c-9/);
      expect(invoicesReminders).toMatch(/em-c-10/);
    });
  });
});
