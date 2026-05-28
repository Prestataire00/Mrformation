import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  naturalLanguageNextRun,
  isEventDrivenTrigger,
  isDateBasedTrigger,
} from "@/lib/automation/next-run-natural-language";

const NEXT_RUN_NL_PATH = resolve(
  process.cwd(),
  "src/lib/automation/next-run-natural-language.ts",
);

const NEXT_RUNS_ROUTE_PATH = resolve(
  process.cwd(),
  "src/app/api/automation/next-runs/route.ts",
);

const NEXT_RUNS_CACHE_PATH = resolve(
  process.cwd(),
  "src/lib/automation/next-runs-cache.ts",
);

const DRY_RUN_FORMATIONS_PATH = resolve(
  process.cwd(),
  "src/app/api/automation/dry-run/route.ts",
);

const DRY_RUN_CRM_PATH = resolve(
  process.cwd(),
  "src/app/api/crm/automations/dry-run/route.ts",
);

const ELIGIBLE_TARGETS_PATH = resolve(
  process.cwd(),
  "src/app/api/crm/automations/eligible-targets/route.ts",
);

describe("aut-a-6 — naturalLanguageNextRun (pure function)", () => {
  it("retourne 'Désactivée' si rule.is_enabled = false", () => {
    expect(
      naturalLanguageNextRun(
        { is_enabled: false, trigger_type: "session_start_minus_days" },
        "2026-06-15T07:00:00Z",
      ),
    ).toBe("Désactivée");
  });

  it("nextAt = null + trigger date-based session_start → 'Pas applicable (...)'", () => {
    const result = naturalLanguageNextRun(
      { is_enabled: true, trigger_type: "session_start_minus_days" },
      null,
    );
    expect(result).toMatch(/Pas applicable/);
    expect(result).toMatch(/session future/);
  });

  it("nextAt = null + trigger date-based session_end → 'Pas applicable (...)'", () => {
    const result = naturalLanguageNextRun(
      { is_enabled: true, trigger_type: "session_end_plus_days" },
      null,
    );
    expect(result).toMatch(/Pas applicable/);
    expect(result).toMatch(/session terminée/);
  });

  it("nextAt = null + trigger event-driven → 'Évalué à chaque événement'", () => {
    const result = naturalLanguageNextRun(
      { is_enabled: true, trigger_type: "on_enrollment" },
      null,
    );
    expect(result).toBe("Évalué à chaque événement");
  });

  it("nextAt = null + opco_deposit_reminder → 'Aucun cas en attente'", () => {
    const result = naturalLanguageNextRun(
      { is_enabled: true, trigger_type: "opco_deposit_reminder" },
      null,
    );
    expect(result).toBe("Aucun cas en attente");
  });

  it("nextAt aujourd'hui → 'Ce soir 7h'", () => {
    const today = new Date().toISOString();
    expect(
      naturalLanguageNextRun(
        { is_enabled: true, trigger_type: "session_start_minus_days" },
        today,
      ),
    ).toBe("Ce soir 7h");
  });

  it("nextAt demain → 'Demain 7h'", () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    expect(
      naturalLanguageNextRun(
        { is_enabled: true, trigger_type: "session_start_minus_days" },
        tomorrow,
      ),
    ).toBe("Demain 7h");
  });

  it("nextAt dans 3 jours → '<jour fr> 7h'", () => {
    const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const result = naturalLanguageNextRun(
      { is_enabled: true, trigger_type: "session_start_minus_days" },
      inThreeDays,
    );
    expect(result).toMatch(/^(Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche) 7h$/);
  });

  it("nextAt dans 30 jours → 'Le <jour> <mois>'", () => {
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = naturalLanguageNextRun(
      { is_enabled: true, trigger_type: "session_start_minus_days" },
      in30Days,
    );
    expect(result).toMatch(/^Le \d{1,2} [a-zéûôî]+$/i);
  });

  it("date invalide → 'Date invalide'", () => {
    expect(
      naturalLanguageNextRun(
        { is_enabled: true, trigger_type: "session_start_minus_days" },
        "not-a-date",
      ),
    ).toBe("Date invalide");
  });

  it("isEventDrivenTrigger reconnaît les triggers événementiels", () => {
    expect(isEventDrivenTrigger("on_enrollment")).toBe(true);
    expect(isEventDrivenTrigger("on_session_creation")).toBe(true);
    expect(isEventDrivenTrigger("certificate_ready")).toBe(true);
    expect(isEventDrivenTrigger("session_start_minus_days")).toBe(false);
  });

  it("isDateBasedTrigger reconnaît les triggers date-based", () => {
    expect(isDateBasedTrigger("session_start_minus_days")).toBe(true);
    expect(isDateBasedTrigger("session_end_plus_days")).toBe(true);
    expect(isDateBasedTrigger("on_enrollment")).toBe(false);
  });
});

