import { describe, it, expect } from "vitest";
import {
  isNeverPushed,
  isPushFinalized,
  isAbbyZoneVisible,
  isPushButtonVisible,
  canPushInvoice,
  getPushDisabledReason,
  isContentLocked,
  isPushResumable,
  getResumeStep,
  canRecordPaymentInLms,
  isBatchSelectable,
  getBatchIneligibilityReason,
  PUSH_DISABLED_TOOLTIP,
  canPushAvoir,
  canResumeAvoir,
  getAvoirActionReason,
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

  it.each(["non_configuree", "testee"] as AbbyConnectionStatus[])(
    "connexion %s (zone masquée) → jamais poussable, même si un appelant saute isAbbyZoneVisible",
    (status) => {
      expect(canPushInvoice(INVOICE_VIERGE, status)).toBe(false);
    }
  );

  it("facture non éligible : jamais poussable même connexion active", () => {
    expect(canPushInvoice({ ...INVOICE_VIERGE, status: "cancelled" }, "active")).toBe(false);
  });
});

describe("isPushResumable — reprise d'un push interrompu (story 3.4)", () => {
  const NOW = new Date("2026-07-19T12:00:00.000Z");
  const STALE = "2026-07-19T11:50:00.000Z"; // 10 min — périmé
  const FRESH = "2026-07-19T11:59:30.000Z"; // 30 s — frais
  const BASE = {
    abby_push_state: "draft_created" as string | null,
    abby_push_locked_at: STALE as string | null,
    is_avoir: false,
    status: "pending",
  };

  it("état intermédiaire + verrou périmé → reprenable ; verrou NULL aussi", () => {
    expect(isPushResumable(BASE, NOW)).toBe(true);
    expect(isPushResumable({ ...BASE, abby_push_locked_at: null }, NOW)).toBe(true);
  });

  it("verrou FRAIS (boucle active) → PAS reprenable", () => {
    expect(isPushResumable({ ...BASE, abby_push_locked_at: FRESH }, NOW)).toBe(false);
  });

  it("jamais poussée ou finalisée → pas reprenable", () => {
    expect(isPushResumable({ ...BASE, abby_push_state: null }, NOW)).toBe(false);
    expect(isPushResumable({ ...BASE, abby_push_state: "finalized" }, NOW)).toBe(false);
  });

  it("annulée → JAMAIS reprenable (le verrou de contenu 3.5 n'existe pas encore)", () => {
    expect(isPushResumable({ ...BASE, status: "cancelled" }, NOW)).toBe(false);
  });

  it("avoir → jamais reprenable (dispatch 5.3)", () => {
    expect(isPushResumable({ ...BASE, is_avoir: true }, NOW)).toBe(false);
  });

  it("verrou non parsable (défensif) → traité comme périmé", () => {
    expect(isPushResumable({ ...BASE, abby_push_locked_at: "pas-une-date" }, NOW)).toBe(true);
  });
});

