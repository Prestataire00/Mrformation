import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { advancePushStep } from "../abby-push";
import type { AbbyConnectionState } from "@/lib/types/abby";

// Frontières mockées : connexion (1.2-1.4), bloc client (2.2), wrappers ACL
// (Task 1). Les mappers restent RÉELS (purs) — les payloads Abby assertés
// ci-dessous sont donc ceux qui partiraient vraiment.
vi.mock("../abby-connections", () => ({
  getConnectionState: vi.fn(),
  withAbbyConnection: vi.fn(),
}));
vi.mock("../abby-customers", () => ({
  ensureCustomerForRecipient: vi.fn(),
}));
vi.mock("@/lib/abby/client", () => ({
  createAbbyClient: vi.fn(),
  getCompanyIdentity: vi.fn(),
  createDraftInvoice: vi.fn(),
  createAsset: vi.fn(),
  setInvoiceLines: vi.fn(),
  setInvoiceTimeline: vi.fn(),
  setInvoiceGeneralInformations: vi.fn(),
  setAssetGeneralInformations: vi.fn(),
  finalizeBilling: vi.fn(),
  readAbbyState: vi.fn(),
}));

import { getConnectionState, withAbbyConnection } from "../abby-connections";
import { ensureCustomerForRecipient } from "../abby-customers";
import {
  getCompanyIdentity,
  createDraftInvoice,
  createAsset,
  setInvoiceLines,
  setInvoiceTimeline,
  setInvoiceGeneralInformations,
  setAssetGeneralInformations,
  finalizeBilling,
  readAbbyState,
} from "@/lib/abby/client";

const getConnectionStateMock = vi.mocked(getConnectionState);
const withAbbyConnectionMock = vi.mocked(withAbbyConnection);
const ensureCustomerMock = vi.mocked(ensureCustomerForRecipient);
const getCompanyIdentityMock = vi.mocked(getCompanyIdentity);
const createDraftInvoiceMock = vi.mocked(createDraftInvoice);
const createAssetMock = vi.mocked(createAsset);
const setInvoiceLinesMock = vi.mocked(setInvoiceLines);
const setInvoiceTimelineMock = vi.mocked(setInvoiceTimeline);
const setInvoiceGeneralInformationsMock = vi.mocked(setInvoiceGeneralInformations);
const setAssetGeneralInformationsMock = vi.mocked(setAssetGeneralInformations);
const finalizeBillingMock = vi.mocked(finalizeBilling);
const readAbbyStateMock = vi.mocked(readAbbyState);

const ENTITY_ID = "ent-mr";
const INVOICE_ID = "inv-1";
const SIRET_MR = "91311329600036";

const BASE_INVOICE = {
  id: INVOICE_ID,
  reference: "FAC-2026-0007",
  external_reference: null,
  recipient_type: "company",
  recipient_id: "client-1",
  recipient_name: "ACME SAS",
  amount: 1200,
  status: "pending",
  is_avoir: false,
  invoice_date: "2026-07-18",
  due_date: null,
  abby_invoice_id: null,
  abby_push_state: null as string | null,
  abby_push_locked_at: null as string | null,
  abby_invoice_number: null,
  abby_state: null,
  abby_last_error: null,
  session: { title: "Formation sécurité", entity_id: ENTITY_ID },
};

const ENTITY_ROW = { name: "MR FORMATION", siret: SIRET_MR, tva_exempt: false, tva_rate: 20 };
const LINK_ROW = { abby_customer_id: "abby-cust-1", abby_customer_type: "organization" };
const LINE_ROWS = [{ description: "Jour 1", quantity: 1, unit_price: 1234.56 }];

interface UpdateCall {
  table: string;
  payload: Record<string, unknown>;
  filters: string[];
}

/** Mock supabase scripté : selects par table + file de résultats d'update
 * (dans l'ordre d'appel) ; tous les updates sont enregistrés avec leurs
 * filtres pour asserter CAS/checkpoints/rollback. */
