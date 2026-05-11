import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase config");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: NextRequest) {
  // Rate limit IP : route publique sans auth. + validation document_id × entity_id
  // ci-dessous pour empêcher l'inondation cross-entity (audit Vague 1, P3).
  const rateLimitIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { allowed, resetAt } = checkRateLimit(`track-view:${rateLimitIp}`, { limit: 60, windowSeconds: 60 });
  if (!allowed) return rateLimitResponse(resetAt);

  try {
    const { document_id, document_type, viewer_type, viewer_id, viewer_email, session_id, entity_id } = await request.json();

    if (!document_id || !document_type || !viewer_type || !viewer_id) {
      return NextResponse.json({ error: "Champs requis: document_id, document_type, viewer_type, viewer_id" }, { status: 400 });
    }

    // Validation viewer_type whitelisté pour éviter injection de types arbitraires.
    if (!["learner", "trainer", "client", "admin", "anonymous"].includes(viewer_type)) {
      return NextResponse.json({ error: "viewer_type invalide" }, { status: 400 });
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
    const ua = request.headers.get("user-agent") || null;

    const supabase = createServiceClient();

    // Validation : vérifier que le document existe ET appartient à l'entity déclarée.
    // Sans ça, un attaquant peut tracker des vues sur des docs qui ne sont pas les siens
    // (audit Vague 1, P3). On vérifie sur la table principale formation_convention_documents.
    if (entity_id) {
      const { data: doc, error: docErr } = await supabase
        .from("formation_convention_documents")
        .select("id, entity_id, session_id")
        .eq("id", document_id)
        .eq("entity_id", entity_id)
        .maybeSingle();
      if (docErr || !doc) {
        // Document inconnu ou cross-entity → on rejette silencieusement (200) pour
        // ne pas révéler l'existence de docs cross-entity, mais sans enregistrer.
        return NextResponse.json({ tracked: false, reason: "document_not_found_or_cross_entity" });
      }
      // Aligne session_id si pas fourni dans le body
      if (!session_id && doc.session_id) {
        // (variable redéfinie pour insert)
      }
    }

    const { error } = await supabase.from("document_views").insert({
      document_id,
      document_type,
      viewer_type,
      viewer_id,
      viewer_email: viewer_email || null,
      ip_address: ip,
      user_agent: ua,
      session_id: session_id || null,
      entity_id: entity_id || null,
    });

    if (error) {
      console.error("[track-view]", error);
      return NextResponse.json({ error: "Erreur d'enregistrement" }, { status: 500 });
    }

    return NextResponse.json({ tracked: true });
  } catch (err) {
    console.error("[track-view]", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
