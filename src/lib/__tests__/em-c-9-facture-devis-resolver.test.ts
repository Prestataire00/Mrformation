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
  // Note : em-c-10 a remplacé les stubs (return null + pending_implementation)
  // par l'implémentation complète Puppeteer. Les tests stub correspondants
  // ont été supprimés — voir em-c-10-pdf-server-facture-devis.test.ts pour
  // les guardrails de l'implémentation finale.
  describe("Resolver email-attachments-resolver.ts (dispatch)", () => {
    it("dispatch facture vers resolveFacture(supabase, desc.payload.invoice_id)", () => {
      expect(resolverSource).toMatch(
        /if \(desc\.type === "facture"\)[\s\S]{0,200}?resolveFacture\(supabase, desc\.payload\.invoice_id,/,
      );
    });

    it("dispatch devis vers resolveDevis(supabase, desc.payload.quote_id)", () => {
      expect(resolverSource).toMatch(
        /if \(desc\.type === "devis"\)[\s\S]{0,200}?resolveDevis\(supabase, desc\.payload\.quote_id\)/,
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