function makeDb(opts: {
  invoice?: unknown;
  entity?: unknown;
  link?: unknown;
  lines?: unknown[];
  updateResults?: Array<{ rows: number; errorCode?: string }>;
} = {}) {
  const invoice = opts.invoice === undefined ? { ...BASE_INVOICE } : opts.invoice;
  const selectData: Record<string, unknown> = {
    formation_invoices: invoice,
    entities: opts.entity === undefined ? ENTITY_ROW : opts.entity,
    abby_customer_links: opts.link === undefined ? LINK_ROW : opts.link,
    formation_invoice_lines: opts.lines === undefined ? LINE_ROWS : opts.lines,
  };
  const updateQueue = [...(opts.updateResults ?? [])];
  const updates: UpdateCall[] = [];

  const from = vi.fn((table: string) => {
    const filters: string[] = [];
    let mode: "select" | "update" = "select";
    let payload: Record<string, unknown> = {};
    const builder: Record<string, unknown> = {};
    const chain = (name: string) => (...args: unknown[]) => {
      filters.push(`${name}:${args.map(String).join("|")}`);
      return builder;
    };
    const nextUpdateResult = () => {
      const r = updateQueue.shift() ?? { rows: 1 };
      updates.push({ table, payload, filters });
      if (r.errorCode) {
        return { data: null, error: { code: r.errorCode, message: "db error" } };
      }
      return { data: Array.from({ length: r.rows }, () => ({ id: INVOICE_ID })), error: null };
    };
    builder.select = vi.fn((sel: string) => {
      if (mode === "update") {
        filters.push(`select:${sel}`);
        return Promise.resolve(nextUpdateResult());
      }
      filters.push(`select:${sel}`);
      return builder;
    });
    builder.update = vi.fn((p: Record<string, unknown>) => {
      mode = "update";
      payload = p;
      return builder;
    });
    builder.eq = chain("eq");
    builder.is = chain("is");
    builder.or = chain("or");
    builder.order = chain("order");
    builder.maybeSingle = vi.fn(async () => ({ data: selectData[table], error: null }));
    builder.single = vi.fn(async () =>
      selectData[table] == null
        ? { data: null, error: { message: "not found" } }
        : { data: selectData[table], error: null }
    );
    // await direct : update sans .select() (rollback, recordStepError) ou
    // select de liste (lignes)
    builder.then = (resolve: (v: unknown) => unknown) =>
      resolve(
        mode === "update"
          ? (() => {
              updates.push({ table, payload, filters });
              return { data: null, error: null };
            })()
          : { data: selectData[table], error: null }
      );
    return builder;
  });

  return { supabase: { from } as unknown as SupabaseClient, updates, from };
}

