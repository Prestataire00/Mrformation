import { describe, it, expect } from "vitest";
import { buildSessionEvents } from "@/lib/automation/compute-events";

const session = {
  id: "s1", title: "Formation X",
  start_date: "2026-06-10", end_date: "2026-06-12", is_subcontracted: false,
};

const ruleConvocation = {
  id: "r1", name: "Convocation J-5", trigger_type: "session_start_minus_days",
  days_offset: 5, document_type: "convocation", recipient_type: "learners",
  condition_subcontracted: null,
};

describe("buildSessionEvents", () => {
  it("calcule la date planifiée d'une règle J-X (début - offset)", () => {
    const events = buildSessionEvents(session, [ruleConvocation], [], []);
    expect(events).toHaveLength(1);
    expect(events[0].scheduled_date.slice(0, 10)).toBe("2026-06-05");
    expect(events[0].status).toBe("pending");
  });

  it("marque l'événement 'overridden' quand un override le désactive", () => {
    const events = buildSessionEvents(session, [ruleConvocation], [{ rule_id: "r1", is_enabled: false, days_offset_override: null }], []);
    expect(events[0].status).toBe("overridden");
  });

  it("marque l'événement 'executed' quand un log success existe", () => {
    const events = buildSessionEvents(session, [ruleConvocation], [], [
      { id: "log1", rule_id: "r1", executed_at: "2026-06-05T08:00:00Z", recipient_count: 3, status: "success" },
    ]);
    expect(events[0].status).toBe("executed");
    expect(events[0].recipient_count).toBe(3);
  });

  it("exclut une règle condition_subcontracted=true sur une session non sous-traitée", () => {
    const events = buildSessionEvents(session, [{ ...ruleConvocation, condition_subcontracted: true }], [], []);
    expect(events).toHaveLength(0);
  });

  it("recalcule la date planifiée quand days_offset_override est fourni", () => {
    const events = buildSessionEvents(
      session,
      [ruleConvocation],
      [{ rule_id: "r1", is_enabled: true, days_offset_override: 10 }],
      [],
    );
    // J-10 au lieu de J-5 → 2026-05-31
    expect(events[0].scheduled_date.slice(0, 10)).toBe("2026-05-31");
    expect(events[0].status).toBe("pending");
  });

  it("calcule la date planifiée d'une règle J+X (fin + offset)", () => {
    const ruleCertif = {
      id: "r2", name: "Certificat J+3", trigger_type: "session_end_plus_days",
      days_offset: 3, document_type: "certificat_realisation", recipient_type: "learners",
      condition_subcontracted: null,
    };
    const events = buildSessionEvents(session, [ruleCertif], [], []);
    expect(events[0].scheduled_date.slice(0, 10)).toBe("2026-06-15");
    expect(events[0].status).toBe("pending");
  });
});
