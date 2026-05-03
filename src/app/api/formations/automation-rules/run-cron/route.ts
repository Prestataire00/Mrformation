import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveVariables } from "@/lib/utils/resolve-variables";
import { enqueueEmail, type EmailAttachmentDescriptor } from "@/lib/services/email-queue";

/**
 * Construit les descripteurs d'attachments pour un destinataire donné,
 * en fonction des types de doc déclarés dans le template email.
 *
 * Map les `attachment_doc_types` du template vers le bon descripteur :
 *   - convocation, certificat_realisation, attestation_assiduite → besoin learner_id
 *   - convention_entreprise → besoin client_id (recipientType='companies')
 *   - convention_intervention, contrat_sous_traitance → besoin trainer_id
 *   - programme_formation, planning_semaine → juste session_id
 */
function buildAttachmentsForRecipient(
  attachmentDocTypes: string[] | null | undefined,
  sessionId: string,
  recipient: { id: string; type: "learner" | "trainer" },
  recipientType: string
): EmailAttachmentDescriptor[] {
  if (!attachmentDocTypes || attachmentDocTypes.length === 0) return [];

  const descriptors: EmailAttachmentDescriptor[] = [];
  for (const docType of attachmentDocTypes) {
    switch (docType) {
      case "convocation":
      case "certificat_realisation":
        if (recipient.type === "learner") {
          descriptors.push({
            type: docType,
            payload: { session_id: sessionId, learner_id: recipient.id },
          });
        }
        break;
      case "convention_entreprise":
        // Le code mappe les "companies" en `recipient.type='learner'` (héritage)
        // → on s'appuie sur recipientType de la règle, pas recipient.type
        if (recipientType === "companies") {
          descriptors.push({
            type: "convention_entreprise",
            payload: { session_id: sessionId, client_id: recipient.id },
          });
        }
        break;
      case "convention_intervention":
      case "contrat_sous_traitance":
        if (recipient.type === "trainer") {
          descriptors.push({
            type: docType,
            payload: { session_id: sessionId, trainer_id: recipient.id },
          });
        }
        break;
      case "programme_formation":
        descriptors.push({
          type: "programme_formation",
          payload: { session_id: sessionId },
        });
        break;
      // Autres types ignorés silencieusement (pas de descripteur défini pour eux)
    }
  }
  return descriptors;
}

// Note : ce cron n'envoie plus d'email synchronously. Il enqueue dans email_history
// (status='pending') ; le worker /api/emails/process-scheduled (toutes les 5 min)
// gère l'envoi avec retry exponential backoff. Bénéfices : pas de timeout Netlify
// même sur 500+ destinataires, retry automatique, rate-limit Resend respecté.

const DOCUMENT_TYPE_SUBJECTS: Record<string, string> = {
  convention_entreprise: "Convention de formation",
  convocation: "Convocation à la formation",
  certificat_realisation: "Certificat de réalisation",
  questionnaire_satisfaction: "Questionnaire de satisfaction",
};

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

  // Parse optional body for targeted mode
  let specificTrigger: string | null = null;
  let specificSessionId: string | null = null;
  try {
    const body = await request.json();
    specificTrigger = body.trigger_type || null;
    specificSessionId = body.session_id || null;
  } catch { /* empty body = normal cron mode */ }

  // ── TARGETED MODE: specific trigger + session ──
  if (specificTrigger && specificSessionId) {
    try {
      const { data: session } = await supabase
        .from("sessions")
        .select("id, title, start_date, end_date, location, entity_id, status")
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
      const templateIds = rules.filter((r) => r.template_id).map((r) => r.template_id);
      let templateMap: Record<string, { subject: string; body: string; attachment_doc_types: string[] | null }> = {};
      if (templateIds.length > 0) {
        const { data: tplData } = await supabase.from("email_templates").select("id, subject, body, attachment_doc_types").in("id", templateIds);
        if (tplData) templateMap = Object.fromEntries(tplData.map((t) => [t.id, t]));
      }

      let emailsSent = 0;

      for (const rule of rules) {
        // Filter by subcontracted condition
        const condSub = (rule as Record<string, unknown>).condition_subcontracted;
        if (condSub === true && !(session as Record<string, unknown>).is_subcontracted) continue;
        if (condSub === false && (session as Record<string, unknown>).is_subcontracted) continue;

        const recipientType = rule.recipient_type || "learners";
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

        if (recipientType === "companies") {
          const { data: companyLinks } = await supabase
            .from("formation_companies")
            .select("client_id, email, client:clients!formation_companies_client_id_fkey(id, company_name)")
            .eq("session_id", session.id);
          for (const cl of companyLinks ?? []) {
            const c = cl.client as unknown as { id: string; company_name: string } | null;
            const companyEmail = cl.email;
            if (c && companyEmail) recipients.push({ id: c.id, email: companyEmail, first_name: c.company_name, last_name: "", type: "learner" });
          }
        }

        const tpl = rule.template_id ? templateMap[rule.template_id] : null;

        for (const recipient of recipients) {
          let subject: string;
          let textBody: string;

          if (tpl) {
            subject = resolveVariables(tpl.subject, { session: session as unknown as import("@/lib/types").Session, learner: recipient.type === "learner" ? recipient as unknown as import("@/lib/types").Learner : null, trainer: recipient.type === "trainer" ? recipient as unknown as import("@/lib/types").Trainer : null });
            textBody = resolveVariables(tpl.body, { session: session as unknown as import("@/lib/types").Session, learner: recipient.type === "learner" ? recipient as unknown as import("@/lib/types").Learner : null, trainer: recipient.type === "trainer" ? recipient as unknown as import("@/lib/types").Trainer : null });
          } else {
            subject = `${DOCUMENT_TYPE_SUBJECTS[rule.document_type] ?? rule.document_type} — ${session.title}`;
            textBody = `Bonjour ${recipient.first_name} ${recipient.last_name},\n\nVeuillez trouver ci-joint votre document : ${DOCUMENT_TYPE_SUBJECTS[rule.document_type] ?? rule.document_type}.\n\nFormation : ${session.title}\n\nCordialement,\nL'équipe de formation`;
          }

          await enqueueEmail(supabase, {
            to: recipient.email,
            subject,
            body: textBody,
            entity_id: session.entity_id,
            session_id: session.id,
            recipient_type: recipient.type,
            recipient_id: recipient.id,
            attachments: buildAttachmentsForRecipient(
              tpl?.attachment_doc_types,
              session.id,
              recipient,
              recipientType
            ),
          });
          emailsSent++;
        }
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
      const templateIds = rules.filter((r) => r.template_id).map((r) => r.template_id);
      let templateMap: Record<string, { subject: string; body: string; attachment_doc_types: string[] | null }> = {};
      if (templateIds.length > 0) {
        const { data: tplData } = await supabase.from("email_templates").select("id, subject, body, attachment_doc_types").in("id", templateIds);
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

            await enqueueEmail(supabase, {
              to: recipient.email,
              subject,
              body: textBody,
              entity_id: entityId,
              session_id: session.id,
              recipient_type: recipient.type,
              recipient_id: recipient.id,
              attachments: buildAttachmentsForRecipient(
                tpl?.attachment_doc_types,
                session.id,
                recipient,
                recipientType
              ),
            });
            emailsSent++;
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
