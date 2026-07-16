import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock du SDK — seul src/lib/abby/ a le droit de l'importer (AD-2)
const getMeMock = vi.fn();
const abbyCtorMock = vi.fn();

vi.mock("@abby-inc/node", () => ({
  default: class AbbyMock {
    company = { getMe: getMeMock };
    constructor(apiKey: string, config?: Record<string, unknown>) {
      abbyCtorMock(apiKey, config);
    }
  },
}));

import { fetchCompanyIdentity, createAbbyClient } from "../client";
import { toAbbyErrorCode } from "../errors";

describe("ACL Abby — client (normalisation défensive)", () => {
  beforeEach(() => {
    getMeMock.mockReset();
    abbyCtorMock.mockReset();
  });

  it("instancie le SDK avec la clé et un timeout de 8 s (limite Netlify 10 s)", () => {
    createAbbyClient("suk_test");
    expect(abbyCtorMock).toHaveBeenCalledWith(
      "suk_test",
      expect.objectContaining({ timeout: 8000 })
    );
  });

  it("dénoyaute data.company et normalise commercialName null + isInTestMode number", async () => {
    getMeMock.mockResolvedValue({
      data: {
        company: {
          commercialName: null,
          siret: "91311329600036",
          isInTestMode: 1,
        },
        user: {},
        preferences: {},
      },
    });
    const identity = await fetchCompanyIdentity("suk_test");
    expect(identity).toEqual({
      companyName: null,
      companySiret: "91311329600036",
      isInTestMode: true,
    });
  });

  it("normalise isInTestMode falsy (0/undefined) en false", async () => {
    getMeMock.mockResolvedValue({
      data: { company: { commercialName: "ACME", siret: "123", isInTestMode: 0 } },
    });
    const identity = await fetchCompanyIdentity("suk_test");
    expect(identity.isInTestMode).toBe(false);
    expect(identity.companyName).toBe("ACME");
  });
});

describe("ACL Abby — errors (mapping err.status → codes internes)", () => {
  it("mappe 401 vers abby_auth_failed", () => {
    expect(toAbbyErrorCode({ status: 401 })).toBe("abby_auth_failed");
  });

  it("mappe 403 vers abby_plan_no_api", () => {
    expect(toAbbyErrorCode({ status: 403 })).toBe("abby_plan_no_api");
  });

  it("mappe 404 vers abby_not_found", () => {
    expect(toAbbyErrorCode({ status: 404 })).toBe("abby_not_found");
  });

  it("mappe 429 vers abby_rate_limited et 400 vers abby_validation", () => {
    expect(toAbbyErrorCode({ status: 429 })).toBe("abby_rate_limited");
    expect(toAbbyErrorCode({ status: 400 })).toBe("abby_validation");
  });

  it("mappe une erreur sans status (réseau, fetch failed) vers abby_network", () => {
    expect(toAbbyErrorCode(new Error("fetch failed"))).toBe("abby_network");
    expect(toAbbyErrorCode(undefined)).toBe("abby_network");
    expect(toAbbyErrorCode({ status: 500 })).toBe("abby_network");
  });
});
