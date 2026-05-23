import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { enqueueEmail } from "@/lib/services/email-queue";
import {
  executeRuleForSession,
  UUID_REGEX,
  type RuleInfo,
  type SessionInfo,
  type TemplateInfo,
  type CustomTemplateInfo,
} from "@/lib/automation/execute-rule";

// Note : ce cron n'envoie plus d'email synchronously. Il enqueue dans email_history
// (status='pending') ; le worker /api/emails/process-scheduled (toutes les 5 min)
// gère l'envoi avec retry exponential backoff. Bénéfices : pas de timeout Netlify
// même sur 500+ destinataires, retry automatique, rate-limit Resend respecté.

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.CRON_SECRET;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const today = new Date().toISOString().split("T")[0];

  // Parse optional body for targeted modes
  let specificTrigger: string | null = null;
  let specificSessionId: string | null = null;
  let specificRuleId: string | null = null;
  try {
    const body = await request.json();
    specificTrigger = body.trigger_type || null;
    specificSessionId = body.session_id || null;
    specificRuleId = body.rule_id || null;
  } catch { /* empty body = normal cron mode */ }

  // ── RULE-SCOPED MODE: une règle précise, une session précise ──
  if (specificRuleId && specificSessionId) {
    try {
      const { data: rule } = await supabase
        .from("formation_automation_rules")
        .select("*")
        .eq("id", specificRuleId)
        .single();
      if (!rule) return NextResponse.json({ error: "Règle introuvable" }, { status: 404 });

      const { data: session } = await supabase
        .from("sessions")
        .select("id, title, start_date, end_date, location, entity_id, is_subcontracted, status")
        .eq("id", specificSessionId)
        .single();
      if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });

      // Contrôle d'appartenance : la règle et la session doivent être de la même entité.
      if (rule.entity_id !== session.entity_id) {
        return NextResponse.json({ error: "Règle hors de l'entité de la session" }, { status: 403 });
      }

      let template: TemplateInfo | null = null;
      const customTemplatesById: Record<string, CustomTemplateInfo> = {};
      if (rule.template_id) {
        const { data: tpl } = await supabase
          .from("email_templates")
          .select("subject, body, attachment_doc_types")
          .eq("id", rule.template_id)
          .single();
        template = (tpl as unknown as TemplateInfo) ?? null;
        for (const v of template?.attachment_doc_types ?? []) {
          if (UUID_REGEX.test(v)) {
            const { data: ct } = await supabase
              .from("document_templates")
              .select("id, name, mode, source_docx_url")
              .eq("id", v)
              .eq("entity_id", session.entity_id)
              .single();
            if (ct) customTemplatesById[v] = ct as unknown as CustomTemplateInfo;
          }
        }
      }

      const { enqueued, skipped, failed } = await executeRuleForSession(supabase, {
        rule: rule as unknown as RuleInfo,
        session: session as unknown as SessionInfo,
        template,
        customTemplatesById,
      });

      // Statut reflète failed/skipped (CHECK constraint : success/partial/failed/skipped/test).
      const status = failed > 0
        ? (enqueued > 0 ? "partial" : "failed")
        : (enqueued > 0 ? "success" : "skipped");

      try {
        await supabase.from("session_automation_logs").insert({
          session_id: session.id,
          rule_id: rule.id,
          rule_name: rule.name || rule.document_type,
          trigger_type: rule.trigger_type,
          recipient_count: enqueued,
          status,
          is_manual: true,
          details: { mode: "rule_scoped", skipped, failed },
        });
      } catch (logErr) {
        // Le log d'audit ne doit pas faire échouer l'opération : les emails sont déjà enqueués.
        console.warn("[automation rule-scoped] log insert failed:", logErr instanceof Error ? logErr.message : logErr);
      }

      return NextResponse.json({ success: true, enqueued, skipped, failed });
    } catch (err) {
      console.error("[automation rule-scoped]", err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }

  // ── TARGETED MODE: specific trigger + session ──
  if (specificTrigger && specificSessionId) {
    try {
      const { data: session } = await supabase
        .from("sessions")
        .select("id, title, start_date, end_date, location, entity_id, is_subcontracted, status")
        .eq("id", specificSessionId)
        .single();

      if (!session) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }

      const { data: rules } = await supabase
        .from("formation_automation_rules")
        .select("*")
        .eq("entity_id", session.entity_id)
        .eq("trigger_type", specificTrigger)
        .eq("is_enabled", true);

      if (!rules || rules.length === 0) {
        return NextResponse.json({ success: true, sent: 0, message: "No rules for this trigger" });
      }

      // Pre-load templates
      const templateIds = rules.filter((r) => r.template_id).map((r) => r.template_id) as string[];
      let templateMap: Record<string, TemplateInfo> = {};
      if (templateIds.length > 0) {
        const { data: tplData } = await supabase
          .from("email_templates")
          .select("id, subject, body, attachment_doc_types")
          .in("id", templateIds);
        if (tplData) templateMap = Object.fromEntries(tplData.map((t) => [t.id, t as unknown as TemplateInfo]));
      }

      // Pre-load les templates Word custom (mode docx_fidelity) référencés par UUID dans les attachment_doc_types
      const customTplIds = new Set<string>();
      for (const t of Object.values(templateMap)) {
        for (const v of t.attachment_doc_types ?? []) {
          if (UUID_REGEX.test(v)) customTplIds.add(v);
        }
      }
      let customTemplatesById: Record<string, CustomTemplateInfo> = {};
      if (customTplIds.size > 0) {
        const { data: customTpls } = await supabase
          .from("document_templates")
          .select("id, name, mode, source_docx_url")
          .in("id", Array.from(customTplIds))
          .eq("entity_id", session.entity_id);
        if (customTpls) customTemplatesById = Object.fromEntries(customTpls.map((t) => [t.id, t as unknown as CustomTemplateInfo]));
      }

      let emailsSent = 0;

      for (const rule of rules) {
        // Filter by subcontracted condition
        const condSub = (rule as Record<string, unknown>).condition_subcontracted;
        if (condSub === true && !(session as Record<string, unknown>).is_subcontracted) continue;
        if (condSub === false && (session as Record<string, unknown>).is_subcontracted) continue;

        const { enqueued } = await executeRuleForSession(supabase, {
          rule: rule as unknown as RuleInfo,
          session: session as unknown as SessionInfo,
          template: rule.template_id ? (templateMap[rule.template_id] as TemplateInfo) ?? null : null,
          customTemplatesById,
        });
        emailsSent += enqueued;
      }

      return NextResponse.json({ success: true, enqueued: emailsSent, trigger: specificTrigger, session: session.title });
    } catch (err) {
      console.error(`[automation] ${specificTrigger} error:`, err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }

  // ── NORMAL CRON MODE: all entities ──
  const results: Array<{ entity: string; sent: number; processed: number; errors: number }> = [];
  let totalSent = 0;

  try {
    const { data: entities } = await supabase.from("entities").select("id, name");

    for (const entity of entities ?? []) {
      const entityId = entity.id;
      let emailsSent = 0;
      let processed = 0;
      const errors: string[] = [];

      // 1. Fetch enabled rules (only date-based triggers for cron)
      const { data: rules } = await supabase
        .from("formation_automation_rules")
        .select("*")
        .eq("entity_id", entityId)
        .eq("is_enabled", true)
        .in("trigger_type", ["session_start_minus_days", "session_end_plus_days"]);

      if (!rules || rules.length === 0) {
        results.push({ entity: entity.name, sent: 0, processed: 0, errors: 0 });
        continue;
      }

      // Pre-load templates
      const templateIds = rules.filter((r) => r.template_id).map((r) => r.template_id) as string[];
      let templateMap: Record<string, TemplateInfo> = {};
      if (templateIds.length > 0) {
        const { data: tplData } = await supabase
          .from("email_templates")
          .select("id, subject, body, attachment_doc_types")
          .in("id", templateIds);
        if (tplData) templateMap = Object.fromEntries(tplData.map((t) => [t.id, t as unknown as TemplateInfo]));
      }

      // Pre-load Word custom templates referenced by UUID in attachment_doc_types
      const customTplIds = new Set<string>();
      for (const t of Object.values(templateMap)) {
        for (const v of t.attachment_doc_types ?? []) {
          if (UUID_REGEX.test(v)) customTplIds.add(v);
        }
      }
      let customTemplatesById: Record<string, CustomTemplateInfo> = {};
      if (customTplIds.size > 0) {
        const { data: customTpls } = await supabase
          .from("document_templates")
          .select("id, name, mode, source_docx_url")
          .in("id", Array.from(customTplIds))
          .eq("entity_id", entityId);
        if (customTpls) customTemplatesById = Object.fromEntries(customTpls.map((t) => [t.id, t as unknown as CustomTemplateInfo]));
      }

      for (const rule of rules) {
        let targetDate: string;
        let dateField: "start_date" | "end_date";

        // Le cron tourne en UTC mais session.start_date/end_date sont des dates
        // locales (YYYY-MM-DD sans timezone). On calcule la date cible en
        // Europe/Paris pour éviter le décalage J-1/J+1 selon le fuseau (ex:
        // cron à 7h UTC = 9h CEST → si on faisait toISOString().split('T')[0]
        // après minuit Paris, on aurait la date d'avant).
        const todayInParis = new Intl.DateTimeFormat("fr-CA", {
          timeZone: "Europe/Paris",
          year: "numeric", month: "2-digit", day: "2-digit",
        }).format(new Date()); // ex: "2026-05-05"
        const [yy, mm, dd] = todayInParis.split("-").map(Number);
        const baseLocal = new Date(Date.UTC(yy, mm - 1, dd)); // midnight UTC same date

        if (rule.trigger_type === "session_start_minus_days") {
          baseLocal.setUTCDate(baseLocal.getUTCDate() + rule.days_offset);
          targetDate = baseLocal.toISOString().split("T")[0];
          dateField = "start_date";
        } else {
          baseLocal.setUTCDate(baseLocal.getUTCDate() - rule.days_offset);
          targetDate = baseLocal.toISOString().split("T")[0];
          dateField = "end_date";
        }

        const { data: sessions } = await supabase
          .from("sessions").select("id, title, start_date, end_date, location, entity_id, is_subcontracted, status")
          .eq("entity_id", entityId).eq(dateField, targetDate)
          .in("status", ["upcoming", "in_progress", "completed"]);

        if (!sessions || sessions.length === 0) continue;

        // Filter by subcontracted condition
        const condSub = (rule as Record<string, unknown>).condition_subcontracted;

        for (const session of sessions) {
          if (condSub === true && !(session as Record<string, unknown>).is_subcontracted) continue;
          if (condSub === false && (session as Record<string, unknown>).is_subcontracted) continue;

          const { enqueued, skipped, failed } = await executeRuleForSession(supabase, {
            rule: rule as unknown as RuleInfo,
            session: session as unknown as SessionInfo,
            template: rule.template_id ? (templateMap[rule.template_id] as TemplateInfo) ?? null : null,
            customTemplatesById,
            dedupAgainstHistoryFromDate: today,
          });
          // processed = total destinataires considérés (sémantique d'origine, pré-refactor).
          processed += enqueued + skipped + failed;
          emailsSent += enqueued;
          if (failed > 0) {
            errors.push(`${rule.name || rule.document_type} (${(session as Record<string, string>).title ?? "session"}): ${failed} échec(s) d'enqueue`);
          }
        }
      }

      results.push({ entity: entity.name, sent: emailsSent, processed, errors: errors.length });
      totalSent += emailsSent;
    }

    // ── OPCO DEPOSIT REMINDERS ──
    // Check formation_financiers with status='a_deposer' where session starts within X days
    for (const entity of entities ?? []) {
      const { data: opcoRules } = await supabase
        .from("formation_automation_rules")
        .select("*")
        .eq("entity_id", entity.id)
        .eq("trigger_type", "opco_deposit_reminder")
        .eq("is_enabled", true);

      if (!opcoRules || opcoRules.length === 0) continue;

      for (const rule of opcoRules) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + (rule.days_offset || 7));
        const targetDateStr = targetDate.toISOString().split("T")[0];

        // Find sessions starting on target date that have undeposited OPCO
        const { data: pendingOpco } = await supabase
          .from("formation_financiers")
          .select("id, name, session_id, session:sessions!inner(id, title, start_date, entity_id)")
          .eq("status", "a_deposer")
          .eq("session.entity_id", entity.id)
          .eq("session.start_date", targetDateStr);

        if (!pendingOpco || pendingOpco.length === 0) continue;

        // Send reminder to all admins of this entity
        const { data: admins } = await supabase
          .from("profiles")
          .select("id, email, first_name, last_name")
          .eq("entity_id", entity.id)
          .in("role", ["admin", "super_admin"]);

        for (const opco of pendingOpco) {
          const session = Array.isArray(opco.session) ? opco.session[0] : opco.session;
          if (!session) continue;
          const sessionTitle = (session as Record<string, string>).title || "Formation";

          for (const admin of admins ?? []) {
            if (!admin.email) continue;

            const subject = `Rappel : demande OPCO à déposer — ${sessionTitle}`;
            const textBody = `Bonjour ${admin.first_name},\n\nLa demande de prise en charge OPCO "${opco.name}" pour la formation "${sessionTitle}" n'a pas encore été déposée.\n\nLa formation commence le ${targetDateStr}.\n\nPensez à déposer la demande rapidement.\n\nCordialement,\nL'équipe ${entity.name}`;

            try {
              await enqueueEmail(supabase, {
                to: admin.email,
                subject,
                body: textBody,
                entity_id: entity.id,
                session_id: (session as Record<string, string>).id,
                recipient_type: "manager",
                recipient_id: admin.id,
              });
              totalSent++;
            } catch (enqueueErr) {
              console.error(`[automation OPCO] enqueue failed for ${admin.email}:`, enqueueErr instanceof Error ? enqueueErr.message : enqueueErr);
            }
          }
        }
      }
    }

    console.log(`[cron] Automation complete: ${totalSent} emails sent across ${results.length} entities`);

    return NextResponse.json({
      success: true,
      totalSent,
      results,
      executedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[cron] Automation error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
