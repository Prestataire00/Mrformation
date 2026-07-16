import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// L'ACL est mockée : le SDK n'est jamais chargé ici (AD-2)
const fetchCompanyIdentityMock = vi.fn<(apiKey: string) => Promise<unknown>>();
const getCompanyIdentityMock = vi.fn<(client: unknown) => Promise<unknown>>();
const createAbbyClientMock = vi.fn<(apiKey: string) => unknown>(() => ({
  mock: "abby-client",
}));

vi.mock("@/lib/abby/client", () => ({
  fetchCompanyIdentity: (apiKey: string) => fetchCompanyIdentityMock(apiKey),
  getCompanyIdentity: (client: unknown) => getCompanyIdentityMock(client),
  createAbbyClient: (apiKey: string) => createAbbyClientMock(apiKey),
}));

import {
  getConnectionState,
  testAndStoreApiKey,
  withAbbyConnection,
  activateConnection,
} from "../abby-connections";
import { encryptApiKey } from "@/lib/abby/encryption";

const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const ENTITY_ID = "11111111-1111-1111-1111-111111111111";
const SIRET_MR = "91311329600036";
const SIRET_C3V = "98525216200021";
const IDENTITY = {
  companyName: null,
  companySiret: SIRET_MR,
  isInTestMode: true,
};

const ORIGINAL_ABBY_KEY = process.env.ABBY_ENCRYPTION_KEY;

// ---------------------------------------------------------------------------
// Mock Supabase chaînable multi-tables (dispatch sur le nom de table,
// précédent : src/lib/services/__tests__/invoices.test.ts)
// ---------------------------------------------------------------------------

type Row = Record<string, unknown> | null;

function makeSupabaseMock(
  opts: { row?: Row; entity?: Row; updateResult?: Array<Record<string, unknown>> } = {}
) {
  const entity =
    opts.entity === undefined
      ? { name: "MR FORMATION", siret: SIRET_MR }
      : opts.entity;

  const calls = {
    upsert: vi.fn<
      (
        payload: Record<string, unknown>,
        options?: Record<string, unknown>
      ) => Promise<{ error: null }>
    >(async () => ({ error: null })),
    update: vi.fn<(payload: Record<string, unknown>) => void>(),
    updateEq: vi.fn<(col: string, val: unknown) => void>(),
    selectEq: vi.fn<(col: string, val: unknown) => void>(),
  };
  const selectColumns = vi.fn<(cols: string) => void>();

  const makeUpdateChain = () => {
    const chain = {
      eq: (col: string, val: unknown) => {
        calls.updateEq(col, val);
        return chain;
      },
      is: (col: string, val: unknown) => {
        calls.updateEq(col, val);
        return chain;
      },
      select: async () => ({
        data: opts.updateResult ?? [{ entity_id: ENTITY_ID }],
        error: null,
      }),
      then: (onFulfilled: (value: { error: null }) => unknown) =>
        onFulfilled({ error: null }),
    };
    return chain;
  };

  const from = vi.fn((table: string) => {
    if (table === "entities") {
      return {
        select: vi.fn(() => ({
          eq: () => ({
            maybeSingle: async () => ({ data: entity, error: null }),
          }),
        })),
      };
    }
    // abby_connections
    return {
      select: vi.fn((cols: string) => {
        selectColumns(cols);
        return {
          eq: (col: string, val: unknown) => {
            calls.selectEq(col, val);
            return {
              maybeSingle: async () => ({ data: opts.row ?? null, error: null }),
            };
          },
        };
      }),
      upsert: (
        payload: Record<string, unknown>,
        options?: Record<string, unknown>
      ) => calls.upsert(payload, options),
      update: (payload: Record<string, unknown>) => {
        calls.update(payload);
        return makeUpdateChain();
      },
    };
  });

  return {
    supabase: { from } as unknown as SupabaseClient,
    from,
    calls,
    selectColumns,
  };
}

function encryptedTriplet() {
  const t = encryptApiKey("suk_stockee");
  return {
    encrypted_api_key: t.encrypted,
    key_iv: t.iv,
    key_auth_tag: t.authTag,
  };
}

function testeeRow(extra: Record<string, unknown> = {}): Row {
  return {
    is_active: false,
    connected_at: null,
    last_error: null,
    company_name: null,
    company_siret: SIRET_MR,
    last_used_at: null,
    last_error_at: null,
    ...encryptedTriplet(),
    ...extra,
  };
}

