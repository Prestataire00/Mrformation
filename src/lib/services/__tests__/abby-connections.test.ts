import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// L'ACL est mockée : le SDK n'est jamais chargé ici (AD-2)
const fetchCompanyIdentityMock = vi.fn<(apiKey: string) => Promise<unknown>>();
const createAbbyClientMock = vi.fn<(apiKey: string) => unknown>(() => ({
  mock: "abby-client",
}));

vi.mock("@/lib/abby/client", () => ({
  fetchCompanyIdentity: (apiKey: string) => fetchCompanyIdentityMock(apiKey),
  createAbbyClient: (apiKey: string) => createAbbyClientMock(apiKey),
}));

import {
  getConnectionState,
  testAndStoreApiKey,
  withAbbyConnection,
} from "../abby-connections";

const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const ENTITY_ID = "11111111-1111-1111-1111-111111111111";
const IDENTITY = {
  companyName: null,
  companySiret: "91311329600036",
  isInTestMode: true,
};

const ORIGINAL_ABBY_KEY = process.env.ABBY_ENCRYPTION_KEY;

// ---------------------------------------------------------------------------
// Mock Supabase chaînable, façon tests services existants
// ---------------------------------------------------------------------------

type Row = Record<string, unknown> | null;

function makeSupabaseMock(opts: { row?: Row } = {}) {
  const calls = {
    upsert: vi.fn<
      (
        payload: Record<string, unknown>,
        options?: Record<string, unknown>
      ) => Promise<{ error: null }>
    >(async () => ({ error: null })),
    update: vi.fn<(payload: Record<string, unknown>) => void>(),
    updateEq: vi.fn<(col: string, val: unknown) => Promise<{ error: null }>>(
      async () => ({ error: null })
    ),
    selectEq: vi.fn<(col: string, val: unknown) => void>(),
  };
  const selectColumns = vi.fn<(cols: string) => void>();
  const from = vi.fn(() => ({
    select: vi.fn((cols: string) => {
      selectColumns(cols);
      return {
        eq: (col: string, val: unknown) => {
          calls.selectEq(col, val);
          return { maybeSingle: async () => ({ data: opts.row ?? null, error: null }) };
        },
      };
    }),
    upsert: (payload: Record<string, unknown>, options?: Record<string, unknown>) => {
      return calls.upsert(payload, options);
    },
    update: (payload: Record<string, unknown>) => {
      calls.update(payload);
      return { eq: calls.updateEq };
    },
  }));
  return {
    supabase: { from } as unknown as SupabaseClient,
    from,
    calls,
    selectColumns,
  };
}

beforeEach(() => {
  process.env.ABBY_ENCRYPTION_KEY = TEST_KEY;
  fetchCompanyIdentityMock.mockReset();
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

describe("testAndStoreApiKey — test de clé et stockage chiffré", () => {
  it("succès : upsert du triplet chiffré (clé jamais en clair) + identité + nettoyage de last_error", async () => {
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
      company_siret: "91311329600036",
      is_active: false,
      last_error: null,
      last_error_at: null,
    });
    expect(payload.encrypted_api_key).toBeTruthy();
    expect(payload.key_iv).toBeTruthy();
    expect(payload.key_auth_tag).toBeTruthy();
    expect(JSON.stringify(payload)).not.toContain("suk_ma-cle-secrete");
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
    expect(updatePayload.last_error_at).toBeTruthy();
    expect(updatePayload).not.toHaveProperty("encrypted_api_key");
    expect(calls.updateEq).toHaveBeenCalledWith("entity_id", ENTITY_ID);
  });
});

describe("withAbbyConnection — seul écrivain des stats d'appel sur connexion stockée", () => {
  function encryptedRow() {
    // Triplet réel généré avec la clé de test — via le vrai module encryption
    // (import dynamique pour bénéficier de l'env posée en beforeEach)
    return import("@/lib/abby/encryption").then(({ encryptApiKey }) => {
      const t = encryptApiKey("suk_stockee");
      return {
        encrypted_api_key: t.encrypted,
        key_iv: t.iv,
        key_auth_tag: t.authTag,
      };
    });
  }

  it("succès : déchiffre, exécute fn(client), pose last_used_at et NETTOIE last_error", async () => {
    const row = await encryptedRow();
    const { supabase, calls } = makeSupabaseMock({ row });
    const res = await withAbbyConnection(supabase, ENTITY_ID, async () => "resultat");

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toBe("resultat");
    expect(createAbbyClientMock).toHaveBeenCalledWith("suk_stockee");
    const updatePayload = calls.update.mock.calls[0][0];
    expect(updatePayload.last_used_at).toBeTruthy();
    expect(updatePayload.last_error).toBeNull();
    expect(updatePayload.last_error_at).toBeNull();
    expect(updatePayload.updated_at).toBeTruthy();
  });

  it("échec de fn : pose last_used_at ET last_error typée", async () => {
    const row = await encryptedRow();
    const { supabase, calls } = makeSupabaseMock({ row });
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
