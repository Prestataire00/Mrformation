import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";

const isResendConfigured =
  !!process.env.RESEND_API_KEY &&
  process.env.RESEND_API_KEY !== "votre-cle-resend";

const resend = isResendConfigured
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_ADDRESS = "LMS Formation <noreply@resend.dev>";

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

export async function POST() {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const entityId = auth.profile.entity_id;
  const today = new Date().toISOString().split("T")[0];
  let emailsSent = 0;
  let processed = 0;
  const errors: string[] = [];

  try {
    // 1. Fetch enabled rules for this entity
    const { data: rules, error: rulesError } = await auth.supabase
      .from("formation_automation_rules")
      .select("*")
      .eq("entity_id", entityId)
      .eq("is_enabled", true);

    if (rulesError) {
      return NextResponse.json(
        { error: sanitizeDbError(rulesError, "automation-run rules") },
        { status: 500 }
      );
    }

    if (!rules || rules.length === 0) {
      return NextResponse.json({ processed: 0, emails_sent: 0, errors: [] });
    }

    for (const rule of rules) {
      // 2. Compute target date based on trigger type
      let targetDate: string;
      let dateField: "start_date" | "end_date";

      if (rule.trigger_type === "session_start_minus_days") {
        const d = new Date();
        d.setDate(d.getDate() + rule.days_offset);
        targetDate = d.toISOString().split("T")[0];
        dateField = "start_date";
      } else {
        const d = new Date();
        d.setDate(d.getDate() - rule.days_offset);
        targetDate = d.toISOString().split("T")[0];
        dateField = "end_date";
      }

      // 3. Find matching sessions
      const { data: sessions, error: sessionsError } = await auth.supabase
        .from("sessions")
        .select("id, title")
        .eq("entity_id", entityId)
        .eq(dateField, targetDate)
        .in("status", ["upcoming", "in_progress", "completed"]);

      if (sessionsError) {
        errors.push(`Règle ${rule.document_type}: ${sessionsError.message}`);
        continue;
      }

      if (!sessions || sessions.length === 0) continue;

      for (const session of sessions) {
        // 4. Get enrolled learners with email
        const { data: enrollments, error: enrollError } = await auth.supabase
          .from("enrollments")
          .select("learner_id, learner:learners!enrollments_learner_id_fkey(id, email, first_name, last_name)")
          .eq("session_id", session.id)
          .in("status", ["registered", "confirmed", "completed"]);

        if (enrollError) {
          errors.push(`Session ${session.title}: ${enrollError.message}`);
          continue;
        }

        if (!enrollments || enrollments.length === 0) continue;

        for (const enrollment of enrollments) {
          const learner = enrollment.learner as unknown as {
            id: string;
            email: string | null;
            first_name: string;
            last_name: string;
          } | null;

          if (!learner?.email) continue;

          processed++;

          // 5. Anti-duplicate: check email_history for today
          const { count } = await auth.supabase
            .from("email_history")
            .select("id", { count: "exact", head: true })
            .eq("session_id", session.id)
            .eq("recipient_id", learner.id)
            .eq("recipient_type", "learner")
            .ilike("subject", `%${DOCUMENT_TYPE_SUBJECTS[rule.document_type] ?? rule.document_type}%`)
            .gte("created_at", today);

          if (count && count > 0) continue;

          // 6. Build email content
          const subject = `${DOCUMENT_TYPE_SUBJECTS[rule.document_type] ?? rule.document_type} — ${session.title}`;
          const textBody = [
            `Bonjour ${learner.first_name} ${learner.last_name},`,
            "",
            `Veuillez trouver ci-joint votre document : ${DOCUMENT_TYPE_SUBJECTS[rule.document_type] ?? rule.document_type}.`,
            "",
            `Formation : ${session.title}`,
            "",
            "Cordialement,",
            "L'équipe de formation",
          ].join("\n");

          let emailStatus: "sent" | "failed" | "pending" = "pending";
          let errorMessage: string | null = null;

          // 7. Send email
          if (resend) {
            try {
              const result = await resend.emails.send({
                from: FROM_ADDRESS,
                to: [learner.email],
                subject,
                html: toHtmlBody(textBody),
                text: textBody,
              });

              if (result.error) {
                emailStatus = "failed";
                errorMessage = result.error.message ?? "Resend returned an error";
              } else {
                emailStatus = "sent";
              }
            } catch (sendErr) {
              emailStatus = "failed";
              errorMessage = sendErr instanceof Error ? sendErr.message : "Erreur inconnue";
            }
          } else {
            // Simulated mode — no RESEND_API_KEY
            console.log("Simulated email to:", learner.email, "—", subject);
            emailStatus = "sent";
          }

          // 8. Log to email_history
          await auth.supabase.from("email_history").insert({
            entity_id: entityId,
            recipient_email: learner.email,
            subject,
            body: textBody,
            status: emailStatus,
            sent_at: new Date().toISOString(),
            sent_by: auth.user.id,
            sent_via: "resend",
            session_id: session.id,
            recipient_type: "learner",
            recipient_id: learner.id,
            error_message: errorMessage,
          });

          if (emailStatus === "sent") {
            emailsSent++;
          } else {
            errors.push(
              `${learner.first_name} ${learner.last_name} (${rule.document_type}): ${errorMessage}`
            );
          }
        }
      }
    }

    logAudit({
      supabase: auth.supabase,
      entityId,
      userId: auth.user.id,
      action: "create",
      resourceType: "formation_automation_run",
      resourceId: entityId,
      details: { processed, emails_sent: emailsSent, errors_count: errors.length },
    });

    return NextResponse.json({ processed, emails_sent: emailsSent, errors });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: sanitizeError(err, "automation-run POST") },
      { status: 500 }
    );
  }
}
