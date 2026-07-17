import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// L'ACL est mockée : le SDK n'est jamais chargé ici (AD-2)
const searchOrganizationsMock =
  vi.fn<(client: unknown, name: string) => Promise<unknown>>();
const createOrganizationCustomerMock =
  vi.fn<(client: unknown, dto: unknown) => Promise<{ id: string }>>();
const createContactCustomerMock =
  vi.fn<(client: unknown, dto: unknown) => Promise<{ id: string }>>();

vi.mock("@/lib/abby/client", () => ({
  searchOrganizations: (client: unknown, name: string) =>
    searchOrganizationsMock(client, name),
  createOrganizationCustomer: (client: unknown, dto: unknown) =>
    createOrganizationCustomerMock(client, dto),
  createContactCustomer: (client: unknown, dto: unknown) =>
    createContactCustomerMock(client, dto),
}));

import {
  readRecipient,
  resolveRecipient,
  persistCustomerLink,
  ensureCustomerForRecipient,
} from "../abby-customers";
import type { createAbbyClient } from "@/lib/abby/client";

const ENTITY_ID = "11111111-1111-1111-1111-111111111111";
const AUTRE_ENTITE = "22222222-2222-2222-2222-222222222222";
const SIRET_ACME = "12345678900011";
// Client Abby factice — resolveRecipient ne doit JAMAIS y toucher directement
// (la recherche passe par l'ACL mockée) : tout accès direct jette
const ABBY_CLIENT = new Proxy(
  {},
  {
    get(_t, prop) {
      throw new Error(
        `resolveRecipient ne doit pas toucher le client Abby directement (accès à ${String(prop)})`
      );
    },
  }
) as unknown as ReturnType<typeof createAbbyClient>;

// ---------------------------------------------------------------------------
// Mock Supabase multi-tables (dispatch sur le nom — pattern abby-connections)
// ---------------------------------------------------------------------------

type Row = Record<string, unknown> | null;

function makeSupabaseMock(
  opts: {
    link?: Row;
    client?: Row;
    learner?: Row;
    financier?: Row;
    contact?: Row;
  } = {}
) {
  const calls = {
    upsert: vi.fn<
      (
        payload: Record<string, unknown>,
        options?: Record<string, unknown>
      ) => Promise<{ error: null }>
    >(async () => ({ error: null })),
    selectEq: vi.fn<(table: string, col: string, val: unknown) => void>(),
    tablesRead: vi.fn<(table: string) => void>(),
  };

  const rowFor = (table: string): Row => {
    if (table === "abby_customer_links") return opts.link ?? null;
    if (table === "clients") return opts.client ?? null;
    if (table === "learners") return opts.learner ?? null;
    if (table === "formation_financiers") return opts.financier ?? null;
    if (table === "contacts") return opts.contact ?? null;
    return null;
  };
  const orderCalls = vi.fn<(table: string, col: string, opts: unknown) => void>();

  const from = vi.fn((table: string) => {
    calls.tablesRead(table);
    return {
      select: vi.fn(() => {
        const chain = {
          eq: (col: string, val: unknown) => {
            calls.selectEq(table, col, val);
            return chain;
          },
          order: (col: string, o: unknown) => {
            orderCalls(table, col, o);
            return chain;
          },
          limit: () => chain,
          maybeSingle: async () => ({ data: rowFor(table), error: null }),
        };
        return chain;
      }),
      upsert: (
        payload: Record<string, unknown>,
        options?: Record<string, unknown>
      ) => calls.upsert(payload, options),
    };
  });

  return {
    supabase: { from } as unknown as SupabaseClient,
    from,
    calls,
    orderCalls,
  };
}

beforeEach(() => {
  searchOrganizationsMock.mockReset();
});

// ---------------------------------------------------------------------------

