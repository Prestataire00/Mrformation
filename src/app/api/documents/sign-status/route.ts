import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase config");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const DOC_LABELS: Record<string, string> = {
  convention_entreprise: "Convention de formation",
  convention_intervention: "Convention d'intervention",
  contrat_sous_traitance: "Contrat de sous-traitance",
};

// GET /api/documents/sign-status?token= — PUBLIC
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token requis" }, { status: 400 });

  const supabase = createServiceClient();

  // 1. Check if it's a QUOTE token (stored in crm_quotes.signature_token)
  const { data: quote } = await supabase
    .from("crm_quotes")
    .select("id, reference, amount, status, signed_at, valid_until, entity_id, prospect_id, client_id")
    .eq("signature_token", token)
    .maybeSingle();

  if (quote) {
    const { data: entity } = await supabase
      .from("entities").select("name, slug").eq("id", quote.entity_id).single();

    let recipientName = "";
    if (quote.prospect_id) {
      const { data: p } = await supabase.from("crm_prospects").select("company_name, contact_name").eq("id", quote.prospect_id).single();
      recipientName = p?.contact_name || p?.company_name || "";
    } else if (quote.client_id) {
      const { data: c } = await supabase.from("clients").select("company_name").eq("id", quote.client_id).single();
      recipientName = c?.company_name || "";
    }

    const isSigned = !!quote.signed_at || quote.status === "accepted";
    const expired = quote.valid_until ? new Date(quote.valid_until) < new Date() : false;

    return NextResponse.json({
      valid: !isSigned && !expired,
      expired,
      already_signed: isSigned,
      signed_at: quote.signed_at || null,
      type: "quote",
      document_info: {
        type: "devis",
        label: `Proposition commerciale ${quote.reference}`,
        amount: quote.amount,
        valid_until: quote.valid_until,
      },
      signer_name: recipientName,
      entity_name: entity?.name || "MR FORMATION",
      entity_slug: entity?.slug || "mr-formation",
    });
  }

  // 2. Check if it's a DOCUMENT token (stored in signing_tokens)
  const { data: tokenData } = await supabase
    .from("signing_tokens")
    .select("id, document_id, session_id, token_purpose, expires_at, used_at, entity_id")
    .eq("token", token)
    .eq("token_purpose", "document_signature")
    .maybeSingle();

  if (!tokenData) {
    return NextResponse.json({ valid: false, reason: "Token invalide" });
  }

  const tokenExpired = new Date(tokenData.expires_at) < new Date();
  const alreadyUsed = !!tokenData.used_at;

  const { data: entity } = await supabase
    .from("entities").select("name, slug").eq("id", tokenData.entity_id).single();

  const { data: doc } = await supabase
    .from("formation_convention_documents")
    .select("id, doc_type, owner_type, is_signed, signed_at, signer_name, signer_email")
    .eq("id", tokenData.document_id)
    .single();

  const { data: session } = await supabase
    .from("sessions").select("title, start_date, end_date")
    .eq("id", tokenData.session_id)
    .single();

  return NextResponse.json({
    valid: !tokenExpired && !alreadyUsed && doc && !doc.is_signed,
    expired: tokenExpired,
    already_signed: doc?.is_signed || alreadyUsed,
    signed_at: doc?.signed_at || null,
    type: "document",
    document_info: doc ? {
      type: doc.doc_type,
      label: DOC_LABELS[doc.doc_type] || doc.doc_type,
      session_title: session?.title || "",
      start_date: session?.start_date || "",
      end_date: session?.end_date || "",
    } : null,
    signer_name: doc?.signer_name || null,
    entity_name: entity?.name || "MR FORMATION",
    entity_slug: entity?.slug || "mr-formation",
  });
}
