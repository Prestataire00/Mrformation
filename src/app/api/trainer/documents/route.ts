import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";

const VALID_SCOPES = ["session", "admin"] as const;
const SESSION_DOC_TYPES = ["feuille_emargement", "evaluation", "compte_rendu", "bilan_pedagogique", "autre"];
const ADMIN_DOC_TYPES = ["cv", "diplome", "certification", "habilitation", "attestation", "autre"];

/**
 * GET  /api/trainer/documents?scope=session|admin  — list trainer's documents
 * POST /api/trainer/documents                      — create a new document
 */

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: trainer } = await supabase
      .from("trainers")
      .select("id")
      .eq("profile_id", user.id)
      .single();

    if (!trainer) return NextResponse.json({ error: "Formateur non trouvé" }, { status: 403 });

    const scope = request.nextUrl.searchParams.get("scope");

    let query = supabase
      .from("trainer_documents")
      .select("*, sessions(id, start_date, trainings(title))")
      .eq("trainer_id", trainer.id)
      .order("created_at", { ascending: false });

    if (scope && VALID_SCOPES.includes(scope as typeof VALID_SCOPES[number])) {
      query = query.eq("scope", scope);
    }

    const { data: documents, error } = await query;

    if (error) return NextResponse.json({ error: sanitizeDbError(error, "trainer/documents GET") }, { status: 500 });

    return NextResponse.json({ data: documents || [] });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/documents GET") }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: trainer } = await supabase
      .from("trainers")
      .select("id, entity_id")
      .eq("profile_id", user.id)
      .single();

    if (!trainer) return NextResponse.json({ error: "Formateur non trouvé" }, { status: 403 });

    const body = await request.json();
    const { scope, session_id, doc_type, file_name, file_type, file_size, file_path, notes } = body;

    // Validate scope
    if (!scope || !VALID_SCOPES.includes(scope)) {
      return NextResponse.json({ error: "Scope invalide (session ou admin)" }, { status: 400 });
    }

    // Validate doc_type
    const validTypes = scope === "session" ? SESSION_DOC_TYPES : ADMIN_DOC_TYPES;
    if (!doc_type || !validTypes.includes(doc_type)) {
      return NextResponse.json({ error: "Type de document invalide" }, { status: 400 });
    }

    // Session required for session scope
    if (scope === "session" && !session_id) {
      return NextResponse.json({ error: "Session requise pour les documents de session" }, { status: 400 });
    }

    // Validate file fields
    if (!file_name || !file_type || !file_size || !file_path) {
      return NextResponse.json({ error: "Informations du fichier manquantes" }, { status: 400 });
    }

    const { data: doc, error } = await supabase
      .from("trainer_documents")
      .insert({
        trainer_id: trainer.id,
        entity_id: trainer.entity_id || null,
        scope,
        session_id: scope === "session" ? session_id : null,
        doc_type,
        file_name,
        file_type,
        file_size,
        file_path,
        notes: notes?.trim() || null,
      })
      .select("*, sessions(id, start_date, trainings(title))")
      .single();

    if (error) return NextResponse.json({ error: sanitizeDbError(error, "trainer/documents POST") }, { status: 500 });

    return NextResponse.json({ data: doc }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/documents POST") }, { status: 500 });
  }
}
