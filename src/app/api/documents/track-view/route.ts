import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase config");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: NextRequest) {
  try {
    const { document_id, document_type, viewer_type, viewer_id, viewer_email, session_id, entity_id } = await request.json();

    if (!document_id || !document_type || !viewer_type || !viewer_id) {
      return NextResponse.json({ error: "Champs requis: document_id, document_type, viewer_type, viewer_id" }, { status: 400 });
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
    const ua = request.headers.get("user-agent") || null;

    const supabase = createServiceClient();
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
