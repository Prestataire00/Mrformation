import { describe, it, expect, vi } from "vitest";
import { loadSignaturesBySessionId } from "@/lib/services/load-signatures";

/**
 * Mock minimaliste de SupabaseClient pour loadSignaturesBySessionId.
 * Pattern identique à load-session-aggregates.test.ts.
 *
 * La fonction sous test fait :
 *   await supabase.from("signatures").select(...).eq("session_id", sessionId)
 *
 * Le `await` déclenche `query.then(resolve)` du thenable → resolve avec
 * { data: rows, error: null }.
 */
type Row = {
  signer_id: string | null;
  signer_type: string | null;
  signature_data: string | null;
  time_slot_id: string | null;
};

function makeNullDataMock() {
  const query: Record<string, unknown> = {};
  const chainable = () => query;
  query.select = vi.fn(chainable);
  query.eq = vi.fn(chainable);
  // Supabase retourne data: null quand une erreur réseau ou RLS bloque la query
  query.then = (resolve: (v: unknown) => void) =>
    resolve({ data: null, error: { message: "network error" } });

  return {
    from: vi.fn(() => query),
  };
}

function makeSupabaseMock(rows: Row[]) {
  const fromCalls: string[] = [];
  const eqCalls: Array<{ column: string; value: unknown }> = [];

  const query: Record<string, unknown> = {};
  const chainable = () => query;
  query.select = vi.fn(chainable);
  query.eq = vi.fn((column: string, value: unknown) => {
    eqCalls.push({ column, value });
    return query;
  });
  query.then = (resolve: (v: unknown) => void) =>
    resolve({ data: rows, error: null });

  return {
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      return query;
    }),
    fromCalls,
    eqCalls,
  };
}

