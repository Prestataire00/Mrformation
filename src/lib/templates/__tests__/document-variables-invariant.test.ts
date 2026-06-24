import { describe, it, expect } from "vitest";
import { SYSTEM_TEMPLATES_BY_DOC_TYPE } from "../registry";
import {
  resolveDocumentVariables,
  ALIAS_TO_VARIABLE_KEY,
} from "@/lib/utils/resolve-variables";

/**
 * Filet anti-régression « variables de documents ».
 *
 * Bug ciblé (classe n°1 des remontées client sur Documents/Attestations) :
 * un template système référence une variable qui n'est câblée NULLE PART dans
 * le resolver. Résultat : le PDF Qualiopi part au client avec un placeholder
 * visible (`[%Quelque chose%]` ou `{{cle_inconnue}}`) au lieu d'une valeur.
 *
 * Deux modes de panne, tous deux indépendants des données :
 *   (A) `{{cle_technique}}` que `resolveVariables` ne connaît pas → reste tel
 *       quel même après résolution (on résout avec un contexte VIDE : seules
 *       les clés réellement inconnues du resolver subsistent, les données
 *       manquantes tombant sur leurs fallbacks `[Xxx]`).
 *   (B) `[%Libellé Sellsy%]` absent de `ALIAS_TO_VARIABLE_KEY` → ne sera jamais
 *       converti en clé technique (cf. resolve-variables.ts : libellé inconnu
 *       conservé en clair).
 *
 * Si un·e dev ajoute une variable à un template sans la brancher, ce test
 * échoue en nommant le doc_type fautif AVANT que le document n'atteigne le
 * client.
 */

const TOKEN_ALIAS = /\[%([^%\]]+)%\]/g;
const TOKEN_TECH = /\{\{[^}]+\}\}/g;

/** Renvoie les libellés `[%…%]` du template absents de la table d'alias. */
function unknownAliases(content: string): string[] {
  const labels = [...content.matchAll(TOKEN_ALIAS)].map((m) => m[1].trim());
  return [...new Set(labels.filter((label) => !(label in ALIAS_TO_VARIABLE_KEY)))];
}

/** Renvoie les `{{…}}` encore présents après résolution à contexte vide. */
function unresolvedTechnicalKeys(content: string): string[] {
  const resolved = resolveDocumentVariables(content, {} as never);
  return [...new Set(resolved.match(TOKEN_TECH) ?? [])];
}

const docTypes = Object.keys(SYSTEM_TEMPLATES_BY_DOC_TYPE);

describe("Invariant variables documents — aucun placeholder non câblé", () => {
  it("le registre n'est pas vide (garde-fou)", () => {
    expect(docTypes.length).toBeGreaterThan(0);
  });

  // NB : on n'itère que sur les clés (string) — pas sur les objets template —
  // pour garder une sortie d'échec lisible (le HTML fait plusieurs Ko).
  it.each(docTypes)(
    "doc_type « %s » : tous les [%%Libellés%%] sont mappés et toutes les {{clés}} sont résolues",
    (docType) => {
      const tpl = SYSTEM_TEMPLATES_BY_DOC_TYPE[docType];
      const combined = `${tpl.html}\n${tpl.footer}`;

      expect(unknownAliases(combined)).toEqual([]);
      expect(unresolvedTechnicalKeys(combined)).toEqual([]);
    },
  );
});

/**
 * Auto-test du détecteur : prouve que les deux modes de panne SONT bien
 * attrapés. Sans ça, l'invariant ci-dessus pourrait être « toujours vert »
 * (faux sentiment de sécurité) si la détection était cassée.
 */
describe("Auto-test du détecteur (méta)", () => {
  it("détecte un libellé Sellsy non mappé", () => {
    const broken = `<p>[%Variable Totalement Inexistante%]</p>`;
    expect(unknownAliases(broken)).toContain("Variable Totalement Inexistante");
  });

  it("détecte une clé technique inconnue après résolution", () => {
    const broken = `<p>{{cle_technique_qui_nexiste_pas}}</p>`;
    expect(unresolvedTechnicalKeys(broken)).toContain("{{cle_technique_qui_nexiste_pas}}");
  });

  it("ne lève PAS de faux positif sur un libellé correctement mappé", () => {
    const ok = `<p>[%Nom de l'apprenant%]</p>`;
    expect(unknownAliases(ok)).toEqual([]);
  });
});
