import { describe, it, expect, vi, beforeEach } from "vitest";

// Cookie mocké, contrôlable par test. vi.hoisted pour être dispo dans vi.mock.
const h = vi.hoisted(() => ({ cookie: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string) =>
      name === "entity_id" && h.cookie ? { value: h.cookie } : undefined,
  }),
}));

import { resolveActiveEntityId } from "../active-entity";

const MR = "f8acea54-71ab-4a22-8cf3-4e7170543bf1";
const C3V = "51e959a3-eaaf-4f4a-bd7f-f41784595d90";

describe("resolveActiveEntityId", () => {
  beforeEach(() => { h.cookie = undefined; });

  it("super_admin + cookie UUID valide → renvoie le cookie", () => {
    h.cookie = MR;
    expect(resolveActiveEntityId({ role: "super_admin", entity_id: C3V })).toBe(MR);
  });

  it("super_admin sans cookie → renvoie profile.entity_id", () => {
    expect(resolveActiveEntityId({ role: "super_admin", entity_id: C3V })).toBe(C3V);
  });

  it("super_admin + cookie non-UUID → renvoie profile.entity_id", () => {
    h.cookie = "pas-un-uuid";
    expect(resolveActiveEntityId({ role: "super_admin", entity_id: C3V })).toBe(C3V);
  });

  it("admin + cookie présent → ignore le cookie, renvoie profile.entity_id", () => {
    h.cookie = MR;
    expect(resolveActiveEntityId({ role: "admin", entity_id: C3V })).toBe(C3V);
  });

  it("commercial + cookie présent → ignore le cookie, renvoie profile.entity_id", () => {
    // Le commercial est cross-entité, mais piloté par profile.entity_id
    // (synchronisé par /api/auth/switch-entity) — jamais le cookie, pour
    // rester aligné sur la RLS commercial (filtre public.user_entity_id()).
    h.cookie = MR;
    expect(resolveActiveEntityId({ role: "commercial", entity_id: C3V })).toBe(C3V);
  });
});
