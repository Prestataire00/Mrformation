import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { exportGammaDeckFresh } from "@/lib/services/gamma";
import { sanitizeError } from "@/lib/api-error";

export const maxDuration = 30;

/**
 * GET /api/elearning/[courseId]/download-pptx?chapterId=xxx
 *
 * Re-fetches a fresh PPTX download URL from Gamma (the stored URL expires quickly).
 * Uses gamma_deck_id (which stores the generationId) to poll Gamma API.
 * Redirects the user to the fresh download URL.
 *
 * If chapterId is omitted, uses the course-level gamma_deck_id.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const chapterId = request.nextUrl.searchParams.get("chapterId");

    let generationId: string | null = null;

    if (chapterId) {
      const { data: chapter } = await supabase
        .from("elearning_chapters")
        .select("id, gamma_deck_id, course_id")
        .eq("id", chapterId)
        .eq("course_id", params.courseId)
        .single();

      if (!chapter) {
        return NextResponse.json({ error: "Chapitre non trouvé" }, { status: 404 });
      }
      generationId = chapter.gamma_deck_id || null;
    } else {
      const { data: course } = await supabase
        .from("elearning_courses")
        .select("id, gamma_deck_id")
        .eq("id", params.courseId)
        .single();

      if (!course) {
        return NextResponse.json({ error: "Cours non trouvé" }, { status: 404 });
      }
      generationId = course.gamma_deck_id || null;
    }

    if (!generationId) {
      return NextResponse.json({ error: "Aucune présentation Gamma disponible" }, { status: 404 });
    }

    const { url: downloadUrl, rawFields } = await exportGammaDeckFresh(generationId);

    if (!downloadUrl) {
      return NextResponse.json(
        {
          error: "Impossible de récupérer le lien de téléchargement PPTX depuis Gamma",
          debug: { generationId, rawFields },
        },
        { status: 502 }
      );
    }

    return NextResponse.redirect(downloadUrl, { status: 302 });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "downloading PPTX from Gamma") }, { status: 500 });
  }
}
