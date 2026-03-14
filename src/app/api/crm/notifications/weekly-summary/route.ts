import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
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

    if (!profile?.entity_id || profile.role !== "admin") {
      return NextResponse.json({ data: null, error: "Admin access required" }, { status: 403 });
    }

    const entityId = profile.entity_id;
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1); // Monday
    const weekStartStr = weekStart.toISOString().split("T")[0];
    const todayStr = now.toISOString().split("T")[0];

    // Weekly stats
    const [
      { count: newProspects },
      { count: wonProspects },
      { count: lostProspects },
      { data: acceptedQuotes },
      { data: rejectedQuotes },
      { count: completedTasks },
    ] = await Promise.all([
      supabase
        .from("crm_prospects")
        .select("id", { count: "exact", head: true })
        .eq("entity_id", entityId)
        .gte("created_at", weekStartStr),
      supabase
        .from("crm_prospects")
        .select("id", { count: "exact", head: true })
        .eq("entity_id", entityId)
        .eq("status", "won")
        .gte("updated_at", weekStartStr),
      supabase
        .from("crm_prospects")
        .select("id", { count: "exact", head: true })
        .eq("entity_id", entityId)
        .eq("status", "lost")
        .gte("updated_at", weekStartStr),
      supabase
        .from("crm_quotes")
        .select("amount")
        .eq("entity_id", entityId)
        .eq("status", "accepted")
        .gte("created_at", weekStartStr),
      supabase
        .from("crm_quotes")
        .select("amount")
        .eq("entity_id", entityId)
        .eq("status", "rejected")
        .gte("created_at", weekStartStr),
      supabase
        .from("crm_tasks")
        .select("id", { count: "exact", head: true })
        .eq("entity_id", entityId)
        .eq("status", "completed")
        .gte("due_date", weekStartStr),
    ]);

    const revenueAccepted = acceptedQuotes?.reduce((sum, q) => sum + Number(q.amount ?? 0), 0) ?? 0;
    const revenueLost = rejectedQuotes?.reduce((sum, q) => sum + Number(q.amount ?? 0), 0) ?? 0;

    const fmtEur = (v: number) => `${v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} EUR`;

    // Build summary message
    const lines: string[] = [];
    lines.push(`Nouveaux prospects: ${newProspects ?? 0}`);
    lines.push(`Gagnés: ${wonProspects ?? 0} | Perdus: ${lostProspects ?? 0}`);
    lines.push(`CA accepté: ${fmtEur(revenueAccepted)} | CA perdu: ${fmtEur(revenueLost)}`);
    lines.push(`Tâches complétées: ${completedTasks ?? 0}`);

    // Create weekly summary notification for all admins
    const { data: admins } = await supabase
      .from("profiles")
      .select("id")
      .eq("entity_id", entityId)
      .eq("role", "admin");

    if (admins) {
      const summaryNotifs = admins.map((admin) => ({
        entity_id: entityId,
        user_id: admin.id,
        type: "weekly_summary",
        title: `Bilan hebdomadaire (sem. du ${weekStartStr})`,
        message: lines.join(" | "),
        link: "/admin/crm",
        resource_type: "summary",
        resource_id: weekStartStr,
      }));
      await supabase.from("crm_notifications").insert(summaryNotifs);
    }

    return NextResponse.json({
      data: {
        week_start: weekStartStr,
        new_prospects: newProspects ?? 0,
        won: wonProspects ?? 0,
        lost: lostProspects ?? 0,
        revenue_accepted: revenueAccepted,
        revenue_lost: revenueLost,
        tasks_completed: completedTasks ?? 0,
      },
      error: null,
    });
  } catch (err) {
    return NextResponse.json({ data: null, error: sanitizeError(err, "generating weekly summary") }, { status: 500 });
  }
}
