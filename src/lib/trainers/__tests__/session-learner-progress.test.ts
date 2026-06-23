import { describe, it, expect } from "vitest";
import { computeSessionLearnerProgress } from "../session-learner-progress";

const enrollments = [
  { learner: { id: "lrn-1", profile_id: "prof-1", first_name: "Marie", last_name: "Dupont" } },
  { learner: { id: "lrn-2", profile_id: "prof-2", first_name: "Paul", last_name: "Martin" } },
];

describe("computeSessionLearnerProgress", () => {
  it("compte les signatures par apprenant via learner.id (convention réelle QR/émargement) et le total de créneaux", () => {
    // Les routes de signature apprenant (QR /api/emargement/sign + /api/signatures)
    // stockent signer_id = learners.id (= enrollments.learner_id), JAMAIS profile_id.
    const signatures = [
      { signer_id: "lrn-1", time_slot_id: "s1" },
      { signer_id: "lrn-1", time_slot_id: "s2" },
      { signer_id: "lrn-2", time_slot_id: "s1" },
    ];
    const rows = computeSessionLearnerProgress(enrollments, signatures, 3, []);
    const marie = rows.find((r) => r.learnerId === "lrn-1")!;
    const paul = rows.find((r) => r.learnerId === "lrn-2")!;
    expect(marie.signedCount).toBe(2);
    expect(marie.slotsCount).toBe(3);
    expect(paul.signedCount).toBe(1);
  });

  it("compte aussi une signature stockée via profile_id (robustesse rétrocompat)", () => {
    const signatures = [{ signer_id: "prof-1", time_slot_id: "s1" }];
    const rows = computeSessionLearnerProgress(enrollments, signatures, 1, []);
    expect(rows.find((r) => r.learnerId === "lrn-1")!.signedCount).toBe(1);
  });

  it("marque questionnaireDone via learner.id présent dans les réponses", () => {
    const rows = computeSessionLearnerProgress(enrollments, [], 1, [{ learner_id: "lrn-1" }]);
    expect(rows.find((r) => r.learnerId === "lrn-1")!.questionnaireDone).toBe(true);
    expect(rows.find((r) => r.learnerId === "lrn-2")!.questionnaireDone).toBe(false);
  });

  it("ignore les enrollments sans learner", () => {
    const rows = computeSessionLearnerProgress(
      [...enrollments, { learner: null }],
      [],
      1,
      [],
    );
    expect(rows).toHaveLength(2);
  });

  it("déduplique par learner.id (double inscription)", () => {
    const rows = computeSessionLearnerProgress(
      [...enrollments, { learner: { id: "lrn-1", profile_id: "prof-1", first_name: "Marie", last_name: "Dupont" } }],
      [],
      1,
      [],
    );
    expect(rows.filter((r) => r.learnerId === "lrn-1")).toHaveLength(1);
  });

  it("trie par nom (NOM Prénom)", () => {
    const rows = computeSessionLearnerProgress(enrollments, [], 1, []);
    expect(rows.map((r) => r.name)).toEqual(["DUPONT Marie", "MARTIN Paul"]);
  });
});
