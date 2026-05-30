import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Story aut-d-1 — trigger `on_enrollment` (ping fire-and-forget + handler
 * + filtre learner_id).
 *
 * Couvre :
 * - Route proxy /api/automation/trigger-on-enrollment (admin-auth + Bearer
 *   CRON_SECRET côté serveur uniquement).
 * - run-cron TARGETED MODE accepte learner_id et le propage à
 *   executeRuleForSession.
 * - execute-rule.ts resolveRecipients respecte onlyLearnerId pour les
 *   recipients de type "learner".
 * - ResumeLearners.tsx ping le trigger après chaque inscription réussie.
 */

const TRIGGER_ROUTE_PATH = resolve(
  process.cwd(),
  "src/app/api/automation/trigger-on-enrollment/route.ts",
);

const RUN_CRON_PATH = resolve(
  process.cwd(),
  "src/app/api/formations/automation-rules/run-cron/route.ts",
);

const EXECUTE_RULE_PATH = resolve(
  process.cwd(),
  "src/lib/automation/execute-rule.ts",
);

const RESUME_LEARNERS_PATH = resolve(
  process.cwd(),
  "src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeLearners.tsx",
);

describe("aut-d-1 — POST /api/automation/trigger-on-enrollment", () => {
  const routeSrc = readFileSync(TRIGGER_ROUTE_PATH, "utf-8");

  it("la route existe et exporte un POST handler", () => {
    expect(existsSync(TRIGGER_ROUTE_PATH)).toBe(true);
    expect(routeSrc).toMatch(/export async function POST\(/);
  });

  it("auth admin/super_admin requise", () => {
    expect(routeSrc).toMatch(/Admin access required/);
    expect(routeSrc).toMatch(/\["admin", "super_admin"\]\.includes\(profile\.role\)/);
  });

  it("requiert session_id + learner_id dans le body", () => {
    expect(routeSrc).toMatch(/session_id and learner_id are required/);
  });

  it("défense en profondeur entité : admin → la session doit appartenir à son entité", () => {
    expect(routeSrc).toMatch(
      /profile\.role === "admin"[\s\S]+?from\("sessions"\)[\s\S]+?session\.entity_id !== profile\.entity_id/,
    );
    expect(routeSrc).toMatch(/Session hors de l'entité/);
  });

  it("proxy vers run-cron avec trigger_type=on_enrollment + Bearer CRON_SECRET", () => {
    expect(routeSrc).toMatch(/\/api\/formations\/automation-rules\/run-cron/);
    expect(routeSrc).toMatch(/Bearer \$\{process\.env\.CRON_SECRET\}/);
    expect(routeSrc).toMatch(/trigger_type: "on_enrollment"/);
    expect(routeSrc).toMatch(/session_id,\s*learner_id/);
  });
});

describe("aut-d-1 — run-cron TARGETED MODE accepte learner_id", () => {
  const src = readFileSync(RUN_CRON_PATH, "utf-8");

  it("parse body.learner_id en plus de trigger_type/session_id/rule_id", () => {
    expect(src).toMatch(/specificLearnerId/);
    expect(src).toMatch(/body\.learner_id/);
  });

  it("propage specificLearnerId à executeRuleForSession.onlyLearnerId", () => {
    expect(src).toMatch(/onlyLearnerId: specificLearnerId/);
  });
});

describe("aut-d-1 — execute-rule.ts resolveRecipients onlyLearnerId", () => {
  const src = readFileSync(EXECUTE_RULE_PATH, "utf-8");

  it("resolveRecipients accepte un opts.onlyLearnerId optionnel", () => {
    expect(src).toMatch(/resolveRecipients[\s\S]+?opts\?:\s*\{\s*onlyLearnerId\?: string\s*\}/);
  });

  it("filtre les enrollments par learner_id quand onlyLearnerId est fourni", () => {
    expect(src).toMatch(/if \(opts\?\.onlyLearnerId\)[\s\S]+?\.eq\("learner_id", opts\.onlyLearnerId\)/);
  });

  it("executeRuleForSession accepte onlyLearnerId et le propage à resolveRecipients", () => {
    expect(src).toMatch(/onlyLearnerId\?: string/);
    expect(src).toMatch(/resolveRecipients\([\s\S]+?\{\s*onlyLearnerId\s*\}\)/);
  });
});

describe("aut-d-1 — ResumeLearners.tsx ping fire-and-forget", () => {
  const src = readFileSync(RESUME_LEARNERS_PATH, "utf-8");

  it("définit un helper pingOnEnrollment(sessionId, learnerId)", () => {
    expect(src).toMatch(
      /const pingOnEnrollment = \(sessionId: string, learnerId: string\)/,
    );
  });

  it("le helper fait un fetch vers /api/automation/trigger-on-enrollment", () => {
    expect(src).toMatch(/fetch\("\/api\/automation\/trigger-on-enrollment"/);
    expect(src).toMatch(/session_id: sessionId, learner_id: learnerId/);
  });

  it("catch silencieux : un échec du ping ne casse pas l'inscription", () => {
    expect(src).toMatch(
      /pingOnEnrollment[\s\S]+?fetch\([\s\S]+?\.catch\(/,
    );
  });

  it("ping appelé après enrollLearner réussi (handleAdd)", () => {
    expect(src).toMatch(
      /toast\(\{ title: "Apprenant ajouté" \}\);\s*pingOnEnrollment\(formation\.id, selectedLearnerId\)/,
    );
  });

  it("ping appelé après createLearnerAndEnroll réussi (handleCreateLearner)", () => {
    expect(src).toMatch(
      /toast\(\{ title: "Apprenant créé et inscrit" \}\);\s*pingOnEnrollment\(formation\.id, result\.learner\.id\)/,
    );
  });
});
