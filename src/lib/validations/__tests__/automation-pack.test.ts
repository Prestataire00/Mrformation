import { describe, it, expect } from "vitest";
import { packMetaSchema, packStepSchema, packStepsSchema } from "../automation-pack";

describe("automation-pack schemas", () => {
  it("packMetaSchema : nom requis", () => {
    expect(packMetaSchema.safeParse({ name: "" }).success).toBe(false);
    expect(packMetaSchema.safeParse({ name: "Mon pack", is_default: true }).success).toBe(true);
  });
  it("packStepSchema : trigger connu + offset >= 0 + doc OU template", () => {
    expect(packStepSchema.safeParse({ trigger_type: "inconnu", document_type: "convocation" }).success).toBe(false);
    expect(packStepSchema.safeParse({ trigger_type: "session_start_minus_days", days_offset: -1, document_type: "convocation" }).success).toBe(false);
    expect(packStepSchema.safeParse({ trigger_type: "on_enrollment", recipient_type: "learners" }).success).toBe(false); // ni doc ni template
    expect(packStepSchema.safeParse({ trigger_type: "session_start_minus_days", days_offset: 5, recipient_type: "learners", document_type: "convocation" }).success).toBe(true);
  });
  it("packStepsSchema : tableau d'étapes", () => {
    expect(packStepsSchema.safeParse([{ trigger_type: "on_enrollment", document_type: "convocation" }]).success).toBe(true);
  });
});
