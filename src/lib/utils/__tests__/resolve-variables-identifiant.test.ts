import { describe, it, expect } from "vitest";
import { resolveDocumentVariables, type ResolveContext } from "@/lib/utils/resolve-variables";

const baseCtx = (overrides: Partial<ResolveContext>): ResolveContext =>
  ({ learner: { username: "jdupont", email: "j@ex.com" }, ...overrides } as unknown as ResolveContext);

describe("résolution [%Identifiant apprenant%]", () => {
  it("remplace [%Identifiant apprenant%] par le username de l'apprenant", () => {
    const html = "Identifiant : [%Identifiant apprenant%]";
    const out = resolveDocumentVariables(html, baseCtx({}));
    expect(out).toContain("jdupont");
    expect(out).not.toContain("[%Identifiant apprenant%]");
  });

  it("fallback sur l'email si pas de username", () => {
    const html = "Identifiant : [%Identifiant apprenant%]";
    const out = resolveDocumentVariables(html, baseCtx({ learner: { email: "fallback@ex.com" } as never }));
    expect(out).toContain("fallback@ex.com");
  });
});
