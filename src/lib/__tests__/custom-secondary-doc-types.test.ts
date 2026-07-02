import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateCustomDocType,
  isCustomDocType,
  CUSTOM_DOC_TYPE_PREFIX,
  createCustomTypeFieldsSchema,
  updateCustomTypeSchema,
  listCustomTypes,
  getActiveCustomTypeByDocType,
  createCustomType,
  renameCustomType,
  setCustomTypeActive,
  updateCustomType,
} from "@/lib/services/custom-secondary-doc-types";
import { deleteDocsByDocType } from "@/lib/services/documents-store";

/**
 * Tests unitaires — catalogue des types secondaires custom + désattribution.
 * Couvre : format/unicité de la clé doc_type, isolation entity_id, scope de la
 * désattribution (session + entité), (dé)activation soft, et la validation Zod.
 *
 * Un mock Supabase chaînable enregistre chaque appel (`from/eq/select/...`) pour
 * vérifier les filtres réellement posés (défense multi-tenant CLAUDE.md AR2).
 */

type Call = { method: string; args: unknown[] };

function makeChain(terminal: { data?: unknown; error?: unknown }) {
  const calls: Call[] = [];
  const chain: Record<string, unknown> = { __calls: calls };
  const passthrough = [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "neq",
    "not",
    "order",
    "range",
  ];
  for (const m of passthrough) {
    chain[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return chain;
    };
  }
  chain.maybeSingle = () => {
    calls.push({ method: "maybeSingle", args: [] });
    return Promise.resolve(terminal);
  };
  chain.single = () => {
    calls.push({ method: "single", args: [] });
    return Promise.resolve(terminal);
  };
  // Rendre la query awaitable directement (ex. delete().select(), order()).
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(terminal).then(resolve, reject);
  return chain;
}

function makeSupabase(terminal: { data?: unknown; error?: unknown }) {
  const chain = makeChain(terminal);
  const supabase = {
    from: (table: string) => {
      (chain.__calls as Call[]).push({ method: "from", args: [table] });
      return chain;
    },
  };
  return { supabase: supabase as unknown as SupabaseClient, calls: chain.__calls as Call[] };
}

function eqPairs(calls: Call[]): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const c of calls) {
    if (c.method === "eq") map[String(c.args[0])] = c.args[1];
  }
  return map;
}

describe("generateCustomDocType / isCustomDocType", () => {
  it("génère une clé préfixée custom_ sans tiret", () => {
    const key = generateCustomDocType();
    expect(key.startsWith(CUSTOM_DOC_TYPE_PREFIX)).toBe(true);
    expect(key).not.toContain("-");
    expect(key.length).toBe(CUSTOM_DOC_TYPE_PREFIX.length + 12);
  });

  it("génère des clés distinctes à chaque appel", () => {
    expect(generateCustomDocType()).not.toBe(generateCustomDocType());
  });

  it("isCustomDocType distingue custom vs legacy", () => {
    expect(isCustomDocType("custom_abc123")).toBe(true);
    expect(isCustomDocType("autorisation_image")).toBe(false);
    expect(isCustomDocType("convention_entreprise")).toBe(false);
  });
});

describe("createCustomTypeFieldsSchema", () => {
  it("accepte un payload valide", () => {
    const r = createCustomTypeFieldsSchema.safeParse({
      label: "Fiche EPI",
      category: "administratif",
      ownerType: "learner",
    });
    expect(r.success).toBe(true);
  });

  it("rejette une catégorie inconnue", () => {
    const r = createCustomTypeFieldsSchema.safeParse({
      label: "X",
      category: "inconnue",
      ownerType: "learner",
    });
    expect(r.success).toBe(false);
  });

  it("rejette un ownerType hors {learner,trainer,session}", () => {
    const r = createCustomTypeFieldsSchema.safeParse({
      label: "X",
      category: "administratif",
      ownerType: "company",
    });
    expect(r.success).toBe(false);
  });

  it("rejette un libellé vide", () => {
    const r = createCustomTypeFieldsSchema.safeParse({
      label: "   ",
      category: "administratif",
      ownerType: "learner",
    });
    expect(r.success).toBe(false);
  });
});

describe("updateCustomTypeSchema", () => {
  it("exige au moins un champ", () => {
    expect(updateCustomTypeSchema.safeParse({}).success).toBe(false);
  });
  it("accepte label seul", () => {
    expect(updateCustomTypeSchema.safeParse({ label: "Nouveau" }).success).toBe(true);
  });
  it("accepte isActive seul", () => {
    expect(updateCustomTypeSchema.safeParse({ isActive: false }).success).toBe(true);
  });
});

describe("deleteDocsByDocType — désattribution scopée", () => {
  it("filtre par entity_id + session + doc_type et compte les lignes supprimées", async () => {
    const { supabase, calls } = makeSupabase({
      data: [{ id: "1" }, { id: "2" }],
      error: null,
    });
    const res = await deleteDocsByDocType(supabase, "ent-1", "sess-9", "custom_x");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.deleted).toBe(2);

    expect(calls.some((c) => c.method === "from" && c.args[0] === "documents")).toBe(true);
    expect(calls.some((c) => c.method === "delete")).toBe(true);
    const eqs = eqPairs(calls);
    expect(eqs.entity_id).toBe("ent-1");
    expect(eqs.source_table).toBe("sessions");
    expect(eqs.source_id).toBe("sess-9");
    expect(eqs.doc_type).toBe("custom_x");
  });

  it("remonte l'erreur Supabase", async () => {
    const { supabase } = makeSupabase({ data: null, error: { message: "boom", code: "500" } });
    const res = await deleteDocsByDocType(supabase, "ent-1", "sess-9", "custom_x");
    expect(res.ok).toBe(false);
  });
});

