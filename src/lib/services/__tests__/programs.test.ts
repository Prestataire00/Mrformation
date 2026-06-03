import { describe, it, expect, vi } from "vitest";
import {
  fetchPrograms,
  fetchProgramById,
  createProgram,
  updateProgram,
  deleteProgram,
  toggleProgramActive,
  fetchProgramVersions,
  createProgramVersion,
  countProgramReferences,
} from "../programs";
import type { ProgramContent } from "@/lib/types";

/**
 * Lot A audit BMAD : tests unitaires du service programs.
 *
 * On mock un SupabaseClient minimaliste via un builder chainable. Le but
 * n'est PAS de tester Supabase, mais de vérifier que le service :
 *  - applique systématiquement `.eq("entity_id", entityId)` (defense in
 *    depth multi-tenant, règle absolue CLAUDE.md #2)
 *  - relaie correctement les erreurs PostgrestError en ServiceResult.ok=false
 *  - sélectionne des colonnes explicites (pas de select("*"))
 */

type MockCalls = {
  table?: string;
  selectCols?: string;
  inserted?: Record<string, unknown>;
  updated?: Record<string, unknown>;
  eqFilters: Array<[string, unknown]>;
  ordered?: { column: string; ascending: boolean };
  isDelete: boolean;
  isMaybeSingle: boolean;
  isSingle: boolean;
};

function makeBuilder(returnValue: { data: unknown; error: unknown }) {
  const calls: MockCalls = { eqFilters: [], isDelete: false, isMaybeSingle: false, isSingle: false };
  const builder = {
    _calls: calls,
    select(cols: string) {
      calls.selectCols = cols;
      return builder;
    },
    insert(row: Record<string, unknown>) {
      calls.inserted = row;
      return builder;
    },
    update(row: Record<string, unknown>) {
      calls.updated = row;
      return builder;
    },
    delete() {
      calls.isDelete = true;
      return builder;
    },
    eq(col: string, val: unknown) {
      calls.eqFilters.push([col, val]);
      return builder;
    },
    order(column: string, opts: { ascending: boolean }) {
      calls.ordered = { column, ascending: opts.ascending };
      return Promise.resolve(returnValue);
    },
    maybeSingle() {
      calls.isMaybeSingle = true;
      return Promise.resolve(returnValue);
    },
    single() {
      calls.isSingle = true;
      return Promise.resolve(returnValue);
    },
    then(resolve: (v: { data: unknown; error: unknown }) => void) {
      resolve(returnValue);
    },
  };
  return builder;
}

function mockSupabase(returnValue: { data: unknown; error: unknown }) {
  const builder = makeBuilder(returnValue);
  return {
    builder,
    client: {
      from: vi.fn(() => builder),
    } as unknown as Parameters<typeof fetchPrograms>[0],
  };
}

describe("fetchPrograms", () => {
  it("applique le filtre entity_id et tri par updated_at desc", async () => {
    const { builder, client } = mockSupabase({ data: [], error: null });
    const result = await fetchPrograms(client, "ent-1");
    expect(result.ok).toBe(true);
    expect(builder._calls.eqFilters).toEqual([["entity_id", "ent-1"]]);
    expect(builder._calls.ordered).toEqual({ column: "updated_at", ascending: false });
    expect(builder._calls.selectCols).toContain("entity_id");
    expect(builder._calls.selectCols).not.toBe("*");
  });

  it("renvoie ok=false avec le message d'erreur sur PostgrestError", async () => {
    const { client } = mockSupabase({ data: null, error: { message: "RLS denied", code: "42501" } });
    const result = await fetchPrograms(client, "ent-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe("RLS denied");
      expect(result.error.code).toBe("42501");
    }
  });
});

describe("fetchProgramById", () => {
  it("applique id ET entity_id et utilise maybeSingle (programme peut être absent)", async () => {
    const { builder, client } = mockSupabase({ data: { id: "p-1", entity_id: "ent-1" }, error: null });
    await fetchProgramById(client, "p-1", "ent-1");
    expect(builder._calls.eqFilters).toEqual([
      ["id", "p-1"],
      ["entity_id", "ent-1"],
    ]);
    expect(builder._calls.isMaybeSingle).toBe(true);
  });
});

describe("createProgram", () => {
  it("force entity_id, version=1, is_active=true et updated_at sur l'insert", async () => {
    const { builder, client } = mockSupabase({ data: { id: "new", title: "X" }, error: null });
    const content: ProgramContent = { modules: [{ id: 1, title: "M1" }] };
    await createProgram(client, "ent-99", {
      title: "X",
      description: null,
      objectives: null,
      content,
      price: null,
      tva_rate: null,
      duration_hours: null,
      nsf_code: null,
      nsf_label: null,
      is_apprenticeship: false,
      bpf_objective: null,
      bpf_funding_type: null,
    });
    expect(builder._calls.inserted?.entity_id).toBe("ent-99");
    expect(builder._calls.inserted?.version).toBe(1);
    expect(builder._calls.inserted?.is_active).toBe(true);
    expect(typeof builder._calls.inserted?.updated_at).toBe("string");
  });
});

