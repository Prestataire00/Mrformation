import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildInvoicePreview,
  computeInvoiceTotalsHT,
} from "../abby-invoice-preview";
import type { AbbyConnectionState } from "@/lib/types/abby";

// Frontières mockées : la résolution (testée en 2.1) et la connexion (1.2-1.4).
// La validation (pure, 2.2) reste RÉELLE — c'est elle qui produit missingFields.
vi.mock("../abby-connections", () => ({
  getConnectionState: vi.fn(),
  withAbbyConnection: vi.fn(),
}));
vi.mock("../abby-customers", () => ({
  resolveRecipient: vi.fn(),
  // Sentinelles AD-21 : la préview ne doit JAMAIS écrire — tout appel jette.
  persistCustomerLink: vi.fn(() => {
    throw new Error("SENTINELLE : persistCustomerLink appelé par la préview (AD-21 violé)");
  }),
  ensureCustomerForRecipient: vi.fn(() => {
    throw new Error("SENTINELLE : ensureCustomerForRecipient appelé par la préview (AD-21 violé)");
  }),
}));

import { getConnectionState, withAbbyConnection } from "../abby-connections";
import { resolveRecipient } from "../abby-customers";

const getConnectionStateMock = vi.mocked(getConnectionState);
const withAbbyConnectionMock = vi.mocked(withAbbyConnection);
const resolveRecipientMock = vi.mocked(resolveRecipient);

const ENTITY_ID = "ent-mr";
const INVOICE_ID = "inv-1";

function connectionState(status: AbbyConnectionState["status"]): AbbyConnectionState {
  return {
    status,
    companyName: "MR FORMATION",
    companySiret: "91311329600036",
    isActive: status === "active" || status === "en_erreur",
    connectedAt: status === "testee" || status === "non_configuree" ? null : "2026-07-16T10:00:00Z",
    lastUsedAt: null,
    lastError: status === "en_erreur" ? "boom" : null,
    lastErrorAt: null,
  };
}

const INVOICE_ROW = {
  id: INVOICE_ID,
  reference: "FAC-2026-0007",
  external_reference: null,
  recipient_type: "company",
  recipient_id: "client-1",
  recipient_name: "ACME SAS",
  amount: 1200,
  status: "pending",
  is_avoir: false,
  abby_push_state: null,
  abby_push_locked_at: null,
  abby_invoice_number: null,
  abby_state: null,
  abby_last_error: null,
  session: { title: "Formation sécurité", entity_id: ENTITY_ID },
};

const ENTITY_ROW = { name: "MR FORMATION", tva_exempt: false, tva_rate: 20 };

const LINE_ROWS = [
  { description: "Jour 1", quantity: 1, unit_price: 450 },
  { description: "Jours 2-3", quantity: 2, unit_price: 275 },
];

/**
 * Mock supabase multi-tables (pattern abby-customers.test.ts) : chaque table
 * a une réponse fixe ; le builder chaîne eq/order/maybeSingle/single.
 * `selects` capture le select string par table (test AD-18).
 */
function makeSupabase(overrides: {
  invoice?: unknown;
  lines?: unknown[];
  entity?: unknown;
} = {}) {
  const selects: Record<string, string> = {};
  const tables: Record<string, { data: unknown; error: null }> = {
    formation_invoices: {
      data: overrides.invoice === undefined ? INVOICE_ROW : overrides.invoice,
      error: null,
    },
    formation_invoice_lines: {
      data: overrides.lines === undefined ? LINE_ROWS : overrides.lines,
      error: null,
    },
    entities: {
      data: overrides.entity === undefined ? ENTITY_ROW : overrides.entity,
      error: null,
    },
  };
  const from = vi.fn((table: string) => {
    const result = tables[table] ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = vi.fn((sel: string) => {
      selects[table] = sel;
      return builder;
    });
    builder.eq = vi.fn(chain);
    builder.order = vi.fn(chain);
    builder.maybeSingle = vi.fn(async () => result);
    builder.single = vi.fn(async () =>
      result.data === null
        ? { data: null, error: { message: "not found" } }
        : result
    );
    // await direct du builder (liste de lignes sans maybeSingle)
    builder.then = (resolve: (v: unknown) => unknown) => resolve(result);
    return builder;
  });
  return { supabase: { from } as unknown as SupabaseClient, selects, from };
}

