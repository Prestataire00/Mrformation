import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Garde de non-régression FR-19 (story 4.3, AC-4) : Abby n'envoie JAMAIS
// d'email — ni facture, ni relance. Le circuit d'envoi reste 100 % LMS.
// Le SDK expose QUATRE méthodes d'email (sdk.gen.d.ts:133/137/141/145) :
// un pattern partiel en raterait deux (leçon de validation).

const FORBIDDEN =
  /\.(sendByEmail|sendEmailTest|sendTestEmailSignature|renderEmail)\s*\(/;

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe("FR-19 — aucun envoi d'email par Abby (garde de non-régression)", () => {
  it("aucun appel aux 4 méthodes d'email du SDK dans src/", () => {
    const offenders = walk("src")
      .filter((f) => !f.includes("__tests__"))
      .filter((f) => FORBIDDEN.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
