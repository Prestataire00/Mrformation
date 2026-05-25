import { describe, it, expect } from "vitest";
import { mapStatusToFlags } from "@/lib/utils/document-status";

describe("mapStatusToFlags", () => {
  it("draft → tout false sauf is_confirmed=false", () => {
    expect(mapStatusToFlags("draft")).toEqual({
      is_confirmed: false,
      is_sent: false,
      is_signed: false,
    });
  });

  it("generated → is_confirmed=true, sent et signed restent false", () => {
    expect(mapStatusToFlags("generated")).toEqual({
      is_confirmed: true,
      is_sent: false,
      is_signed: false,
    });
  });

  it("sent → is_confirmed et is_sent true, signed false", () => {
    expect(mapStatusToFlags("sent")).toEqual({
      is_confirmed: true,
      is_sent: true,
      is_signed: false,
    });
  });

  it("signed → tout true (sent implique signé)", () => {
    expect(mapStatusToFlags("signed")).toEqual({
      is_confirmed: true,
      is_sent: true,
      is_signed: true,
    });
  });

  it("null / undefined / status inconnu → fallback draft", () => {
    const expected = { is_confirmed: false, is_sent: false, is_signed: false };
    expect(mapStatusToFlags(null)).toEqual(expected);
    expect(mapStatusToFlags(undefined)).toEqual(expected);
    expect(mapStatusToFlags("cancelled")).toEqual(expected);
    expect(mapStatusToFlags("inconnu")).toEqual(expected);
  });
});