beforeEach(() => {
  process.env.ABBY_ENCRYPTION_KEY = TEST_KEY;
  fetchCompanyIdentityMock.mockReset();
  getCompanyIdentityMock.mockReset();
  createAbbyClientMock.mockClear();
});

afterEach(() => {
  if (ORIGINAL_ABBY_KEY === undefined) delete process.env.ABBY_ENCRYPTION_KEY;
  else process.env.ABBY_ENCRYPTION_KEY = ORIGINAL_ABBY_KEY;
});

// ---------------------------------------------------------------------------

describe("getConnectionState — dérivation des états (AD-4 + précision connected_at)", () => {
  it("dérive non_configuree quand aucune ligne n'existe", async () => {
    const { supabase, calls } = makeSupabaseMock({ row: null });
    const res = await getConnectionState(supabase, ENTITY_ID);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.state.status).toBe("non_configuree");
    expect(calls.selectEq).toHaveBeenCalledWith("entity_id", ENTITY_ID);
  });

  it("dérive testee (ligne présente, is_active=false, connected_at null)", async () => {
    const { supabase } = makeSupabaseMock({
      row: { is_active: false, connected_at: null, last_error: null },
    });
    const res = await getConnectionState(supabase, ENTITY_ID);
    if (res.ok) expect(res.state.status).toBe("testee");
  });

  it("ne SELECT jamais les colonnes chiffrées (AD-18 — les select strings échappent à tsc)", async () => {
    const { supabase, selectColumns } = makeSupabaseMock({ row: null });
    await getConnectionState(supabase, ENTITY_ID);
    const cols = selectColumns.mock.calls[0]?.[0] ?? "";
    expect(cols).not.toMatch(/encrypted_api_key|key_iv|key_auth_tag/);
  });

  it("dérive active / en_erreur / desactivee selon is_active, last_error et connected_at", async () => {
    const cases: Array<[Row, string]> = [
      [{ is_active: true, connected_at: "2026-07-16", last_error: null }, "active"],
      [{ is_active: true, connected_at: "2026-07-16", last_error: "boom" }, "en_erreur"],
      [{ is_active: false, connected_at: "2026-07-16", last_error: null }, "desactivee"],
    ];
    for (const [row, expected] of cases) {
      const { supabase } = makeSupabaseMock({ row });
      const res = await getConnectionState(supabase, ENTITY_ID);
      if (res.ok) expect(res.state.status).toBe(expected);
    }
  });
});