describe("listCustomTypes — isolation + filtre actif", () => {
  it("filtre entity_id et is_active=true par défaut", async () => {
    const { supabase, calls } = makeSupabase({ data: [], error: null });
    await listCustomTypes(supabase, "ent-42");
    const eqs = eqPairs(calls);
    expect(eqs.entity_id).toBe("ent-42");
    expect(eqs.is_active).toBe(true);
  });

  it("n'ajoute pas le filtre is_active quand includeInactive=true", async () => {
    const { supabase, calls } = makeSupabase({ data: [], error: null });
    await listCustomTypes(supabase, "ent-42", { includeInactive: true });
    const eqs = eqPairs(calls);
    expect(eqs.entity_id).toBe("ent-42");
    expect("is_active" in eqs).toBe(false);
  });
});

describe("getActiveCustomTypeByDocType", () => {
  it("filtre entity_id + doc_type + is_active=true", async () => {
    const { supabase, calls } = makeSupabase({ data: null, error: null });
    const res = await getActiveCustomTypeByDocType(supabase, "ent-1", "custom_z");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.type).toBeNull();
    const eqs = eqPairs(calls);
    expect(eqs.entity_id).toBe("ent-1");
    expect(eqs.doc_type).toBe("custom_z");
    expect(eqs.is_active).toBe(true);
  });
});

describe("createCustomType — génère une clé custom et insère la définition", () => {
  it("insère un doc_type préfixé custom_ et actif", async () => {
    const { supabase, calls } = makeSupabase({
      data: {
        id: "def-1",
        entity_id: "ent-1",
        doc_type: "custom_generated",
        label: "Fiche EPI",
        category: "administratif",
        owner_type: "learner",
        template_id: "tpl-1",
        is_active: true,
        created_at: "now",
        updated_at: "now",
      },
      error: null,
    });
    const res = await createCustomType(supabase, {
      entityId: "ent-1",
      label: "Fiche EPI",
      category: "administratif",
      ownerType: "learner",
      templateId: "tpl-1",
    });
    expect(res.ok).toBe(true);

    const insertCall = calls.find((c) => c.method === "insert");
    expect(insertCall).toBeTruthy();
    const payload = insertCall!.args[0] as Record<string, unknown>;
    expect(String(payload.doc_type).startsWith(CUSTOM_DOC_TYPE_PREFIX)).toBe(true);
    expect(payload.entity_id).toBe("ent-1");
    expect(payload.template_id).toBe("tpl-1");
    expect(payload.is_active).toBe(true);
  });
});

describe("renameCustomType / setCustomTypeActive — isolation par entité", () => {
  it("renameCustomType filtre id + entity_id", async () => {
    const { supabase, calls } = makeSupabase({
      data: { id: "def-1", entity_id: "ent-1", label: "Neuf" },
      error: null,
    });
    await renameCustomType(supabase, "ent-1", "def-1", "Neuf");
    const eqs = eqPairs(calls);
    expect(eqs.id).toBe("def-1");
    expect(eqs.entity_id).toBe("ent-1");
    const updateCall = calls.find((c) => c.method === "update");
    expect((updateCall!.args[0] as Record<string, unknown>).label).toBe("Neuf");
  });

  it("setCustomTypeActive(false) désactive en soft avec filtre entité", async () => {
    const { supabase, calls } = makeSupabase({
      data: { id: "def-1", entity_id: "ent-1", is_active: false },
      error: null,
    });
    await setCustomTypeActive(supabase, "ent-1", "def-1", false);
    const eqs = eqPairs(calls);
    expect(eqs.id).toBe("def-1");
    expect(eqs.entity_id).toBe("ent-1");
    const updateCall = calls.find((c) => c.method === "update");
    expect((updateCall!.args[0] as Record<string, unknown>).is_active).toBe(false);
  });
});

describe("updateCustomType — écriture atomique label + isActive", () => {
  it("applique label et is_active en un seul update, filtré par entité", async () => {
    const { supabase, calls } = makeSupabase({
      data: { id: "def-1", entity_id: "ent-1", label: "Neuf", is_active: false },
      error: null,
    });
    const res = await updateCustomType(supabase, "ent-1", "def-1", {
      label: "Neuf",
      isActive: false,
    });
    expect(res.ok).toBe(true);
    const updateCalls = calls.filter((c) => c.method === "update");
    expect(updateCalls).toHaveLength(1); // un seul UPDATE, pas deux
    const payload = updateCalls[0].args[0] as Record<string, unknown>;
    expect(payload.label).toBe("Neuf");
    expect(payload.is_active).toBe(false);
    const eqs = eqPairs(calls);
    expect(eqs.id).toBe("def-1");
    expect(eqs.entity_id).toBe("ent-1");
  });

  it("n'écrit que les champs fournis (label seul)", async () => {
    const { supabase, calls } = makeSupabase({
      data: { id: "def-1", entity_id: "ent-1", label: "Neuf" },
      error: null,
    });
    await updateCustomType(supabase, "ent-1", "def-1", { label: "Neuf" });
    const payload = calls.find((c) => c.method === "update")!.args[0] as Record<string, unknown>;
    expect(payload.label).toBe("Neuf");
    expect("is_active" in payload).toBe(false);
  });
});
