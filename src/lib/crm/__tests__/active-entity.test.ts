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

  it("rôle non super_admin + cookie présent → renvoie profile.entity_id", () => {
    h.cookie = MR;
    expect(resolveActiveEntityId({ role: "admin", entity_id: C3V })).toBe(C3V);
  });
});