describe("readRecipient — lecture normalisée du destinataire polymorphe", () => {
  it("company : lit clients et normalise (organization, siret, adresse)", async () => {
    const { supabase } = makeSupabaseMock({
      client: {
        entity_id: ENTITY_ID,
        company_name: "ACME SAS",
        siret: SIRET_ACME,
        address: "1 rue du Test",
        postal_code: "13001",
        city: "Marseille",
      },
    });
    const res = await readRecipient(supabase, ENTITY_ID, "company", "c1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.recipient.kind).toBe("organization");
      expect(res.recipient.name).toBe("ACME SAS");
      expect(res.recipient.siret).toBe(SIRET_ACME);
      expect(res.recipient.city).toBe("Marseille");
      expect(res.recipient.email).toBeNull(); // clients n'a pas d'email (2.2 tranchera)
    }
  });

  it("learner : lit learners et normalise en contact (prénom/nom/email)", async () => {
    const { supabase } = makeSupabaseMock({
      learner: {
        entity_id: ENTITY_ID,
        first_name: "Marie",
        last_name: "Dupont",
        email: "marie@exemple.fr",
      },
    });
    const res = await readRecipient(supabase, ENTITY_ID, "learner", "l1");
    if (res.ok) {
      expect(res.recipient.kind).toBe("contact");
      expect(res.recipient.firstName).toBe("Marie");
      expect(res.recipient.name).toBe("Marie Dupont");
      expect(res.recipient.siret).toBeNull();
    }
  });

  it("financier : lit formation_financiers (PAS financeurs), isolation via la session, email via la FK", async () => {
    const { supabase, calls } = makeSupabaseMock({
      financier: {
        name: "OPCO Atlas",
        type: "opco",
        financeur: { email: "contact@opco.fr" },
        session: { entity_id: ENTITY_ID },
      },
    });
    const res = await readRecipient(supabase, ENTITY_ID, "financier", "ff1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.recipient.kind).toBe("organization");
      expect(res.recipient.name).toBe("OPCO Atlas");
      expect(res.recipient.siret).toBeNull(); // pas de SIRET dans le LMS
      expect(res.recipient.email).toBe("contact@opco.fr");
    }
    expect(calls.tablesRead).toHaveBeenCalledWith("formation_financiers");
    expect(calls.tablesRead).not.toHaveBeenCalledWith("financeurs");
  });

  it("fiche non rattachée (recipient_id aléatoire des imports LORIS) : erreur dédiée — cas NOMINAL", async () => {
    const { supabase } = makeSupabaseMock({ client: null });
    const res = await readRecipient(supabase, ENTITY_ID, "company", "uuid-aleatoire");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toMatch(/non rattachée/i);
  });

  it("destinataire d'une AUTRE entité : erreur d'isolation distincte", async () => {
    const { supabase } = makeSupabaseMock({
      client: { entity_id: AUTRE_ENTITE, company_name: "Intruse", siret: null },
    });
    const res = await readRecipient(supabase, ENTITY_ID, "company", "c-intruse");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toMatch(/entité/i);
  });

  it("financier d'une autre entité (via session) : erreur d'isolation", async () => {
    const { supabase } = makeSupabaseMock({
      financier: { name: "X", type: "opco", financeur: null, session: { entity_id: AUTRE_ENTITE } },
    });
    const res = await readRecipient(supabase, ENTITY_ID, "financier", "ff2");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toMatch(/entité/i);
  });
});

