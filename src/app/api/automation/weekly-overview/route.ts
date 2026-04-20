import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { computeBatchEvents } from "@/lib/automation/compute-events";

function getWeekBounds(): { from: Date; to: Date } {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { from: monday, to: sunday };
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const defaultBounds = getWeekBounds();
  const from = fromParam ? new Date(fromParam) : defaultBounds.from;
  const to = toParam ? new Date(toParam) : defaultBounds.to;

  const { events, sessions } = await computeBatchEvents(auth.supabase, auth.profile.entity_id, { from, to });

  // Counts by status
  const countsByStatus = { pending: 0, executed: 0, overridden: 0, failed: 0 };
  for (const e of events) {
    if (e.status in countsByStatus) countsByStatus[e.status as keyof typeof countsByStatus]++;
  }

  // Counts by type category
  const countsByType = { email: 0, document: 0, questionnaire: 0, invoice: 0, certificate: 0 };
  for (const e of events) {
    if (e.trigger_type.includes("questionnaire")) countsByType.questionnaire++;
    else if (e.trigger_type.includes("invoice") || e.trigger_type.includes("opco")) countsByType.invoice++;
    else if (e.trigger_type.includes("certificate")) countsByType.certificate++;
    else if (e.trigger_type.includes("signature") || e.trigger_type.includes("document")) countsByType.document++;
    else countsByType.email++;
  }

  // Group by day
  const eventsByDay: Record<string, typeof events> = {};
  for (const e of events) {
    const day = e.scheduled_date.split("T")[0];
    if (!eventsByDay[day]) eventsByDay[day] = [];
    eventsByDay[day].push(e);
  }

  // Alerts
  const alerts: Array<{
    level: "warning" | "error";
    type: string;
    title: string;
    description: string;
    session_id: string;
    session_title: string;
    cta?: { label: string; href: string };
  }> = [];

  for (const e of events) {
    if (e.status === "failed") {
      alerts.push({
        level: "error",
        type: "failed_send",
        title: `Envoi échoué : ${e.title}`,
        description: `Pour la formation "${e.session_title}"`,
        session_id: e.session_id || "",
        session_title: e.session_title || "",
        cta: { label: "Voir", href: `/admin/formations/${e.session_id}?tab=automatisation` },
      });
    }
  }

  // Check for sessions starting this week with no convocation
  for (const session of sessions) {
    const startTs = new Date(session.start_date).getTime();
    if (startTs >= from.getTime() && startTs <= to.getTime()) {
      const hasConvocation = events.some(
        e => e.session_id === session.id && e.trigger_type === "session_start_minus_days" && e.status === "executed"
      );
      if (!hasConvocation) {
        alerts.push({
          level: "warning",
          type: "missing_convocation",
          title: `Convocation non envoyée`,
          description: `"${session.title}" commence le ${new Date(session.start_date).toLocaleDateString("fr-FR")}`,
          session_id: session.id,
          session_title: session.title,
          cta: { label: "Configurer", href: `/admin/formations/${session.id}?tab=automatisation` },
        });
      }
    }
  }

  return NextResponse.json({
    period: { from: from.toISOString(), to: to.toISOString() },
    total_events: events.length,
    counts_by_status: countsByStatus,
    counts_by_type: countsByType,
    events_by_day: eventsByDay,
    alerts,
    sessions_count: sessions.length,
  });
}
