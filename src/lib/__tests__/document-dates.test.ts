import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We test the exported getDefaultTemplate indirectly by verifying
// the document date resolution logic matches Qualiopi requirements.

// Inline the same logic as docDate/docDateLong for unit testing
function docDate(doc?: { document_date?: string | null; confirmed_at?: string | null }): string {
  if (doc?.document_date) {
    return new Date(doc.document_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  if (doc?.confirmed_at) {
    return new Date(doc.confirmed_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  return new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

describe("PDF document dates (exigence Qualiopi)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("priorite 1 : utilise document_date si defini", () => {
    const result = docDate({
      document_date: "2026-04-20",
      confirmed_at: "2026-04-18T14:30:00Z",
    });
    expect(result).toBe("20/04/2026");
  });

  it("priorite 2 : fallback sur confirmed_at si pas de document_date", () => {
    const result = docDate({
      document_date: null,
      confirmed_at: "2026-04-18T14:30:00Z",
    });
    expect(result).toBe("18/04/2026");
  });

  it("priorite 3 : fallback sur aujourd'hui si pas confirme", () => {
    const result = docDate({ document_date: null, confirmed_at: null });
    expect(result).toBe("15/06/2026");
  });

  it("fallback sur aujourd'hui si doc undefined", () => {
    const result = docDate(undefined);
    expect(result).toBe("15/06/2026");
  });

  it("date ne change pas entre 2 appels si document_date est fige", () => {
    const doc = { document_date: "2026-03-01", confirmed_at: null };
    const result1 = docDate(doc);

    // Avancer de 30 jours
    vi.setSystemTime(new Date("2026-07-15T10:00:00Z"));
    const result2 = docDate(doc);

    expect(result1).toBe(result2);
    expect(result1).toBe("01/03/2026");
  });

  it("date ne change pas si confirmed_at est fige", () => {
    const doc = { document_date: null, confirmed_at: "2026-05-10T09:00:00Z" };
    const result1 = docDate(doc);

    vi.setSystemTime(new Date("2026-12-01T10:00:00Z"));
    const result2 = docDate(doc);

    expect(result1).toBe(result2);
    expect(result1).toBe("10/05/2026");
  });
});
