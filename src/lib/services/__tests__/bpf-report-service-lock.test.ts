import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { updateInvoiceBPF } from "../bpf-report-service";

// Verrou Abby sur la remédiation BPF (story 3.5, FR-21) : invoice_date EST
// la date d'émission poussée à Abby — les autres champs restent libres.

function makeDb(abbyPushState: string | null) {
  const updates: Array<Record<string, unknown>> = [];
  const supabase = {
    from: vi.fn(() => {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      builder.maybeSingle = vi.fn(async () => ({
        data: { abby_push_state: abbyPushState },
        error: null,
      }));
      builder.update = vi.fn((p: Record<string, unknown>) => {
        updates.push(p);
        return { eq: vi.fn(async () => ({ error: null })) };
      });
      return builder;
    }),
  } as unknown as SupabaseClient;
  return { supabase, updates };
}

describe("updateInvoiceBPF — verrou Abby (story 3.5)", () => {
  it("invoice_date sur une facture POUSSÉE → jette (message avoir), AUCUN update", async () => {
    const { supabase, updates } = makeDb("finalized");
    await expect(
      updateInvoiceBPF(supabase, "inv1", { invoice_date: "2026-01-15" })
    ).rejects.toThrow(/verrouillée.*avoir/);
    expect(updates).toHaveLength(0);
  });

  it("invoice_date sur une NON poussée (null explicite) → update passe — anti-piège undefined", async () => {
    const { supabase, updates } = makeDb(null);
    await updateInvoiceBPF(supabase, "inv1", { invoice_date: "2026-01-15" });
    expect(updates).toHaveLength(1);
    expect(updates[0].invoice_date).toBe("2026-01-15");
  });

  it("funding_type / invoice_date_confirmed sur une POUSSÉE → LIBRES (analytique BPF, FR-20), aucun lookup", async () => {
    const { supabase, updates } = makeDb("finalized");
    await updateInvoiceBPF(supabase, "inv1", { funding_type: "opco" });
    await updateInvoiceBPF(supabase, "inv1", { invoice_date_confirmed: true });
    expect(updates).toHaveLength(2);
  });
});
