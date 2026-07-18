import { describe, it, expect } from "vitest";
import {
  ABBY_INVOICE_SELECT,
  ABBY_PUSH_LOCK_TTL_MS,
  deriveAbbyBadge,
  type AbbyInvoiceBadgeInput,
} from "../invoice-badge";

const NOW = new Date("2026-07-18T10:00:00.000Z");

/** Entrée complète — le type n'a AUCUN champ optionnel (convention UI du spine). */
const BASE: AbbyInvoiceBadgeInput = {
  abby_push_state: null,
  abby_push_locked_at: null,
  abby_invoice_number: null,
  abby_state: null,
  abby_last_error: null,
};

describe("ABBY_INVOICE_SELECT — garde-fou des select strings (invisibles pour tsc)", () => {
  it("chaque clé du type d'entrée figure dans le fragment", () => {
    const cols = ABBY_INVOICE_SELECT.split(",").map((c) => c.trim());
    for (const key of Object.keys(BASE)) {
      expect(cols).toContain(key);
    }
  });

  it("le fragment ne contient rien d'autre que les clés du type", () => {
    const cols = ABBY_INVOICE_SELECT.split(",").map((c) => c.trim());
    expect(cols.sort()).toEqual(Object.keys(BASE).sort());
  });
});

describe("deriveAbbyBadge — LA fonction pure unique (table de dérivation de la story 3.1)", () => {
  it("jamais poussée → « Non poussée » (variant outline)", () => {
    const b = deriveAbbyBadge(BASE, NOW);
    expect(b).toEqual({ label: "Non poussée", variant: "outline", className: null });
  });

  it("payée côté Abby → « Payée (Abby) », prioritaire sur tout le reste", () => {
    const b = deriveAbbyBadge(
      { ...BASE, abby_state: "paid", abby_push_state: "finalized", abby_invoice_number: "F-2026-0042" },
      NOW
    );
    expect(b.label).toBe("Payée (Abby)");
    expect(b.className).toContain("bg-green-100"); // classes du badge LMS « paid » (QO-4)
  });

  it("finalisée → « Finalisée · {numéro} » (classes du badge LMS « sent »)", () => {
    const b = deriveAbbyBadge(
      { ...BASE, abby_push_state: "finalized", abby_invoice_number: "F-2026-0042" },
      NOW
    );
    expect(b.label).toBe("Finalisée · F-2026-0042");
    expect(b.className).toContain("bg-blue-100");
  });

  it("finalisée sans numéro (défensif) → « Finalisée » seule", () => {
    const b = deriveAbbyBadge({ ...BASE, abby_push_state: "finalized" }, NOW);
    expect(b.label).toBe("Finalisée");
  });

  it("finalisée + erreur résiduelle d'une tentative passée → reste « Finalisée » (priorité)", () => {
    const b = deriveAbbyBadge(
      { ...BASE, abby_push_state: "finalized", abby_invoice_number: "F-2026-0042", abby_last_error: "boom" },
      NOW
    );
    expect(b.label).toBe("Finalisée · F-2026-0042");
  });

  it("verrou non parsable (défensif) → traité comme périmé, « Interrompue — à reprendre »", () => {
    const b = deriveAbbyBadge(
      { ...BASE, abby_push_state: "pushing", abby_push_locked_at: "pas-une-date" },
      NOW
    );
    expect(b.label).toBe("Interrompue — à reprendre");
  });

  it.each(["pushing", "draft_created", "lines_set", "details_set"])(
    "état intermédiaire %s + verrou frais (< 2 min) → « Push en cours »",
    (state) => {
      const lockedAt = new Date(NOW.getTime() - ABBY_PUSH_LOCK_TTL_MS + 1000).toISOString();
      const b = deriveAbbyBadge(
        { ...BASE, abby_push_state: state, abby_push_locked_at: lockedAt },
        NOW
      );
      expect(b).toEqual({ label: "Push en cours", variant: "secondary", className: null });
    }
  );

  it("verrou frais PRIORITAIRE sur une erreur résiduelle (curseur séparé de l'erreur, AD-6)", () => {
    const lockedAt = new Date(NOW.getTime() - 30_000).toISOString();
    const b = deriveAbbyBadge(
      { ...BASE, abby_push_state: "lines_set", abby_push_locked_at: lockedAt, abby_last_error: "boom" },
      NOW
    );
    expect(b.label).toBe("Push en cours");
  });

  it("intermédiaire + verrou périmé + erreur enregistrée → « Erreur » (variant destructive)", () => {
    const lockedAt = new Date(NOW.getTime() - ABBY_PUSH_LOCK_TTL_MS - 1000).toISOString();
    const b = deriveAbbyBadge(
      { ...BASE, abby_push_state: "draft_created", abby_push_locked_at: lockedAt, abby_last_error: "timeout" },
      NOW
    );
    expect(b).toEqual({ label: "Erreur", variant: "destructive", className: null });
  });

  it("intermédiaire + verrou NULL sans erreur (onglet fermé) → « Interrompue — à reprendre » (secondary)", () => {
    const b = deriveAbbyBadge({ ...BASE, abby_push_state: "details_set" }, NOW);
    expect(b).toEqual({
      label: "Interrompue — à reprendre",
      variant: "secondary",
      className: null,
    });
  });

  it("verrou exactement au seuil de 2 min → périmé (strictement inférieur = frais)", () => {
    const lockedAt = new Date(NOW.getTime() - ABBY_PUSH_LOCK_TTL_MS).toISOString();
    const b = deriveAbbyBadge(
      { ...BASE, abby_push_state: "pushing", abby_push_locked_at: lockedAt },
      NOW
    );
    expect(b.label).toBe("Interrompue — à reprendre");
  });
});