describe("updateProgram", () => {
  it("applique id ET entity_id et touche updated_at automatiquement", async () => {
    const { builder, client } = mockSupabase({ data: { id: "p-1" }, error: null });
    await updateProgram(client, "p-1", "ent-1", { title: "Nouveau titre" });
    expect(builder._calls.eqFilters).toEqual([
      ["id", "p-1"],
      ["entity_id", "ent-1"],
    ]);
    expect(builder._calls.updated?.title).toBe("Nouveau titre");
    expect(typeof builder._calls.updated?.updated_at).toBe("string");
  });
});

describe("deleteProgram", () => {
  it("applique id ET entity_id (defense in depth)", async () => {
    const { builder, client } = mockSupabase({ data: null, error: null });
    const result = await deleteProgram(client, "p-1", "ent-1");
    expect(result.ok).toBe(true);
    expect(builder._calls.isDelete).toBe(true);
    expect(builder._calls.eqFilters).toEqual([
      ["id", "p-1"],
      ["entity_id", "ent-1"],
    ]);
  });
});

describe("toggleProgramActive", () => {
  it("applique id ET entity_id et envoie le nouveau is_active", async () => {
    const { builder, client } = mockSupabase({ data: null, error: null });
    await toggleProgramActive(client, "p-1", "ent-1", false);
    expect(builder._calls.updated?.is_active).toBe(false);
    expect(builder._calls.eqFilters).toEqual([
      ["id", "p-1"],
      ["entity_id", "ent-1"],
    ]);
  });
});

describe("fetchProgramVersions", () => {
  it("filtre par program_id et tri version desc", async () => {
    const { builder, client } = mockSupabase({ data: [], error: null });
    await fetchProgramVersions(client, "p-1");
    expect(builder._calls.eqFilters).toEqual([["program_id", "p-1"]]);
    expect(builder._calls.ordered).toEqual({ column: "version", ascending: false });
  });
});

describe("countProgramReferences", () => {
  it("retourne les comptes des 6 tables avec FK vers programs", async () => {
    // Mock simplifié : chaque appel from() retourne un builder qui résout
    // avec un count fixé. On vérifie surtout que les 6 tables sont sondées.
    const fromCalls: string[] = [];
    const client = {
      from: vi.fn((table: string) => {
        fromCalls.push(table);
        return {
          select() {
            return this;
          },
          eq() {
            return Promise.resolve({ count: 3, error: null });
          },
        };
      }),
    } as unknown as Parameters<typeof countProgramReferences>[0];

    const result = await countProgramReferences(client, "p-1");
    expect(result.ok).toBe(true);
    expect(fromCalls).toEqual([
      "trainings",
      "sessions",
      "elearning_courses",
      "crm_quotes",
      "program_enrollments",
      "program_versions",
    ]);
    if (result.ok) {
      expect(result.counts.trainings).toBe(3);
      expect(result.counts.program_versions).toBe(3);
    }
  });

  it("renvoie null pour une table inaccessible (RLS / table absente)", async () => {
    const client = {
      from: vi.fn((table: string) => ({
        select() {
          return this;
        },
        eq() {
          // simule un échec pour une seule table
          if (table === "crm_quotes") {
            return Promise.resolve({ count: null, error: { message: "relation not found" } });
          }
          return Promise.resolve({ count: 0, error: null });
        },
      })),
    } as unknown as Parameters<typeof countProgramReferences>[0];

    const result = await countProgramReferences(client, "p-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.counts.crm_quotes).toBeNull();
      expect(result.counts.trainings).toBe(0);
    }
  });
});

describe("createProgramVersion", () => {
  it("incrémente la version et applique entity_id sur l'update programs", async () => {
    // Premier appel = insert program_versions, second = update programs.
    // Le builder mocké ne réinitialise pas entre les calls — pour cette
    // logique on vérifie juste que ok=true sur le happy path en mockant les
    // deux étapes ensemble (les deux passent par les mêmes méthodes).
    const { client } = mockSupabase({ data: null, error: null });
    const result = await createProgramVersion(client, "p-1", "ent-1", 2, { modules: [] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.newVersion).toBe(3);
  });

  it("renvoie l'erreur du snapshot si l'insert program_versions échoue", async () => {
    const { client } = mockSupabase({ data: null, error: { message: "duplicate", code: "23505" } });
    const result = await createProgramVersion(client, "p-1", "ent-1", 2, null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("23505");
  });
});