beforeEach(() => {
  vi.clearAllMocks();
  getConnectionStateMock.mockResolvedValue({
    ok: true,
    state: connectionState("active"),
  } as never);
  // withAbbyConnection exécute fn avec un faux client et enveloppe le résultat
  withAbbyConnectionMock.mockImplementation(async (_sb, _ent, fn) => {
    const data = await fn({} as never);
    return { ok: true, data } as never;
  });
  resolveRecipientMock.mockResolvedValue({
    ok: true,
    resolution: { outcome: "linked", abbyCustomerId: "abby-1", abbyCustomerType: "organization" },
  } as never);
});

describe("computeInvoiceTotalsHT — parité stricte avec invoice-pdf-export.ts", () => {
  it("vecteur nominal : 1×450 + 2×275, taux 20 → HT 1000, TVA 200, TTC 1200", () => {
    const t = computeInvoiceTotalsHT(
      [
        { quantity: 1, unitPriceHT: 450 },
        { quantity: 2, unitPriceHT: 275 },
      ],
      { vatExempt: false, tvaRate: 20 }
    );
    expect(t).toEqual({ totalHT: 1000, tvaAmount: 200, totalTTC: 1200 });
  });

  it("vecteur arrondi : 0.10 + 0.15, taux 5.5 → TVA 0.01 (round à 2 décimales, comme le PDF)", () => {
    const t = computeInvoiceTotalsHT(
      [
        { quantity: 1, unitPriceHT: 0.1 },
        { quantity: 1, unitPriceHT: 0.15 },
      ],
      { vatExempt: false, tvaRate: 5.5 }
    );
    // Math.round(0.25 × 0.055 × 100) / 100 = Math.round(1.375) / 100 = 0.01
    expect(t.tvaAmount).toBe(0.01);
    expect(t.totalTTC).toBe(0.26);
  });

  it("entité exonérée : taux 0, TVA 0, TTC = HT", () => {
    const t = computeInvoiceTotalsHT([{ quantity: 2, unitPriceHT: 500 }], {
      vatExempt: true,
      tvaRate: 20,
    });
    expect(t).toEqual({ totalHT: 1000, tvaAmount: 0, totalTTC: 1000 });
  });
});

