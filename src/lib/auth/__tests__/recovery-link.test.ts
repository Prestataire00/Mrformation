import { describe, it, expect } from "vitest";
import { parseRecoveryLink } from "@/lib/auth/recovery-link";

describe("parseRecoveryLink", () => {
  it("détecte le code PKCE dans la query", () => {
    expect(parseRecoveryLink("?code=abc123", "")).toEqual({ kind: "code", code: "abc123" });
  });

  it("détecte le token implicite dans le hash", () => {
    expect(
      parseRecoveryLink("", "#access_token=xyz&type=recovery&refresh_token=r"),
    ).toEqual({ kind: "hash-token" });
  });

  it("détecte une erreur (lien expiré) dans la query", () => {
    const r = parseRecoveryLink("?error=access_denied&error_description=Email+link+is+invalid+or+has+expired", "");
    expect(r.kind).toBe("error");
    expect(r.errorDescription).toContain("expired");
  });

  it("détecte une erreur dans le hash", () => {
    const r = parseRecoveryLink("", "#error=access_denied&error_description=otp_expired");
    expect(r.kind).toBe("error");
  });

  it("l'erreur prime sur le code", () => {
    expect(parseRecoveryLink("?code=abc&error=access_denied", "").kind).toBe("error");
  });

  it("aucun paramètre → none", () => {
    expect(parseRecoveryLink("", "")).toEqual({ kind: "none" });
    expect(parseRecoveryLink("?foo=bar", "#baz=1")).toEqual({ kind: "none" });
  });
});
