import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";

interface RouteContext { params: { id: string } }

const TRIGGER_LABELS: Record<string, string> = {
  session_start_minus_days: "Avant la formation",
  session_end_plus_days: "Après la formation",
  on_session_creation: "Création de la session",
  on_session_completion: "Session terminée",
  on_enrollment: "Inscription apprenant",
  on_signature_complete: "Signatures complètes",
  opco_deposit_reminder: "Rappel dépôt OPCO",
  invoice_overdue: "Facture en retard",
  questionnaire_reminder: "Rappel questionnaire",
  certificate_ready: "Certificat prêt",
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const sessionId = context.params.id;
  const entityId = auth.profile.entity_id;

  // 1. Fetch session
  const { data: session } = await auth.supabase
    .from("sessions")
    .select("id, title, start_date, end_date, status, is_subcontracted, entity_id")
    .eq("id", sessionId)
    .eq("entity_id", entityId)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
  }

  // 2. Fetch all active rules for entity
  const { data: rules } = await auth.supabase
    .from("formation_automation_rules")
    .select("id, name, trigger_type, days_offset, document_type, recipient_type, template_id, is_enabled, condition_subcontracted")
    .eq("entity_id", entityId)
    .eq("is_enabled", true);

  // 3. Fetch overrides for this session
  const { data: overrides } = await auth.supabase
    .from("session_automation_overrides")
    .select("rule_id, is_enabled, days_offset_override")
    .eq("session_id", sessionId);

  // 4. Fetch logs for this session
  const { data: logs } = await auth.supabase
    .from("session_automation_logs")
    .select("id, rule_id, rule_name, trigger_type, executed_at, recipient_count, status, is_manual, details")
    .eq("session_id", sessionId)
    .order("executed_at", { ascending: false });

  // 5. Build timeline events
  const now = new Date();
  const startDate = new Date(session.start_date);
  const endDate = new Date(session.end_date);
  const overrideMap = new Map((overrides || []).map(o => [o.rule_id, o]));
  const logsByRule = new Map<string, typeof logs>();
  for (const log of logs || []) {
    if (!log.rule_id) continue;
    if (!logsByRule.has(log.rule_id)) logsByRule.set(log.rule_id, []);
    logsByRule.get(log.rule_id)!.push(log);
  }

  interface TimelineEvent {
    id: string;
    title: string;
    description: string;
    trigger_type: string;
    scheduled_date: string;
    status: "executed" | "pending" | "overridden" | "failed";
    recipient_type: string;
    rule_id: string;
    log_id?: string;
    last_executed_at?: string;
    recipient_count: number;
    can_override: boolean;
    can_trigger_now: boolean;
  }

  const events: TimelineEvent[] = [];

  for (const rule of rules || []) {
    // Check if rule applies to this session (subcontracted filter)
    if (rule.condition_subcontracted !== null && rule.condition_subcontracted !== !!session.is_subcontracted) {
      continue;
    }

    // Calculate scheduled date
    let scheduledDate: Date | null = null;
    const offset = rule.days_offset || 0;

    switch (rule.trigger_type) {
      case "session_start_minus_days":
        scheduledDate = new Date(startDate);
        scheduledDate.setDate(scheduledDate.getDate() - offset);
        break;
      case "session_end_plus_days":
        scheduledDate = new Date(endDate);
        scheduledDate.setDate(scheduledDate.getDate() + offset);
        break;
      case "on_session_creation":
        scheduledDate = new Date(session.start_date); // approximation
        scheduledDate.setDate(scheduledDate.getDate() - 30); // ~at creation
        break;
      case "on_session_completion":
        scheduledDate = new Date(endDate);
        break;
      case "on_enrollment":
        scheduledDate = new Date(startDate);
        scheduledDate.setDate(scheduledDate.getDate() - 7);
        break;
      default:
        scheduledDate = new Date(startDate);
        break;
    }

    // Check override
    const override = overrideMap.get(rule.id);
    const isOverridden = override && !override.is_enabled;
    if (override?.days_offset_override != null && scheduledDate) {
      // Apply custom offset
      if (rule.trigger_type === "session_start_minus_days") {
        scheduledDate = new Date(startDate);
        scheduledDate.setDate(scheduledDate.getDate() - override.days_offset_override);
      } else if (rule.trigger_type === "session_end_plus_days") {
        scheduledDate = new Date(endDate);
        scheduledDate.setDate(scheduledDate.getDate() + override.days_offset_override);
      }
    }

    // Check execution logs
    const ruleLogs = logsByRule.get(rule.id) || [];
    const lastLog = ruleLogs[0]; // most recent
    const wasExecuted = lastLog && (lastLog.status === "success" || lastLog.status === "partial");

    // Determine status
    let status: TimelineEvent["status"] = "pending";
    if (isOverridden) status = "overridden";
    else if (lastLog?.status === "failed") status = "failed";
    else if (wasExecuted) status = "executed";

    const triggerLabel = TRIGGER_LABELS[rule.trigger_type] || rule.trigger_type;
    const ruleName = rule.name || rule.document_type || triggerLabel;
    const offsetLabel = offset > 0
      ? rule.trigger_type.includes("minus") ? `J-${offset}` : `J+${offset}`
      : "Jour J";

    events.push({
      id: rule.id,
      title: ruleName,
      description: `${triggerLabel} (${offsetLabel}) — ${rule.recipient_type}`,
      trigger_type: rule.trigger_type,
      scheduled_date: scheduledDate?.toISOString() || now.toISOString(),
      status,
      recipient_type: rule.recipient_type,
      rule_id: rule.id,
      log_id: lastLog?.id,
      last_executed_at: lastLog?.executed_at,
      recipient_count: lastLog?.recipient_count || 0,
      can_override: !isOverridden,
      can_trigger_now: status === "pending" && !isOverridden,
    });
  }

  // Sort by scheduled_date
  events.sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime());

  return NextResponse.json({
    session: {
      id: session.id,
      title: session.title,
      start_date: session.start_date,
      end_date: session.end_date,
      status: session.status,
    },
    events,
    now: now.toISOString(),
  });
}
