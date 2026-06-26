import { describe, it, expect } from "vitest";
import {
  selectTrainerQuestionnaires,
  buildTrainerLearnerCells,
} from "@/lib/utils/questionnaire-stats";

/**
 * SPEC spec-p2-visu-admin-questionnaires-formateur — visibilité admin des
 * questionnaires attribués par un formateur (via questionnaire_sessions),
 * absents de formation_*_assignments.
 */

const link = (id: string, opts: Partial<{ title: string; type: string; trainer: string | null }> = {}) => ({
  questionnaire_id: id,
  questionnaires: {
    id,
    title: opts.title ?? `T-${id}`,
    type: opts.type ?? "evaluation",
    created_by_trainer_id: opts.trainer ?? null,
  },
});

describe("selectTrainerQuestionnaires", () => {
  it("retient un lien de session absent des assignments (questionnaire du formateur)", () => {
    const res = selectTrainerQuestionnaires(
      [link("q-trainer", { trainer: "tr-1" })],
      [],
      [],
    );
    expect(res).toEqual([
      { id: "q-trainer", title: "T-q-trainer", type: "evaluation", createdByTrainerId: "tr-1" },
    ]);
  });

  it("exclut un questionnaire déjà attribué via formation_evaluation_assignments", () => {
    const res = selectTrainerQuestionnaires(
      [link("q-admin"), link("q-trainer")],
      [{ questionnaire_id: "q-admin" }],
      [],
    );
    expect(res.map((q) => q.id)).toEqual(["q-trainer"]);
  });

  it("exclut aussi via formation_satisfaction_assignments", () => {
    const res = selectTrainerQuestionnaires(
      [link("q-sat", { type: "satisfaction" })],
      [],
      [{ questionnaire_id: "q-sat" }],
    );
    expect(res).toEqual([]);
  });

  it("dédoublonne un même questionnaire_id présent sur plusieurs liens", () => {
    const res = selectTrainerQuestionnaires(
      [link("q-dup"), link("q-dup")],
      [],
      [],
    );
    expect(res).toHaveLength(1);
  });

  it("liste un lien legacy sans created_by_trainer_id (createdByTrainerId null)", () => {
    const res = selectTrainerQuestionnaires([link("q-legacy", { trainer: null })], [], []);
    expect(res[0].createdByTrainerId).toBeNull();
  });

  it("renvoie [] si aucun lien", () => {
    expect(selectTrainerQuestionnaires([], [{ questionnaire_id: "x" }], [])).toEqual([]);
  });

  it("exclut un questionnaire désactivé (is_active=false)", () => {
    const inactive = { questionnaire_id: "q-off", questionnaires: { id: "q-off", title: "Off", type: "evaluation", created_by_trainer_id: "tr-1", is_active: false } };
    expect(selectTrainerQuestionnaires([inactive], [], [])).toEqual([]);
  });
});

describe("buildTrainerLearnerCells", () => {
  const enrollments = [
    { learner: { id: "l1", first_name: "Alice", last_name: "Martin" } },
    { learner: { id: "l2", first_name: "Bob", last_name: "Durand" } },
  ];

  it("marque 'answered' avec responseId pour l'apprenant ayant répondu", () => {
    const cells = buildTrainerLearnerCells(
      "q1",
      "Test formateur",
      enrollments,
      [{ questionnaire_id: "q1", learner_id: "l1", id: "resp-1" }],
      [],
      1_000,
    );
    const alice = cells.find((c) => c.learnerId === "l1")!;
    expect(alice.status).toBe("answered");
    expect(alice.responseId).toBe("resp-1");
    expect(alice.questionnaireId).toBe("q1");
    expect(alice.learnerName).toBe("Alice Martin");
  });

  it("marque 'not_sent' l'apprenant sans réponse ni token", () => {
    const cells = buildTrainerLearnerCells("q1", "T", enrollments, [], [], 1_000);
    expect(cells.find((c) => c.learnerId === "l2")!.status).toBe("not_sent");
  });

  it("marque 'sent' / 'expired' selon l'expiration du token", () => {
    const cells = buildTrainerLearnerCells(
      "q1",
      "T",
      enrollments,
      [],
      [
        { questionnaire_id: "q1", learner_id: "l1", expires_at: new Date(5_000).toISOString(), id: "tk-1" },
        { questionnaire_id: "q1", learner_id: "l2", expires_at: new Date(500).toISOString(), id: "tk-2" },
      ],
      1_000,
    );
    expect(cells.find((c) => c.learnerId === "l1")!.status).toBe("sent");
    expect(cells.find((c) => c.learnerId === "l2")!.status).toBe("expired");
  });

  it("ignore les inscriptions sans learner.id", () => {
    const cells = buildTrainerLearnerCells("q1", "T", [{ learner: {} }], [], [], 1_000);
    expect(cells).toEqual([]);
  });

  it("dédoublonne une fiche apprenant inscrite plusieurs fois (1 cellule par learner_id)", () => {
    const dupEnrollments = [
      { learner: { id: "l1", first_name: "Alice", last_name: "Martin" } },
      { learner: { id: "l1", first_name: "Alice", last_name: "Martin" } },
    ];
    const cells = buildTrainerLearnerCells("q1", "T", dupEnrollments, [{ questionnaire_id: "q1", learner_id: "l1", id: "r1" }], [], 1_000);
    expect(cells).toHaveLength(1);
    expect(cells[0].learnerId).toBe("l1");
  });
});
