import { describe, it, expect } from "vitest";
import {
  buildAttachmentsForRecipient,
  buildFallbackEmail,
  type SessionInfo,
  type RecipientInfo,
  type RuleInfo,
  type CustomTemplateInfo,
} from "@/lib/automation/execute-rule";

const session: SessionInfo = {
  id: "s1", title: "Formation X", start_date: "2026-06-01",
  end_date: "2026-06-03", location: "Paris", entity_id: "ent-A",
};
const learner: RecipientInfo = {
  id: "l1", email: "l@x.fr", first_name: "Jean", last_name: "Dupont", type: "learner",
};

describe("buildAttachmentsForRecipient", () => {
  it("renvoie [] quand aucun type de document", () => {
    expect(buildAttachmentsForRecipient(null, session, learner, "learners", {})).toEqual([]);
    expect(buildAttachmentsForRecipient([], session, learner, "learners", {})).toEqual([]);
  });

  it("mappe un type système (convocation) vers un descripteur payload", () => {
    const res = buildAttachmentsForRecipient(["convocation"], session, learner, "learners", {});
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      type: "convocation",
      payload: { session_id: "s1", learner_id: "l1" },
    });
  });

  it("mappe un UUID vers un descripteur uploaded_docx si le template custom est en mode docx_fidelity", () => {
    const tplId = "11111111-1111-1111-1111-111111111111";
    const customById: Record<string, CustomTemplateInfo> = {
      [tplId]: { id: tplId, name: "Attestation", mode: "docx_fidelity", source_docx_url: "https://x/a.docx" },
    };
    const res = buildAttachmentsForRecipient([tplId], session, learner, "learners", customById);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ type: "uploaded_docx", filename: "Attestation.pdf", url: "https://x/a.docx" });
  });

  it("ignore un UUID dont le template custom n'est pas en mode docx_fidelity", () => {
    const tplId = "22222222-2222-2222-2222-222222222222";
    const customById: Record<string, CustomTemplateInfo> = {
      [tplId]: { id: tplId, name: "X", mode: "editable", source_docx_url: null },
    };
    expect(buildAttachmentsForRecipient([tplId], session, learner, "learners", customById)).toEqual([]);
  });
});

describe("buildFallbackEmail", () => {
  it("construit un sujet et un corps avec le libellé du document et le nom du destinataire", () => {
    const rule: RuleInfo = {
      id: "r1", trigger_type: "session_start_minus_days", document_type: "convocation",
      days_offset: 5, recipient_type: "learners", template_id: null,
      condition_subcontracted: null, name: "Convocation J-5",
    };
    const { subject, body } = buildFallbackEmail(rule, session, learner);
    expect(subject).toBe("Convocation à la formation — Formation X");
    expect(body).toContain("Jean Dupont");
    expect(body).toContain("Convocation à la formation");
    expect(body).toContain("Formation X");
  });
});