function activeState(): AbbyConnectionState {
  return {
    status: "active",
    companyName: "MR FORMATION",
    companySiret: SIRET_MR,
    isActive: true,
    connectedAt: "2026-07-16T10:00:00Z",
    lastUsedAt: null,
    lastError: null,
    lastErrorAt: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getConnectionStateMock.mockResolvedValue({ ok: true, state: activeState() } as never);
  // withAbbyConnection : exécute fn avec un faux client, enveloppe { ok, data }
  withAbbyConnectionMock.mockImplementation(async (_sb, _ent, fn) => {
    try {
      const data = await fn({} as never);
      return { ok: true, data } as never;
    } catch (err) {
      return { ok: false, error: { message: "Abby injoignable", code: "abby_network" } } as never;
    }
  });
  getCompanyIdentityMock.mockResolvedValue({
    companyName: "MR FORMATION",
    companySiret: SIRET_MR,
    isInTestMode: true,
  });
  ensureCustomerMock.mockResolvedValue({
    ok: true,
    abbyCustomerId: "abby-cust-1",
    abbyCustomerType: "organization",
    created: true,
  } as never);
  createDraftInvoiceMock.mockResolvedValue({ id: "abby-inv-9" });
  createAssetMock.mockResolvedValue({ id: "abby-asset-1" });
  setInvoiceLinesMock.mockResolvedValue(undefined);
  setInvoiceTimelineMock.mockResolvedValue(undefined);
  setInvoiceGeneralInformationsMock.mockResolvedValue(undefined);
  setAssetGeneralInformationsMock.mockResolvedValue(undefined);
  finalizeBillingMock.mockResolvedValue(undefined);
  readAbbyStateMock.mockResolvedValue({ id: "abby-inv-9", number: "F-2026-0042", state: "finalized", paidAt: null, finalizedAt: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("gardes d'accès (avant toute étape)", () => {
  it("connexion non active (desactivee) → abby_invalid_state, aucune lecture facture", async () => {
    getConnectionStateMock.mockResolvedValue({
      ok: true,
      state: { ...activeState(), status: "desactivee", isActive: false },
    } as never);
    const { supabase, from } = makeDb();
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_invalid_state");
    expect(from).not.toHaveBeenCalledWith("formation_invoices");
  });

  it("facture introuvable (isolation entity_id) → abby_not_found", async () => {
    const { supabase } = makeDb({ invoice: null });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_not_found");
  });

  it("avoir dont la parente n'est PAS poussée-finalisée → abby_invalid_state (story 5.3)", async () => {
    const { supabase } = makeDb({
      invoice: {
        ...BASE_INVOICE,
        is_avoir: true,
        amount: -300,
        parent_invoice_id: "parent-1",
        parent: { abby_invoice_id: null, abby_invoice_number: null, reference: "FAC-2026-0007", abby_push_state: null },
      },
    });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_invalid_state");
  });

  it("facture annulée → abby_invalid_state (éligibilité re-vérifiée serveur)", async () => {
    const { supabase } = makeDb({ invoice: { ...BASE_INVOICE, status: "cancelled" } });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_invalid_state");
  });
});

describe("étape 1 (NULL → pushing) : acquisition + SIRET + ensureCustomer", () => {
  it("nominal : acquisition exclusive, getMe UNE fois, ensureCustomer câblé, état pushing", async () => {
    const { supabase, updates } = makeDb();
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res).toEqual({ ok: true, step: { state: "pushing", done: false } });
    expect(getCompanyIdentityMock).toHaveBeenCalledTimes(1);
    expect(ensureCustomerMock).toHaveBeenCalledWith(supabase, expect.anything(), ENTITY_ID, {
      type: "company",
      id: "client-1",
    });
    // acquisition : condition stricte IS NULL
    const acquire = updates[0];
    expect(acquire.payload.abby_push_state).toBe("pushing");
    expect(acquire.filters).toContain("is:abby_push_state|null");
  });

  it("verrou perdu (0 ligne) → 409, AUCUN appel Abby", async () => {
    const { supabase } = makeDb({ updateResults: [{ rows: 0 }] });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_invalid_state");
    expect(getCompanyIdentityMock).not.toHaveBeenCalled();
    expect(ensureCustomerMock).not.toHaveBeenCalled();
  });

  it("SIRET mismatch → rollback (gardé abby_invoice_id IS NULL) + les DEUX SIRET dans le message", async () => {
    getCompanyIdentityMock.mockResolvedValue({
      companyName: "AUTRE",
      companySiret: "98525216200021",
      isInTestMode: true,
    });
    const { supabase, updates } = makeDb();
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("abby_siret_mismatch");
      expect(res.error.message).toContain("98525216200021");
      expect(res.error.message).toContain(SIRET_MR);
    }
    const rollback = updates.find((u) => u.payload.abby_push_state === null);
    expect(rollback).toBeDefined();
    expect(rollback!.filters).toContain("eq:abby_push_state|pushing");
    expect(rollback!.filters).toContain("is:abby_invoice_id|null");
    expect(ensureCustomerMock).not.toHaveBeenCalled();
  });

  it("entities.siret NULL → erreur franche (jamais un mismatch avec attendu=null) + rollback", async () => {
    const { supabase, updates } = makeDb({ entity: { ...ENTITY_ROW, siret: null } });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toMatch(/SIRET de l'entité/);
    expect(updates.some((u) => u.payload.abby_push_state === null)).toBe(true);
    expect(getCompanyIdentityMock).not.toHaveBeenCalled();
  });

  it("ensureCustomer invalide (abby_validation + missingFields) → rollback + erreur forwardée", async () => {
    ensureCustomerMock.mockResolvedValue({
      ok: false,
      error: {
        message: "Compléter la fiche client : adresse.",
        code: "abby_validation",
        missingFields: ["adresse"],
      },
    } as never);
    const { supabase, updates } = makeDb();
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("abby_validation");
      expect(res.error.missingFields).toEqual(["adresse"]);
    }
    expect(updates.some((u) => u.payload.abby_push_state === null)).toBe(true);
  });
});

describe("étapes 2-5 : CAS, checkpoints, erreurs (mid-boucle : verrou FRAIS — la réconciliation 3.4 ne se déclenche pas)", () => {
  const LOCKED = new Date(Date.now() - 30_000).toISOString();

  it("étape 2 : re-stamp CAS (valeur lue dans le or) + brouillon + checkpoint draft_created", async () => {
    const { supabase, updates } = makeDb({
      invoice: { ...BASE_INVOICE, abby_push_state: "pushing", abby_push_locked_at: LOCKED },
    });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res).toEqual({ ok: true, step: { state: "draft_created", done: false } });
    // CAS : le or contient la valeur LUE
    const restamp = updates[0];
    expect(restamp.filters.join(" ")).toContain(`abby_push_locked_at.eq.${LOCKED}`);
    expect(restamp.filters).toContain("eq:abby_push_state|pushing");
    // checkpoint : id persisté + curseur + last_error effacé
    const cp = updates[1];
    expect(cp.payload).toMatchObject({
      abby_invoice_id: "abby-inv-9",
      abby_push_state: "draft_created",
      abby_last_error: null,
    });
    expect(cp.payload.abby_pushed_at).toBeDefined();
    expect(getCompanyIdentityMock).not.toHaveBeenCalled(); // getMe = étape 1 seule
  });

  it("étape 2 : CAS perdu (0 ligne) → 409, AUCUN brouillon créé (protège la seule étape non idempotente)", async () => {
    const { supabase } = makeDb({
      invoice: { ...BASE_INVOICE, abby_push_state: "pushing", abby_push_locked_at: LOCKED },
      updateResults: [{ rows: 0 }],
    });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_invalid_state");
    expect(createDraftInvoiceMock).not.toHaveBeenCalled();
  });

  it("étape 2 : liaison absente (incohérence) → erreur + abby_last_error écrit, curseur intact", async () => {
    const { supabase, updates } = makeDb({
      invoice: { ...BASE_INVOICE, abby_push_state: "pushing", abby_push_locked_at: LOCKED },
      link: null,
    });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    const errWrite = updates.find((u) => typeof u.payload.abby_last_error === "string");
    expect(errWrite).toBeDefined();
    expect(errWrite!.payload.abby_push_state).toBeUndefined();
  });

  it("étape 3 : lignes mappées RÉELLEMENT (centimes, service_delivery, FR_2000) + checkpoint lines_set", async () => {
    const { supabase, updates } = makeDb({
      invoice: {
        ...BASE_INVOICE,
        abby_push_state: "draft_created",
        abby_push_locked_at: LOCKED,
        abby_invoice_id: "abby-inv-9",
      },
    });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res).toEqual({ ok: true, step: { state: "lines_set", done: false } });
    expect(setInvoiceLinesMock).toHaveBeenCalledWith(expect.anything(), "abby-inv-9", [
      {
        designation: "Jour 1",
        unitPrice: 123456,
        quantity: 1,
        quantityUnit: "unit",
        type: "service_delivery",
        vatCode: "FR_2000",
        isTaxIncluded: false,
      },
    ]);
    expect(updates[1].payload).toMatchObject({ abby_push_state: "lines_set", abby_last_error: null });
  });

  it("étape 3 : sans lignes → repli parité préview (1 ligne titre session, |amount|)", async () => {
    const { supabase } = makeDb({
      invoice: {
        ...BASE_INVOICE,
        abby_push_state: "draft_created",
        abby_push_locked_at: LOCKED,
        abby_invoice_id: "abby-inv-9",
      },
      lines: [],
    });
    await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(setInvoiceLinesMock).toHaveBeenCalledWith(expect.anything(), "abby-inv-9", [
      expect.objectContaining({ designation: "Formation sécurité", unitPrice: 120000, quantity: 1 }),
    ]);
  });

  it("étape 3 : taux TVA hors enum → abby_validation, curseur intact", async () => {
    const { supabase, updates } = makeDb({
      invoice: {
        ...BASE_INVOICE,
        abby_push_state: "draft_created",
        abby_push_locked_at: LOCKED,
        abby_invoice_id: "abby-inv-9",
      },
      entity: { ...ENTITY_ROW, tva_rate: 19.6 },
    });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_validation");
    expect(setInvoiceLinesMock).not.toHaveBeenCalled();
    expect(updates.every((u) => u.payload.abby_push_state !== "lines_set")).toBe(true);
  });

  it("étape 3 : échec Abby → abby_last_error écrit, curseur INTACT (séparé de l'erreur, AD-6)", async () => {
    setInvoiceLinesMock.mockRejectedValue(Object.assign(new Error("down"), { status: 500 }));
    const { supabase, updates } = makeDb({
      invoice: {
        ...BASE_INVOICE,
        abby_push_state: "draft_created",
        abby_push_locked_at: LOCKED,
        abby_invoice_id: "abby-inv-9",
      },
    });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    const errWrite = updates.find((u) => typeof u.payload.abby_last_error === "string");
    expect(errWrite).toBeDefined();
    expect(updates.every((u) => u.payload.abby_push_state !== "lines_set")).toBe(true);
  });

  it("étape 4 : timeline (SECONDES) puis general-informations, UN SEUL checkpoint details_set", async () => {
    const { supabase, updates } = makeDb({
      invoice: {
        ...BASE_INVOICE,
        abby_push_state: "lines_set",
        abby_push_locked_at: LOCKED,
        abby_invoice_id: "abby-inv-9",
      },
    });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res).toEqual({ ok: true, step: { state: "details_set", done: false } });
    expect(setInvoiceTimelineMock).toHaveBeenCalledWith(expect.anything(), "abby-inv-9", {
      emittedAt: Math.floor(Date.parse("2026-07-18") / 1000),
      paymentDelay: "thirty_days",
    });
    // assujettie 20 % → body vide (pas de footerNote)
    expect(setInvoiceGeneralInformationsMock).toHaveBeenCalledWith(expect.anything(), "abby-inv-9", {});
    const checkpoints = updates.filter((u) => u.payload.abby_push_state === "details_set");
    expect(checkpoints).toHaveLength(1);
  });

  it("étape 4 : entité exonérée → footerNote QO-1 SANS vatMention", async () => {
    const { supabase } = makeDb({
      invoice: {
        ...BASE_INVOICE,
        abby_push_state: "lines_set",
        abby_push_locked_at: LOCKED,
        abby_invoice_id: "abby-inv-9",
      },
      entity: { ...ENTITY_ROW, tva_exempt: true },
    });
    await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(setInvoiceGeneralInformationsMock).toHaveBeenCalledWith(expect.anything(), "abby-inv-9", {
      footerNote: "TVA non applicable, article 261-4-4° du CGI.",
    });
  });

  it("étape 5 : finalize + relecture → checkpoint final (numéro, state relu, verrou NULL) + done", async () => {
    const { supabase, updates } = makeDb({
      invoice: {
        ...BASE_INVOICE,
        abby_push_state: "details_set",
        abby_push_locked_at: LOCKED,
        abby_invoice_id: "abby-inv-9",
      },
    });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res).toEqual({
      ok: true,
      step: { state: "finalized", done: true, abbyInvoiceNumber: "F-2026-0042" },
    });
    expect(finalizeBillingMock).toHaveBeenCalledWith(expect.anything(), "abby-inv-9");
    const cp = updates[1];
    expect(cp.payload).toMatchObject({
      abby_invoice_number: "F-2026-0042",
      abby_state: "finalized",
      abby_push_state: "finalized",
      abby_push_locked_at: null,
      abby_last_error: null,
    });
    expect(cp.payload.abby_finalized_at).toBeDefined();
  });

  it("état finalized : terminal idempotent — done sans AUCUN appel Abby ni update", async () => {
    const { supabase, updates } = makeDb({
      invoice: {
        ...BASE_INVOICE,
        abby_push_state: "finalized",
        abby_invoice_number: "F-2026-0042",
      },
    });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res).toEqual({
      ok: true,
      step: { state: "finalized", done: true, abbyInvoiceNumber: "F-2026-0042" },
    });
    expect(updates).toHaveLength(0);
    expect(finalizeBillingMock).not.toHaveBeenCalled();
  });
});

