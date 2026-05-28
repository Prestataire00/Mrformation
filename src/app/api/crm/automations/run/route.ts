import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  checkDormantProspects,
  relanceInactiveProspects,
  createExpiringQuoteTasks,
  notifyOverdueTasks,
} from "@/lib/crm/automations";
import { sanitizeError } from "@/lib/api-error";
import { resolveActiveEntityId } from "@/lib/crm/active-entity";

// Story aut-a-2 — Branche cron pour scheduled function Netlify
// `process-automation-rules.mts` pingue cette route avec Bearer ${CRON_SECRET}
// → mode cron : iterate toutes les entités avec service_role (NFR-AUT-REL-2 :
// try/catch par entité, fail sur entité X n'interrompt pas entité Y).

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type EntitySummary = {
  name?: string;
  results?: Record<string, number>;
  error?: string;
};

export async function POST(request: NextRequest) {
  // ── BRANCHE CRON : Authorization: Bearer ${CRON_SECRET} ──
  // Appelée par netlify/functions/process-automation-rules.mts (aut-a-2)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    try {
      const supabase = createServiceClient();
      const { data: entities } = await supabase
        .from("entities")
        .select("id, name");

      const summary: Record<string, EntitySummary> = {};
      let totalExecuted = 0;
      let totalFailed = 0;

      for (const entity of entities ?? []) {
        try {
          // Pour chaque entité, déterminer les triggers actifs
          const { data: rules } = await supabase
            .from("crm_automation_rules")
            .select("trigger_type, is_enabled")
            .eq("entity_id", entity.id)
            .eq("is_enabled", true);

          const enabledTriggers = new Set(
            (rules ?? []).map((r) => r.trigger_type),
          );
          const results: Record<string, number> = {};

          if (enabledTriggers.has("prospect_inactive_30d")) {
            results.inactive_relances = await relanceInactiveProspects(
              supabase,
              entity.id,
            );
            results.dormant_prospects = await checkDormantProspects(
              supabase,
              entity.id,
            );
          }

          if (enabledTriggers.has("quote_expiring_3d")) {
            results.expiring_quote_tasks = await createExpiringQuoteTasks(
              supabase,
              entity.id,
            );
          }

          if (enabledTriggers.has("task_overdue_3d")) {
            results.overdue_notifications = await notifyOverdueTasks(
              supabase,
              entity.id,
            );
          }

          summary[entity.id] = { name: entity.name, results };
          totalExecuted += Object.keys(results).length;
        } catch (entityErr) {
          // NFR-AUT-REL-2 : un fail sur 1 entité n'interrompt pas le reste
          totalFailed += 1;
          summary[entity.id] = {
            name: entity.name,
            error: entityErr instanceof Error ? entityErr.message : String(entityErr),
          };
        }
      }

      return NextResponse.json({
        data: {
          mode: "cron",
          entities_count: entities?.length ?? 0,
          totalExecuted,
          totalFailed,
          summary,
        },
        error: null,
      });
    } catch (err) {
      return NextResponse.json(
        { data: null, error: sanitizeError(err, "running automations (cron mode)") },
        { status: 500 },
      );
    }
  }

  // ── BRANCHE USER : flow existant (admin appelle manuellement) ──
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("entity_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.entity_id || !["admin","super_admin"].includes(profile.role)) {
      return NextResponse.json({ data: null, error: "Admin access required" }, { status: 403 });
    }

    const entityId = resolveActiveEntityId(profile);

    // Fetch enabled rules
    const { data: rules } = await supabase
      .from("crm_automation_rules")
      .select("trigger_type, is_enabled")
      .eq("entity_id", entityId)
      .eq("is_enabled", true);

    const enabledTriggers = new Set((rules ?? []).map((r) => r.trigger_type));

    const results: Record<string, string> = {};

    // Run applicable automations
    if (enabledTriggers.has("prospect_inactive_30d")) {
      const relanceCount = await relanceInactiveProspects(supabase, entityId);
      results.inactive_prospect_relances = `${relanceCount} tâche(s) de relance créée(s)`;
      const dormantCount = await checkDormantProspects(supabase, entityId);
      results.dormant_prospects = `${dormantCount} prospect(s) marqué(s) dormant`;
    }

    if (enabledTriggers.has("quote_expiring_3d")) {
      const count = await createExpiringQuoteTasks(supabase, entityId);
      results.expiring_quote_tasks = `${count} tâche(s) de relance créée(s)`;
    }

    if (enabledTriggers.has("task_overdue_3d")) {
      const count = await notifyOverdueTasks(supabase, entityId);
      results.overdue_notifications = `${count} notification(s) créée(s)`;
    }

    // Daily digest and weekly summary are handled by their respective API routes
    // They can be triggered separately via /api/crm/notifications/daily-digest and weekly-summary

    return NextResponse.json({
      data: {
        executed: Object.keys(results).length,
        results,
      },
      error: null,
    });
  } catch (err) {
    return NextResponse.json({ data: null, error: sanitizeError(err, "running automations") }, { status: 500 });
  }
}