describe("resolveRecipient — les trois issues, sans jamais écrire (AD-10/AD-21)", () => {
  it("liaison existante : linked, AUCUNE lecture de fiche ni recherche Abby (FR-5)", async () => {
    const { supabase, calls } = makeSupabaseMock({
      link: { abby_customer_id: "abby-42", abby_customer_type: "organization" },
    });
    const res = await resolveRecipient(supabase, ABBY_CLIENT, ENTITY_ID, {
      type: "company",
      id: "c1",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.resolution.outcome).toBe("linked");
      if (res.resolution.outcome === "linked") {
        expect(res.resolution.abbyCustomerId).toBe("abby-42");
      }
    }
    expect(searchOrganizationsMock).not.toHaveBeenCalled();
    expect(calls.tablesRead).not.toHaveBeenCalledWith("clients");
  });

  it("company avec SIRET + organization Abby au SIRET identique : auto_linkable (FR-6)", async () => {
    searchOrganizationsMock.mockResolvedValue([
      { id: "abby-1", name: "ACME homonyme", siret: "99999999999999" },
      { id: "abby-2", name: "ACME SAS", siret: SIRET_ACME },
    ]);
    const { supabase } = makeSupabaseMock({
      client: { entity_id: ENTITY_ID, company_name: "ACME SAS", siret: SIRET_ACME },
    });
    const res = await resolveRecipient(supabase, ABBY_CLIENT, ENTITY_ID, {
      type: "company",
      id: "c1",
    });
    if (res.ok && res.resolution.outcome === "auto_linkable") {
      expect(res.resolution.abbyCustomerId).toBe("abby-2");
      expect(res.resolution.abbyCustomerType).toBe("organization");
    } else {
      expect.fail(`attendu auto_linkable, reçu ${JSON.stringify(res)}`);
    }
  });

  it("comparaison SIRET normalisée des deux côtés (espaces des imports)", async () => {
    searchOrganizationsMock.mockResolvedValue([
      { id: "abby-3", name: "ACME", siret: "123 456 789 00011" },
    ]);
    const { supabase } = makeSupabaseMock({
      client: { entity_id: ENTITY_ID, company_name: "ACME", siret: "12345678900011" },
    });
    const res = await resolveRecipient(supabase, ABBY_CLIENT, ENTITY_ID, {
      type: "company",
      id: "c1",
    });
    if (res.ok) expect(res.resolution.outcome).toBe("auto_linkable");
  });

  it("correspondance sur NOM SEUL (SIRET différent) : to_create quand même (FR-6)", async () => {
    searchOrganizationsMock.mockResolvedValue([
      { id: "abby-9", name: "ACME SAS", siret: "88888888800088" },
    ]);
    const { supabase } = makeSupabaseMock({
      client: { entity_id: ENTITY_ID, company_name: "ACME SAS", siret: SIRET_ACME },
    });
    const res = await resolveRecipient(supabase, ABBY_CLIENT, ENTITY_ID, {
      type: "company",
      id: "c1",
    });
    if (res.ok) expect(res.resolution.outcome).toBe("to_create");
  });

  it("learner : to_create direct SANS recherche Abby (dérogation AD-10 assumée)", async () => {
    const { supabase } = makeSupabaseMock({
      learner: { entity_id: ENTITY_ID, first_name: "A", last_name: "B", email: null },
    });
    const res = await resolveRecipient(supabase, ABBY_CLIENT, ENTITY_ID, {
      type: "learner",
      id: "l1",
    });
    if (res.ok) expect(res.resolution.outcome).toBe("to_create");
    expect(searchOrganizationsMock).not.toHaveBeenCalled();
  });

  it("financier (jamais de SIRET) : to_create direct sans recherche", async () => {
    const { supabase } = makeSupabaseMock({
      financier: { name: "OPCO", type: "opco", financeur: null, session: { entity_id: ENTITY_ID } },
    });
    const res = await resolveRecipient(supabase, ABBY_CLIENT, ENTITY_ID, {
      type: "financier",
      id: "ff1",
    });
    if (res.ok) expect(res.resolution.outcome).toBe("to_create");
    expect(searchOrganizationsMock).not.toHaveBeenCalled();
  });

  it("SIRET non plausible (tronqué ou tout-zéros) : to_create SANS recherche — jamais d'auto-liaison sur du junk d'import", async () => {
    for (const junk of ["1234567", "00000000000000"]) {
      searchOrganizationsMock.mockClear();
      const { supabase } = makeSupabaseMock({
        client: { entity_id: ENTITY_ID, company_name: "Importée", siret: junk },
      });
      const res = await resolveRecipient(supabase, ABBY_CLIENT, ENTITY_ID, {
        type: "company",
        id: "c1",
      });
      if (res.ok) expect(res.resolution.outcome).toBe("to_create");
      expect(searchOrganizationsMock).not.toHaveBeenCalled();
    }
  });

  it("company SANS siret : to_create direct sans recherche", async () => {
    const { supabase } = makeSupabaseMock({
      client: { entity_id: ENTITY_ID, company_name: "Sans Siret", siret: null },
    });
    const res = await resolveRecipient(supabase, ABBY_CLIENT, ENTITY_ID, {
      type: "company",
      id: "c1",
    });
    if (res.ok) expect(res.resolution.outcome).toBe("to_create");
    expect(searchOrganizationsMock).not.toHaveBeenCalled();
  });
});

describe("persistCustomerLink — unique écrivain de la liaison (saga uniquement)", () => {
  it("upsert sur la clé composite (entité, type, id)", async () => {
    const { supabase, calls } = makeSupabaseMock();
    const res = await persistCustomerLink(
      supabase,
      ENTITY_ID,
      { type: "company", id: "c1" },
      "abby-42",
      "organization"
    );
    expect(res.ok).toBe(true);
    const [payload, options] = calls.upsert.mock.calls[0];
    expect(payload).toMatchObject({
      entity_id: ENTITY_ID,
      recipient_type: "company",
      recipient_id: "c1",
      abby_customer_id: "abby-42",
      abby_customer_type: "organization",
    });
    expect(options).toMatchObject({
      onConflict: "entity_id,recipient_type,recipient_id",
    });
  });
});

describe("readRecipient(company) — email du contact principal (décision 2.2)", () => {
  it("lit l'email du contact principal avec tri is_primary nullsFirst:false", async () => {
    const { supabase, orderCalls } = makeSupabaseMock({
      client: { entity_id: ENTITY_ID, company_name: "ACME", siret: SIRET_ACME },
      contact: { email: "principal@acme.fr" },
    });
    const res = await readRecipient(supabase, ENTITY_ID, "company", "c1");
    if (res.ok) expect(res.recipient.email).toBe("principal@acme.fr");
    expect(orderCalls).toHaveBeenCalledWith(
      "contacts",
      "is_primary",
      expect.objectContaining({ ascending: false, nullsFirst: false })
    );
  });

  it("aucun contact : email null (emails sera omis à la création)", async () => {
    const { supabase } = makeSupabaseMock({
      client: { entity_id: ENTITY_ID, company_name: "ACME", siret: SIRET_ACME },
      contact: null,
    });
    const res = await readRecipient(supabase, ENTITY_ID, "company", "c1");
    if (res.ok) expect(res.recipient.email).toBeNull();
  });
});