describe("getResumeStep — état curseur → prochaine étape (source unique)", () => {
  it.each([
    ["pushing", 2],
    ["draft_created", 3],
    ["lines_set", 4],
    ["details_set", 5],
  ])("%s → étape %i", (state, expected) => {
    expect(getResumeStep(state)).toBe(expected);
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

describe("canRecordPaymentInLms — enregistrement du paiement (story 4.2, FR-18)", () => {
  const PAYABLE = {
    abby_push_state: "finalized" as string | null,
    abby_state: "paid" as string | null,
    status: "sent",
    is_avoir: false,
  };

  it("finalisée + Abby payée + LMS non payée → action proposée", () => {
    expect(canRecordPaymentInLms(PAYABLE)).toBe(true);
  });

  it("LMS déjà payée → jamais proposée (idempotence)", () => {
    expect(canRecordPaymentInLms({ ...PAYABLE, status: "paid" })).toBe(false);
  });

  it("Abby pas payée (null ou finalized) → jamais proposée", () => {
    expect(canRecordPaymentInLms({ ...PAYABLE, abby_state: null })).toBe(false);
    expect(canRecordPaymentInLms({ ...PAYABLE, abby_state: "finalized" })).toBe(false);
  });

  it("facture annulée → jamais proposée", () => {
    expect(canRecordPaymentInLms({ ...PAYABLE, status: "cancelled" })).toBe(false);
  });

  it("AVOIR → jamais proposée (l'Epic 5 en finalisera)", () => {
    expect(canRecordPaymentInLms({ ...PAYABLE, is_avoir: true })).toBe(false);
  });

  it("push non finalisé → jamais proposée (borne AD-13)", () => {
    expect(canRecordPaymentInLms({ ...PAYABLE, abby_push_state: "details_set" })).toBe(false);
    expect(canRecordPaymentInLms({ ...PAYABLE, abby_push_state: null })).toBe(false);
  });
});

describe("isBatchSelectable — éligibilité au lot = bouton unitaire visible ET actif (story 5.1, AD-13)", () => {
  it("facture vierge + connexion active → cochable", () => {
    expect(isBatchSelectable(INVOICE_VIERGE, "active")).toBe(true);
  });

  it("strictement aligné sur canPushInvoice (jamais de divergence lot/unitaire)", () => {
    const statuses: AbbyConnectionStatus[] = [
      "active", "en_erreur", "desactivee", "non_configuree", "testee",
    ];
    const invoices = [
      INVOICE_VIERGE,
      { ...INVOICE_VIERGE, is_avoir: true },
      { ...INVOICE_VIERGE, status: "cancelled" },
      { ...INVOICE_VIERGE, abby_push_state: "finalized" },
      { ...INVOICE_VIERGE, abby_push_state: "draft_created" },
    ];
    for (const inv of invoices) {
      for (const s of statuses) {
        expect(isBatchSelectable(inv, s)).toBe(canPushInvoice(inv, s));
      }
    }
  });
});

describe("getBatchIneligibilityReason — motif du tooltip d'une ligne non cochable (story 5.1)", () => {
  it("ligne cochable → null (aucun tooltip)", () => {
    expect(getBatchIneligibilityReason(INVOICE_VIERGE, "active")).toBeNull();
  });

  it("avoir → renvoie vers sa facture d'origine", () => {
    expect(getBatchIneligibilityReason({ ...INVOICE_VIERGE, is_avoir: true }, "active")).toBe(
      "Un avoir se pousse depuis sa facture d'origine.",
    );
  });

  it("annulée → non transmissible", () => {
    expect(getBatchIneligibilityReason({ ...INVOICE_VIERGE, status: "cancelled" }, "active")).toBe(
      "Facture annulée — non transmissible.",
    );
  });

  it("poussée-finalisée → déjà transmise", () => {
    expect(getBatchIneligibilityReason({ ...INVOICE_VIERGE, abby_push_state: "finalized" }, "active")).toBe(
      "Déjà transmise à Abby.",
    );
  });

  it.each(["pushing", "draft_created", "lines_set", "details_set"])(
    "push interrompu (%s) → reprise, JAMAIS « déjà transmise »",
    (state) => {
      expect(getBatchIneligibilityReason({ ...INVOICE_VIERGE, abby_push_state: state }, "active")).toBe(
        "Push interrompu — reprenez-le depuis cette ligne.",
      );
    },
  );

  it.each(["desactivee", "en_erreur"] as AbbyConnectionStatus[])(
    "jamais poussée mais connexion %s → reconnecter",
    (status) => {
      expect(getBatchIneligibilityReason(INVOICE_VIERGE, status)).toBe(PUSH_DISABLED_TOOLTIP);
    },
  );

  it("avoir prime sur l'état de connexion", () => {
    expect(getBatchIneligibilityReason({ ...INVOICE_VIERGE, is_avoir: true }, "desactivee")).toBe(
      "Un avoir se pousse depuis sa facture d'origine.",
    );
  });
});

// ─── Éligibilité AVOIR (story 5.3, AD-23) ────────────────────────────────────

const AVOIR = { is_avoir: true, abby_push_state: null as string | null, status: "sent" };
const PARENT_FINALIZED = { abby_push_state: "finalized" as string | null, abby_invoice_id: "abby_123" };

describe("canPushAvoir — push d'un avoir (parente poussée-finalisée, serveur)", () => {
  it("avoir vierge + parente finalisée avec abby_invoice_id → oui", () => {
    expect(canPushAvoir(AVOIR, PARENT_FINALIZED)).toBe(true);
  });
  it("parente non finalisée → non", () => {
    expect(canPushAvoir(AVOIR, { abby_push_state: "draft_created", abby_invoice_id: "x" })).toBe(false);
    expect(canPushAvoir(AVOIR, { abby_push_state: null, abby_invoice_id: null })).toBe(false);
  });
  it("parente finalisée mais SANS abby_invoice_id → non (input createAsset manquant)", () => {
    expect(canPushAvoir(AVOIR, { abby_push_state: "finalized", abby_invoice_id: null })).toBe(false);
  });
  it("parente absente (avoir importé) → non", () => {
    expect(canPushAvoir(AVOIR, null)).toBe(false);
  });
  it("avoir déjà poussé (état non null) → non", () => {
    expect(canPushAvoir({ ...AVOIR, abby_push_state: "finalized" }, PARENT_FINALIZED)).toBe(false);
    expect(canPushAvoir({ ...AVOIR, abby_push_state: "draft_created" }, PARENT_FINALIZED)).toBe(false);
  });
  it("avoir annulé → non", () => {
    expect(canPushAvoir({ ...AVOIR, status: "cancelled" }, PARENT_FINALIZED)).toBe(false);
  });
  it("non-avoir → non (n'emprunte jamais ce chemin)", () => {
    expect(canPushAvoir({ ...AVOIR, is_avoir: false }, PARENT_FINALIZED)).toBe(false);
  });
});

describe("canResumeAvoir — reprise d'un avoir interrompu", () => {
  const now = new Date("2026-07-23T12:00:00.000Z");
  const stale = "2026-07-23T11:00:00.000Z"; // > 2 min
  const fresh = "2026-07-23T11:59:30.000Z"; // < 2 min
  const RESUMABLE = { is_avoir: true, abby_push_state: "draft_created" as string | null, abby_push_locked_at: stale as string | null, status: "sent" };

  it("état intermédiaire + verrou périmé + parente finalisée → oui", () => {
    expect(canResumeAvoir(RESUMABLE, "finalized", now)).toBe(true);
  });
  it("verrou NULL → oui (interrompu sans boucle active)", () => {
    expect(canResumeAvoir({ ...RESUMABLE, abby_push_locked_at: null }, "finalized", now)).toBe(true);
  });
  it("verrou FRAIS (< 2 min) → non (boucle active)", () => {
    expect(canResumeAvoir({ ...RESUMABLE, abby_push_locked_at: fresh }, "finalized", now)).toBe(false);
  });
  it("parente non finalisée → non", () => {
    expect(canResumeAvoir(RESUMABLE, "draft_created", now)).toBe(false);
    expect(canResumeAvoir(RESUMABLE, null, now)).toBe(false);
  });
  it("état null (jamais poussé) ou finalisé → non (pas une reprise)", () => {
    expect(canResumeAvoir({ ...RESUMABLE, abby_push_state: null }, "finalized", now)).toBe(false);
    expect(canResumeAvoir({ ...RESUMABLE, abby_push_state: "finalized" }, "finalized", now)).toBe(false);
  });
  it("annulé ou non-avoir → non", () => {
    expect(canResumeAvoir({ ...RESUMABLE, status: "cancelled" }, "finalized", now)).toBe(false);
    expect(canResumeAvoir({ ...RESUMABLE, is_avoir: false }, "finalized", now)).toBe(false);
  });
});

describe("getAvoirActionReason — motif du bouton avoir désactivé", () => {
  it("poussable (parente finalisée, jamais poussé) → null", () => {
    expect(getAvoirActionReason({ abby_push_state: null, status: "sent" }, "finalized")).toBeNull();
  });
  it("annulé → « Avoir annulé — non transmissible. »", () => {
    expect(getAvoirActionReason({ abby_push_state: null, status: "cancelled" }, "finalized")).toBe(
      "Avoir annulé — non transmissible.",
    );
  });
  it("déjà transmis (finalisé) → « Déjà transmis à Abby. »", () => {
    expect(getAvoirActionReason({ abby_push_state: "finalized", status: "sent" }, "finalized")).toBe(
      "Déjà transmis à Abby.",
    );
  });
  it("parente non finalisée → « La facture d'origine doit d'abord être transmise à Abby. »", () => {
    expect(getAvoirActionReason({ abby_push_state: null, status: "sent" }, null)).toBe(
      "La facture d'origine doit d'abord être transmise à Abby.",
    );
    expect(getAvoirActionReason({ abby_push_state: null, status: "sent" }, "draft_created")).toBe(
      "La facture d'origine doit d'abord être transmise à Abby.",
    );
  });
});

describe("non-régression : les prédicats FACTURE excluent toujours l'avoir (story 5.3)", () => {
  const AVOIR_VIERGE = { abby_push_state: null, status: "sent", is_avoir: true };
  it("isPushButtonVisible / isBatchSelectable / isPushResumable restent false sur un avoir", () => {
    expect(isPushButtonVisible(AVOIR_VIERGE)).toBe(false);
    expect(isBatchSelectable(AVOIR_VIERGE, "active")).toBe(false);
    expect(
      isPushResumable(
        { abby_push_state: "draft_created", abby_push_locked_at: null, is_avoir: true, status: "sent" },
        new Date(),
      ),
    ).toBe(false);
  });
});
