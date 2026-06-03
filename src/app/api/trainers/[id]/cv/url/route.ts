import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";

/**
 * GET /api/trainers/[id]/cv/url
 *
 * Génère une signed URL (1h) pour télécharger le CV d'un formateur
 * depuis le bucket privé `elearning-documents`. Remplace l'ancien
 * accès via URL publique (bucket "documents" en `public: true`,
 * violation RGPD identifiée par audit BMAD).
 *
 * Auth : admin/super_admin de l'entité du trainer, ou le trainer
 * lui-même (via profile_id).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { data: trainer } = await supabase
      .from("trainers")
      .select("id, entity_id, profile_id, cv_url")
      .eq("id", params.id)
      .maybeSingle();
    if (!trainer) {
      return NextResponse.json({ error: "Formateur introuvable" }, { status: 404 });
    }
    if (!trainer.cv_url) {
      return NextResponse.json({ error: "Aucun CV uploadé" }, { status: 404 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, entity_id")
      .eq("id", user.id)
      .single();
    if (!profile) {
      return NextResponse.json({ error: "Profil non trouvé" }, { status: 403 });
    }

    const isSuperAdmin = profile.role === "super_admin";
    const isAdminSameEntity =
      profile.role === "admin" && profile.entity_id === trainer.entity_id;
    const isOwnerTrainer = trainer.profile_id === user.id;

    if (!isSuperAdmin && !isAdminSameEntity && !isOwnerTrainer) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    // cv_url peut être : (a) nouveau path `trainers/cv/cv-<id>.pdf` (post-fix),
    // (b) ancien storage path `trainers/cv-<id>-<ts>.pdf` (legacy bucket
    // "documents" — encore lisible si bucket existe), (c) URL publique
    // complète (legacy avant fix). On gère (a) et (b) via signed URL et
    // on renvoie (c) tel quel pour rétrocompat.
    if (/^https?:\/\//.test(trainer.cv_url)) {
      return NextResponse.json({ url: trainer.cv_url, legacy: true });
    }

    const { data, error } = await supabase.storage
      .from("elearning-documents")
      .createSignedUrl(trainer.cv_url, 3600);
    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { error: "Impossible de générer le lien" },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (e) {
    return NextResponse.json(
      { error: sanitizeError(e, "trainers/[id]/cv/url GET") },
      { status: 500 },
    );
  }
}
