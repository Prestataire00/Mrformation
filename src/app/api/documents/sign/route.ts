import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase config");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// POST /api/documents/sign — PUBLIC endpoint (no auth required, token validates identity)
export async function POST(request: NextRequest) {
  try {
    const { token, signature_data, signer_name } = await request.json();

    if (!token || !signature_data) {
      return NextResponse.json({ error: "token et signature_data requis" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Validate token
    const { data: tokenData, error: tokenErr } = await supabase
      .from("signing_tokens")
      .select("id, token, session_id, document_id, token_purpose, expires_at, used_at, entity_id, signer_type")
      .eq("token", token)
      .eq("token_purpose", "document_signature")
      .single();

    if (tokenErr || !tokenData) {
      return NextResponse.json({ error: "Token invalide" }, { status: 404 });
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json({ error: "Ce lien de signature a expiré" }, { status: 410 });
    }

    if (tokenData.used_at) {
      return NextResponse.json({ error: "Ce document a déjà été signé" }, { status: 410 });
    }

    if (!tokenData.document_id) {
      return NextResponse.json({ error: "Token non lié à un document" }, { status: 400 });
    }

    // Fetch document
    const { data: doc } = await supabase
      .from("formation_convention_documents")
      .select("id, doc_type, owner_type, owner_id, session_id, is_signed, signer_name, signer_email")
      .eq("id", tokenData.document_id)
      .single();

    if (!doc) {
      return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
    }

    if (doc.is_signed) {
      return NextResponse.json({ error: "Ce document est déjà signé" }, { status: 409 });
    }

    // Get IP and user agent for legal proof
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    // Insert document signature
    const { error: sigErr } = await supabase
      .from("document_signatures")
      .insert({
        document_id: doc.id,
        session_id: doc.session_id,
        signer_type: doc.owner_type,
        signer_id: doc.owner_id,
        signer_name: signer_name || doc.signer_name || "Signataire",
        signer_email: doc.signer_email,
        signature_data,
        ip_address: ipAddress,
        user_agent: userAgent,
      });

    if (sigErr) {
      if (sigErr.code === "23505") {
        return NextResponse.json({ error: "Document déjà signé par ce signataire" }, { status: 409 });
      }
      throw sigErr;
    }

    // Mark document as signed
    await supabase
      .from("formation_convention_documents")
      .update({
        is_signed: true,
        signed_at: new Date().toISOString(),
      })
      .eq("id", doc.id);

    // Mark token as used
    await supabase
      .from("signing_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", tokenData.id);

    // Get session title for response
    const { data: session } = await supabase
      .from("sessions")
      .select("title")
      .eq("id", doc.session_id)
      .single();

    return NextResponse.json({
      success: true,
      document_type: doc.doc_type,
      session_title: session?.title || "",
      signed_at: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
