import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";

/**
 * GET /api/trainer/documents/[id]/file-url
 *
 * Generates a signed URL (1h) to download a trainer document.
 * Verifies that the document belongs to the requesting trainer
 * OR the requester is an admin of the same entity.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    // Get the document
    const { data: doc } = await supabase
      .from("trainer_documents")
      .select("id, file_path, trainer_id, entity_id")
      .eq("id", params.id)
      .single();

    if (!doc) {
      return NextResponse.json({ error: "Document non trouvé" }, { status: 404 });
    }

    // Check access: trainer owns the document or user is admin of same entity
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, entity_id")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Profil non trouvé" }, { status: 403 });
    }

    const isAdmin = profile.role === "admin" && profile.entity_id === doc.entity_id;

    if (!isAdmin) {
      const { data: trainer } = await supabase
        .from("trainers")
        .select("id")
        .eq("profile_id", user.id)
        .single();

      if (!trainer || trainer.id !== doc.trainer_id) {
        return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
      }
    }

    const { data, error } = await supabase.storage
      .from("elearning-documents")
      .createSignedUrl(doc.file_path, 3600);

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: "Impossible de générer le lien" }, { status: 500 });
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (e) {
    return NextResponse.json(
      { error: sanitizeError(e, "trainer/documents/[id]/file-url GET") },
      { status: 500 }
    );
  }
}
