import { describe, it, expect } from "vitest";
import { aiGenerationError } from "@/lib/api-error";

/**
 * `parseJsonResponse` (génération IA e-learning) lève des erreurs typées
 * (`AI_SCHEMA`, `AI_JSON_PARSE`). Sans mapping, les routes les renvoyaient en
 * 500 « Une erreur interne est survenue » — indiscernable d'un vrai crash, et
 * sans indiquer au client qu'un nouvel essai aide.
 *
 * `aiGenerationError` traduit ces codes en réponse claire + statut 422 (la
 * requête était valide ; c'est la sortie IA qui est inexploitable).
 */
describe("aiGenerationError", () => {
  it("AI_SCHEMA → 422 + message actionnable", () => {
    const err = Object.assign(new Error("Sortie IA invalide: chapters"), { code: "AI_SCHEMA" });
    const r = aiGenerationError(err);
    expect(r).not.toBeNull();
    expect(r!.status).toBe(422);
    expect(r!.error).toMatch(/réessayer/i);
  });

  it("AI_JSON_PARSE → 422 + message actionnable", () => {
    const err = Object.assign(new Error("Réponse IA non-JSON"), { code: "AI_JSON_PARSE" });
    const r = aiGenerationError(err);
    expect(r).not.toBeNull();
    expect(r!.status).toBe(422);
    expect(r!.error).toMatch(/réessayer/i);
  });

  it("ne fuite pas le message technique interne", () => {
    const err = Object.assign(new Error("Sortie IA invalide: chapters.0.title, quiz_questions"), {
      code: "AI_SCHEMA",
    });
    const r = aiGenerationError(err);
    expect(r!.error).not.toContain("chapters.0.title");
  });

  it("erreur sans code IA → null (laisse le 500 générique)", () => {
    expect(aiGenerationError(new Error("DB connection lost"))).toBeNull();
  });

  it("erreur avec un autre code → null", () => {
    expect(aiGenerationError(Object.assign(new Error("x"), { code: "PGRST116" }))).toBeNull();
  });

  it("valeurs non-Error → null", () => {
    expect(aiGenerationError("boom")).toBeNull();
    expect(aiGenerationError(null)).toBeNull();
    expect(aiGenerationError(undefined)).toBeNull();
  });
});
