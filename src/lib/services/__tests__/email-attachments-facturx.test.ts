import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Pièce jointe Factur-X (story 4.3, AD-15) : sur une facture poussée, le
// document OFFICIEL remplace le PDF interne — mais UNIQUEMENT dans le worker
// d'envoi (flag preferAbbyPdf), jamais dans /api/documents/generate.

vi.mock("@/lib/services/abby-status", () => ({
  getInvoicePdf: vi.fn(),
}));
// Le chemin jsPDF est coûteux et hors périmètre : on le mocke pour prouver
// qu'il est (ou n'est pas) emprunté.
vi.mock("@/lib/services/pdf-generator", () => ({
  generatePdfFromFragment: vi.fn(async () => ({ buffer: Buffer.from("JSPDF") })),
}));

import { resolveAttachments } from "../email-attachments-resolver";
import { getInvoicePdf } from "@/lib/services/abby-status";
import { generatePdfFromFragment } from "@/lib/services/pdf-generator";

const getInvoicePdfMock = vi.mocked(getInvoicePdf);
const generatePdfMock = vi.mocked(generatePdfFromFragment);

const INVOICE_ID = "inv-1";

function makeSupabase(invoice: unknown, lookupError: { message: string } | null = null) {
  return {
    from: vi.fn(() => {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      builder.order = vi.fn(() => builder);
      builder.maybeSingle = vi.fn(async () => ({
        data: lookupError ? null : invoice,
        error: lookupError,
      }));
      return builder;
    }),
  } as unknown as SupabaseClient;
}

const PUSHED = {
  entity_id: "ent-mr",
  abby_push_state: "finalized",
  abby_invoice_id: "abby-inv-9",
};

const DESCRIPTORS = [
  { type: "facture" as const, filename: "f.pdf", payload: { invoice_id: INVOICE_ID } },
];

beforeEach(() => {
  vi.clearAllMocks();
  getInvoicePdfMock.mockResolvedValue({
    ok: true,
    pdf: Buffer.from("%PDF-FACTURX"),
    filename: "facture-F-2026-0042.pdf",
  } as never);
});

describe("pièce jointe facture — chemin Factur-X (story 4.3)", () => {
  it("worker (preferAbbyPdf) + facture poussée → Factur-X joint, jsPDF JAMAIS appelé", async () => {
    const supabase = makeSupabase(PUSHED);
    const out = await resolveAttachments(supabase, DESCRIPTORS as never, {
      preferAbbyPdf: true,
    });
    expect(out).toHaveLength(1);
    expect(out[0].filename).toBe("facture-F-2026-0042.pdf");
    expect(out[0].content.toString()).toContain("FACTURX");
    expect(generatePdfMock).not.toHaveBeenCalled();
  });

  it("SANS le flag (documents/generate, user-scoped/trainer) → jamais d'appel Abby", async () => {
    const supabase = makeSupabase(PUSHED);
    await resolveAttachments(supabase, DESCRIPTORS as never);
    // AC-2bis : la surface existante n'emprunte pas le chemin Abby (RLS)
    expect(getInvoicePdfMock).not.toHaveBeenCalled();
  });

  it("facture NON poussée + flag → chemin jsPDF existant, comportement inchangé", async () => {
    const supabase = makeSupabase({ ...PUSHED, abby_push_state: null, abby_invoice_id: null });
    await resolveAttachments(supabase, DESCRIPTORS as never, { preferAbbyPdf: true });
    expect(getInvoicePdfMock).not.toHaveBeenCalled();
  });

  it("poussée + proxy en ÉCHEC → aucune PJ, JAMAIS de repli sur le PDF interne (AC-5)", async () => {
    getInvoicePdfMock.mockResolvedValue({
      ok: false,
      error: { message: "Abby injoignable", code: "abby_network" },
    } as never);
    const supabase = makeSupabase(PUSHED);
    const out = await resolveAttachments(supabase, DESCRIPTORS as never, {
      preferAbbyPdf: true,
    });
    expect(out).toHaveLength(0);
    expect(generatePdfMock).not.toHaveBeenCalled();
  });

  it("ERREUR de lecture facture → jamais de repli jsPDF (on ne SAIT pas si poussée — AC-5 strict)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const supabase = makeSupabase(null, { message: "db timeout" });
    const out = await resolveAttachments(supabase, DESCRIPTORS as never, {
      preferAbbyPdf: true,
    });
    expect(out).toHaveLength(0);
    expect(generatePdfMock).not.toHaveBeenCalled();
    const logged = logSpy.mock.calls.map((c) => String(c[0])).join(" ");
    expect(logged).toContain("invoice_lookup_error");
    logSpy.mockRestore();
  });

  it("poussée + connexion INACTIVE → log critique dédié (état durable ≠ panne)", async () => {
    getInvoicePdfMock.mockResolvedValue({
      ok: false,
      error: { message: "connexion inactive", code: "abby_connection_inactive" },
    } as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const supabase = makeSupabase(PUSHED);
    await resolveAttachments(supabase, DESCRIPTORS as never, { preferAbbyPdf: true });
    const logged = logSpy.mock.calls.map((c) => String(c[0])).join(" ");
    expect(logged).toContain("email_attachment_facturx_failed");
    expect(logged).toContain("critical");
    expect(logged).toContain("abby_connection_inactive");
    logSpy.mockRestore();
  });
});
