import { describe, it, expect } from "vitest";
import { parseJsonResponse } from "@/lib/services/openai";
import { outlineSchema } from "@/lib/validations/elearning-ai";

/**
 * `parseJsonResponse` est le point unique où la fiabilité de la génération IA
 * e-learning est attrapée : il est utilisé par les 7 générateurs (outline,
 * chapter, quiz, exam, flashcards, slides…). Ces tests verrouillent son
 * contrat : nettoyage des fences markdown, erreurs TYPÉES sur sortie IA
 * non-JSON (`AI_JSON_PARSE`) ou structurellement invalide (`AI_SCHEMA`).
 */

function codeOfThrow(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined; // n'a pas levé
  } catch (e) {
    return (e as { code?: string }).code;
  }
}

describe("parseJsonResponse — nettoyage & parsing", () => {
  it("JSON pur (sans schéma) → objet parsé", () => {
    expect(parseJsonResponse('{"a":1,"b":"x"}')).toEqual({ a: 1, b: "x" });
  });

  it("strippe les fences ```json … ```", () => {
    expect(parseJsonResponse('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("strippe les fences ``` … ``` (sans le mot json)", () => {
    expect(parseJsonResponse('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("trim les espaces/sauts de ligne autour", () => {
    expect(parseJsonResponse('  \n {"a":1} \n  ')).toEqual({ a: 1 });
  });
});

describe("parseJsonResponse — erreurs typées (fiabilité IA)", () => {
  it("réponse non-JSON → code AI_JSON_PARSE", () => {
    expect(codeOfThrow(() => parseJsonResponse("Désolé, je ne peux pas générer ce contenu."))).toBe(
      "AI_JSON_PARSE",
    );
  });

  it("JSON tronqué → code AI_JSON_PARSE", () => {
    expect(codeOfThrow(() => parseJsonResponse('{"title":"x","chapters":['))).toBe("AI_JSON_PARSE");
  });

  it("JSON valide mais structure invalide (chapters vide) → code AI_SCHEMA", () => {
    const invalid = JSON.stringify({ title: "Cours", chapters: [] }); // min(1) requis
    expect(codeOfThrow(() => parseJsonResponse(invalid, outlineSchema))).toBe("AI_SCHEMA");
  });

  it("JSON valide mais champ requis manquant (title) → code AI_SCHEMA", () => {
    const invalid = JSON.stringify({ chapters: [{ title: "C1", key_concepts: ["a"] }] });
    expect(codeOfThrow(() => parseJsonResponse(invalid, outlineSchema))).toBe("AI_SCHEMA");
  });
});

describe("parseJsonResponse — succès avec schéma", () => {
  it("JSON + schéma valides → données typées", () => {
    const valid = JSON.stringify({
      title: "Cours sécurité au travail",
      chapters: [
        { title: "Introduction", key_concepts: ["EPI", "risques"] },
        { title: "Prévention", summary: "résumé", key_concepts: ["gestes"] },
      ],
    });
    const out = parseJsonResponse(valid, outlineSchema);
    expect(out.title).toBe("Cours sécurité au travail");
    expect(out.chapters).toHaveLength(2);
    expect(out.chapters[0].key_concepts).toEqual(["EPI", "risques"]);
  });

  it("schéma valide avec fences markdown → strip + validation OK", () => {
    const wrapped = "```json\n" + JSON.stringify({ title: "C", chapters: [{ title: "x", key_concepts: [] }] }) + "\n```";
    const out = parseJsonResponse(wrapped, outlineSchema);
    expect(out.title).toBe("C");
  });
});