describe("testAndStoreApiKey — test de clé, garde-fou SIRET et stockage chiffré", () => {
  it("succès (SIRET identiques) : upsert du triplet chiffré (clé jamais en clair) + identité + nettoyage de last_error", async () => {
    fetchCompanyIdentityMock.mockResolvedValue(IDENTITY);
    const { supabase, calls } = makeSupabaseMock();
    const res = await testAndStoreApiKey(supabase, ENTITY_ID, "suk_ma-cle-secrete");

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.identity).toEqual(IDENTITY);
    expect(calls.upsert).toHaveBeenCalledTimes(1);
    const [payload, options] = calls.upsert.mock.calls[0];
    expect(options).toMatchObject({ onConflict: "entity_id" });
    expect(payload).toMatchObject({
      entity_id: ENTITY_ID,
      company_siret: SIRET_MR,
      is_active: false,
      last_error: null,
      last_error_at: null,
    });
    expect(payload.encrypted_api_key).toBeTruthy();
    expect(JSON.stringify(payload)).not.toContain("suk_ma-cle-secrete");
  });

  it("garde-fou SIRET : mismatch → abby_siret_mismatch avec LES DEUX SIRET, AUCUN stockage (FR-3)", async () => {
    fetchCompanyIdentityMock.mockResolvedValue({ ...IDENTITY, companySiret: SIRET_C3V });
    const { supabase, calls } = makeSupabaseMock(); // entité MR par défaut
    const res = await testAndStoreApiKey(supabase, ENTITY_ID, "suk_cle-de-c3v");

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("abby_siret_mismatch");
      expect(res.error.message).toContain(SIRET_C3V);
      expect(res.error.message).toContain(SIRET_MR);
      expect(res.error.message).toContain("MR FORMATION");
    }
    expect(calls.upsert).not.toHaveBeenCalled();
    expect(calls.update).not.toHaveBeenCalled();
  });

  it("mismatch avec ligne existante : last_error = message dynamique, triplet intact", async () => {
    fetchCompanyIdentityMock.mockResolvedValue({ ...IDENTITY, companySiret: SIRET_C3V });
    const { supabase, calls } = makeSupabaseMock({ row: { id: "conn-1" } });
    const res = await testAndStoreApiKey(supabase, ENTITY_ID, "suk_cle-de-c3v");

    expect(res.ok).toBe(false);
    expect(calls.upsert).not.toHaveBeenCalled();
    expect(calls.update).toHaveBeenCalledTimes(1);
    const updatePayload = calls.update.mock.calls[0][0];
    expect(String(updatePayload.last_error)).toContain(SIRET_C3V);
    expect(updatePayload).not.toHaveProperty("encrypted_api_key");
  });

  it("entities.siret NULL : refus config explicite, aucun stockage (AC-2)", async () => {
    fetchCompanyIdentityMock.mockResolvedValue(IDENTITY);
    const { supabase, calls } = makeSupabaseMock({
      entity: { name: "MR FORMATION", siret: null },
    });
    const res = await testAndStoreApiKey(supabase, ENTITY_ID, "suk_valide");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toMatch(/SIRET de l'entité/);
    expect(calls.upsert).not.toHaveBeenCalled();
  });

  it("échec sans ligne existante : erreur typée, AUCUNE écriture", async () => {
    fetchCompanyIdentityMock.mockRejectedValue({ status: 401 });
    const { supabase, calls } = makeSupabaseMock({ row: null });
    const res = await testAndStoreApiKey(supabase, ENTITY_ID, "suk_mauvaise");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_auth_failed");
    expect(calls.upsert).not.toHaveBeenCalled();
    expect(calls.update).not.toHaveBeenCalled();
  });

  it("échec avec ligne existante : last_error posé, triplet stocké intact", async () => {
    fetchCompanyIdentityMock.mockRejectedValue({ status: 403 });
    const { supabase, calls } = makeSupabaseMock({ row: { id: "conn-1" } });
    const res = await testAndStoreApiKey(supabase, ENTITY_ID, "suk_nouvelle");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_plan_no_api");
    expect(calls.upsert).not.toHaveBeenCalled();
    expect(calls.update).toHaveBeenCalledTimes(1);
    const updatePayload = calls.update.mock.calls[0][0];
    expect(updatePayload.last_error).toBeTruthy();
    expect(updatePayload).not.toHaveProperty("encrypted_api_key");
    expect(calls.updateEq).toHaveBeenCalledWith("entity_id", ENTITY_ID);
  });

  it("ABBY_ENCRYPTION_KEY absente/malformée : erreur de configuration EXPLICITE, aucune écriture (pas de 'erreur interne')", async () => {
    fetchCompanyIdentityMock.mockResolvedValue(IDENTITY);
    delete process.env.ABBY_ENCRYPTION_KEY;
    const { supabase, calls } = makeSupabaseMock();
    const res = await testAndStoreApiKey(supabase, ENTITY_ID, "suk_valide");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toMatch(/ABBY_ENCRYPTION_KEY/);
    expect(calls.upsert).not.toHaveBeenCalled();
  });

  it("remplacement de clé : connected_at repasse explicitement à NULL (retour à l'état testée)", async () => {
    fetchCompanyIdentityMock.mockResolvedValue(IDENTITY);
    const { supabase, calls } = makeSupabaseMock({
      row: { id: "conn-1", connected_at: "2026-07-14T10:00:00Z" },
    });
    const res = await testAndStoreApiKey(supabase, ENTITY_ID, "suk_remplacement");

    expect(res.ok).toBe(true);
    const [payload] = calls.upsert.mock.calls[0];
    expect(payload).toHaveProperty("connected_at", null);
    expect(payload).toMatchObject({ is_active: false });
  });
});

