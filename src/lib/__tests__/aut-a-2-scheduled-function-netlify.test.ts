import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const NETLIFY_FN_PATH = resolve(
  process.cwd(),
  "netlify/functions/process-automation-rules.mts",
);

const CRM_RUN_ROUTE_PATH = resolve(
  process.cwd(),
  "src/app/api/crm/automations/run/route.ts",
);

describe("aut-a-2 — Scheduled function Netlify (planificateur cron quotidien)", () => {
  const netlifyFn = readFileSync(NETLIFY_FN_PATH, "utf-8");

  it("conserve le schedule cron quotidien (config.schedule)", () => {
    expect(netlifyFn).toMatch(/schedule:\s*"0 7 \* \* \*"/);
  });

  it("expose un export par défaut (handler scheduled function)", () => {
    expect(netlifyFn).toMatch(/export default async \(\)/);
  });

  it("expose une config Netlify avec type Config", () => {
    expect(netlifyFn).toMatch(/export const config: Config/);
  });

  it("utilise CRON_SECRET pour authentifier tous les pings", () => {
    expect(netlifyFn).toMatch(/process\.env\.CRON_SECRET/);
    expect(netlifyFn).toMatch(/Authorization.*Bearer \$\{cronSecret\}/);
  });

  it("pingue /api/formations/automation-rules/run-cron (formations)", () => {
    expect(netlifyFn).toMatch(
      /\/api\/formations\/automation-rules\/run-cron/,
    );
  });

  it("pingue /api/crm/automations/run (CRM) — NOUVEAU pour B5", () => {
    expect(netlifyFn).toMatch(/\/api\/crm\/automations\/run/);
  });

  it("pingue /api/documents/process-sign-reminders (conservation existant)", () => {
    expect(netlifyFn).toMatch(/\/api\/documents\/process-sign-reminders/);
  });

  it("utilise un helper pingEndpoint avec try/catch indépendant (NFR-AUT-REL-3)", () => {
    expect(netlifyFn).toMatch(/async function pingEndpoint/);
    expect(netlifyFn).toMatch(/try \{[\s\S]+?catch \(err\)/);
  });

  it("émet l'event structuré automation_scheduled_run_completed", () => {
    expect(netlifyFn).toMatch(/event:\s*"automation_scheduled_run_completed"/);
  });

  it("payload event contient duration_ms + status par endpoint + result", () => {
    expect(netlifyFn).toMatch(/duration_ms/);
    expect(netlifyFn).toMatch(/formations_status/);
    expect(netlifyFn).toMatch(/crm_status/);
    expect(netlifyFn).toMatch(/sign_reminders_status/);
  });

  it("retourne status 200 si AU MOINS UN ping a réussi (NFR-AUT-REL-3 anyOk)", () => {
    expect(netlifyFn).toMatch(/anyOk/);
    expect(netlifyFn).toMatch(/some\(/);
    expect(netlifyFn).toMatch(/status >= 200 && r\.status < 300/);
  });

  it("référence les stories aut-a-2 + aut-e-3 (event consommé par bannière)", () => {
    expect(netlifyFn).toMatch(/aut-a-2/);
    expect(netlifyFn).toMatch(/aut-e-3/);
  });
});

describe("aut-a-2 — Route /api/crm/automations/run étendue avec branche cron", () => {
  const crmRoute = readFileSync(CRM_RUN_ROUTE_PATH, "utf-8");

  it("détecte le header Authorization: Bearer ${CRON_SECRET}", () => {
    expect(crmRoute).toMatch(/authHeader === `Bearer \$\{cronSecret\}`/);
  });

  it("utilise un service client en mode cron (contourne RLS)", () => {
    expect(crmRoute).toMatch(/function createServiceClient/);
    expect(crmRoute).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("itère toutes les entités en mode cron", () => {
    expect(crmRoute).toMatch(
      /\.from\("entities"\)\s*\n?\s*\.select\("id, name"\)/,
    );
    expect(crmRoute).toMatch(/for \(const entity of entities/);
  });

  it("try/catch par entité (NFR-AUT-REL-2) — un fail n'interrompt pas le reste", () => {
    // Vérifie qu'il y a un try/catch DANS la boucle for
    expect(crmRoute).toMatch(
      /for \(const entity of entities[\s\S]+?try \{[\s\S]+?catch \(entityErr\)/,
    );
  });

  it("retourne un summary par entité en mode cron", () => {
    expect(crmRoute).toMatch(/mode: "cron"/);
    expect(crmRoute).toMatch(/summary/);
    expect(crmRoute).toMatch(/totalExecuted/);
    expect(crmRoute).toMatch(/totalFailed/);
  });

  it("conserve la branche user existante (getUser + admin check)", () => {
    expect(crmRoute).toMatch(/supabase\.auth\.getUser\(\)/);
    expect(crmRoute).toMatch(/Admin access required/);
  });

  it("préserve la logique métier (4 fonctions de lib/crm/automations appelées)", () => {
    expect(crmRoute).toMatch(/relanceInactiveProspects/);
    expect(crmRoute).toMatch(/checkDormantProspects/);
    expect(crmRoute).toMatch(/createExpiringQuoteTasks/);
    expect(crmRoute).toMatch(/notifyOverdueTasks/);
  });
});
