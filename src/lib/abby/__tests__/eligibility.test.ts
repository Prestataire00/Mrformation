import { describe, it, expect } from "vitest";
import {
  isNeverPushed,
  isPushFinalized,
  isAbbyZoneVisible,
  isPushButtonVisible,
  canPushInvoice,
  getPushDisabledReason,
  isContentLocked,
} from "../eligibility";
import type { AbbyConnectionStatus } from "@/lib/types/abby";

const INVOICE_VIERGE = {
  abby_push_state: null,
  status: "pending",
  is_avoir: false,
};

describe("prédicats d'état de push (AD-13)", () => {
  it("isNeverPushed : uniquement quand abby_push_state est NULL", () => {
    expect(isNeverPushed({ abby_push_state: null })).toBe(true);
    expect(isNeverPushed({ abby_push_state: "pushing" })).toBe(false);
    expect(isNeverPushed({ abby_push_state: "finalized" })).toBe(false);
  });

  it("isPushFinalized : uniquement l'état finalized", () => {
    expect(isPushFinalized({ abby_push_state: "finalized" })).toBe(true);
    expect(isPushFinalized({ abby_push_state: "details_set" })).toBe(false);
    expect(isPushFinalized({ abby_push_state: null })).toBe(false);
  });

  it("isContentLocked (AD-12) : verrouillé dès que le push a commencé", () => {
    expect(isContentLocked({ abby_push_state: null })).toBe(false);
    expect(isContentLocked({ abby_push_state: "pushing" })).toBe(true);
    expect(isContentLocked({ abby_push_state: "finalized" })).toBe(true);
  });
});

describe("isAbbyZoneVisible — la zone n'existe qu'après une première activation (FR-8)", () => {
  it.each([
    ["active", true],
    ["en_erreur", true],
    ["desactivee", true],
    ["non_configuree", false],
    ["testee", false],
  ] as Array<[AbbyConnectionStatus, boolean]>)("%s → %s", (status, expected) => {
    expect(isAbbyZoneVisible(status)).toBe(expected);
  });
});

describe("isPushButtonVisible — existence du bouton, SANS condition de connexion (FR-4)", () => {
  it("facture jamais poussée, non annulée, non avoir : bouton présent", () => {
    expect(isPushButtonVisible(INVOICE_VIERGE)).toBe(true);
  });

  it("facture déjà poussée (état intermédiaire ou finalisé) : plus de bouton", () => {
    expect(isPushButtonVisible({ ...INVOICE_VIERGE, abby_push_state: "draft_created" })).toBe(false);
    expect(isPushButtonVisible({ ...INVOICE_VIERGE, abby_push_state: "finalized" })).toBe(false);
  });

  it("facture annulée : pas de bouton", () => {
    expect(isPushButtonVisible({ ...INVOICE_VIERGE, status: "cancelled" })).toBe(false);
  });

  it("avoir : jamais de bouton de push unitaire en 3.1 (push avoir = story 5.3)", () => {
    expect(isPushButtonVisible({ ...INVOICE_VIERGE, is_avoir: true })).toBe(false);
  });
});

describe("canPushInvoice — bouton ACTIF seulement si connexion active", () => {
  it("visible + connexion active → poussable", () => {
    expect(canPushInvoice(INVOICE_VIERGE, "active")).toBe(true);
  });

  it.each(["en_erreur", "desactivee"] as AbbyConnectionStatus[])(
    "visible + connexion %s → bouton présent mais PAS actif",
    (status) => {
      expect(isPushButtonVisible(INVOICE_VIERGE)).toBe(true);
      expect(canPushInvoice(INVOICE_VIERGE, status)).toBe(false);
    }
  );

  it("facture non éligible : jamais poussable même connexion active", () => {
    expect(canPushInvoice({ ...INVOICE_VIERGE, status: "cancelled" }, "active")).toBe(false);
  });
});

describe("getPushDisabledReason — tooltip verbatim EXPERIENCE.md", () => {
  it("desactivee / en_erreur : message de reconnexion", () => {
    const expected = "Reconnectez le compte Abby de cette entité dans les paramètres";
    expect(getPushDisabledReason("desactivee")).toBe(expected);
    expect(getPushDisabledReason("en_erreur")).toBe(expected);
  });

  it("active : aucun message (bouton actif)", () => {
    expect(getPushDisabledReason("active")).toBeNull();
  });
});
