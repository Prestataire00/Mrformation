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
  setInvoiceLines: vi.fn(),
  setInvoiceTimeline: vi.fn(),
  setInvoiceGeneralInformations: vi.fn(),
  finalizeBilling: vi.fn(),
  getAbbyInvoice: vi.fn(),
}));

import { getConnectionState, withAbbyConnection } from "../abby-connections";
import { ensureCustomerForRecipient } from "../abby-customers";
import {
  getCompanyIdentity,
  createDraftInvoice,
  setInvoiceLines,
  setInvoiceTimeline,
  setInvoiceGeneralInformations,
  finalizeBilling,
  getAbbyInvoice,
} from "@/lib/abby/client";

const getConnectionStateMock = vi.mocked(getConnectionState);
const withAbbyConnectionMock = vi.mocked(withAbbyConnection);
const ensureCustomerMock = vi.mocked(ensureCustomerForRecipient);
const getCompanyIdentityMock = vi.mocked(getCompanyIdentity);
const createDraftInvoiceMock = vi.mocked(createDraftInvoice);
const setInvoiceLinesMock = vi.mocked(setInvoiceLines);
const setInvoiceTimelineMock = vi.mocked(setInvoiceTimeline);
const setInvoiceGeneralInformationsMock = vi.mocked(setInvoiceGeneralInformations);
const finalizeBillingMock = vi.mocked(finalizeBilling);
const getAbbyInvoiceMock = vi.mocked(getAbbyInvoice);

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
  setInvoiceLinesMock.mockResolvedValue(undefined);
  setInvoiceTimelineMock.mockResolvedValue(undefined);
  setInvoiceGeneralInformationsMock.mockResolvedValue(undefined);
  finalizeBillingMock.mockResolvedValue(undefined);
  getAbbyInvoiceMock.mockResolvedValue({ id: "abby-inv-9", number: "F-2026-0042", state: "finalized" });
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

  it("avoir → abby_invalid_state (dispatch avoir = story 5.3)", async () => {
    const { supabase } = makeDb({ invoice: { ...BASE_INVOICE, is_avoir: true } });
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

describe("étapes 2-5 : CAS, checkpoints, erreurs", () => {
  const LOCKED = "2026-07-19T10:00:00.000Z";

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

describe("backoff 429 confiné à l'étape (AC-6)", () => {
  it("429 puis succès : 1 retry après 500 ms, l'étape aboutit", async () => {
    vi.useFakeTimers();
    const err429 = Object.assign(new Error("rate"), { status: 429 });
    createDraftInvoiceMock.mockRejectedValueOnce(err429).mockResolvedValueOnce({ id: "abby-inv-9" });
    const { supabase } = makeDb({
      invoice: { ...BASE_INVOICE, abby_push_state: "pushing", abby_push_locked_at: "2026-07-19T10:00:00.000Z" },
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
      invoice: { ...BASE_INVOICE, abby_push_state: "pushing", abby_push_locked_at: "2026-07-19T10:00:00.000Z" },
    });
    const promise = advancePushStep(supabase, ENTITY_ID, INVOICE_ID);
    await vi.advanceTimersByTimeAsync(2000);
    const res = await promise;
    expect(res.ok).toBe(false);
    expect(createDraftInvoiceMock).toHaveBeenCalledTimes(3); // initiale + 2 retries
  });
});
