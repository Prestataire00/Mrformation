import { describe, it, expect } from "vitest";
import { appendCommercialSignature, loadCommercialSignature } from "@/lib/email/signature";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("appendCommercialSignature", () => {
  it("ajoute la signature en bas avec le séparateur --", () => {
    expect(appendCommercialSignature("Bonjour,", "Jean Dupont\nCommercial")).toBe(
      "Bonjour,\n\n--\nJean Dupont\nCommercial",
    );
  });

  it("no-op si signature vide, null ou espaces", () => {
    expect(appendCommercialSignature("Corps", "")).toBe("Corps");
    expect(appendCommercialSignature("Corps", null)).toBe("Corps");
    expect(appendCommercialSignature("Corps", "   ")).toBe("Corps");
    expect(appendCommercialSignature("Corps", undefined)).toBe("Corps");
  });

  it("idempotent : ne double pas une signature déjà présente en fin de corps", () => {
    const once = appendCommercialSignature("Bonjour,", "Jean Dupont");
    const twice = appendCommercialSignature(once, "Jean Dupont");
    expect(twice).toBe(once);
    expect(twice.match(/Jean Dupont/g)).toHaveLength(1);
  });

  it("trim la signature avant comparaison / ajout", () => {
    expect(appendCommercialSignature("Corps", "  Sig  ")).toBe("Corps\n\n--\nSig");
  });
});

/** Mock minimal du chaînage supabase.from().select().eq().maybeSingle(). */
function makeSupabaseReturning(row: { email_signature: string | null } | null): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row, error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe("loadCommercialSignature", () => {
  it("retourne null si profileId absent (aucun appel DB)", async () => {
    const supabase = { from: () => { throw new Error("ne doit pas être appelé"); } } as unknown as SupabaseClient;
    expect(await loadCommercialSignature(supabase, null)).toBeNull();
    expect(await loadCommercialSignature(supabase, undefined)).toBeNull();
  });

  it("retourne la signature du profil", async () => {
    const supabase = makeSupabaseReturning({ email_signature: "Jean Dupont" });
    expect(await loadCommercialSignature(supabase, "p1")).toBe("Jean Dupont");
  });

  it("retourne null si profil introuvable ou signature vide", async () => {
    expect(await loadCommercialSignature(makeSupabaseReturning(null), "p1")).toBeNull();
    expect(await loadCommercialSignature(makeSupabaseReturning({ email_signature: null }), "p1")).toBeNull();
    expect(await loadCommercialSignature(makeSupabaseReturning({ email_signature: "  " }), "p1")).toBeNull();
  });
});
