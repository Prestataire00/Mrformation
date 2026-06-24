import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";
import { resolveTrainerIds } from "@/lib/auth/trainer-session-access";

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

    // Lot G audit BMAD #G.4 : autoriser aussi super_admin (entité matching)
    // + commercial. Avant : seul "admin" strict → super_admin bloqué.
    const isAdminOrSuper =
      ["admin", "super_admin", "commercial"].includes(profile.role) &&
      profile.entity_id === doc.entity_id;

    if (!isAdminOrSuper) {
      // Multi-entité : .includes sur toutes les fiches du profil (.single() cassait à ≥2).
      const trainerIds = await resolveTrainerIds(supabase, user.id);
      if (!trainerIds.includes(doc.trainer_id)) {
        return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
      }
    }

    // Fallback rétrocompat : essayer `elearning-documents` (nouveau bucket
    // standard) puis `documents` (legacy bucket utilisé avant migration).
    // Sans ça les anciens trainer_documents uploadés AVANT le fix bucket
    // mismatch (audit BMAD #3) restaient illisibles → 404.
    const trySign = async (bucket: string) => {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(doc.file_path, 3600);
      return error || !data?.signedUrl ? null : data.signedUrl;
    };
    const signedUrl = (await trySign("elearning-documents")) ?? (await trySign("documents"));
    if (!signedUrl) {
      return NextResponse.json({ error: "Impossible de générer le lien" }, { status: 500 });
    }
    return NextResponse.json({ url: signedUrl });
  } catch (e) {
    return NextResponse.json(
      { error: sanitizeError(e, "trainer/documents/[id]/file-url GET") },
      { status: 500 }
    );
  }
}
