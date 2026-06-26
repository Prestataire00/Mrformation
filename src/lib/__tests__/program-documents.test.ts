import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  listProgramDocuments,
  createProgramDocument,
  deleteProgramDocument,
} from "@/lib/services/program-documents";

/**
 * SPEC spec-program-supports-docs-partages — service `program_documents`.
 * Couvre : CRUD, filtre/isolation `entity_id` (defense in depth), gestion
 * d'erreur, et garde-fous de la migration (RLS + idempotence).
 */

type ChainResult = { data?: unknown; error?: unknown };

/** Mock Supabase chaînable + thenable : `await chain` résout `result`. */
function mockClient(result: ChainResult) {
  const calls: unknown[][] = [];
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "insert", "delete"]) {
    chain[m] = vi.fn((...args: unknown[]) => {
      calls.push([m, ...args]);
      return chain;
    });
  }
  chain.single = vi.fn(async () => result);
  chain.maybeSingle = vi.fn(async () => result);
  (chain as { then: unknown }).then = (resolve: (v: ChainResult) => unknown) => resolve(result);
  const from = vi.fn(() => chain);
  return { supabase: { from } as never, calls };
}

describe("listProgramDocuments", () => {
  it("liste les supports filtrés par program_id ET entity_id", async () => {
    const { supabase, calls } = mockClient({
      data: [{ id: "d1", program_id: "p1", entity_id: "ent-A", file_name: "a.pdf", file_url: "http://x/a.pdf", uploaded_by: "u1", created_at: "2026-06-26" }],
      error: null,
    });
    const res = await listProgramDocuments(supabase, "p1", "ent-A");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.documents).toHaveLength(1);
    expect(calls).toContainEqual(["eq", "program_id", "p1"]);
    expect(calls).toContainEqual(["eq", "entity_id", "ent-A"]); // isolation multi-tenant
  });

  it("renvoie un tableau vide quand data est null", async () => {
    const { supabase } = mockClient({ data: null, error: null });
    const res = await listProgramDocuments(supabase, "p1", "ent-A");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.documents).toEqual([]);
  });

  it("renvoie ok:false en cas d'erreur Supabase", async () => {
    const { supabase } = mockClient({ data: null, error: { message: "boom", code: "42501" } });
    const res = await listProgramDocuments(supabase, "p1", "ent-A");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toBe("boom");
  });
});

describe("createProgramDocument", () => {
  it("insère la ligne avec entity_id et renvoie le document", async () => {
    const { supabase, calls } = mockClient({
      data: { id: "d1", program_id: "p1", entity_id: "ent-A", file_name: "a.pdf", file_url: "http://x/a.pdf", uploaded_by: "u1", created_at: "2026-06-26" },
      error: null,
    });
    const res = await createProgramDocument(supabase, {
      programId: "p1",
      entityId: "ent-A",
      fileName: "a.pdf",
      fileUrl: "http://x/a.pdf",
      uploadedBy: "u1",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.document.id).toBe("d1");
    expect(calls).toContainEqual([
      "insert",
      { program_id: "p1", entity_id: "ent-A", file_name: "a.pdf", file_url: "http://x/a.pdf", uploaded_by: "u1" },
    ]);
  });

  it("renvoie ok:false en cas d'erreur d'insertion", async () => {
    const { supabase } = mockClient({ data: null, error: { message: "denied", code: "42501" } });
    const res = await createProgramDocument(supabase, {
      programId: "p1",
      entityId: "ent-A",
      fileName: "a.pdf",
      fileUrl: "http://x/a.pdf",
      uploadedBy: null,
    });
    expect(res.ok).toBe(false);
  });
});

describe("deleteProgramDocument", () => {
  it("supprime en filtrant id ET entity_id (defense in depth)", async () => {
    const { supabase, calls } = mockClient({ error: null });
    const res = await deleteProgramDocument(supabase, "d1", "ent-A");
    expect(res.ok).toBe(true);
    expect(calls).toContainEqual(["delete"]);
    expect(calls).toContainEqual(["eq", "id", "d1"]);
    expect(calls).toContainEqual(["eq", "entity_id", "ent-A"]);
  });

  it("renvoie ok:false en cas d'erreur de suppression", async () => {
    const { supabase } = mockClient({ error: { message: "nope", code: "42501" } });
    const res = await deleteProgramDocument(supabase, "d1", "ent-A");
    expect(res.ok).toBe(false);
  });
});

describe("migration add_program_documents.sql", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/add_program_documents.sql"),
    "utf8",
  );

  it("crée la table de façon idempotente avec entity_id NOT NULL", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS program_documents");
    expect(sql).toMatch(/entity_id UUID NOT NULL REFERENCES entities/);
    expect(sql).toMatch(/program_id UUID NOT NULL REFERENCES programs\(id\) ON DELETE CASCADE/);
  });

  it("active la RLS et utilise les helpers public.user_role (pas auth.*)", () => {
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("public.user_role()");
    expect(sql).toContain("public.user_entity_id()");
    expect(sql).not.toMatch(/auth\.user_role\(\)/);
  });

  it("autorise la lecture aux stagiaires (learner) et l'écriture aux admins", () => {
    expect(sql).toMatch(/program_documents_member_read/);
    expect(sql).toMatch(/'trainer', 'client', 'learner'/);
    expect(sql).toMatch(/program_documents_admin_all/);
    expect(sql).toMatch(/program_documents_super_admin_all/);
  });

  it("est ré-exécutable (DROP POLICY IF EXISTS sur chaque policy)", () => {
    const drops = sql.match(/DROP POLICY IF EXISTS/g) ?? [];
    expect(drops.length).toBeGreaterThanOrEqual(3);
  });
});
