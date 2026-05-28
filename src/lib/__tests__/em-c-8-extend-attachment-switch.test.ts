import { describe, it, expect } from "vitest";
import {
  buildAttachmentsForRecipient,
  ATTACHMENT_DOC_TYPE_SETS,
} from "@/lib/automation/execute-rule";

const FAKE_SESSION = {
  id: "session-1",
  entity_id: "ent-1",
  title: "Formation Test",
  start_date: "2026-06-01",
  end_date: "2026-06-03",
  location: "Marseille",
};

const FAKE_LEARNER_RECIPIENT = {
  id: "learner-1",
  type: "learner" as const,
  first_name: "Jean",
  last_name: "Dupont",
  email: "jean@test.fr",
};

const FAKE_COMPANY_RECIPIENT = {
  id: "client-1",
  type: "learner" as const, // RecipientInfo n'accepte que learner|trainer ; "companies" se gère via recipientType, pas via recipient.type
  first_name: "Acme",
  last_name: "Corp",
  email: "contact@acme.fr",
};

const FAKE_TRAINER_RECIPIENT = {
  id: "trainer-1",
  type: "trainer" as const,
  first_name: "Marie",
  last_name: "Formatrice",
  email: "marie@formateur.fr",
};

describe("em-c-8 — Extension buildAttachmentsForRecipient", () => {
  describe("LEARNER_DOC_TYPES — 21 types routés vers session+learner_id", () => {
    const learnerTypes = [...ATTACHMENT_DOC_TYPE_SETS.LEARNER];

    it("contient au moins les 12 nouveaux types ajoutés en em-c-8", () => {
      const expected = [
        "attestation_aipr",
        "attestation_competences",
        "attestation_abandon_formation",
        "certificat_travail_hauteur",
        "certificat_diplome",
        "autorisation_image",
        "decharge_responsabilite",
        "lettre_decharge_responsabilite",
        "contrat_engagement_stagiaire",
        "avis_hab_elec_generique",
        "avis_hab_elec_b0_bf_bs",
        "avis_hab_elec_h0_b0_initial",
      ];
      for (const t of expected) {
        expect(learnerTypes).toContain(t);
      }
    });

    it("attestation_aipr → descriptor pour learner recipient", () => {
      const descriptors = buildAttachmentsForRecipient(
        ["attestation_aipr"],
        FAKE_SESSION,
        FAKE_LEARNER_RECIPIENT,
        "learners",
        {},
      );
      expect(descriptors).toHaveLength(1);
      expect(descriptors[0]).toEqual({
        type: "attestation_aipr",
        payload: { session_id: "session-1", learner_id: "learner-1" },
      });
    });

    it("avis_hab_elec_h0_b0 → descriptor pour learner recipient", () => {
      const descriptors = buildAttachmentsForRecipient(
        ["avis_hab_elec_h0_b0"],
        FAKE_SESSION,
        FAKE_LEARNER_RECIPIENT,
        "learners",
        {},
      );
      expect(descriptors).toHaveLength(1);
      expect(descriptors[0]).toEqual({
        type: "avis_hab_elec_h0_b0",
        payload: { session_id: "session-1", learner_id: "learner-1" },
      });
    });

    it("learner doc_type SKIP si recipient n'est pas un learner (ex: trainer)", () => {
      const descriptors = buildAttachmentsForRecipient(
        ["attestation_aipr"],
        FAKE_SESSION,
        FAKE_TRAINER_RECIPIENT,
        "trainers",
        {},
      );
      expect(descriptors).toHaveLength(0);
    });
  });

  describe("SESSION_DOC_TYPES — 5 types session-only", () => {
    it("bilan_poe → descriptor session-only (pas de learner_id)", () => {
      const descriptors = buildAttachmentsForRecipient(
        ["bilan_poe"],
        FAKE_SESSION,
        FAKE_LEARNER_RECIPIENT,
        "learners",
        {},
      );
      expect(descriptors).toHaveLength(1);
      expect(descriptors[0]).toEqual({
        type: "bilan_poe",
        payload: { session_id: "session-1" },
      });
    });

    it("reponses_satisfaction_session → session-only", () => {
      const descriptors = buildAttachmentsForRecipient(
        ["reponses_satisfaction_session"],
        FAKE_SESSION,
        FAKE_LEARNER_RECIPIENT,
        "learners",
        {},
      );
      expect(descriptors).toHaveLength(1);
      expect((descriptors[0] as { payload: Record<string, string> }).payload).not.toHaveProperty("learner_id");
    });
  });

  describe("TRAINER_DOC_TYPES — 2 types", () => {
    it("charte_formateur → descriptor pour trainer recipient", () => {
      const descriptors = buildAttachmentsForRecipient(
        ["charte_formateur"],
        FAKE_SESSION,
        FAKE_TRAINER_RECIPIENT,
        "trainers",
        {},
      );
      expect(descriptors).toHaveLength(1);
      expect(descriptors[0]).toEqual({
        type: "charte_formateur",
        payload: { session_id: "session-1", trainer_id: "trainer-1" },
      });
    });

    it("charte_formateur SKIP si recipient n'est pas un trainer", () => {
      const descriptors = buildAttachmentsForRecipient(
        ["charte_formateur"],
        FAKE_SESSION,
        FAKE_LEARNER_RECIPIENT,
        "learners",
        {},
      );
      expect(descriptors).toHaveLength(0);
    });
  });

  describe("COMPANY_DOC_TYPES — 2 types (réutilise routage existant)", () => {
    it("convention_entreprise → descriptor pour company recipient (existant)", () => {
      const descriptors = buildAttachmentsForRecipient(
        ["convention_entreprise"],
        FAKE_SESSION,
        FAKE_COMPANY_RECIPIENT,
        "companies",
        {},
      );
      expect(descriptors).toHaveLength(1);
      expect(descriptors[0]).toEqual({
        type: "convention_entreprise",
        payload: { session_id: "session-1", client_id: "client-1" },
      });
    });
  });

  describe("Doc types non classifiés (skip silencieux)", () => {
    it("attestation_assiduite n'est PAS dans EmailAttachmentDescriptor → skip", () => {
      const descriptors = buildAttachmentsForRecipient(
        ["attestation_assiduite"],
        FAKE_SESSION,
        FAKE_LEARNER_RECIPIENT,
        "learners",
        {},
      );
      // attestation_assiduite n'est PAS dans le union → silencieusement skip
      expect(descriptors).toHaveLength(0);
    });

    it("cgv, politique_confidentialite, reglement_interieur → skip silencieux", () => {
      const skippedTypes = ["cgv", "politique_confidentialite", "reglement_interieur"];
      const descriptors = buildAttachmentsForRecipient(
        skippedTypes,
        FAKE_SESSION,
        FAKE_COMPANY_RECIPIENT,
        "companies",
        {},
      );
      expect(descriptors).toHaveLength(0);
    });
  });

  describe("ATTACHMENT_DOC_TYPE_SETS exporté", () => {
    it("expose 4 sets : LEARNER, COMPANY, TRAINER, SESSION", () => {
      expect(ATTACHMENT_DOC_TYPE_SETS).toHaveProperty("LEARNER");
      expect(ATTACHMENT_DOC_TYPE_SETS).toHaveProperty("COMPANY");
      expect(ATTACHMENT_DOC_TYPE_SETS).toHaveProperty("TRAINER");
      expect(ATTACHMENT_DOC_TYPE_SETS).toHaveProperty("SESSION");
    });

    it("LEARNER set inclut les 9 variants avis_hab_elec_*", () => {
      const allAvisHabElec = [
        "avis_hab_elec_generique",
        "avis_hab_elec_b0_bf_bs",
        "avis_hab_elec_b1v_b2v_br",
        "avis_hab_elec_bf_hf",
        "avis_hab_elec_bt",
        "avis_hab_elec_bt_ht",
        "avis_hab_elec_h0_b0",
        "avis_hab_elec_h0_b0_bf_hf_bs",
        "avis_hab_elec_h0_b0_initial",
      ];
      for (const v of allAvisHabElec) {
        expect(ATTACHMENT_DOC_TYPE_SETS.LEARNER.has(v)).toBe(true);
      }
    });

    it("sets sont disjoints (aucun doc_type dans 2 catégories)", () => {
      const all = new Set<string>();
      const dupes: string[] = [];
      for (const set of Object.values(ATTACHMENT_DOC_TYPE_SETS)) {
        for (const v of set) {
          if (all.has(v)) dupes.push(v);
          all.add(v);
        }
      }
      expect(dupes).toEqual([]);
    });
  });

  describe("Combos multi-types par recipient", () => {
    it("learner + 3 types LEARNER → 3 descriptors", () => {
      const descriptors = buildAttachmentsForRecipient(
        ["convocation", "attestation_aipr", "certificat_diplome"],
        FAKE_SESSION,
        FAKE_LEARNER_RECIPIENT,
        "learners",
        {},
      );
      expect(descriptors).toHaveLength(3);
    });
  });
});
