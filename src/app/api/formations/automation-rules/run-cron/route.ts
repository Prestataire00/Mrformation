import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { resolveVariables } from "@/lib/utils/resolve-variables";

const isResendConfigured =
  !!process.env.RESEND_API_KEY &&
  process.env.RESEND_API_KEY !== "votre-cle-resend";

const resend = isResendConfigured
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

function getFromAddress(entityName: string): string {
  return entityName.toLowerCase().includes("c3v")
    ? "C3V Formation <noreply@c3vformation.fr>"
    : "MR Formation <noreply@mrformation.fr>";
}

const DOCUMENT_TYPE_SUBJECTS: Record<string, string> = {
  convention_entreprise: "Convention de formation",
  convocation: "Convocation à la formation",
  certificat_realisation: "Certificat de réalisation",
  questionnaire_satisfaction: "Questionnaire de satisfaction",
};

function toHtmlBody(body: string): string {
  return `<div style="font-family: sans-serif; font-size: 14px; line-height: 1.6; color: #374151; white-space: pre-wrap;">${body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br />")}</div>`;
}

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
  const results: Array<{ entity: string; sent: number; processed: number; errors: number }> = [];
  let totalSent = 0;

  try {
    const { data: entities } = await supabase.from("entities").select("id, name");

    for (const entity of entities ?? []) {
      const entityId = entity.id;
      const FROM_ADDRESS = getFromAddress(entity.name);
      let emailsSent = 0;
      let processed = 0;
      const errors: string[] = [];

      // 1. Fetch enabled rules
      const { data: rules } = await supabase
        .from("formation_automation_rules")
        .select("*")
        .eq("entity_id", entityId)
        .eq("is_enabled", true);

      if (!rules || rules.length === 0) {
        results.push({ entity: entity.name, sent: 0, processed: 0, errors: 0 });
        continue;
      }

      // Pre-load templates
      const templateIds = rules.filter((r) => r.template_id).map((r) => r.template_id);
      let templateMap: Record<string, { subject: string; body: string }> = {};
      if (templateIds.length > 0) {
        const { data: tplData } = await supabase.from("email_templates").select("id, subject, body").in("id", templateIds);
        if (tplData) templateMap = Object.fromEntries(tplData.map((t) => [t.id, t]));
      }

      for (const rule of rules) {
        let targetDate: string;
        let dateField: "start_date" | "end_date";

        if (rule.trigger_type === "session_start_minus_days") {
          const d = new Date(); d.setDate(d.getDate() + rule.days_offset);
          targetDate = d.toISOString().split("T")[0]; dateField = "start_date";
        } else {
          const d = new Date(); d.setDate(d.getDate() - rule.days_offset);
          targetDate = d.toISOString().split("T")[0]; dateField = "end_date";
        }

        const { data: sessions } = await supabase
          .from("sessions").select("id, title, start_date, end_date, location")
          .eq("entity_id", entityId).eq(dateField, targetDate)
          .in("status", ["upcoming", "in_progress", "completed"]);

        if (!sessions || sessions.length === 0) continue;

        const recipientType = rule.recipient_type || "learners";

        for (const session of sessions) {
          type Recipient = { id: string; email: string; first_name: string; last_name: string; type: "learner" | "trainer" };
          const recipients: Recipient[] = [];

          if (recipientType === "learners" || recipientType === "all") {
            const { data: enrollments } = await supabase
              .from("enrollments")
              .select("learner_id, learner:learners!enrollments_learner_id_fkey(id, email, first_name, last_name)")
              .eq("session_id", session.id).in("status", ["registered", "confirmed", "completed"]);
            for (const e of enrollments ?? []) {
              const l = e.learner as unknown as { id: string; email: string | null; first_name: string; last_name: string } | null;
              if (l?.email) recipients.push({ id: l.id, email: l.email, first_name: l.first_name, last_name: l.last_name, type: "learner" });
            }
          }

          if (recipientType === "trainers" || recipientType === "all") {
            const { data: trainerLinks } = await supabase
              .from("formation_trainers")
              .select("trainer:trainers!formation_trainers_trainer_id_fkey(id, email, first_name, last_name)")
              .eq("session_id", session.id);
            for (const tl of trainerLinks ?? []) {
              const t = tl.trainer as unknown as { id: string; email: string | null; first_name: string; last_name: string } | null;
              if (t?.email) recipients.push({ id: t.id, email: t.email, first_name: t.first_name, last_name: t.last_name, type: "trainer" });
            }
          }

          if (recipients.length === 0) continue;

          const tpl = rule.template_id ? templateMap[rule.template_id] : null;

          for (const recipient of recipients) {
            processed++;

            // Anti-duplicate
            const { count } = await supabase
              .from("email_history").select("id", { count: "exact", head: true })
              .eq("session_id", session.id).eq("recipient_id", recipient.id)
              .eq("recipient_type", recipient.type)
              .ilike("subject", `%${rule.name || DOCUMENT_TYPE_SUBJECTS[rule.document_type] || rule.document_type}%`)
              .gte("sent_at", today);
            if (count && count > 0) continue;

            // Build email
            let subject: string;
            let textBody: string;

            if (tpl) {
              subject = resolveVariables(tpl.subject, {
                session: session as any,
                learner: recipient.type === "learner" ? recipient as any : null,
                trainer: recipient.type === "trainer" ? recipient as any : null,
              });
              textBody = resolveVariables(tpl.body, {
                session: session as any,
                learner: recipient.type === "learner" ? recipient as any : null,
                trainer: recipient.type === "trainer" ? recipient as any : null,
              });
            } else {
              subject = `${DOCUMENT_TYPE_SUBJECTS[rule.document_type] ?? rule.document_type} — ${session.title}`;
              textBody = `Bonjour ${recipient.first_name} ${recipient.last_name},\n\nVeuillez trouver ci-joint votre document : ${DOCUMENT_TYPE_SUBJECTS[rule.document_type] ?? rule.document_type}.\n\nFormation : ${session.title}\n\nCordialement,\nL'équipe de formation`;
            }

            let emailStatus: "sent" | "failed" = "sent";
            let errorMessage: string | null = null;

            if (resend) {
              try {
                const result = await resend.emails.send({
                  from: FROM_ADDRESS, to: [recipient.email], subject,
                  html: toHtmlBody(textBody), text: textBody,
                });
                if (result.error) { emailStatus = "failed"; errorMessage = result.error.message ?? "Resend error"; }
              } catch (err) { emailStatus = "failed"; errorMessage = err instanceof Error ? err.message : "Erreur inconnue"; }
            } else {
              console.log("[cron] Simulated email to:", recipient.email, "—", subject);
            }

            await supabase.from("email_history").insert({
              entity_id: entityId, recipient_email: recipient.email,
              subject, body: textBody, status: emailStatus,
              sent_at: new Date().toISOString(), sent_via: "resend",
              session_id: session.id, recipient_type: recipient.type,
              recipient_id: recipient.id, error_message: errorMessage,
            });

            if (emailStatus === "sent") emailsSent++;
            else errors.push(`${recipient.first_name} ${recipient.last_name}: ${errorMessage}`);
          }
        }
      }

      results.push({ entity: entity.name, sent: emailsSent, processed, errors: errors.length });
      totalSent += emailsSent;
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