describe("buildInvoicePreview — garde-fous d'accès (AC-1)", () => {
  it("connexion non active (desactivee) → abby_invalid_state, AUCUNE lecture facture", async () => {
    getConnectionStateMock.mockResolvedValue({
      ok: true,
      state: connectionState("desactivee"),
    } as never);
    const { supabase, from } = makeSupabase();
    const res = await buildInvoicePreview(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_invalid_state");
    expect(from).not.toHaveBeenCalledWith("formation_invoices");
  });

  it("facture introuvable (ou autre entité — filtre entity_id) → abby_not_found", async () => {
    const { supabase } = makeSupabase({ invoice: null });
    const res = await buildInvoicePreview(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_not_found");
  });

  it("facture déjà poussée → abby_invalid_state (re-vérification AD-13 côté serveur)", async () => {
    const { supabase } = makeSupabase({
      invoice: { ...INVOICE_ROW, abby_push_state: "draft_created" },
    });
    const res = await buildInvoicePreview(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_invalid_state");
  });

  it("avoir → abby_invalid_state (push avoir = story 5.3)", async () => {
    const { supabase } = makeSupabase({
      invoice: { ...INVOICE_ROW, is_avoir: true },
    });
    const res = await buildInvoicePreview(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_invalid_state");
  });

  it("le select facture utilise le fragment ABBY_INVOICE_SELECT + les 9 colonnes propres (AD-18)", async () => {
    const { supabase, selects } = makeSupabase();
    await buildInvoicePreview(supabase, ENTITY_ID, INVOICE_ID);
    const sel = selects.formation_invoices;
    for (const col of [
      "id", "reference", "external_reference", "recipient_type", "recipient_id",
      "recipient_name", "amount", "status", "is_avoir",
      "abby_push_state", "abby_push_locked_at", "abby_invoice_number", "abby_state", "abby_last_error",
    ]) {
      expect(sel).toContain(col);
    }
    expect(sel).toContain("sessions!inner");
  });
});

describe("buildInvoicePreview — contenu (AC-1/AC-2)", () => {
  it("nominal linked : preview complète, recipient.name = colonne facture, totaux parité PDF", async () => {
    const { supabase } = makeSupabase();
    const res = await buildInvoicePreview(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.preview).toEqual({
      invoice: { id: INVOICE_ID, displayRef: "FAC-2026-0007", isAvoir: false },
      entity: { name: "MR FORMATION" },
      recipient: { name: "ACME SAS", type: "company", outcome: "linked" },
      lines: [
        { description: "Jour 1", quantity: 1, unitPriceHT: 450, totalHT: 450 },
        { description: "Jours 2-3", quantity: 2, unitPriceHT: 275, totalHT: 550 },
      ],
      totals: {
        totalHT: 1000,
        vatExempt: false,
        tvaRate: 20,
        tvaAmount: 200,
        totalTTC: 1200,
        exonerationMention: null,
      },
    });
  });

  it("référence LORIS : displayRef = external_reference (règle invoiceDisplayRef)", async () => {
    const { supabase } = makeSupabase({
      invoice: { ...INVOICE_ROW, reference: "LORIS-2025-0001", external_reference: "FAC-25-42" },
    });
    const res = await buildInvoicePreview(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.preview.invoice.displayRef).toBe("FAC-25-42");
  });

  it("sans lignes : repli parité PDF — 1 ligne titre de session, PU = |amount|", async () => {
    const { supabase } = makeSupabase({ lines: [] });
    const res = await buildInvoicePreview(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.preview.lines).toEqual([
      { description: "Formation sécurité", quantity: 1, unitPriceHT: 1200, totalHT: 1200 },
    ]);
    expect(res.preview.totals.totalTTC).toBe(1440);
  });

  it("entité exonérée : mention QO-1 exacte, taux 0", async () => {
    const { supabase } = makeSupabase({
      entity: { name: "MR FORMATION", tva_exempt: true, tva_rate: 20 },
    });
    const res = await buildInvoicePreview(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.preview.totals).toMatchObject({
      vatExempt: true,
      tvaRate: 0,
      tvaAmount: 0,
      totalTTC: 1000,
      exonerationMention: "TVA non applicable, article 261-4-4° du CGI.",
    });
  });

  it("to_create valide : outcome to_create, et recipient.name = COLONNE facture (pas la résolution)", async () => {
    resolveRecipientMock.mockResolvedValue({
      ok: true,
      resolution: {
        outcome: "to_create",
        recipient: {
          // Nom VOLONTAIREMENT différent de la colonne facture : prouve que
          // l'affichage vient de formation_invoices.recipient_name (décision story)
          kind: "organization", name: "ACME SAS (fiche source)", siret: "12345678900011",
          email: null, address: "1 rue Test", postalCode: "13001", city: "Marseille",
        },
      },
    } as never);
    const { supabase } = makeSupabase();
    const res = await buildInvoicePreview(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.preview.recipient.outcome).toBe("to_create");
      expect(res.preview.recipient.name).toBe("ACME SAS");
    }
  });
});

describe("buildInvoicePreview — blocage validation (AC-3) et erreurs", () => {
  it("to_create invalide : abby_validation + missingFields + message actionnable, PAS de preview", async () => {
    resolveRecipientMock.mockResolvedValue({
      ok: true,
      resolution: {
        outcome: "to_create",
        recipient: { kind: "organization", name: "Importée", siret: "123", email: null },
      },
    } as never);
    const { supabase } = makeSupabase();
    const res = await buildInvoicePreview(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("abby_validation");
    expect(res.error.message).toMatch(/^Compléter la fiche client :/);
    expect(res.error.missingFields).toContain("SIRET (14 chiffres)");
    expect(res.error.missingFields).toContain("adresse");
  });

  it("linked : la validation ne bloque JAMAIS (périmètre to_create uniquement)", async () => {
    // linked avec une fiche qui SERAIT invalide — mais on ne la lit même pas
    const { supabase } = makeSupabase();
    const res = await buildInvoicePreview(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(true);
  });

  it("non_configuree → abby_invalid_state (le check getConnectionState précède withAbbyConnection)", async () => {
    getConnectionStateMock.mockResolvedValue({
      ok: true,
      state: connectionState("non_configuree"),
    } as never);
    const { supabase } = makeSupabase();
    const res = await buildInvoicePreview(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_invalid_state");
  });

  it("erreur SDK pendant la résolution (réseau) : code typé forwardé", async () => {
    withAbbyConnectionMock.mockResolvedValue({
      ok: false,
      error: { message: "Abby injoignable", code: "abby_network" },
    } as never);
    const { supabase } = makeSupabase();
    const res = await buildInvoicePreview(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_network");
  });

  it("erreur interne de resolveRecipient (enveloppe interne) forwardée", async () => {
    resolveRecipientMock.mockResolvedValue({
      ok: false,
      error: { message: "Une erreur interne est survenue" },
    } as never);
    const { supabase } = makeSupabase();
    const res = await buildInvoicePreview(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toBe("Une erreur interne est survenue");
  });
});
