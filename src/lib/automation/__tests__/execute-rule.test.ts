import { describe, it, expect, vi } from "vitest";
import {
  buildAttachmentsForRecipient,
  buildFallbackEmail,
  resolveQuestionnaireIdForRule,
  ensureSessionQuestionnaireAttributions,
  isQuestionnaireRule,
  QUESTIONNAIRE_DOCUMENT_TYPES,
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
const trainer: RecipientInfo = {
  id: "t1", email: "t@x.fr", first_name: "Anne", last_name: "Martin", type: "trainer",
};
// Les entreprises sont portées en type "learner" — c'est recipientType qui aiguille.
const company: RecipientInfo = {
  id: "c1", email: "c@x.fr", first_name: "Acme SAS", last_name: "", type: "learner",
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

  it("mappe convention_intervention vers un descripteur trainer", () => {
    const res = buildAttachmentsForRecipient(["convention_intervention"], session, trainer, "trainers", {});
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      type: "convention_intervention",
      payload: { session_id: "s1", trainer_id: "t1" },
    });
  });

  it("ignore convention_intervention si le destinataire n'est pas un trainer", () => {
    const res = buildAttachmentsForRecipient(["convention_intervention"], session, learner, "learners", {});
    expect(res).toEqual([]);
  });

  it("mappe feuille_emargement vers un descripteur learner", () => {
    const res = buildAttachmentsForRecipient(["feuille_emargement"], session, learner, "learners", {});
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      type: "feuille_emargement",
      payload: { session_id: "s1", learner_id: "l1" },
    });
  });

  it("mappe feuille_emargement_collectif vers un descripteur client quand recipientType=companies", () => {
    const res = buildAttachmentsForRecipient(["feuille_emargement_collectif"], session, company, "companies", {});
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      type: "feuille_emargement_collectif",
      payload: { session_id: "s1", client_id: "c1" },
    });
  });

  it("ignore feuille_emargement_collectif si le recipientType n'est pas companies", () => {
    const res = buildAttachmentsForRecipient(["feuille_emargement_collectif"], session, learner, "learners", {});
    expect(res).toEqual([]);
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

describe("isQuestionnaireRule", () => {
  it("retourne true pour document_type questionnaire_positionnement", () => {
    const rule: RuleInfo = { id: "r1", trigger_type: "session_start_minus_days", document_type: "questionnaire_positionnement", days_offset: 3, recipient_type: "learners", template_id: null, condition_subcontracted: null, name: null };
    expect(isQuestionnaireRule(rule)).toBe(true);
  });

  it("retourne false pour document_type convocation", () => {
    const rule: RuleInfo = { id: "r1", trigger_type: "session_start_minus_days", document_type: "convocation", days_offset: 5, recipient_type: "learners", template_id: null, condition_subcontracted: null, name: null };
    expect(isQuestionnaireRule(rule)).toBe(false);
  });
});

describe("resolveQuestionnaireIdForRule", () => {
  it("retourne questionnaire_id pour règle 'questionnaire_positionnement' avec assignment auto_eval_pre existant", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: { questionnaire_id: "QUEST-1" }, error: null })),
        // Le miroir questionnaire_sessions est désormais upserté même quand
        // l'assignment préexiste (visibilité in-app au trigger).
        upsert: vi.fn(async () => ({ error: null })),
      })),
    };
    const rule: RuleInfo = { id: "r1", trigger_type: "session_start_minus_days", document_type: "questionnaire_positionnement", days_offset: 3, recipient_type: "learners", template_id: null, condition_subcontracted: null, name: null };
    const result = await resolveQuestionnaireIdForRule(supabase as never, rule, "S1");
    expect(result).toBe("QUEST-1");
  });

  it("retourne null si document_type n'est pas dans le mapping", async () => {
    const supabase = { from: vi.fn() };
    const rule: RuleInfo = { id: "r1", trigger_type: "session_start_minus_days", document_type: "convocation", days_offset: 5, recipient_type: "learners", template_id: null, condition_subcontracted: null, name: null };
    const result = await resolveQuestionnaireIdForRule(supabase as never, rule, "S1");
    expect(result).toBe(null);
  });
});

// Vérifie que QUESTIONNAIRE_DOCUMENT_TYPES exporte les 4 valeurs attendues.
describe("QUESTIONNAIRE_DOCUMENT_TYPES", () => {
  it("contient les 4 document_type questionnaire confirmés par Task 0", () => {
    expect(QUESTIONNAIRE_DOCUMENT_TYPES.has("questionnaire_positionnement")).toBe(true);
    expect(QUESTIONNAIRE_DOCUMENT_TYPES.has("questionnaire_satisfaction")).toBe(true);
    expect(QUESTIONNAIRE_DOCUMENT_TYPES.has("questionnaire_satisfaction_froid")).toBe(true);
    expect(QUESTIONNAIRE_DOCUMENT_TYPES.has("questionnaire_satisfaction_client")).toBe(true);
    expect(QUESTIONNAIRE_DOCUMENT_TYPES.has("convocation")).toBe(false);
  });
});

