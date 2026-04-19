import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createExpiringQuoteTasks, notifyOverdueTasks } from "@/lib/crm/automations";
import { sanitizeError } from "@/lib/api-error";
import { DORMANCY_THRESHOLD_DAYS } from "@/lib/crm/constants";
import { verifyCronAuth, unauthorizedCronResponse } from "@/lib/cron-auth";

export async function POST(request: NextRequest) {
  try {
    const isCron = verifyCronAuth(request);
    const supabase = createClient();
    let entityId: string;

    if (isCron) {
      // En mode cron, l'entity_id peut être passé dans le body
      const body = await request.json().catch(() => ({}));
      if (!body.entity_id) {
        return NextResponse.json({ data: null, error: "entity_id requis en mode cron" }, { status: 400 });
      }
      entityId = body.entity_id;
    } else {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        return unauthorizedCronResponse();
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("entity_id, role")
        .eq("id", user.id)
        .single();

      if (!profile?.entity_id || !["admin","super_admin"].includes(profile.role)) {
        return NextResponse.json({ data: null, error: "Admin access required" }, { status: 403 });
      }
      entityId = profile.entity_id;
    }
    const today = new Date().toISOString().split("T")[0];

    // 1. Create tasks for expiring quotes
    const expiringTasksCreated = await createExpiringQuoteTasks(supabase, entityId);

    // 2. Notify admins about overdue tasks (3+ days)
    const overdueNotifs = await notifyOverdueTasks(supabase, entityId);

    // 3. Aggregate daily stats
    const [
      { count: overdueCount },
      { count: todayTaskCount },
      { count: newLeadsCount },
      { data: expiringQuotes },
    ] = await Promise.all([
      supabase
        .from("crm_tasks")
        .select("id", { count: "exact", head: true })
        .eq("entity_id", entityId)
        .lt("due_date", today)
        .in("status", ["pending", "in_progress"]),
      supabase
        .from("crm_tasks")
        .select("id", { count: "exact", head: true })
        .eq("entity_id", entityId)
        .eq("due_date", today)
        .in("status", ["pending", "in_progress"]),
      supabase
        .from("crm_prospects")
        .select("id", { count: "exact", head: true })
        .eq("entity_id", entityId)
        .gte("created_at", today),
      supabase
        .from("crm_quotes")
        .select("id")
        .eq("entity_id", entityId)
        .eq("status", "sent")
        .lte("valid_until", new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0])
        .gte("valid_until", today),
    ]);

    // 4. Create digest notification for all admins
    const { data: admins } = await supabase
      .from("profiles")
      .select("id")
      .eq("entity_id", entityId)
      .eq("role", "admin");

    // Count dormant prospects
    const dormancyThreshold = new Date(
      Date.now() - DORMANCY_THRESHOLD_DAYS * 86400000
    ).toISOString();
    const { data: recentActions } = await supabase
      .from("crm_commercial_actions")
      .select("prospect_id")
      .eq("entity_id", entityId)
      .gte("created_at", dormancyThreshold);
    const recentIds = new Set(
      recentActions?.map((a) => a.prospect_id).filter(Boolean) ?? []
    );
    const { data: activeProspects } = await supabase
      .from("crm_prospects")
      .select("id")
      .eq("entity_id", entityId)
      .not("status", "in", '("won","lost","dormant")');
    const dormantCount = (activeProspects ?? []).filter(
      (p) => !recentIds.has(p.id)
    ).length;

    const parts: string[] = [];
    if ((overdueCount ?? 0) > 0) parts.push(`${overdueCount} tâche(s) en retard`);
    if ((todayTaskCount ?? 0) > 0) parts.push(`${todayTaskCount} tâche(s) du jour`);
    if ((expiringQuotes?.length ?? 0) > 0) parts.push(`${expiringQuotes?.length} devis expirant bientôt`);
    if ((newLeadsCount ?? 0) > 0) parts.push(`${newLeadsCount} nouveau(x) lead(s)`);
    if (dormantCount > 0) parts.push(`${dormantCount} prospect(s) dormant(s)`);

    if (parts.length > 0 && admins) {
      const digestNotifs = admins.map((admin) => ({
        entity_id: entityId,
        user_id: admin.id,
        type: "daily_digest",
        title: "Résumé quotidien",
        message: parts.join(" | "),
        link: "/admin/crm",
        resource_type: "digest",
        resource_id: today,
      }));
      await supabase.from("crm_notifications").insert(digestNotifs);
    }

    return NextResponse.json({
      data: {
        expiring_tasks_created: expiringTasksCreated,
        overdue_notifications: overdueNotifs,
        digest: {
          overdue_tasks: overdueCount ?? 0,
          today_tasks: todayTaskCount ?? 0,
          expiring_quotes: expiringQuotes?.length ?? 0,
          new_leads: newLeadsCount ?? 0,
        },
      },
      error: null,
    });
  } catch (err) {
    return NextResponse.json({ data: null, error: sanitizeError(err, "generating daily digest") }, { status: 500 });
  }
}
