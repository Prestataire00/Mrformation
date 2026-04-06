import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/require-role";
import { logAudit } from "@/lib/audit-log";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase config");
  return createSupabaseClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const { quote_id } = await request.json();
    if (!quote_id) return NextResponse.json({ error: "quote_id requis" }, { status: 400 });

    // Fetch quote
    const { data: quote, error: quoteErr } = await auth.supabase
      .from("crm_quotes")
      .select("id, reference, amount, status, entity_id, prospect_id, client_id, valid_until")
      .eq("id", quote_id)
      .single();

    if (quoteErr) return NextResponse.json({ error: quoteErr.message }, { status: 500 });
    if (!quote) return NextResponse.json({ error: "Devis introuvable" }, { status: 404 });

    // Get recipient email
    let recipientEmail: string | null = null;
    let recipientName = "";

    if (quote.prospect_id) {
      const { data: p } = await auth.supabase
        .from("crm_prospects").select("email, company_name, contact_name").eq("id", quote.prospect_id).single();
      recipientEmail = p?.email || null;
      recipientName = p?.contact_name || p?.company_name || "";
    } else if (quote.client_id) {
      const { data: c } = await auth.supabase
        .from("clients").select("company_name").eq("id", quote.client_id).single();
      recipientName = c?.company_name || "";
    }

    if (!recipientEmail) {
      return NextResponse.json({ error: "Aucun email trouvé pour le destinataire. Renseignez l'email du prospect." }, { status: 400 });
    }

    // Get entity name
    const { data: entity } = await auth.supabase
      .from("entities").select("name").eq("id", quote.entity_id).single();
    const entityName = entity?.name || "MR FORMATION";

    // Generate a simple UUID token — stored directly in crm_quotes.signature_token
    const signToken = crypto.randomUUID();
    const serviceDb = getServiceSupabase();

    const { error: updateErr } = await serviceDb
      .from("crm_quotes")
      .update({
        signature_token: signToken,
        signature_requested_at: new Date().toISOString(),
        status: quote.status === "draft" ? "sent" : quote.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", quote_id);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    // Build sign URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.URL || "https://mrformationcrm.netlify.app";
    const signUrl = `${appUrl}/sign/${signToken}`;

    // Send email
    const amount = Number(quote.amount) || 0;
    const emailBody = `Bonjour${recipientName ? ` ${recipientName}` : ""},\n\nVeuillez trouver notre proposition commerciale ${quote.reference}${amount > 0 ? ` d'un montant de ${amount.toLocaleString("fr-FR")}€ HT` : ""}.\n\nPour accepter cette proposition, veuillez la signer électroniquement en cliquant sur le lien suivant :\n\n${signUrl}\n\nCe lien est valide${quote.valid_until ? ` jusqu'au ${new Date(quote.valid_until).toLocaleDateString("fr-FR")}` : " pendant 30 jours"}.\n\nN'hésitez pas à nous contacter pour toute question.\n\nCordialement,\nL'équipe ${entityName}`;

    await fetch(`${appUrl}/api/emails/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: recipientEmail,
        subject: `Proposition ${quote.reference} — ${entityName}`,
        body: emailBody,
      }),
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

    return NextResponse.json({ success: true, sign_url: signUrl, email_sent_to: recipientEmail });
  } catch (err) {
    console.error("[quote-sign-request] ERROR:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
