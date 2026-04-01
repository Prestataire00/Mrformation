import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import {
  checkDormantProspects,
  relanceInactiveProspects,
  createExpiringQuoteTasks,
  notifyOverdueTasks,
} from "@/lib/crm/automations";
import { sanitizeError } from "@/lib/api-error";

export async function POST(request: NextRequest) {
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

    const entityId = profile.entity_id;

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
