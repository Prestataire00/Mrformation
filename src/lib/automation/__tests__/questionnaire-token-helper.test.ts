import { describe, it, expect, vi } from "vitest";
import { ensureQuestionnaireToken, buildPublicQuestionnaireUrl } from "@/lib/automation/questionnaire-token-helper";

describe("ensureQuestionnaireToken", () => {
  it("retourne le token existant si actif (wasCreated: false)", async () => {
    const existingToken = {
      token: "11111111-1111-1111-1111-111111111111",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    };
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: existingToken, error: null })),
      })),
    };
    const result = await ensureQuestionnaireToken(supabase as never, "S1", "Q1", "L1", "E1");
    expect(result.token).toBe(existingToken.token);
    expect(result.wasCreated).toBe(false);
    expect(result.expiresAt).toBe(existingToken.expires_at);
  });

  it("crée un nouveau token si aucun actif n'existe (wasCreated: true)", async () => {
    const newToken = {
      token: "22222222-2222-2222-2222-222222222222",
      expires_at: new Date(Date.now() + 90 * 86400000).toISOString(),
    };
    let callCount = 0;
    const supabase = {
      from: vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          };
        }
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn(async () => ({ data: newToken, error: null })),
        };
      }),
    };
    const result = await ensureQuestionnaireToken(supabase as never, "S1", "Q1", "L1", "E1");
    expect(result.token).toBe(newToken.token);
    expect(result.wasCreated).toBe(true);
  });

  it("ignore les tokens expirés et en crée un nouveau", async () => {
    const newToken = {
      token: "33333333-3333-3333-3333-333333333333",
      expires_at: new Date(Date.now() + 90 * 86400000).toISOString(),
    };
    let callCount = 0;
    const supabase = {
      from: vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          };
        }
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn(async () => ({ data: newToken, error: null })),
        };
      }),
    };
    const result = await ensureQuestionnaireToken(supabase as never, "S1", "Q1", "L1", "E1");
    expect(result.wasCreated).toBe(true);
    expect(result.token).toBe(newToken.token);
  });
});

describe("buildPublicQuestionnaireUrl", () => {
  it("construit l'URL avec NEXT_PUBLIC_APP_URL si défini", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://test.example.com";
    expect(buildPublicQuestionnaireUrl("abc-123")).toBe("https://test.example.com/questionnaire/abc-123");
  });

  it("utilise le fallback hardcodé si NEXT_PUBLIC_APP_URL absent", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(buildPublicQuestionnaireUrl("abc-123")).toBe("https://mrformationcrm.netlify.app/questionnaire/abc-123");
  });
});
