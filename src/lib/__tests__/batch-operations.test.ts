import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BatchResult } from "@/lib/types/batch-operations";

/**
 * Tests batch operations helpers (E3-S06).
 *
 * On mock les dépendances externes (sendBatchEmail, requestBatchSignatures,
 * updateDocsByDocType, upsertDocsIgnoreDuplicates) pour tester la logique
 * d'enveloppe : refetch, latency, error accumulation, logging.
 */

// Mock batch-doc-send
vi.mock("@/lib/utils/batch-doc-send", () => ({
  sendBatchEmail: vi.fn(),
}));

// Mock batch-doc-signature-request
vi.mock("@/lib/utils/batch-doc-signature-request", () => ({
  requestBatchSignatures: vi.fn(),
}));

// We need to mock specific functions from documents-store but import the
// batch helpers under test. Use dynamic import after mocking internals.
// Instead, we test the helpers indirectly by importing them after mocks.

import { sendBatchEmail } from "@/lib/utils/batch-doc-send";
import { requestBatchSignatures } from "@/lib/utils/batch-doc-signature-request";

// For the confirm/assign helpers, we need a mock supabase client
function makeMockSupabase(responses: Record<string, { data: unknown; error: unknown; count?: number }> = {}) {
  const defaultResponse = { data: [], error: null, count: 0 };
  const chainable: Record<string, ReturnType<typeof vi.fn>> = {};

  const methods = ["select", "eq", "in", "ilike", "gte", "lte", "range",
    "insert", "update", "upsert", "maybeSingle", "single"] as const;

  for (const method of methods) {
    chainable[method] = vi.fn().mockReturnValue(
      new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "then") {
            const resp = responses[method] ?? defaultResponse;
            return (resolve: (v: unknown) => void) => resolve(resp);
          }
          return chainable[prop] ?? vi.fn().mockReturnThis();
        },
      })
    );
  }

  return {
    from: vi.fn().mockReturnValue(chainable),
  } as unknown as Parameters<typeof import("@/lib/services/documents-store").batchSendEmailWithRefetch>[0];
}

// Import helpers under test
import {
  batchSendEmailWithRefetch,
  batchRequestSignaturesWithRefetch,
  batchConfirmDocumentsWithRefetch,
  batchAssignTemplateToLearnersWithRefetch,
} from "@/lib/services/documents-store";

