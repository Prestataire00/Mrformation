import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase config");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// POST /api/documents/sign — PUBLIC endpoint (no auth required, token validates identity)
export async function POST(request: NextRequest) {
  // Rate limit : route publique sensible (service role + signatures de documents)
  const rateLimitIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { allowed, resetAt } = checkRateLimit(`documents-sign:${rateLimitIp}`, { limit: 10, windowSeconds: 60 });
  if (!allowed) return rateLimitResponse(resetAt);

  try {
    const { token, signature_data, signer_name } = await request.json();

    if (!token || !signature_data) {
      return NextResponse.json({ error: "token et signature_data requis" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    // ── 1. CHECK QUOTE TOKEN (stored in crm_quotes.signature_token) ──
    const { data: quote } = await supabase
      .from("crm_quotes")
      .select("id, reference, entity_id, status, signed_at")
      .eq("signature_token", token)
      .maybeSingle();

    if (quote) {
      // Idempotent : si déjà signé (par cette même requête ou un double-clic), on
      // renvoie success avec already_signed=true plutôt qu'une erreur — le client
      // affichera le même écran de confirmation.
      if (quote.signed_at || quote.status === "accepted") {
        return NextResponse.json({
          success: true,
          already_signed: true,
          type: "quote",
          reference: quote.reference,
          signed_at: quote.signed_at ?? new Date().toISOString(),
        });
      }

      // INSERT (pas upsert) : on s'appuie sur UNIQUE(quote_id) pour atomiser.
      // Si 2 requêtes arrivent simultanément, la 2e prend 23505 → traitée comme
      // déjà signée (le 1er signataire a gagné, sa data reste).
      const { error: sigInsertErr } = await supabase.from("quote_signatures").insert({
        quote_id: quote.id,
        entity_id: quote.entity_id,
        signer_name: signer_name || "Signataire",
        signature_data,
        ip_address: ipAddress,
        user_agent: userAgent,
      });

      if (sigInsertErr && sigInsertErr.code !== "23505") {
        throw sigInsertErr;
      }

      const alreadySigned = sigInsertErr?.code === "23505";

      if (!alreadySigned) {
        await supabase.from("crm_quotes").update({
          status: "accepted",
          signed_at: new Date().toISOString(),
          signer_name: signer_name || "Signataire",
          signer_ip: ipAddress,
          signature_data,
          updated_at: new Date().toISOString(),
        }).eq("id", quote.id);
      }

      return NextResponse.json({
        success: true,
        already_signed: alreadySigned,
        type: "quote",
        reference: quote.reference,
        signed_at: new Date().toISOString(),
      });
    }

    // ── 2. CHECK DOCUMENT TOKEN (stored in signing_tokens) ──
    const { data: tokenData, error: tokenErr } = await supabase
      .from("signing_tokens")
      .select("id, token, session_id, document_id, token_purpose, expires_at, used_at, entity_id")
      .eq("token", token)
      .eq("token_purpose", "document_signature")
      .maybeSingle();

    if (tokenErr || !tokenData) {
      return NextResponse.json({ error: "Token invalide" }, { status: 404 });
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json({ error: "Ce lien de signature a expiré" }, { status: 410 });
    }

    if (!tokenData.document_id) {
      return NextResponse.json({ error: "Token non lié à un document" }, { status: 400 });
    }

    // Fetch document
    const { data: doc } = await supabase
      .from("formation_convention_documents")
      .select("id, doc_type, owner_type, owner_id, session_id, is_signed, signed_at, signer_name, signer_email")
      .eq("id", tokenData.document_id)
      .maybeSingle();

    if (!doc) {
      return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
    }

    // Idempotent : si déjà signé (used_at OU is_signed), on renvoie success
    // avec already_signed=true (le client affiche l'écran de confirmation).
    if (tokenData.used_at || doc.is_signed) {
      const { data: session } = await supabase
        .from("sessions").select("title").eq("id", doc.session_id).maybeSingle();
      return NextResponse.json({
        success: true,
        already_signed: true,
        document_type: doc.doc_type,
        session_title: session?.title || "",
        signed_at: doc.signed_at ?? tokenData.used_at ?? new Date().toISOString(),
      });
    }

    // Insert document signature : UNIQUE(document_id, signer_type, signer_id)
    // garantit l'atomicité contre double-clic + race condition.
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

    const alreadySigned = sigErr?.code === "23505";
    if (sigErr && !alreadySigned) {
      throw sigErr;
    }

    // Mark document as signed (idempotent : si déjà fait, c'est un no-op)
    if (!alreadySigned) {
      await supabase
        .from("formation_convention_documents")
        .update({
          is_signed: true,
          signed_at: new Date().toISOString(),
        })
        .eq("id", doc.id);
    }

    // Mark token as used (idempotent)
    await supabase
      .from("signing_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", tokenData.id)
      .is("used_at", null);

    // Get session title for response
    const { data: session } = await supabase
      .from("sessions")
      .select("title")
      .eq("id", doc.session_id)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      already_signed: alreadySigned,
      document_type: doc.doc_type,
      session_title: session?.title || "",
      signed_at: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