describe("chemins d'échec de checkpoint (review #351)", () => {
  const LOCKED = new Date(Date.now() - 30_000).toISOString();
  const PUSHING = { ...BASE_INVOICE, abby_push_state: "pushing", abby_push_locked_at: LOCKED };

  it("checkpoint 0 ligne (état écrasé entre-temps) → 409, jamais requalifié en doublon", async () => {
    const { supabase } = makeDb({
      invoice: PUSHING,
      updateResults: [{ rows: 1 }, { rows: 0 }], // restamp OK, checkpoint 0 ligne
    });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("abby_invalid_state");
      expect(res.error.message).not.toMatch(/existe déjà/);
    }
  });

  it("checkpoint 23505 (violation UNIQUE abby_invoice_id) → abby_duplicate, wording doublon", async () => {
    const { supabase } = makeDb({
      invoice: PUSHING,
      updateResults: [{ rows: 1 }, { rows: 1, errorCode: "23505" }],
    });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("abby_duplicate");
      expect(res.error.message).toMatch(/existe déjà/);
    }
  });

  it("checkpoint en erreur DB NON-unique (panne transitoire) → erreur générique, PAS le wording doublon", async () => {
    const { supabase } = makeDb({
      invoice: PUSHING,
      updateResults: [{ rows: 1 }, { rows: 1, errorCode: "57014" }], // timeout PG
    });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBeUndefined();
      expect(res.error.message).not.toMatch(/existe déjà/);
    }
  });
});