describe("loadSignaturesBySessionId", () => {
  it("aucune signature → empty maps + count=0", async () => {
    const mock = makeSupabaseMock([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await loadSignaturesBySessionId(mock as any, "SESS-1");

    expect(result.signaturesById.size).toBe(0);
    expect(result.signaturesBySlotPerson.size).toBe(0);
    expect(result.signedLearnerIds.size).toBe(0);
    expect(result.totalCount).toBe(0);
  });

  it("1 signature complète learner → présente dans les 3 structures", async () => {
    const mock = makeSupabaseMock([
      {
        signer_id: "LEARNER-1",
        signer_type: "learner",
        signature_data: "<svg>L1</svg>",
        time_slot_id: "SLOT-A",
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await loadSignaturesBySessionId(mock as any, "SESS-1");

    expect(result.signaturesById.get("LEARNER-1")).toBe("<svg>L1</svg>");
    expect(result.signaturesBySlotPerson.get("SLOT-A|LEARNER-1|learner")).toBe("<svg>L1</svg>");
    expect(result.signedLearnerIds.has("LEARNER-1")).toBe(true);
    expect(result.totalCount).toBe(1);
  });

  it("1 signature trainer avec time_slot_id → signaturesById + slotPerson, PAS signedLearnerIds", async () => {
    const mock = makeSupabaseMock([
      {
        signer_id: "TRAINER-1",
        signer_type: "trainer",
        signature_data: "<svg>T1</svg>",
        time_slot_id: "SLOT-A",
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await loadSignaturesBySessionId(mock as any, "SESS-1");

    expect(result.signaturesById.get("TRAINER-1")).toBe("<svg>T1</svg>");
    expect(result.signaturesBySlotPerson.get("SLOT-A|TRAINER-1|trainer")).toBe("<svg>T1</svg>");
    expect(result.signedLearnerIds.has("TRAINER-1")).toBe(false);
  });

  it("signature avec signer_id=null → skippée (mais totalCount inclut)", async () => {
    const mock = makeSupabaseMock([
      {
        signer_id: null,
        signer_type: "learner",
        signature_data: "<svg>orphan</svg>",
        time_slot_id: "SLOT-A",
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await loadSignaturesBySessionId(mock as any, "SESS-1");

    expect(result.signaturesById.size).toBe(0);
    expect(result.signaturesBySlotPerson.size).toBe(0);
    expect(result.signedLearnerIds.size).toBe(0);
    expect(result.totalCount).toBe(1); // typed.length inclut les rows skipped via continue
  });

  it("signature avec signature_data=null + learner → signaturesById vide, signedLearnerIds contient", async () => {
    const mock = makeSupabaseMock([
      {
        signer_id: "LEARNER-2",
        signer_type: "learner",
        signature_data: null, // présence cochée sans dessin (admin_bulk pre-fix par exemple)
        time_slot_id: "SLOT-A",
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await loadSignaturesBySessionId(mock as any, "SESS-1");

    expect(result.signaturesById.has("LEARNER-2")).toBe(false);
    expect(result.signaturesBySlotPerson.size).toBe(0);
    expect(result.signedLearnerIds.has("LEARNER-2")).toBe(true);
    expect(result.totalCount).toBe(1);
  });

  it("signature sans time_slot_id → signaturesById seulement", async () => {
    const mock = makeSupabaseMock([
      {
        signer_id: "LEARNER-3",
        signer_type: "learner",
        signature_data: "<svg>L3</svg>",
        time_slot_id: null, // signature globale (legacy avant slots)
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await loadSignaturesBySessionId(mock as any, "SESS-1");

    expect(result.signaturesById.get("LEARNER-3")).toBe("<svg>L3</svg>");
    expect(result.signaturesBySlotPerson.size).toBe(0);
    expect(result.signedLearnerIds.has("LEARNER-3")).toBe(true);
  });

  it("signature sans signer_type mais avec time_slot_id → signaturesById PAS signaturesBySlotPerson", async () => {
    const mock = makeSupabaseMock([
      {
        signer_id: "X-1",
        signer_type: null, // les 2 conditions doivent être true pour rejoindre slotPerson
        signature_data: "<svg>X</svg>",
        time_slot_id: "SLOT-A",
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await loadSignaturesBySessionId(mock as any, "SESS-1");

    expect(result.signaturesById.get("X-1")).toBe("<svg>X</svg>");
    expect(result.signaturesBySlotPerson.size).toBe(0);
    expect(result.signedLearnerIds.has("X-1")).toBe(false); // signer_type !== "learner"
  });

  it("2 signatures même signer_id → la dernière gagne (Map overwrite)", async () => {
    const mock = makeSupabaseMock([
      {
        signer_id: "LEARNER-4",
        signer_type: "learner",
        signature_data: "<svg>first</svg>",
        time_slot_id: null,
      },
      {
        signer_id: "LEARNER-4",
        signer_type: "learner",
        signature_data: "<svg>second</svg>",
        time_slot_id: null,
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await loadSignaturesBySessionId(mock as any, "SESS-1");

    expect(result.signaturesById.get("LEARNER-4")).toBe("<svg>second</svg>");
    expect(result.signaturesById.size).toBe(1);
    expect(result.totalCount).toBe(2);
  });

  it("filtre .eq('session_id', sessionId) appelé correctement", async () => {
    const mock = makeSupabaseMock([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await loadSignaturesBySessionId(mock as any, "SESS-123");

    expect(mock.fromCalls).toEqual(["signatures"]);
    expect(mock.eqCalls).toEqual([{ column: "session_id", value: "SESS-123" }]);
  });

  it("mix réaliste : 3 learners (2 signés, 1 sans data) + 1 trainer + 1 null", async () => {
    const mock = makeSupabaseMock([
      // Learner 1 : signé avec data + slot
      {
        signer_id: "L1",
        signer_type: "learner",
        signature_data: "<svg>L1</svg>",
        time_slot_id: "SLOT-A",
      },
      // Learner 2 : signé avec data, sans slot (legacy)
      {
        signer_id: "L2",
        signer_type: "learner",
        signature_data: "<svg>L2</svg>",
        time_slot_id: null,
      },
      // Learner 3 : présence cochée mais signature_data null
      {
        signer_id: "L3",
        signer_type: "learner",
        signature_data: null,
        time_slot_id: "SLOT-A",
      },
      // Trainer 1 : signé avec data + slot
      {
        signer_id: "T1",
        signer_type: "trainer",
        signature_data: "<svg>T1</svg>",
        time_slot_id: "SLOT-A",
      },
      // Row orpheline : signer_id null → skippée
      {
        signer_id: null,
        signer_type: "learner",
        signature_data: "<svg>orphan</svg>",
        time_slot_id: "SLOT-A",
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await loadSignaturesBySessionId(mock as any, "SESS-1");

    // signaturesById : L1 + L2 + T1 (L3 sans data, orphan skip)
    expect(result.signaturesById.size).toBe(3);
    expect(result.signaturesById.get("L1")).toBe("<svg>L1</svg>");
    expect(result.signaturesById.get("L2")).toBe("<svg>L2</svg>");
    expect(result.signaturesById.get("T1")).toBe("<svg>T1</svg>");

    // signaturesBySlotPerson : L1 + T1 (L2 sans slot, L3 sans data, orphan skip)
    expect(result.signaturesBySlotPerson.size).toBe(2);
    expect(result.signaturesBySlotPerson.get("SLOT-A|L1|learner")).toBe("<svg>L1</svg>");
    expect(result.signaturesBySlotPerson.get("SLOT-A|T1|trainer")).toBe("<svg>T1</svg>");

    // signedLearnerIds : L1 + L2 + L3 (tous les learners avec signer_id non-null)
    expect(result.signedLearnerIds.size).toBe(3);
    expect(result.signedLearnerIds.has("L1")).toBe(true);
    expect(result.signedLearnerIds.has("L2")).toBe(true);
    expect(result.signedLearnerIds.has("L3")).toBe(true);
    expect(result.signedLearnerIds.has("T1")).toBe(false);

    // totalCount inclut TOUTES les rows (5 incluant l'orpheline skipped)
    expect(result.totalCount).toBe(5);
  });

  it("data=null (erreur réseau/RLS) → rows ?? [] fallback → empty structures", async () => {
    const mock = makeNullDataMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await loadSignaturesBySessionId(mock as any, "SESS-1");

    // Le ?? [] s'applique : typed est un tableau vide, aucune itération
    expect(result.signaturesById.size).toBe(0);
    expect(result.signaturesBySlotPerson.size).toBe(0);
    expect(result.signedLearnerIds.size).toBe(0);
    expect(result.totalCount).toBe(0);
  });
});