describe("executeRuleForSession — injection lien token (Chantier 2c)", () => {
  it("remplace {{questionnaire_link}} dans body custom si présent", () => {
    const body = "Bonjour, voici votre questionnaire : {{questionnaire_link}}\n\nMerci";
    const link = "https://example.com/questionnaire/abc-123";
    const result = body.replaceAll("{{questionnaire_link}}", link);
    expect(result).toBe("Bonjour, voici votre questionnaire : https://example.com/questionnaire/abc-123\n\nMerci");
    expect(result.includes("{{questionnaire_link}}")).toBe(false);
  });

  it("auto-append le lien en fin de body si {{questionnaire_link}} absent", () => {
    const body = "Bonjour,\nVeuillez répondre au questionnaire de satisfaction.\nCordialement";
    const link = "https://example.com/questionnaire/abc-123";
    const result = body + `\n\n📝 Lien direct vers le questionnaire :\n${link}`;
    expect(result.endsWith(`📝 Lien direct vers le questionnaire :\n${link}`)).toBe(true);
    expect(result.includes("Bonjour,")).toBe(true);
  });
});

describe("ensureSessionQuestionnaireAttributions (attribution eager du parcours)", () => {
  // Mock supabase minimal : route les .maybeSingle() par table (existence
  // d'assignment vs questionnaire par défaut) et capture les .insert().
  function makeSupabase(opts: { existing?: boolean; hasDefault?: (qi: string) => boolean }) {
    const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
    const supabase = {
      from(table: string) {
        const eqArgs: Record<string, unknown> = {};
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: (col: string, val: unknown) => { eqArgs[col] = val; return builder; },
          order: () => builder,
          limit: () => builder,
          maybeSingle: async () => {
            if (table === "questionnaires") {
              const qi = eqArgs["quality_indicator_type"] as string;
              const ok = opts.hasDefault ? opts.hasDefault(qi) : true;
              return { data: ok ? { id: `Q-${qi}` } : null, error: null };
            }
            return { data: opts.existing ? { id: "EX" } : null, error: null };
          },
          insert: async (row: Record<string, unknown>) => { inserts.push({ table, row }); return { error: null }; },
        };
        return builder;
      },
    };
    return { supabase, inserts };
  }

  it("attribue tout le parcours (pré, post, satisfaction, bilan formateur) quand rien n'existe", async () => {
    const { supabase, inserts } = makeSupabase({ existing: false });
    const res = await ensureSessionQuestionnaireAttributions(supabase as never, "s1", "ent-A");
    expect(res.attributed.sort()).toEqual(
      ["auto_eval_post", "auto_eval_pre", "quest_formateurs", "satisfaction_chaud"].sort(),
    );
    expect(inserts).toHaveLength(4);
    // Le bilan formateur cible le formateur (target_type trainer), pas l'apprenant.
    const formateur = inserts.find((i) => i.row.satisfaction_type === "quest_formateurs");
    expect(formateur?.table).toBe("formation_satisfaction_assignments");
    expect(formateur?.row.target_type).toBe("trainer");
    // Satisfaction à chaud cible l'apprenant.
    const satis = inserts.find((i) => i.row.satisfaction_type === "satisfaction_chaud");
    expect(satis?.row.target_type).toBe("learner");
    // auto_eval_post en attribution masse (learner_id null).
    const post = inserts.find((i) => i.row.evaluation_type === "auto_eval_post");
    expect(post?.table).toBe("formation_evaluation_assignments");
    expect(post?.row.learner_id).toBe(null);
  });

  it("idempotent : n'insère rien si les assignments existent déjà", async () => {
    const { supabase, inserts } = makeSupabase({ existing: true });
    const res = await ensureSessionQuestionnaireAttributions(supabase as never, "s1", "ent-A");
    expect(res.attributed).toEqual([]);
    expect(inserts).toHaveLength(0);
  });

  it("n'attribue que les indicateurs pour lesquels l'entité a un questionnaire actif", async () => {
    const { supabase, inserts } = makeSupabase({
      existing: false,
      hasDefault: (qi) => qi === "auto_eval_pre",
    });
    const res = await ensureSessionQuestionnaireAttributions(supabase as never, "s1", "ent-A");
    expect(res.attributed).toEqual(["auto_eval_pre"]);
    expect(inserts).toHaveLength(1);
  });
});
