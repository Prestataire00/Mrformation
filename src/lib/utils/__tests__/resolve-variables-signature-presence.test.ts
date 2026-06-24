import { describe, it, expect } from "vitest";
import { resolveVariables, type ResolveContext } from "@/lib/utils/resolve-variables";
import type { Session } from "@/lib/types";

/**
 * Émargement — table de signature compacte (`{{tableau_signature_compact}}`).
 *
 * Verrouille la logique de présence et la CONVENTION signer_id :
 *   - apprenant signé pour un créneau → « Présent » + image de signature ;
 *   - le lookup se fait sur `slotId|<learners.id>|learner` (PAS le profile_id).
 *
 * C'est la classe de bug « présence 0/100 » : si les signatures sont chargées
 * avec le mauvais identifiant (profile_id au lieu de learners.id), tous les
 * apprenants ressortent absents. Le 3ᵉ test capture précisément ce cas.
 */

const SIG_SVG = "<svg>signature</svg>";

function makeSession(): Session {
  return {
    id: "session-1",
    entity_id: "entity-1",
    start_date: "2026-06-08T07:00:00.000Z",
    end_date: "2026-06-08T15:00:00.000Z", // passée (vs date du jour) → renderUnsignedCell = "Non signé"
    enrollments: [
      { learner: { id: "learner-1", first_name: "Pierre", last_name: "MARTIN" } },
    ],
    formation_trainers: [
      { trainer: { id: "trainer-1", first_name: "Karim", last_name: "AZIZI" } },
    ],
    formation_time_slots: [
      { id: "slot-1", start_time: "2026-06-08T07:00:00.000Z", end_time: "2026-06-08T11:00:00.000Z" },
    ],
  } as unknown as Session;
}

function resolveCompact(slotSig: Map<string, string>): string {
  const ctx: ResolveContext = { session: makeSession(), signaturesBySlotPerson: slotSig };
  return resolveVariables("{{tableau_signature_compact}}", ctx);
}

describe("Émargement compact — présence apprenant (convention signer_id = learners.id)", () => {
  it("apprenant signé pour le créneau → « Présent » + signature", () => {
    const html = resolveCompact(new Map([["slot-1|learner-1|learner", SIG_SVG]]));
    expect(html).toContain("MARTIN Pierre");
    expect(html).toContain("Présent");
    expect(html).toContain("<img"); // image de signature inlinée
  });

  it("apprenant non signé (session passée) → « Non signé »", () => {
    const html = resolveCompact(new Map());
    expect(html).toContain("Non signé");
    expect(html).not.toContain("Présent");
  });

  it("signature indexée par le MAUVAIS id (profile_id) → NON présent (anti 0/100)", () => {
    // Si le chargement des signatures utilisait profile_id au lieu de learners.id,
    // la clé ne matcherait pas et l'apprenant resterait absent.
    const html = resolveCompact(new Map([["slot-1|profile-de-learner-1|learner", SIG_SVG]]));
    expect(html).not.toContain("Présent");
    expect(html).toContain("Non signé");
  });

  it("formateur signé pour le créneau → « Présent » (convention signer_id = trainers.id)", () => {
    const html = resolveCompact(new Map([["slot-1|trainer-1|trainer", SIG_SVG]]));
    expect(html).toContain("AZIZI Karim");
    expect(html).toContain("Présent");
  });
});
