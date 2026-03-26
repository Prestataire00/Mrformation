import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generateGammaChapterDeck, type GammaGenerateOptions } from "@/lib/services/gamma";
import { sanitizeError } from "@/lib/api-error";

export const maxDuration = 300;

function buildChapterMarkdown(title: string, contentMarkdown: string): string {
  const body = contentMarkdown.replace(/^### /gm, "## ");
  return `# ${title}\n\n${body}`;
}

/**
 * GET /api/elearning/[courseId]/download-pdf?chapterId=xxx
 *
 * Generates a PDF export of a chapter's Gamma deck on demand.
 * - First call: generates a new Gamma deck with exportAs="pdf" (~2-3 min), caches URL in gamma_export_pdf
 * - Subsequent calls: redirects to cached URL directly
 *
 * If chapterId is omitted, uses the course-level deck.
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

    // Block learners from downloading PDF files
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role === "learner") {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    const chapterId = request.nextUrl.searchParams.get("chapterId");

    let cachedPdfUrl: string | null = null;
    let title = "";
    let content = "";
    let themeId: string | null = null;
    let targetTable: "elearning_chapters" | "elearning_courses";
    let targetId: string;

    if (chapterId) {
      const { data: chapter } = await supabase
        .from("elearning_chapters")
        .select("id, title, summary, content_markdown, gamma_export_pdf, course_id")
        .eq("id", chapterId)
        .eq("course_id", params.courseId)
        .single();

      if (!chapter) {
        return NextResponse.json({ error: "Chapitre non trouvé" }, { status: 404 });
      }
      cachedPdfUrl = chapter.gamma_export_pdf || null;
      title = chapter.title;
      content = buildChapterMarkdown(title, chapter.content_markdown || chapter.summary || "");
      targetTable = "elearning_chapters";
      targetId = chapterId;
    } else {
      const { data: course } = await supabase
        .from("elearning_courses")
        .select("id, title, description, gamma_export_pdf, gamma_theme_id")
        .eq("id", params.courseId)
        .single();

      if (!course) {
        return NextResponse.json({ error: "Cours non trouvé" }, { status: 404 });
      }
      cachedPdfUrl = course.gamma_export_pdf || null;
      title = course.title;
      content = buildChapterMarkdown(title, course.description || "");
      themeId = (course as Record<string, unknown>).gamma_theme_id as string || null;
      targetTable = "elearning_courses";
      targetId = params.courseId;
    }

    // If we have a cached PDF URL, redirect directly
    if (cachedPdfUrl) {
      return NextResponse.redirect(cachedPdfUrl, { status: 302 });
    }

    if (!content.trim() || content.trim() === `# ${title}`) {
      return NextResponse.json(
        { error: "Contenu insuffisant pour générer le PDF" },
        { status: 400 }
      );
    }

    // Get course theme if not already loaded
    if (!themeId && targetTable === "elearning_chapters") {
      const { data: course } = await supabase
        .from("elearning_courses")
        .select("gamma_theme_id")
        .eq("id", params.courseId)
        .single();
      themeId = (course as Record<string, unknown>)?.gamma_theme_id as string || null;
    }

    // Generate fresh PDF deck (costs 1 Gamma credit, ~2-3 minutes)
    const gammaOptions: GammaGenerateOptions = {
      themeId: themeId || undefined,
      numCards: 8,
      language: "fr",
      tone: "professionnel et pédagogique",
      audience: "apprenants en formation professionnelle",
      textAmount: "medium",
      imageSource: "aiGenerated",
      imageStyle: "professionnel, moderne, éducatif",
      exportAs: "pdf",
    };

    const result = await generateGammaChapterDeck(content, gammaOptions);

    if (result.status !== "completed" || !result.exportPptx) {
      return NextResponse.json(
        { error: "Impossible de générer le PDF Gamma", status: result.status },
        { status: 502 }
      );
    }

    const pdfUrl = result.exportPptx; // exportPptx holds the exportUrl field from Gamma

    // Cache the PDF URL in DB to avoid regenerating next time
    await supabase
      .from(targetTable)
      .update({ gamma_export_pdf: pdfUrl, updated_at: new Date().toISOString() })
      .eq("id", targetId);

    return NextResponse.redirect(pdfUrl, { status: 302 });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "downloading PDF from Gamma") }, { status: 500 });
  }
}
