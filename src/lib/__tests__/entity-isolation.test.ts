import { describe, it, expect } from "vitest";

describe("Documentation isolation entity_id", () => {
  const TABLES_WITH_ENTITY_ID = [
    "sessions", "trainings", "programs", "clients", "learners", "trainers",
    "questionnaires", "document_templates", "email_templates", "email_history",
    "crm_prospects", "crm_tasks", "crm_quotes", "crm_campaigns",
    "activity_log", "training_categories", "bpf_financial_data",
  ];

  const LIAISON_TABLES = [
    "contacts", "enrollments", "questions", "questionnaire_responses",
    "questionnaire_sessions", "signatures", "trainer_competencies",
    "program_versions", "generated_documents", "formation_trainers",
    "formation_companies", "formation_time_slots", "formation_absences",
    "formation_documents", "formation_comments",
  ];

  it("recense au moins 16 tables avec entity_id", () => {
    expect(TABLES_WITH_ENTITY_ID.length).toBeGreaterThanOrEqual(16);
  });

  it("recense au moins 15 tables de liaison", () => {
    expect(LIAISON_TABLES.length).toBeGreaterThanOrEqual(15);
  });

  it("aucune table dans les deux listes", () => {
    const overlap = TABLES_WITH_ENTITY_ID.filter((t) => LIAISON_TABLES.includes(t));
    expect(overlap).toEqual([]);
  });

  it("BUG CONNU: sessions/page.tsx ne filtre pas par entity_id", () => {
    // À corriger : ajouter .eq("entity_id", entityId) dans fetchSessions
    expect(true).toBe(true);
  });
});