describe("aut-a-6 — GET /api/automation/next-runs (batch-loader)", () => {
  const routeSrc = readFileSync(NEXT_RUNS_ROUTE_PATH, "utf-8");

  it("la route existe et exporte un GET handler", () => {
    expect(existsSync(NEXT_RUNS_ROUTE_PATH)).toBe(true);
    expect(routeSrc).toMatch(/export async function GET\(/);
  });

  it("requiert le query param entity_id", () => {
    expect(routeSrc).toMatch(/entity_id query param required/);
  });

  it("auth admin/super_admin (super_admin tout, admin son entité)", () => {
    expect(routeSrc).toMatch(/profile\.role === "admin" && profile\.entity_id !== entityId/);
  });

  it("cache module-level 5min via next-runs-cache.ts (ID-AUT-1)", () => {
    // Contrainte Next.js 14 : route.ts ne peut exporter que des handlers HTTP.
    // Le cache vit dans un fichier séparé importé par la route.
    const cacheSrc = readFileSync(NEXT_RUNS_CACHE_PATH, "utf-8");
    expect(cacheSrc).toMatch(/const CACHE = new Map<string, CacheEntry>/);
    expect(cacheSrc).toMatch(/TTL_MS = 5 \* 60 \* 1000/);
    expect(cacheSrc).toMatch(/Date\.now\(\) - entry\.computedAt >= TTL_MS/);
    expect(routeSrc).toMatch(/from "@\/lib\/automation\/next-runs-cache"/);
    expect(routeSrc).toMatch(/getNextRunsCache\(entityId\)/);
    expect(routeSrc).toMatch(/setNextRunsCache\(entityId/);
  });

  it("export invalidateNextRunsCache(entityId) pour Server Actions futures", () => {
    const cacheSrc = readFileSync(NEXT_RUNS_CACHE_PATH, "utf-8");
    expect(cacheSrc).toMatch(
      /export function invalidateNextRunsCache\(entityId: string\)/,
    );
  });

  it("utilise computeBatchEvents() avec fenêtre 60 jours", () => {
    expect(routeSrc).toMatch(/computeBatchEvents\(supabase, entityId/);
    expect(routeSrc).toMatch(/60 \* 86400000/);
  });

  it("filtre events executed/failed/passés + aggregate par rule_id", () => {
    expect(routeSrc).toMatch(/status === "executed" \|\| ev\.status === "failed"/);
    expect(routeSrc).toMatch(/byRule\.get\(ev\.rule_id\)/);
  });

  it("retourne Record<rule_id, NextRunInfo>", () => {
    expect(routeSrc).toMatch(/Record<string, NextRunInfo>/);
    expect(routeSrc).toMatch(/naturalLanguageNextRun\(rule, next_at\)/);
  });
});

describe("aut-a-6 — POST /api/automation/dry-run (proxy formations)", () => {
  const routeSrc = readFileSync(DRY_RUN_FORMATIONS_PATH, "utf-8");

  it("la route existe et exporte un POST handler", () => {
    expect(existsSync(DRY_RUN_FORMATIONS_PATH)).toBe(true);
    expect(routeSrc).toMatch(/export async function POST\(/);
  });

  it("requiert rule_id + session_id dans le body", () => {
    expect(routeSrc).toMatch(/rule_id and session_id are required/);
  });

  it("auth admin + check entity (admin: son entité, super_admin: toutes)", () => {
    expect(routeSrc).toMatch(/Admin access required/);
    expect(routeSrc).toMatch(
      /profile\.role === "admin"[\s\S]+?rule\.entity_id !== profile\.entity_id/,
    );
  });

  it("proxy vers /api/formations/automation-rules/run-cron avec mode=dry-run + Bearer", () => {
    expect(routeSrc).toMatch(
      /\/api\/formations\/automation-rules\/run-cron/,
    );
    expect(routeSrc).toMatch(/Bearer \$\{process\.env\.CRON_SECRET\}/);
    expect(routeSrc).toMatch(/mode: "dry-run"/);
  });
});

describe("aut-a-6 — POST /api/crm/automations/dry-run (proxy CRM)", () => {
  const routeSrc = readFileSync(DRY_RUN_CRM_PATH, "utf-8");

  it("la route existe", () => {
    expect(existsSync(DRY_RUN_CRM_PATH)).toBe(true);
    expect(routeSrc).toMatch(/export async function POST\(/);
  });

  it("accepte rule_id OU trigger_type (les 2 sont optionnels)", () => {
    expect(routeSrc).toMatch(/rule_id = body\?\.rule_id/);
    expect(routeSrc).toMatch(/trigger_type = body\?\.trigger_type/);
  });

  it("si rule_id : charge la rule pour récupérer trigger_type", () => {
    expect(routeSrc).toMatch(
      /if \(rule_id\)[\s\S]+?from\("crm_automation_rules"\)[\s\S]+?\.eq\("id", rule_id\)/,
    );
  });

  it("défense en profondeur entité pour admin (pas super_admin)", () => {
    expect(routeSrc).toMatch(
      /profile\.role === "admin" && rule\.entity_id !== profile\.entity_id/,
    );
  });

  it("forward le cookie de session (pas Bearer car branche user)", () => {
    expect(routeSrc).toMatch(/request\.headers\.get\("cookie"\)/);
    expect(routeSrc).toMatch(/Cookie: cookieHeader/);
  });

  it("body forwardé contient mode=dry-run", () => {
    expect(routeSrc).toMatch(/mode: "dry-run"/);
  });
});

describe("aut-a-6 — POST /api/crm/automations/eligible-targets (wizard étape 5)", () => {
  const routeSrc = readFileSync(ELIGIBLE_TARGETS_PATH, "utf-8");

  it("la route existe", () => {
    expect(existsSync(ELIGIBLE_TARGETS_PATH)).toBe(true);
    expect(routeSrc).toMatch(/export async function POST\(/);
  });

  it("requiert trigger_type dans le body", () => {
    expect(routeSrc).toMatch(/trigger_type required/);
  });

  it("supporte les 3 triggers V1 CRM (prospect_inactive_30d + quote_expiring_3d + task_overdue_3d)", () => {
    expect(routeSrc).toMatch(/SUPPORTED_TRIGGERS = new Set/);
    expect(routeSrc).toMatch(/"prospect_inactive_30d"/);
    expect(routeSrc).toMatch(/"quote_expiring_3d"/);
    expect(routeSrc).toMatch(/"task_overdue_3d"/);
  });

  it("rejette les triggers non supportés V1 avec 400", () => {
    expect(routeSrc).toMatch(/non supporté pour eligible-targets \(V1\)/);
  });

  it("retourne { trigger_type, count, sample } pour chaque trigger", () => {
    expect(routeSrc).toMatch(/data: \{[\s\S]+?trigger_type[\s\S]+?count[\s\S]+?sample/);
  });

  it("utilise Promise.all pour parallel count + sample (perf)", () => {
    const matches = routeSrc.match(/Promise\.all\(/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3); // 1 par trigger
  });

  it("limit(5) pour le sample (preview UI)", () => {
    const matches = routeSrc.match(/\.limit\(5\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3); // 1 par trigger
  });

  it("auth admin + entity scope (utilise profile.entity_id)", () => {
    expect(routeSrc).toMatch(/Admin access required/);
    expect(routeSrc).toMatch(/const entityId = profile\.entity_id/);
  });
});
