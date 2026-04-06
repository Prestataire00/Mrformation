import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";

function getFromAddress(entityName: string): string {
  return entityName.toLowerCase().includes("c3v")
    ? "C3V Formation <noreply@c3vformation.fr>"
    : "MR Formation <noreply@mrformation.fr>";
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const { quote_id } = await request.json();
    if (!quote_id) return NextResponse.json({ error: "quote_id requis" }, { status: 400 });

    // Fetch quote with prospect/client info
    const { data: quote } = await auth.supabase
      .from("crm_quotes")
      .select("id, reference, amount, status, entity_id, prospect_id, client_id, valid_until, signed_at")
      .eq("id", quote_id)
      .single();

    if (!quote) return NextResponse.json({ error: "Devis introuvable" }, { status: 404 });
    if (quote.signed_at) return NextResponse.json({ error: "Ce devis est déjà signé" }, { status: 400 });

    // Get recipient email
    let recipientEmail: string | null = null;
    let recipientName = "";

    if (quote.prospect_id) {
      const { data: prospect } = await auth.supabase
        .from("crm_prospects").select("email, company_name, contact_name").eq("id", quote.prospect_id).single();
      recipientEmail = prospect?.email || null;
      recipientName = prospect?.contact_name || prospect?.company_name || "";
    } else if (quote.client_id) {
      const { data: client } = await auth.supabase
        .from("clients").select("email, company_name").eq("id", quote.client_id).single();
      recipientEmail = (client as Record<string, string> | null)?.email || null;
      recipientName = client?.company_name || "";
    }

    if (!recipientEmail) {
      return NextResponse.json({ error: "Aucun email trouvé pour le destinataire. Renseignez l'email du prospect." }, { status: 400 });
    }

    // Get entity name
    const { data: entity } = await auth.supabase
      .from("entities").select("name").eq("id", quote.entity_id).single();
    const entityName = entity?.name || "MR FORMATION";

    // Create signing token (30 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const { data: token, error: tokenErr } = await auth.supabase
      .from("signing_tokens")
      .insert({
        session_id: null,
        entity_id: quote.entity_id,
        quote_id,
        token_purpose: "quote_signature",
        expires_at: expiresAt.toISOString(),
      })
      .select("token")
      .single();

    if (tokenErr) throw tokenErr;

    // Update quote
    await auth.supabase
      .from("crm_quotes")
      .update({
        signature_token: token.token,
        signature_requested_at: new Date().toISOString(),
        status: quote.status === "draft" ? "sent" : quote.status,
        sent_at: quote.status === "draft" ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", quote_id);

    // Build sign URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.URL || "https://mrformationcrm.netlify.app";
    const signUrl = `${appUrl}/sign/${token.token}`;

    // Generate PDF for attachment
    let pdfBase64 = "";
    try {
      // Call the existing download endpoint logic client-side — here we just attach the sign URL
      // PDF generation for devis is complex (uses devis-pdf.ts) — skip attachment, just send the link
    } catch { /* skip */ }

    // Send email
    const amount = Number(quote.amount) || 0;
    const emailBody = `Bonjour${recipientName ? ` ${recipientName}` : ""},\n\nVeuillez trouver notre proposition commerciale ${quote.reference}${amount > 0 ? ` d'un montant de ${amount.toLocaleString("fr-FR")}€ HT` : ""}.\n\nPour accepter cette proposition, veuillez la signer électroniquement en cliquant sur le lien suivant :\n\n${signUrl}\n\nCe lien est valide${quote.valid_until ? ` jusqu'au ${new Date(quote.valid_until).toLocaleDateString("fr-FR")}` : " pendant 30 jours"}.\n\nN'hésitez pas à nous contacter pour toute question.\n\nCordialement,\nL'équipe ${entityName}`;

    const emailPayload: Record<string, unknown> = {
      to: recipientEmail,
      subject: `Proposition ${quote.reference} — ${entityName}`,
      body: emailBody,
    };

    await fetch(`${appUrl}/api/emails/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(emailPayload),
    });

    logAudit({
      supabase: auth.supabase,
      entityId: quote.entity_id,
      userId: auth.user.id,
      action: "create",
      resourceType: "quote_sign_request",
      resourceId: quote_id,
      details: { reference: quote.reference, signer_email: recipientEmail },
    });

    return NextResponse.json({ success: true, sign_url: signUrl, token: token.token, email_sent_to: recipientEmail });
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err, "quote-sign-request") }, { status: 500 });
  }
}
