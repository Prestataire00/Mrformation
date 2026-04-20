/**
 * Logique partagée pour calculer la timeline d'automation d'une ou plusieurs sessions.
 * Utilisé par :
 * - /api/formations/[id]/timeline (session unique)
 * - /api/automation/weekly-overview (multi-sessions)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = { from: (table: string) => any };

export interface TimelineEvent {
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
  session_id?: string;
  session_title?: string;
}

export const TRIGGER_LABELS: Record<string, string> = {
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

interface SessionData {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  is_subcontracted?: boolean;
}

interface RuleData {
  id: string;
  name: string | null;
  trigger_type: string;
  days_offset: number | null;
  document_type: string | null;
  recipient_type: string;
  condition_subcontracted: boolean | null;
}

interface OverrideData {
  rule_id: string;
  is_enabled: boolean;
  days_offset_override: number | null;
}

interface LogData {
  id: string;
  rule_id: string | null;
  executed_at: string;
  recipient_count: number;
  status: string;
}

function computeScheduledDate(triggerType: string, offset: number, start: Date, end: Date): Date {
  switch (triggerType) {
    case "session_start_minus_days": {
      const d = new Date(start);
      d.setDate(d.getDate() - offset);
      return d;
    }
    case "session_end_plus_days": {
      const d = new Date(end);
      d.setDate(d.getDate() + offset);
      return d;
    }
    case "on_session_completion":
      return new Date(end);
    case "on_session_creation": {
      const d = new Date(start);
      d.setDate(d.getDate() - 30);
      return d;
    }
    case "on_enrollment": {
      const d = new Date(start);
      d.setDate(d.getDate() - 7);
      return d;
    }
    default:
      return new Date(start);
  }
}

/** Calcule les événements d'une session à partir de données pré-chargées */
export function buildSessionEvents(
  session: SessionData,
  rules: RuleData[],
  overrides: OverrideData[],
  logs: LogData[],
): TimelineEvent[] {
  const startDate = new Date(session.start_date);
  const endDate = new Date(session.end_date);
  const overrideMap = new Map(overrides.map(o => [o.rule_id, o]));
  const logsByRule = new Map<string, LogData[]>();
  for (const log of logs) {
    if (!log.rule_id) continue;
    if (!logsByRule.has(log.rule_id)) logsByRule.set(log.rule_id, []);
    logsByRule.get(log.rule_id)!.push(log);
  }

  const events: TimelineEvent[] = [];

  for (const rule of rules) {
    if (rule.condition_subcontracted !== null && rule.condition_subcontracted !== !!session.is_subcontracted) continue;

    const offset = rule.days_offset || 0;
    let scheduledDate = computeScheduledDate(rule.trigger_type, offset, startDate, endDate);

    const override = overrideMap.get(rule.id);
    const isOverridden = override && !override.is_enabled;
    if (override?.days_offset_override != null) {
      scheduledDate = computeScheduledDate(rule.trigger_type, override.days_offset_override, startDate, endDate);
    }

    const ruleLogs = logsByRule.get(rule.id) || [];
    const lastLog = ruleLogs[0];
    const wasExecuted = lastLog && (lastLog.status === "success" || lastLog.status === "partial");

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
      id: `${session.id}_${rule.id}`,
      title: ruleName,
      description: `${triggerLabel} (${offsetLabel}) — ${rule.recipient_type}`,
      trigger_type: rule.trigger_type,
      scheduled_date: scheduledDate.toISOString(),
      status,
      recipient_type: rule.recipient_type,
      rule_id: rule.id,
      log_id: lastLog?.id,
      last_executed_at: lastLog?.executed_at,
      recipient_count: lastLog?.recipient_count || 0,
      can_override: !isOverridden,
      can_trigger_now: status === "pending" && !isOverridden,
      session_id: session.id,
      session_title: session.title,
    });
  }

  events.sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime());
  return events;
}