describe("withAbbyConnection — seul écrivain des stats d'appel sur connexion stockée", () => {
  it("succès : déchiffre, exécute fn(client), pose last_used_at et NETTOIE last_error", async () => {
    const { supabase, calls } = makeSupabaseMock({ row: testeeRow() });
    const res = await withAbbyConnection(supabase, ENTITY_ID, async () => "resultat");

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toBe("resultat");
    expect(createAbbyClientMock).toHaveBeenCalledWith("suk_stockee");
    const updatePayload = calls.update.mock.calls[0][0];
    expect(updatePayload.last_used_at).toBeTruthy();
    expect(updatePayload.last_error).toBeNull();
    expect(updatePayload.updated_at).toBeTruthy();
  });

  it("échec de fn : pose last_used_at ET last_error typée", async () => {
    const { supabase, calls } = makeSupabaseMock({ row: testeeRow() });
    const res = await withAbbyConnection(supabase, ENTITY_ID, async () => {
      throw { status: 429 };
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_rate_limited");
    const updatePayload = calls.update.mock.calls[0][0];
    expect(updatePayload.last_used_at).toBeTruthy();
    expect(updatePayload.last_error).toBeTruthy();
  });

  it("aucune connexion stockée : code abby_no_connection, fn jamais exécutée", async () => {
    const { supabase } = makeSupabaseMock({ row: null });
    const fn = vi.fn();
    const res = await withAbbyConnection(supabase, ENTITY_ID, fn);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_no_connection");
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("activateConnection — activation explicite avec re-vérification SIRET live (FR-2/FR-3)", () => {
  it("refuse avec abby_invalid_state si aucune connexion (non_configuree)", async () => {
    const { supabase } = makeSupabaseMock({ row: null });
    const res = await activateConnection(supabase, ENTITY_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_invalid_state");
  });

  it("refuse avec abby_invalid_state si déjà active", async () => {
    const { supabase } = makeSupabaseMock({
      row: testeeRow({ is_active: true, connected_at: "2026-07-16" }),
    });
    const res = await activateConnection(supabase, ENTITY_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_invalid_state");
  });

  it("happy path : re-getMe live via withAbbyConnection puis UPDATE conditionnel atomique d'activation", async () => {
    getCompanyIdentityMock.mockResolvedValue(IDENTITY);
    const { supabase, calls } = makeSupabaseMock({ row: testeeRow() });
    const res = await activateConnection(supabase, ENTITY_ID);

    expect(res.ok).toBe(true);
    expect(getCompanyIdentityMock).toHaveBeenCalledTimes(1);
    // Un payload d'activation existe, avec conditions atomiques
    const activation = calls.update.mock.calls
      .map((c) => c[0])
      .find((p) => p.is_active === true);
    expect(activation).toBeTruthy();
    expect(activation?.connected_at).toBeTruthy();
    expect(activation?.company_siret).toBe(SIRET_MR);
    expect(activation?.last_error).toBeNull();
    expect(calls.updateEq).toHaveBeenCalledWith("is_active", false);
    expect(calls.updateEq).toHaveBeenCalledWith("connected_at", null);
  });

  it("mismatch à l'activation (compte changé) : pas d'activation, last_error dynamique — 2 update successifs assumés", async () => {
    getCompanyIdentityMock.mockResolvedValue({ ...IDENTITY, companySiret: SIRET_C3V });
    const { supabase, calls } = makeSupabaseMock({ row: testeeRow() });
    const res = await activateConnection(supabase, ENTITY_ID);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("abby_siret_mismatch");
      expect(res.error.message).toContain(SIRET_C3V);
      expect(res.error.message).toContain(SIRET_MR);
    }
    // 1er update = stamp succès de withAbbyConnection, 2e = pose du mismatch
    const payloads = calls.update.mock.calls.map((c) => c[0]);
    expect(payloads.some((p) => p.is_active === true)).toBe(false);
    const final = payloads[payloads.length - 1];
    expect(String(final.last_error)).toContain(SIRET_C3V);
  });

  it("échec de withAbbyConnection (réseau) : code propagé, pas d'activation", async () => {
    getCompanyIdentityMock.mockRejectedValue(new Error("fetch failed"));
    const { supabase, calls } = makeSupabaseMock({ row: testeeRow() });
    const res = await activateConnection(supabase, ENTITY_ID);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_network");
    const payloads = calls.update.mock.calls.map((c) => c[0]);
    expect(payloads.some((p) => p.is_active === true)).toBe(false);
  });

  it("entities.siret NULL à l'activation : refus config explicite, pas d'activation (AC-2 étendue)", async () => {
    getCompanyIdentityMock.mockResolvedValue(IDENTITY);
    const { supabase, calls } = makeSupabaseMock({
      row: testeeRow(),
      entity: { name: "MR FORMATION", siret: null },
    });
    const res = await activateConnection(supabase, ENTITY_ID);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toMatch(/SIRET de l'entité/);
    const payloads = calls.update.mock.calls.map((c) => c[0]);
    expect(payloads.some((p) => p.is_active === true)).toBe(false);
  });

  it("UPDATE conditionnel touchant 0 ligne (double onglet) : abby_invalid_state", async () => {
    getCompanyIdentityMock.mockResolvedValue(IDENTITY);
    const { supabase } = makeSupabaseMock({ row: testeeRow(), updateResult: [] });
    const res = await activateConnection(supabase, ENTITY_ID);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_invalid_state");
  });
});
