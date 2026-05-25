/**
 * Tests d'intégration sur batchSendDocsEmail.
 *
 * Ces tests auraient détecté le bug #1 du final review (response shape
 * mismatch) car ils vérifient le contrat de retour { ok, totalRequested,
 * successCount, failureCount, errors, latencyMs } et la forme { ok, error }.
 *
 * Pattern de mock : vi.fn().mockReturnThis() pour les chainables,
 * single/maybeSingle retournent des Promises finales — même style que
 * documents-store.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { batchSendDocsEmail } from "@/lib/services/batch-email-handler";

// ---------------------------------------------------------------------------
// Helpers de construction de mock Supabase
// ---------------------------------------------------------------------------

/**
 * Crée un mock Supabase qui :
 *  - Sessions query (.select().eq().eq().single()) → `sessionResult`
 *  - Enrollments query (.select().eq().in()) → `enrollmentsResult`
 *  - Document_templates query (.select().eq().eq().eq().maybeSingle()) → null (pas de docx custom)
 *  - Entity settings query (entities table) → null
 */
function makeSupabaseMock(opts: {
  sessionResult: { data: Record<string, unknown> | null; error: { message: string } | null };
  enrollmentsResult?: { data: unknown[]; error: null };
}) {
  const { enrollmentsResult = { data: [], error: null } } = opts;

  return {
    from: vi.fn((table: string) => {
      if (table === "sessions") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn(async () => opts.sessionResult),
        };
      }
      if (table === "enrollments") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn(async () => enrollmentsResult),
        };
      }
      // document_templates (docx_fidelity check) + entity settings + autres
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        single: vi.fn(async () => ({ data: null, error: null })),
        in: vi.fn(async () => ({ data: [], error: null })),
      };
    }),
  };
}

const VALID_SESSION = {
  id: "SESS-1",
  entity_id: "ENT-A",
  title: "Formation Test",
  updated_at: "2026-05-01T00:00:00Z",
  training: { id: "TRAIN-1", title: "Formation Test" },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("batchSendDocsEmail — contrat de réponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test #1 — Zéro destinataires : retour ok: true avec compteurs à zéro
  it("retourne ok:true avec totalRequested=0 quand aucun destinataire", async () => {
    const supabase = makeSupabaseMock({
      sessionResult: { data: VALID_SESSION, error: null },
      enrollmentsResult: { data: [], error: null },
    });

    const result = await batchSendDocsEmail(
      supabase as never,
      "ENT-A",
      "SESS-1",
      "cgv",          // ownerType = "session" → passe par enrollments
      "PROFILE-1",
    );

    // Vérifie la shape complète du succès (aurait détecté le bug #1)
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.totalRequested).toBe(0);
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(0);
      expect(result.errors).toEqual([]);
      // latencyMs peut être absent sur le chemin zero-recipient
      if ("latencyMs" in result) {
        expect(typeof result.latencyMs === "number" || result.latencyMs === undefined).toBe(true);
      }
    }
  });

  // Test #2 — doc_type inconnu : retour ok:false avec message explicite
  it("retourne ok:false avec code UNKNOWN_DOC_TYPE pour un doc_type inconnu", async () => {
    const supabase = makeSupabaseMock({
      sessionResult: { data: VALID_SESSION, error: null },
    });

    const result = await batchSendDocsEmail(
      supabase as never,
      "ENT-A",
      "SESS-1",
      "doc_type_inexistant",
      "PROFILE-1",
    );

    // Vérifie la shape de l'erreur (aurait détecté le bug #1 si la shape était différente)
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeDefined();
      expect(typeof result.error.message).toBe("string");
      expect(result.error.message).toContain("doc_type_inexistant");
      expect(result.error.code).toBe("UNKNOWN_DOC_TYPE");
    }
  });

  // Test #3 — Session entity_id mismatch : retour ok:false avec code SESSION_NOT_FOUND
  it("retourne ok:false avec code SESSION_NOT_FOUND quand la session n'appartient pas à l'entité", async () => {
    const supabase = makeSupabaseMock({
      sessionResult: {
        data: null,
        error: { message: "Not found" },
      },
    });

    const result = await batchSendDocsEmail(
      supabase as never,
      "ENT-WRONG",
      "SESS-1",
      "cgv",
      "PROFILE-1",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeDefined();
      expect(typeof result.error.message).toBe("string");
      expect(result.error.code).toBe("SESSION_NOT_FOUND");
    }
  });

  // Test #4 — Session introuvable sans erreur Supabase (data: null, error: null)
  it("retourne ok:false avec SESSION_NOT_FOUND quand data est null sans erreur Supabase", async () => {
    const supabase = makeSupabaseMock({
      sessionResult: { data: null, error: null },
    });

    const result = await batchSendDocsEmail(
      supabase as never,
      "ENT-A",
      "SESS-GHOST",
      "convocation",
      "PROFILE-1",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SESSION_NOT_FOUND");
    }
  });

  // Test #5 — Vérifie que la session est bien filtrée par entity_id (défense multi-tenant)
  it("filtre la session par entity_id (ne pas exposer les sessions inter-entités)", async () => {
    const fromCalls: string[] = [];
    const eqCalls: Array<{ column: string; value: unknown }> = [];

    const supabase = {
      from: vi.fn((table: string) => {
        fromCalls.push(table);
        if (table === "sessions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn((col: string, val: unknown) => {
              eqCalls.push({ column: col, value: val });
              return {
                eq: vi.fn((col2: string, val2: unknown) => {
                  eqCalls.push({ column: col2, value: val2 });
                  return {
                    single: vi.fn(async () => ({ data: null, error: { message: "Not found" } })),
                  };
                }),
              };
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          single: vi.fn(async () => ({ data: null, error: null })),
          in: vi.fn(async () => ({ data: [], error: null })),
        };
      }),
    };

    await batchSendDocsEmail(
      supabase as never,
      "ENT-A",
      "SESS-1",
      "cgv",
      "PROFILE-1",
    );

    // La première table touchée doit être sessions
    expect(fromCalls[0]).toBe("sessions");
    // Le filtre entity_id doit être présent dans les eq() de la sessions query
    expect(eqCalls.some(c => c.column === "entity_id" && c.value === "ENT-A")).toBe(true);
    expect(eqCalls.some(c => c.column === "id" && c.value === "SESS-1")).toBe(true);
  });
});