describe("run chaîné NULL → finalized (AC-2 : getMe UNE fois sur la saga entière)", () => {
  it("5 appels successifs : états dans l'ordre, getMe appelé exactement 1 fois au total", async () => {
    const invoice = { ...BASE_INVOICE };
    const { supabase, updates } = makeDb({ invoice });
    const states: string[] = [];

    for (let i = 0; i < 5; i++) {
      const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      states.push(res.step.state);
      // Simule la persistance DB : applique le dernier payload d'update
      // (checkpoint OU acquisition) sur la ligne mutable lue au prochain tour
      for (const u of updates.splice(0)) {
        if (u.table === "formation_invoices") Object.assign(invoice, u.payload);
      }
    }

    expect(states).toEqual(["pushing", "draft_created", "lines_set", "details_set", "finalized"]);
    expect(getCompanyIdentityMock).toHaveBeenCalledTimes(1);
    expect(createDraftInvoiceMock).toHaveBeenCalledTimes(1);
    expect(finalizeBillingMock).toHaveBeenCalledTimes(1);
    expect(invoice.abby_push_state).toBe("finalized");
    expect(invoice.abby_push_locked_at).toBeNull();
    expect(invoice.abby_invoice_number).toBe("F-2026-0042");
  });
});

describe("run AVOIR chaîné NULL → finalized (story 5.3, AD-23 : dispatch is_avoir)", () => {
  const AVOIR_INVOICE = {
    ...BASE_INVOICE,
    amount: -300,
    is_avoir: true,
    parent_invoice_id: "parent-1",
    // ⚠️ PostgREST renvoie l'embed self-ref en TABLEAU (vérifié prod 23/07) — le
    // fixture le reflète ; la saga doit normaliser (firstOrNull) sinon refus.
    parent: [
      {
        abby_invoice_id: "abby-parent-99",
        abby_invoice_number: "F-2026-0007",
        reference: "FAC-2026-0007",
        abby_push_state: "finalized",
      },
    ],
  };

  it("saga avoir : createAsset(parente), PAS d'ensureCustomer, PAS de timeline, getAsset, numéro AV-…", async () => {
    readAbbyStateMock.mockResolvedValue({ id: "abby-asset-1", number: "AV-2026-0001", state: "finalized", paidAt: null, finalizedAt: null });
    const invoice = { ...AVOIR_INVOICE };
    const { supabase, updates } = makeDb({ invoice });
    const states: string[] = [];

    for (let i = 0; i < 5; i++) {
      const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      states.push(res.step.state);
      for (const u of updates.splice(0)) {
        if (u.table === "formation_invoices") Object.assign(invoice, u.payload);
      }
    }

    expect(states).toEqual(["pushing", "draft_created", "lines_set", "details_set", "finalized"]);
    // Création via ASSET sur la parente, JAMAIS createDraftInvoice.
    expect(createAssetMock).toHaveBeenCalledTimes(1);
    expect(createAssetMock).toHaveBeenCalledWith(expect.anything(), "abby-parent-99");
    expect(createDraftInvoiceMock).not.toHaveBeenCalled();
    // Client hérité : ensureCustomer JAMAIS appelé (mais getMe SIRET oui, AD-5).
    expect(ensureCustomerMock).not.toHaveBeenCalled();
    expect(getCompanyIdentityMock).toHaveBeenCalledTimes(1);
    // Pas de timeline asset : uniquement setAssetGeneralInformations.
    expect(setInvoiceTimelineMock).not.toHaveBeenCalled();
    expect(setInvoiceGeneralInformationsMock).not.toHaveBeenCalled();
    expect(setAssetGeneralInformationsMock).toHaveBeenCalledTimes(1);
    // Relecture via getAsset (readAbbyState avec is_avoir=true).
    expect(readAbbyStateMock).toHaveBeenCalledWith(expect.anything(), "abby-asset-1", true);
    // L'assetId devient abby_invoice_id ; numéro AV-… stocké.
    expect(invoice.abby_invoice_id).toBe("abby-asset-1");
    expect(invoice.abby_invoice_number).toBe("AV-2026-0001");
  });

  it("reprise d'un avoir interrompu : réconciliation relit via getAsset (is_avoir=true), pas de recréation", async () => {
    readAbbyStateMock.mockResolvedValue({ id: "abby-asset-1", number: "AV-2026-0002", state: "finalized", paidAt: null, finalizedAt: null });
    const STALE = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { supabase } = makeDb({
      invoice: {
        ...AVOIR_INVOICE,
        abby_push_state: "draft_created",
        abby_push_locked_at: STALE,
        abby_invoice_id: "abby-asset-1",
      },
    });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res).toEqual({ ok: true, step: { state: "finalized", done: true, abbyInvoiceNumber: "AV-2026-0002" } });
    expect(readAbbyStateMock).toHaveBeenCalledWith(expect.anything(), "abby-asset-1", true);
    expect(createAssetMock).not.toHaveBeenCalled(); // JAMAIS de recréation d'avoir
  });
});

