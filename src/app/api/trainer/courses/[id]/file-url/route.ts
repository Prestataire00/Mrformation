import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/trainer/courses/[id]/file-url?path=trainer-courses/xxx/file.pdf
 *
 * Generates a signed URL (1h) to download a file from a trainer course.
 * Verifies that the course belongs to the requesting user's trainer profile
 * OR that the course is published (for learners).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const filePath = request.nextUrl.searchParams.get("path");
    if (!filePath) {
      return NextResponse.json({ error: "Paramètre 'path' manquant" }, { status: 400 });
    }

    // Check access: either the trainer owns the course, or the course is published
    const { data: course } = await supabase
      .from("trainer_courses")
      .select("id, status, trainer_id")
      .eq("id", params.id)
      .single();

    if (!course) {
      return NextResponse.json({ error: "Cours non trouvé" }, { status: 404 });
    }

    // Allow if published (any authenticated user) or if requester is the trainer
    if (course.status !== "published") {
      const { data: trainer } = await supabase
        .from("trainers")
        .select("id")
        .eq("profile_id", user.id)
        .single();

      if (!trainer || trainer.id !== course.trainer_id) {
        return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
      }
    }

    const { data, error } = await supabase.storage
      .from("elearning-documents")
      .createSignedUrl(filePath, 3600);

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: "Impossible de générer le lien" }, { status: 500 });
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur interne" },
      { status: 500 }
    );
  }
}
