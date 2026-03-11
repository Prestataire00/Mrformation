import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generateGammaChapterDeck } from "@/lib/services/gamma";
import type { GammaGenerateOptions } from "@/lib/services/gamma";

export const maxDuration = 300;

function buildChapterMarkdown(title: string, contentMarkdown: string): string {
  // Convertit ### → ## pour la structure Gamma (H1 titre + H2 sections)
  const body = contentMarkdown.replace(/^### /gm, "## ");
  return `# ${title}\n\n${body}`;
}

/**
 * POST: Regenerate Gamma decks — one per chapter, in parallel.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    // Load course + chapters
    const { data: course, error: courseError } = await supabase
      .from("elearning_courses")
      .select(`
        id, title, gamma_theme_id,
        elearning_chapters (
          id, title, summary, order_index, content_markdown
        )
      `)
      .eq("id", params.courseId)
      .single();

    if (courseError || !course) {
      return NextResponse.json({ error: "Cours non trouvé" }, { status: 404 });
    }

    const chapters = ((course.elearning_chapters || []) as {
      id: string; title: string; summary: string;
      order_index: number; content_markdown: string;
    }[]).sort((a, b) => a.order_index - b.order_index);

    if (chapters.length === 0) {
      return NextResponse.json({ error: "Aucun chapitre dans ce cours" }, { status: 400 });
    }

    const gammaOptions: GammaGenerateOptions = {
      themeId: (course as Record<string, unknown>).gamma_theme_id as string || undefined,
      numCards: 8,
      language: "fr",
      tone: "professionnel et pédagogique",
      audience: "apprenants en formation professionnelle",
      textAmount: "medium",
      imageSource: "aiGenerated",
      imageStyle: "professionnel, moderne, éducatif",
      exportAs: "pptx",
    };

    // Generate one deck per chapter in parallel
    const gammaResults = await Promise.allSettled(
      chapters.map((ch) =>
        generateGammaChapterDeck(
          buildChapterMarkdown(ch.title, ch.content_markdown || ch.summary || ""),
          gammaOptions
        )
      )
    );

    const succeeded: { chapter_id: string; deck_url: string; embed_url: string }[] = [];

    for (let i = 0; i < chapters.length; i++) {
      const r = gammaResults[i];
      if (r.status === "fulfilled" && r.value.status === "completed" && r.value.embedUrl) {
        await supabase
          .from("elearning_chapters")
          .update({
            gamma_embed_url: r.value.embedUrl,
            gamma_deck_url: r.value.url,
            gamma_deck_id: r.value.id, // generationId — used for re-downloading PPTX
            gamma_slide_start: null,
            ...(r.value.exportPptx && { gamma_export_pptx: r.value.exportPptx }),
            updated_at: new Date().toISOString(),
          })
          .eq("id", chapters[i].id);
        succeeded.push({ chapter_id: chapters[i].id, deck_url: r.value.url, embed_url: r.value.embedUrl });
      } else {
        console.warn(`[Gamma] Chapitre ${i + 1} échoué:`, r.status === "rejected" ? r.reason : r.value.status);
      }
    }

    // Store chapter 1's deck at course level (for "Voir dans Gamma" button)
    if (succeeded.length > 0) {
      const firstResult = gammaResults[0];
      if (firstResult?.status === "fulfilled" && firstResult.value.status === "completed") {
        const first = firstResult.value;
        await supabase
          .from("elearning_courses")
          .update({
            gamma_embed_url: first.embedUrl,
            gamma_deck_url: first.url,
            gamma_deck_id: first.id, // generationId — used for re-downloading PPTX
            ...(first.exportPptx && { gamma_export_pptx: first.exportPptx }),
            updated_at: new Date().toISOString(),
          })
          .eq("id", params.courseId);
      }
    }

    if (succeeded.length === 0) {
      return NextResponse.json({ error: "Aucun deck Gamma généré" }, { status: 502 });
    }

    return NextResponse.json({
      data: {
        chapters_succeeded: succeeded.length,
        chapters_total: chapters.length,
        chapters: succeeded,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { data: chapters } = await supabase
      .from("elearning_chapters")
      .select("id, title, gamma_deck_id, gamma_deck_url, gamma_embed_url, gamma_export_pdf, gamma_export_pptx")
      .eq("course_id", params.courseId)
      .order("order_index");

    return NextResponse.json({
      data: {
        chapters: (chapters || []).map((ch) => ({
          id: ch.id,
          title: ch.title,
          deck_id: ch.gamma_deck_id,
          deck_url: ch.gamma_deck_url,
          embed_url: ch.gamma_embed_url,
          export_pdf: ch.gamma_export_pdf,
          export_pptx: ch.gamma_export_pptx,
        })),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