describe("Batch Operations (E3-S06)", () => {
  const mockOnRefresh = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("batchSendEmailWithRefetch", () => {
    it("retourne BatchResult avec counts corrects sur succès total", async () => {
      const mockSend = sendBatchEmail as ReturnType<typeof vi.fn>;
      mockSend.mockResolvedValue({
        totalRequested: 10,
        successCount: 10,
        failureCount: 0,
        errors: [],
        latencyMs: 500,
      });

      const supabase = makeMockSupabase();
      const result = await batchSendEmailWithRefetch(
        supabase,
        { docType: "convocation", sessionId: "session-1" },
        mockOnRefresh,
      );

      expect(result.success).toBe(true);
      expect(result.totalRequested).toBe(10);
      expect(result.successCount).toBe(10);
      expect(result.failureCount).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.refetchLatencyMs).toBeGreaterThanOrEqual(0);
      expect(mockOnRefresh).toHaveBeenCalledOnce();
    });

    it("accumule les erreurs avec itemLabel sur échecs partiels", async () => {
      const mockSend = sendBatchEmail as ReturnType<typeof vi.fn>;
      mockSend.mockResolvedValue({
        totalRequested: 10,
        successCount: 8,
        failureCount: 2,
        errors: [
          { learnerId: "l1", learnerName: "Alice Dupont", error: "email invalid" },
          { learnerId: "l2", learnerName: "Bob Martin", error: "smtp timeout" },
        ],
        latencyMs: 800,
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const supabase = makeMockSupabase();
      const result = await batchSendEmailWithRefetch(
        supabase,
        { docType: "convocation", sessionId: "session-1" },
        mockOnRefresh,
      );

      expect(result.successCount).toBe(8);
      expect(result.failureCount).toBe(2);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].itemLabel).toBe("Alice Dupont");
      expect(result.errors[1].itemId).toBe("l2");

      // Verify structured logging
      expect(consoleSpy).toHaveBeenCalledTimes(2);
      expect(consoleSpy.mock.calls[0][0]).toContain("[BatchOperation] SendEmail");
      expect(consoleSpy.mock.calls[0][0]).toContain("Alice Dupont");

      consoleSpy.mockRestore();
    });

    it("retourne success=false si sendBatchEmail throw", async () => {
      const mockSend = sendBatchEmail as ReturnType<typeof vi.fn>;
      mockSend.mockRejectedValue(new Error("network error"));

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const supabase = makeMockSupabase();
      const result = await batchSendEmailWithRefetch(
        supabase,
        { docType: "convocation", sessionId: "session-1" },
        mockOnRefresh,
      );

      expect(result.success).toBe(false);
      expect(result.failureCount).toBe(1);
      expect(result.errors[0].error).toBe("network error");
      expect(mockOnRefresh).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("batchRequestSignaturesWithRefetch", () => {
    it("retourne BatchResult avec refetchLatencyMs mesuré", async () => {
      const mockReq = requestBatchSignatures as ReturnType<typeof vi.fn>;
      mockReq.mockResolvedValue({
        totalRequested: 5,
        successCount: 5,
        failureCount: 0,
        errors: [],
        latencyMs: 300,
      });

      const supabase = makeMockSupabase();
      const result = await batchRequestSignaturesWithRefetch(
        supabase,
        { docType: "convention_learner", sessionId: "session-1" },
        mockOnRefresh,
      );

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(5);
      expect(result.refetchLatencyMs).toBeDefined();
      expect(result.refetchLatencyMs).toBeGreaterThanOrEqual(0);
      expect(mockOnRefresh).toHaveBeenCalledOnce();
    });

    it("log les erreurs de signature avec ownerName comme itemLabel", async () => {
      const mockReq = requestBatchSignatures as ReturnType<typeof vi.fn>;
      mockReq.mockResolvedValue({
        totalRequested: 3,
        successCount: 1,
        failureCount: 2,
        errors: [
          { docId: "d1", ownerName: "Jean Formateur", error: "missing email" },
          { docId: "d2", ownerName: "Marie Apprenant", error: "doc not confirmed" },
        ],
        latencyMs: 200,
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const supabase = makeMockSupabase();
      const result = await batchRequestSignaturesWithRefetch(
        supabase,
        { docType: "convention_learner", sessionId: "session-1" },
        mockOnRefresh,
      );

      expect(result.errors[0].itemLabel).toBe("Jean Formateur");
      expect(consoleSpy).toHaveBeenCalledTimes(2);
      expect(consoleSpy.mock.calls[0][0]).toContain("[BatchOperation] RequestSignatures");

      consoleSpy.mockRestore();
    });
  });

  describe("batchAssignTemplateToLearnersWithRefetch", () => {
    it("retourne success=true avec count correct", async () => {
      // upsertDocsIgnoreDuplicates is called inside the helper — it uses supabase.from("documents").upsert
      // The mock supabase handles this transparently
      const supabase = makeMockSupabase({
        upsert: { data: [], error: null },
      });

      const result = await batchAssignTemplateToLearnersWithRefetch(
        supabase,
        {
          entityId: "ent-1",
          sessionId: "session-1",
          templateId: "tpl-1",
          templateName: "Attestation custom",
          enrollments: [
            { learner: { id: "l1", first_name: "Alice", last_name: "Dupont" } },
            { learner: { id: "l2", first_name: "Bob", last_name: "Martin" } },
            { learner: null },
          ],
        },
        mockOnRefresh,
      );

      expect(result.success).toBe(true);
      expect(result.totalRequested).toBe(2); // 3 enrollments minus 1 null learner
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
      expect(mockOnRefresh).toHaveBeenCalledOnce();
    });

    it("retourne 0 items si aucun enrollment avec learner", async () => {
      const supabase = makeMockSupabase();
      const result = await batchAssignTemplateToLearnersWithRefetch(
        supabase,
        {
          entityId: "ent-1",
          sessionId: "session-1",
          templateId: "tpl-1",
          templateName: "Test",
          enrollments: [{ learner: null }, { learner: undefined }],
        },
        mockOnRefresh,
      );

      expect(result.totalRequested).toBe(0);
      expect(result.success).toBe(false);
      expect(mockOnRefresh).not.toHaveBeenCalled();
    });

    it("FIX B3 : retourne success=false si upsert throw (toast erreur, pas succès)", async () => {
      // Make upsert throw via the supabase mock
      const supabase = makeMockSupabase({
        upsert: { data: null, error: { message: "duplicate key" } },
      });

      // Override the from().upsert to throw
      const mockFrom = supabase.from as ReturnType<typeof vi.fn>;
      mockFrom.mockReturnValue({
        upsert: vi.fn().mockRejectedValue(new Error("upsert constraint violation")),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const result = await batchAssignTemplateToLearnersWithRefetch(
        supabase,
        {
          entityId: "ent-1",
          sessionId: "session-1",
          templateId: "tpl-1",
          templateName: "Attestation",
          enrollments: [
            { learner: { id: "l1" } },
          ],
        },
        mockOnRefresh,
      );

      expect(result.success).toBe(false);
      expect(result.failureCount).toBe(1);
      expect(result.errors[0].error).toContain("upsert constraint violation");
      // FIX B3: onRefresh should NOT be called on failure
      expect(mockOnRefresh).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
