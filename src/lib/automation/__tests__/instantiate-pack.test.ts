import { describe, it, expect } from "vitest";
import { packStepToSessionStepRow } from "../instantiate-pack";

describe("packStepToSessionStepRow", () => {
  it("copie les champs d'étape et injecte session_id + source_pack_id", () => {
    const step = {
      id: "step-1", order_index: 2, trigger_type: "session_start_minus_days",
      days_offset: 10, recipient_type: "trainers", document_type: "convention_intervention",
      template_id: null, condition_subcontracted: null, send_email: true,
      name: "Convention J-10", description: "desc",
    };
    const row = packStepToSessionStepRow(step, "sess-9", "pack-7");
    expect(row).toEqual({
      session_id: "sess-9",
      source_pack_id: "pack-7",
      order_index: 2,
      trigger_type: "session_start_minus_days",
      days_offset: 10,
      recipient_type: "trainers",
      document_type: "convention_intervention",
      template_id: null,
      condition_subcontracted: null,
      send_email: true,
      name: "Convention J-10",
      description: "desc",
    });
    // ne propage PAS l'id de l'étape gabarit
    expect((row as unknown as Record<string, unknown>).id).toBeUndefined();
  });
});