describe("réconciliation de reprise (story 3.4, AD-8)", () => {
  const STALE = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const INTERRUPTED = {
    ...BASE_INVOICE,
    abby_push_state: "draft_created",
    abby_push_locked_at: STALE,
    abby_invoice_id: "abby-inv-9",
  };

  it("déjà finalisée (numéro présent) → conclusion SANS écriture Abby, done avec numéro, garde SIRET exécutée", async () => {
    readAbbyStateMock.mockResolvedValue({ id: "abby-inv-9", number: "F-2026-0099", state: "finalized", paidAt: null, finalizedAt: null });
    const { supabase, updates } = makeDb({ invoice: INTERRUPTED });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res).toEqual({
      ok: true,
      step: { state: "finalized", done: true, abbyInvoiceNumber: "F-2026-0099" },
    });
    expect(finalizeBillingMock).not.toHaveBeenCalled();
    expect(setInvoiceLinesMock).not.toHaveBeenCalled();
    expect(getCompanyIdentityMock).toHaveBeenCalledTimes(1); // ré-acquisition = garde AD-5
    const cp = updates.find((u) => u.payload.abby_push_state === "finalized");
    expect(cp).toBeDefined();
    expect(cp!.filters).toContain("eq:abby_push_state|draft_created"); // conditionnel sur l'état LU
    expect(cp!.payload.abby_push_locked_at).toBeNull();
  });

  it("brouillon présent (pas de numéro) → la saga complète depuis le checkpoint (étape 3)", async () => {
    readAbbyStateMock.mockResolvedValue({ id: "abby-inv-9", number: null, state: "draft", paidAt: null, finalizedAt: null });
    const { supabase } = makeDb({ invoice: INTERRUPTED });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res).toEqual({ ok: true, step: { state: "lines_set", done: false } });
    expect(setInvoiceLinesMock).toHaveBeenCalled();
    expect(createDraftInvoiceMock).not.toHaveBeenCalled(); // JAMAIS de recréation
  });

  it("404 (brouillon disparu) → abby_draft_missing, rien n'avance", async () => {
    withAbbyConnectionMock.mockResolvedValueOnce({
      ok: false,
      error: { message: "introuvable", code: "abby_not_found" },
    } as never);
    const { supabase, updates } = makeDb({ invoice: INTERRUPTED });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_draft_missing");
    expect(updates).toHaveLength(0);
  });

  it("SIRET mismatch à la ré-acquisition → blocage franc (2 SIRET), aucune relecture ni avance", async () => {
    getCompanyIdentityMock.mockResolvedValue({
      companyName: "AUTRE",
      companySiret: "98525216200021",
      isInTestMode: true,
    });
    const { supabase, updates } = makeDb({ invoice: INTERRUPTED });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("abby_siret_mismatch");
      expect(res.error.message).toContain(SIRET_MR);
      expect(res.error.message).toContain("98525216200021");
    }
    expect(readAbbyStateMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("verrou FRAIS + id : PAS de réconciliation (mid-boucle — jamais de relecture)", async () => {
    const { supabase } = makeDb({
      invoice: { ...INTERRUPTED, abby_push_locked_at: new Date().toISOString() },
    });
    await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(getCompanyIdentityMock).not.toHaveBeenCalled();
    expect(readAbbyStateMock).not.toHaveBeenCalled();
  });

  it("annulée interrompue → refus (le verrou de contenu 3.5 n'existe pas encore)", async () => {
    const { supabase } = makeDb({ invoice: { ...INTERRUPTED, status: "cancelled" } });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_invalid_state");
    expect(getCompanyIdentityMock).not.toHaveBeenCalled();
  });

  it("interrompue à pushing SANS abby_invoice_id : pas de relecture, mais garde SIRET exécutée (AD-5), puis étape 2", async () => {
    const { supabase } = makeDb({
      invoice: { ...BASE_INVOICE, abby_push_state: "pushing", abby_push_locked_at: STALE, abby_invoice_id: null },
    });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res).toEqual({ ok: true, step: { state: "draft_created", done: false } });
    expect(readAbbyStateMock).not.toHaveBeenCalled();
    expect(getCompanyIdentityMock).toHaveBeenCalledTimes(1); // ré-acquisition = garde AD-5, même sans brouillon
  });

  it("interrompue à pushing SANS id + SIRET mismatch → blocage franc, la saga ne repart pas", async () => {
    getCompanyIdentityMock.mockResolvedValue({
      companyName: "AUTRE",
      companySiret: "98525216200021",
      isInTestMode: true,
    });
    const { supabase } = makeDb({
      invoice: { ...BASE_INVOICE, abby_push_state: "pushing", abby_push_locked_at: STALE, abby_invoice_id: null },
    });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_siret_mismatch");
    expect(createDraftInvoiceMock).not.toHaveBeenCalled();
  });

  it("number relu vide (\"\") → traité comme BROUILLON, jamais une fausse finalisation", async () => {
    // readAbbyState normalise "" → null (client.ts) ; on simule ici la
    // normalisation faite : number null → dispatch normal
    readAbbyStateMock.mockResolvedValue({ id: "abby-inv-9", number: null, state: "draft", paidAt: null, finalizedAt: null });
    const { supabase, updates } = makeDb({ invoice: INTERRUPTED });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(true);
    expect(updates.every((u) => u.payload.abby_push_state !== "finalized")).toBe(true);
  });
});