describe("ensureCustomerForRecipient — étape 1 de saga (ÉCRIT — réservé 3.3)", () => {
  const COMPANY_OK = {
    entity_id: ENTITY_ID,
    company_name: "ACME SAS",
    siret: SIRET_ACME,
    address: "1 rue du Test",
    postal_code: "13001",
    city: "Marseille",
  };

  beforeEach(() => {
    createOrganizationCustomerMock.mockReset();
    createContactCustomerMock.mockReset();
  });

  it("linked : retour direct, AUCUNE écriture (ni création ni liaison)", async () => {
    const { supabase, calls } = makeSupabaseMock({
      link: { abby_customer_id: "abby-42", abby_customer_type: "organization" },
    });
    const res = await ensureCustomerForRecipient(supabase, ABBY_CLIENT, ENTITY_ID, {
      type: "company",
      id: "c1",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.abbyCustomerId).toBe("abby-42");
      expect(res.created).toBe(false);
    }
    expect(createOrganizationCustomerMock).not.toHaveBeenCalled();
    expect(calls.upsert).not.toHaveBeenCalled();
  });

  it("auto_linkable : persiste la liaison SANS création", async () => {
    searchOrganizationsMock.mockResolvedValue([
      { id: "abby-7", name: "ACME SAS", siret: SIRET_ACME },
    ]);
    const { supabase, calls } = makeSupabaseMock({ client: COMPANY_OK });
    const res = await ensureCustomerForRecipient(supabase, ABBY_CLIENT, ENTITY_ID, {
      type: "company",
      id: "c1",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.abbyCustomerId).toBe("abby-7");
      expect(res.created).toBe(false);
    }
    expect(createOrganizationCustomerMock).not.toHaveBeenCalled();
    expect(calls.upsert).toHaveBeenCalledTimes(1);
    expect(calls.upsert.mock.calls[0][0]).toMatchObject({ abby_customer_id: "abby-7" });
  });

  it("to_create valide : crée l'organization (payload mappé) puis persiste la liaison", async () => {
    searchOrganizationsMock.mockResolvedValue([]);
    createOrganizationCustomerMock.mockResolvedValue({ id: "abby-neuf" });
    const { supabase, calls } = makeSupabaseMock({ client: COMPANY_OK });
    const res = await ensureCustomerForRecipient(supabase, ABBY_CLIENT, ENTITY_ID, {
      type: "company",
      id: "c1",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.abbyCustomerId).toBe("abby-neuf");
      expect(res.abbyCustomerType).toBe("organization");
      expect(res.created).toBe(true);
    }
    const dto = createOrganizationCustomerMock.mock.calls[0][1] as Record<string, unknown>;
    expect(dto).toMatchObject({ name: "ACME SAS", siret: SIRET_ACME });
    expect(calls.upsert).toHaveBeenCalledTimes(1);
  });

  it("to_create learner : crée un CONTACT", async () => {
    createContactCustomerMock.mockResolvedValue({ id: "abby-contact-1" });
    const { supabase } = makeSupabaseMock({
      learner: { entity_id: ENTITY_ID, first_name: "Marie", last_name: "Dupont", email: null },
    });
    const res = await ensureCustomerForRecipient(supabase, ABBY_CLIENT, ENTITY_ID, {
      type: "learner",
      id: "l1",
    });
    if (res.ok) expect(res.abbyCustomerType).toBe("contact");
    expect(createContactCustomerMock).toHaveBeenCalledTimes(1);
    expect(createOrganizationCustomerMock).not.toHaveBeenCalled();
  });

  it("to_create INVALIDE (fiche incomplète) : abby_validation, AUCUNE écriture", async () => {
    const { supabase, calls } = makeSupabaseMock({
      client: { entity_id: ENTITY_ID, company_name: "Incomplète", siret: null },
    });
    const res = await ensureCustomerForRecipient(supabase, ABBY_CLIENT, ENTITY_ID, {
      type: "company",
      id: "c1",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("abby_validation");
      expect(res.error.message).toMatch(/Compléter la fiche client/);
    }
    expect(createOrganizationCustomerMock).not.toHaveBeenCalled();
    expect(calls.upsert).not.toHaveBeenCalled();
  });
});
