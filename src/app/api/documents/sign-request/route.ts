import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";
import { exportHtmlToPDFBase64 } from "@/lib/pdf-export";
import { getDefaultTemplate } from "@/lib/document-templates-defaults";
import { resolveVariables } from "@/lib/utils/resolve-variables";

function getFromAddress(entityName: string): string {
  return entityName.toLowerCase().includes("c3v")
    ? "C3V Formation <noreply@c3vformation.fr>"
    : "MR Formation <noreply@mrformation.fr>";
}

const DOC_LABELS: Record<string, string> = {
  convention_entreprise: "Convention de formation",
  convention_intervention: "Convention d'intervention",
  contrat_sous_traitance: "Contrat de sous-traitance",
};

export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const { document_id, signer_name, signer_email, session_id } = await request.json();

    if (!document_id || !signer_email || !session_id) {
      return NextResponse.json({ error: "document_id, signer_email et session_id requis" }, { status: 400 });
    }

    // Fetch document
    const { data: doc } = await auth.supabase
      .from("formation_convention_documents")
      .select("id, doc_type, owner_type, owner_id, is_signed, session_id")
      .eq("id", document_id)
      .single();

    if (!doc) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
    if (doc.is_signed) return NextResponse.json({ error: "Ce document est déjà signé" }, { status: 400 });

    // Fetch session + entity
    const { data: session } = await auth.supabase
      .from("sessions")
      .select("id, title, start_date, end_date, entity_id, location, planned_hours, total_price, mode, training:trainings(*), enrollments(id, learner_id, learner:learners(*)), formation_companies(id, client_id, client:clients(*)), formation_trainers(id, trainer_id, trainer:trainers(*))")
      .eq("id", session_id)
      .single();

    if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });

    const { data: entity } = await auth.supabase
      .from("entities")
      .select("name")
      .eq("id", session.entity_id)
      .single();
    const entityName = entity?.name || "MR FORMATION";

    // Create signing token (30 days expiry)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const { data: token, error: tokenErr } = await auth.supabase
      .from("signing_tokens")
      .insert({
        session_id,
        entity_id: session.entity_id,
        document_id,
        token_purpose: "document_signature",
        expires_at: expiresAt.toISOString(),
        signer_type: doc.owner_type === "company" ? "learner" : doc.owner_type, // Use learner as fallback signer_type
      })
      .select("token")
      .single();

    if (tokenErr) throw tokenErr;

    // Update document with signature tracking
    await auth.supabase
      .from("formation_convention_documents")
      .update({
        signature_token: token.token,
        signature_requested_at: new Date().toISOString(),
        signer_name: signer_name || null,
        signer_email,
        is_sent: true,
        sent_at: new Date().toISOString(),
      })
      .eq("id", document_id);

    // Generate PDF for attachment
    const docLabel = DOC_LABELS[doc.doc_type] || doc.doc_type;
    let htmlContent = "";

    // Try to generate HTML from template
    const enrollments = session.enrollments as unknown as Array<Record<string, unknown>> || [];
    const companies = session.formation_companies as unknown as Array<Record<string, unknown>> || [];
    const trainers = session.formation_trainers as unknown as Array<Record<string, unknown>> || [];

    const learnerRaw = enrollments.find((e) => e.learner_id === doc.owner_id)?.learner as Record<string, string> | undefined;
    const companyRaw = companies.find((c) => c.client_id === doc.owner_id)?.client as Record<string, string> | undefined;
    const trainerRaw = trainers.find((t) => t.trainer_id === doc.owner_id)?.trainer as Record<string, string> | undefined;

    const templateHtml = getDefaultTemplate(doc.doc_type, {
      formation: session as unknown as import("@/lib/types").Session,
      learner: learnerRaw ? { first_name: learnerRaw.first_name, last_name: learnerRaw.last_name } : undefined,
      company: companyRaw ? { company_name: companyRaw.company_name } : undefined,
      trainer: trainerRaw ? { first_name: trainerRaw.first_name, last_name: trainerRaw.last_name } : undefined,
      entityName,
    });

    htmlContent = templateHtml || `<p>Document ${docLabel}</p>`;

    // Generate PDF base64
    let pdfBase64 = "";
    try {
      pdfBase64 = await exportHtmlToPDFBase64(docLabel, htmlContent, entityName);
    } catch {
      // PDF generation optional — send email without attachment if it fails
    }

    // Build sign URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.URL || "https://mrformationcrm.netlify.app";
    const signUrl = `${appUrl}/sign/${token.token}`;

    // Send email
    const emailBody = `Bonjour${signer_name ? ` ${signer_name}` : ""},\n\nVeuillez trouver ci-joint le document "${docLabel}" relatif à la formation "${session.title}".\n\nPour signer ce document électroniquement, veuillez cliquer sur le lien suivant :\n${signUrl}\n\nCe lien est valide pendant 30 jours.\n\nCordialement,\nL'équipe ${entityName}`;

    const emailPayload: Record<string, unknown> = {
      to: signer_email,
      subject: `Document à signer — ${docLabel} — ${session.title}`,
      body: emailBody,
      session_id,
    };

    if (pdfBase64) {
      emailPayload.attachments = [{
        filename: `${doc.doc_type}.pdf`,
        content: pdfBase64,
        type: "application/pdf",
      }];
    }

    await fetch(`${appUrl}/api/emails/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(emailPayload),
    });

    logAudit({
      supabase: auth.supabase,
      entityId: session.entity_id,
      userId: auth.user.id,
      action: "create",
      resourceType: "document_sign_request",
      resourceId: document_id,
      details: { doc_type: doc.doc_type, signer_email, session_title: session.title },
    });

    return NextResponse.json({ success: true, sign_url: signUrl, token: token.token });
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err, "sign-request") }, { status: 500 });
  }
}