/** Charge et calcule la timeline d'une session unique */
export async function computeSessionEvents(
  supabase: SupabaseLike,
  sessionId: string,
  entityId: string,
): Promise<{ session: SessionData; events: TimelineEvent[] } | null> {
  const { data: session } = await supabase
    .from("sessions")
    .select("id, title, start_date, end_date, status, is_subcontracted")
    .eq("id", sessionId)
    .eq("entity_id", entityId)
    .single();

  if (!session) return null;

  const { data: rules } = await supabase
    .from("formation_automation_rules")
    .select("id, name, trigger_type, days_offset, document_type, recipient_type, condition_subcontracted")
    .eq("entity_id", entityId)
    .eq("is_enabled", true);

  const { data: overrides } = await supabase
    .from("session_automation_overrides")
    .select("rule_id, is_enabled, days_offset_override")
    .eq("session_id", sessionId);

  const { data: logs } = await supabase
    .from("session_automation_logs")
    .select("id, rule_id, executed_at, recipient_count, status")
    .eq("session_id", sessionId)
    .order("executed_at", { ascending: false });

  const events = buildSessionEvents(session, rules || [], overrides || [], logs || []);
  return { session, events };
}

/** Calcule les événements pour plusieurs sessions en batch (optimisé) */
export async function computeBatchEvents(
  supabase: SupabaseLike,
  entityId: string,
  window?: { from: Date; to: Date },
): Promise<{ events: Array<TimelineEvent & { session_id: string; session_title: string }>; sessions: SessionData[] }> {
  // 1. Charger sessions actives (fenêtre large pour couvrir J-X et J+X)
  const windowFrom = window ? new Date(window.from.getTime() - 60 * 86400000).toISOString() : undefined;
  const windowTo = window ? new Date(window.to.getTime() + 60 * 86400000).toISOString() : undefined;

  let sessionsQuery = supabase
    .from("sessions")
    .select("id, title, start_date, end_date, is_subcontracted")
    .eq("entity_id", entityId)
    .in("status", ["upcoming", "in_progress"]);

  if (windowFrom) sessionsQuery = sessionsQuery.gte("end_date", windowFrom);
  if (windowTo) sessionsQuery = sessionsQuery.lte("start_date", windowTo);

  const { data: sessions } = await sessionsQuery.order("start_date");
  if (!sessions || sessions.length === 0) return { events: [], sessions: [] };

  const sessionIds = sessions.map((s: SessionData) => s.id);

  // 2. Charger règles en 1 query
  const { data: rules } = await supabase
    .from("formation_automation_rules")
    .select("id, name, trigger_type, days_offset, document_type, recipient_type, condition_subcontracted")
    .eq("entity_id", entityId)
    .eq("is_enabled", true);

  // 3. Charger tous les overrides en 1 query
  const { data: allOverrides } = await supabase
    .from("session_automation_overrides")
    .select("session_id, rule_id, is_enabled, days_offset_override")
    .in("session_id", sessionIds);

  // 4. Charger tous les logs en 1 query
  const { data: allLogs } = await supabase
    .from("session_automation_logs")
    .select("id, session_id, rule_id, executed_at, recipient_count, status")
    .in("session_id", sessionIds)
    .order("executed_at", { ascending: false });

  // 5. Calculer par session en mémoire
  const overridesBySession = new Map<string, OverrideData[]>();
  for (const o of allOverrides || []) {
    if (!overridesBySession.has(o.session_id)) overridesBySession.set(o.session_id, []);
    overridesBySession.get(o.session_id)!.push(o);
  }

  const logsBySession = new Map<string, LogData[]>();
  for (const l of allLogs || []) {
    if (!logsBySession.has(l.session_id)) logsBySession.set(l.session_id, []);
    logsBySession.get(l.session_id)!.push(l);
  }

  let allEvents: Array<TimelineEvent & { session_id: string; session_title: string }> = [];

  for (const session of sessions) {
    const sessionOverrides = overridesBySession.get(session.id) || [];
    const sessionLogs = logsBySession.get(session.id) || [];
    const events = buildSessionEvents(session, rules || [], sessionOverrides, sessionLogs);
    allEvents.push(...events.map(e => ({ ...e, session_id: session.id, session_title: session.title })));
  }

  // 6. Filtrer par fenêtre temporelle si fournie
  if (window) {
    const fromTs = window.from.getTime();
    const toTs = window.to.getTime();
    allEvents = allEvents.filter(e => {
      const ts = new Date(e.scheduled_date).getTime();
      return ts >= fromTs && ts <= toTs;
    });
  }

  allEvents.sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime());
  return { events: allEvents, sessions };
}
