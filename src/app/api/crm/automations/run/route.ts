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
import { logCrmAutomationExecution } from "@/lib/crm/automation-logger";

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
            // aut-c-4 : log audit (NFR-AUT-REL-2 non-blocking via helper)
            await logCrmAutomationExecution(supabase, {
              entity_id: entity.id,
              trigger_type: "prospect_inactive_30d",
              action_type: "create_task",
              recipient_count: results.inactive_relances + results.dormant_prospects,
              status: "success",
              is_manual: false,
            });
          }

          if (enabledTriggers.has("quote_expiring_3d")) {
            results.expiring_quote_tasks = await createExpiringQuoteTasks(
              supabase,
              entity.id,
            );
            await logCrmAutomationExecution(supabase, {
              entity_id: entity.id,
              trigger_type: "quote_expiring_3d",
              action_type: "create_task",
              recipient_count: results.expiring_quote_tasks,
              status: "success",
              is_manual: false,
            });
          }

          if (enabledTriggers.has("task_overdue_3d")) {
            results.overdue_notifications = await notifyOverdueTasks(
              supabase,
              entity.id,
            );
            await logCrmAutomationExecution(supabase, {
              entity_id: entity.id,
              trigger_type: "task_overdue_3d",
              action_type: "create_notification",
              recipient_count: results.overdue_notifications,
              status: "success",
              is_manual: false,
            });
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

    // ── DRY-RUN MODE (aut-a-3) : calcule cibles éligibles sans agir ──
    // Body input : { mode: "dry-run", trigger_type?: string }
    // Garantie NFR-AUT-SEC-5 : aucune création de tâche/notification en dry-run.
    let bodyMode: "execute" | "dry-run" = "execute";
    let bodyTriggerType: string | null = null;
    try {
      const body = await request.json();
      if (body?.mode === "dry-run") bodyMode = "dry-run";
      if (body?.trigger_type) bodyTriggerType = body.trigger_type;
    } catch { /* empty body = execute mode */ }

    if (bodyMode === "dry-run") {
      const eligibility: Record<string, { count: number; sample: Array<{ id: string; name: string }> }> = {};
      const today = new Date();

      // prospect_inactive_30d : prospects sans activité depuis 30 jours
      if (!bodyTriggerType || bodyTriggerType === "prospect_inactive_30d") {
        const cutoff = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: prospects } = await supabase
          .from("crm_prospects")
          .select("id, company_name, last_activity_at")
          .eq("entity_id", entityId)
          .lt("last_activity_at", cutoff)
          .limit(5);
        const { count: totalCount } = await supabase
          .from("crm_prospects")
          .select("id", { count: "exact", head: true })
          .eq("entity_id", entityId)
          .lt("last_activity_at", cutoff);
        eligibility.prospect_inactive_30d = {
          count: totalCount ?? 0,
          sample: (prospects ?? []).map((p) => ({ id: p.id, name: p.company_name ?? "—" })),
        };
      }

      // quote_expiring_3d : devis expirant dans les 3 prochains jours
      if (!bodyTriggerType || bodyTriggerType === "quote_expiring_3d") {
        const inThreeDays = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
        const { data: quotes } = await supabase
          .from("crm_quotes")
          .select("id, reference, valid_until")
          .eq("entity_id", entityId)
          .lte("valid_until", inThreeDays)
          .gte("valid_until", today.toISOString())
          .limit(5);
        const { count: totalCount } = await supabase
          .from("crm_quotes")
          .select("id", { count: "exact", head: true })
          .eq("entity_id", entityId)
          .lte("valid_until", inThreeDays)
          .gte("valid_until", today.toISOString());
        eligibility.quote_expiring_3d = {
          count: totalCount ?? 0,
          sample: (quotes ?? []).map((q) => ({ id: q.id, name: q.reference ?? "—" })),
        };
      }

      // task_overdue_3d : tâches commerciales en retard de 3+ jours
      if (!bodyTriggerType || bodyTriggerType === "task_overdue_3d") {
        const overdueCutoff = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
        const { data: tasks } = await supabase
          .from("crm_tasks")
          .select("id, title, due_at, status")
          .eq("entity_id", entityId)
          .lt("due_at", overdueCutoff)
          .neq("status", "done")
          .limit(5);
        const { count: totalCount } = await supabase
          .from("crm_tasks")
          .select("id", { count: "exact", head: true })
          .eq("entity_id", entityId)
          .lt("due_at", overdueCutoff)
          .neq("status", "done");
        eligibility.task_overdue_3d = {
          count: totalCount ?? 0,
          sample: (tasks ?? []).map((t) => ({ id: t.id, name: t.title ?? "—" })),
        };
      }

      return NextResponse.json({
        data: {
          mode: "dry-run",
          entity_id: entityId,
          trigger_type: bodyTriggerType ?? "all",
          eligibility,
        },
        error: null,
      });
    }

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
      // aut-c-4 : log audit (NFR-AUT-REL-2 non-blocking via helper)
      await logCrmAutomationExecution(supabase, {
        entity_id: entityId,
        trigger_type: "prospect_inactive_30d",
        action_type: "create_task",
        recipient_count: relanceCount + dormantCount,
        status: "success",
        executed_by: user.id,
        is_manual: true,
      });
    }

    if (enabledTriggers.has("quote_expiring_3d")) {
      const count = await createExpiringQuoteTasks(supabase, entityId);
      results.expiring_quote_tasks = `${count} tâche(s) de relance créée(s)`;
      await logCrmAutomationExecution(supabase, {
        entity_id: entityId,
        trigger_type: "quote_expiring_3d",
        action_type: "create_task",
        recipient_count: count,
        status: "success",
        executed_by: user.id,
        is_manual: true,
      });
    }

    if (enabledTriggers.has("task_overdue_3d")) {
      const count = await notifyOverdueTasks(supabase, entityId);
      results.overdue_notifications = `${count} notification(s) créée(s)`;
      await logCrmAutomationExecution(supabase, {
        entity_id: entityId,
        trigger_type: "task_overdue_3d",
        action_type: "create_notification",
        recipient_count: count,
        status: "success",
        executed_by: user.id,
        is_manual: true,
      });
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