describe("repartir-de-zéro (story 3.4, AD-8 — unique effaceur)", () => {
  const STALE = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const INTERRUPTED = {
    ...BASE_INVOICE,
    abby_push_state: "draft_created",
    abby_push_locked_at: STALE,
    abby_invoice_id: "abby-inv-9",
  };

  it("404 re-confirmé + restartFromZero → UN update atomique (id effacé, CAS état+id LUS) puis pushing", async () => {
    withAbbyConnectionMock.mockResolvedValueOnce({
      ok: false,
      error: { message: "introuvable", code: "abby_not_found" },
    } as never);
    const { supabase, updates } = makeDb({ invoice: INTERRUPTED });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID, { restartFromZero: true });
    expect(res).toEqual({ ok: true, step: { state: "pushing", done: false } });
    expect(updates).toHaveLength(1);
    const restart = updates[0];
    expect(restart.payload).toMatchObject({
      abby_invoice_id: null,
      abby_push_state: "pushing",
      abby_last_error: null,
    });
    expect(restart.filters).toContain("eq:abby_push_state|draft_created");
    expect(restart.filters).toContain("eq:abby_invoice_id|abby-inv-9");
  });

  it("brouillon encore VIVANT + restartFromZero → refus (jamais d'effacement d'un brouillon existant)", async () => {
    readAbbyStateMock.mockResolvedValue({ id: "abby-inv-9", number: null, state: "draft", paidAt: null, finalizedAt: null });
    const { supabase, updates } = makeDb({ invoice: INTERRUPTED });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID, { restartFromZero: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_invalid_state");
    expect(updates).toHaveLength(0);
  });

  it("déjà finalisée + restartFromZero → conclusion (flag ignoré)", async () => {
    readAbbyStateMock.mockResolvedValue({ id: "abby-inv-9", number: "F-2026-0099", state: "finalized", paidAt: null, finalizedAt: null });
    const { supabase } = makeDb({ invoice: INTERRUPTED });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID, { restartFromZero: true });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.step.done).toBe(true);
  });

  it("restartFromZero hors reprise (état NULL ou verrou frais) → refus", async () => {
    const { supabase } = makeDb();
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID, { restartFromZero: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_invalid_state");

    const { supabase: sb2 } = makeDb({
      invoice: { ...INTERRUPTED, abby_push_locked_at: new Date().toISOString() },
    });
    const res2 = await advancePushStep(sb2, ENTITY_ID, INVOICE_ID, { restartFromZero: true });
    expect(res2.ok).toBe(false);
  });

  it("restart CAS perdu (0 ligne) → 409 propre", async () => {
    withAbbyConnectionMock.mockResolvedValueOnce({
      ok: false,
      error: { message: "introuvable", code: "abby_not_found" },
    } as never);
    const { supabase } = makeDb({ invoice: INTERRUPTED, updateResults: [{ rows: 0 }] });
    const res = await advancePushStep(supabase, ENTITY_ID, INVOICE_ID, { restartFromZero: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_invalid_state");
  });
});

describe("backoff 429 confiné à l'étape (AC-6)", () => {
  it("429 puis succès : 1 retry après 500 ms, l'étape aboutit", async () => {
    vi.useFakeTimers();
    const err429 = Object.assign(new Error("rate"), { status: 429 });
    createDraftInvoiceMock.mockRejectedValueOnce(err429).mockResolvedValueOnce({ id: "abby-inv-9" });
    const { supabase } = makeDb({
      invoice: { ...BASE_INVOICE, abby_push_state: "pushing", abby_push_locked_at: new Date().toISOString() },
    });
    const promise = advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    await vi.advanceTimersByTimeAsync(500);
    const res = await promise;
    expect(res.ok).toBe(true);
    expect(createDraftInvoiceMock).toHaveBeenCalledTimes(2);
  });

  it("429 persistant : abandon après 2 retries (jamais de retry silencieux au-delà)", async () => {
    vi.useFakeTimers();
    const err429 = Object.assign(new Error("rate"), { status: 429 });
    createDraftInvoiceMock.mockRejectedValue(err429);
    const { supabase } = makeDb({
      invoice: { ...BASE_INVOICE, abby_push_state: "pushing", abby_push_locked_at: new Date().toISOString() },
    });
    const promise = advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    await vi.advanceTimersByTimeAsync(2000);
    const res = await promise;
    expect(res.ok).toBe(false);
    expect(createDraftInvoiceMock).toHaveBeenCalledTimes(3); // initiale + 2 retries
  });
});
