import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generateGammaFullCourseContent } from "@/lib/services/openai";
import { generateGammaChapterDeck } from "@/lib/services/gamma";
import type { GammaGenerateOptions } from "@/lib/services/gamma";

export const maxDuration = 180;

/**
 * POST: Generate (or regenerate) a single Gamma deck for the entire course.
 * Uses the unified single-deck approach: 1 API call for all chapters.
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
        id, title, objectives, gamma_theme_id,
        elearning_chapters (
          id, title, summary, key_concepts, order_index, content_markdown
        )
      `)
      .eq("id", params.courseId)
      .single();

    if (courseError || !course) {
      return NextResponse.json({ error: "Cours non trouvé" }, { status: 404 });
    }

    const chapters = ((course.elearning_chapters || []) as {
      id: string; title: string; summary: string; key_concepts: string[];
      order_index: number; content_markdown: string;
    }[]).sort((a, b) => a.order_index - b.order_index);

    if (chapters.length === 0) {
      return NextResponse.json({ error: "Aucun chapitre dans ce cours" }, { status: 400 });
    }

    // Step 1: Generate unified markdown for all chapters via OpenAI
    const fullGammaMarkdown = await generateGammaFullCourseContent(
      course.title,
      chapters.map((ch) => ({
        title: ch.title,
        contentMarkdown: ch.content_markdown || ch.summary || "",
        key_concepts: ch.key_concepts || [],
      }))
    );

    // Step 2: Single Gamma API call
    const gammaOptions: GammaGenerateOptions = {
      themeId: (course as Record<string, unknown>).gamma_theme_id as string || undefined,
      language: "fr",
      tone: "professionnel et pédagogique",
      audience: "apprenants en formation professionnelle",
      textAmount: "medium",
      imageSource: "aiGenerated",
      imageStyle: "professionnel, moderne, éducatif",
    };

    const gammaDeck = await generateGammaChapterDeck(fullGammaMarkdown, gammaOptions);

    if (gammaDeck.status !== "completed" || !gammaDeck.embedUrl) {
      return NextResponse.json({
        error: `Gamma: statut ${gammaDeck.status} — pas d'URL générée`,
      }, { status: 502 });
    }

    // Step 3: Store at course level
    await supabase
      .from("elearning_courses")
      .update({
        gamma_embed_url: gammaDeck.embedUrl,
        gamma_deck_url: gammaDeck.url,
        gamma_deck_id: gammaDeck.gammaId || gammaDeck.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.courseId);

    // Step 4: Update each chapter with same URL + estimated slide_start
    const ESTIMATED_SLIDES_PER_CHAPTER = 7;
    for (let i = 0; i < chapters.length; i++) {
      const slideStart = 1 + i * ESTIMATED_SLIDES_PER_CHAPTER;
      await supabase
        .from("elearning_chapters")
        .update({
          gamma_slide_start: slideStart,
          gamma_embed_url: gammaDeck.embedUrl,
          gamma_deck_url: gammaDeck.url,
          gamma_deck_id: gammaDeck.gammaId || gammaDeck.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", chapters[i].id);
    }

    return NextResponse.json({
      data: {
        deck_url: gammaDeck.url,
        embed_url: gammaDeck.embedUrl,
        deck_id: gammaDeck.gammaId || gammaDeck.id,
        chapters_count: chapters.length,
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
