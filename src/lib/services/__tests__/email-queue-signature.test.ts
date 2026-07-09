import { describe, it, expect } from "vitest";
import { enqueueEmail, enqueueEmails } from "@/lib/services/email-queue";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Vérifie que l'enqueue injecte la signature commerciale quand `sent_by` est
 * fourni, et rien pour un envoi système (sans sent_by). Cf. spec
 * docs/superpowers/specs/2026-07-09-email-commercial-signature-design.md
 */

interface Captured {
  inserted: Record<string, unknown>[];
}

/**
 * Mock supabase :
 *  - profiles : select/eq/maybeSingle → { email_signature } ; select/in → liste
 *  - email_history : insert(row|rows) capture puis select/single (single insert)
 */
function makeSupabase(
  signaturesById: Record<string, string | null>,
  captured: Captured,
): SupabaseClient {
  return {
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: (_col: string, id: string) => ({
              maybeSingle: async () => ({
                data: id in signaturesById ? { email_signature: signaturesById[id] } : null,
                error: null,
              }),
            }),
            in: (_col: string, ids: string[]) => ({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              then: (resolve: (v: any) => void) =>
                resolve({
                  data: ids
                    .filter((id) => id in signaturesById)
                    .map((id) => ({ id, email_signature: signaturesById[id] })),
                  error: null,
                }),
            }),
          }),
        };
      }
      // email_history
      return {
        insert: (rowOrRows: Record<string, unknown> | Record<string, unknown>[]) => {
          const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
          captured.inserted.push(...rows);
          return {
            select: () => ({
              single: async () => ({ data: { id: "eh1", scheduled_for: null }, error: null }),
            }),
            // pour enqueueEmails (insert(rows, { count }))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            then: (resolve: (v: any) => void) => resolve({ error: null, count: rows.length }),
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

const base = { to: "dest@example.com", subject: "Objet", entity_id: "e1", body: "Bonjour," };

describe("enqueueEmail — signature commerciale", () => {
  it("ajoute la signature de l'expéditeur quand sent_by est fourni", async () => {
    const captured: Captured = { inserted: [] };
    const supabase = makeSupabase({ p1: "Jean Dupont\nCommercial" }, captured);
    await enqueueEmail(supabase, { ...base, sent_by: "p1" });
    expect(captured.inserted[0].body).toBe("Bonjour,\n\n--\nJean Dupont\nCommercial");
  });

  it("n'ajoute rien pour un envoi système (sans sent_by)", async () => {
    const captured: Captured = { inserted: [] };
    const supabase = makeSupabase({ p1: "Jean Dupont" }, captured);
    await enqueueEmail(supabase, { ...base });
    expect(captured.inserted[0].body).toBe("Bonjour,");
  });

  it("n'ajoute rien si l'expéditeur n'a pas de signature", async () => {
    const captured: Captured = { inserted: [] };
    const supabase = makeSupabase({ p1: null }, captured);
    await enqueueEmail(supabase, { ...base, sent_by: "p1" });
    expect(captured.inserted[0].body).toBe("Bonjour,");
  });
});

describe("enqueueEmails (bulk) — signature commerciale", () => {
  it("applique la bonne signature par expéditeur", async () => {
    const captured: Captured = { inserted: [] };
    const supabase = makeSupabase({ p1: "Alice", p2: "Bob" }, captured);
    await enqueueEmails(supabase, [
      { ...base, to: "a@x.com", sent_by: "p1" },
      { ...base, to: "b@x.com", sent_by: "p2" },
      { ...base, to: "c@x.com" }, // système
    ]);
    const byRecipient = Object.fromEntries(
      captured.inserted.map((r) => [r.recipient_email, r.body]),
    );
    expect(byRecipient["a@x.com"]).toBe("Bonjour,\n\n--\nAlice");
    expect(byRecipient["b@x.com"]).toBe("Bonjour,\n\n--\nBob");
    expect(byRecipient["c@x.com"]).toBe("Bonjour,");
  });
});
