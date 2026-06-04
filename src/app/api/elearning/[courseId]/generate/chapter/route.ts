/**
 * POST /api/elearning/[courseId]/generate/chapter
 *
 * Étape 2 du pipeline split. Génère le contenu d'UN chapitre (markdown
 * + sections). Appelé N fois en série par le client après /outline.
 *
 * Body : { chapter_id: string }
 * Réponse : { ok: true, chapter: { id, title, content_markdown } }
 *
 * Durée typique : 5-12s par chapitre (1 appel OpenAI). Reste largement
 * sous le timeout Netlify Functions de 26s (Pro).
 */

import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { verifyCronAuth } from "@/lib/cron-auth";
import { requireElearningCourse } from "@/lib/auth/elearning-access";
import { generateChapterContent } from "@/lib/services/openai";

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  if (!verifyCronAuth(request)) {
    const access = await requireElearningCourse(params.courseId, ["admin", "super_admin"]);
    if (!access.ok) return access.error;
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { chapter_id?: string };
    if (!body.chapter_id) {
      return NextResponse.json({ error: "chapter_id requis" }, { status: 400 });
    }

    const { createClient } = await import("@/lib/supabase/server");
    const supabase = createClient();

    // Charge le chapitre + le cours pour reconstituer le contexte.
    const [{ data: chapter, error: chErr }, { data: course, error: courseErr }] = await Promise.all([
      supabase
        .from("elearning_chapters")
        .select("id, title, summary, key_concepts, order_index")
        .eq("id", body.chapter_id)
        .eq("course_id", params.courseId)
        .single(),
      supabase
        .from("elearning_courses")
        .select("title, objectives, extracted_text")
        .eq("id", params.courseId)
        .single(),
    ]);

    if (chErr || !chapter) {
      return NextResponse.json({ error: "Chapitre non trouvé" }, { status: 404 });
    }
    if (courseErr || !course) {
      return NextResponse.json({ error: "Cours non trouvé" }, { status: 404 });
    }

    const sourceText = (course.extracted_text as string | null) ?? "";
    const content = await generateChapterContent(
      chapter.title as string,
      (chapter.summary as string | null) ?? "",
      ((chapter.key_concepts as string[] | null) ?? []),
      sourceText,
      course.title as string,
      (course.objectives as string | null) ?? "",
    );

    // Aligné sur le pipeline legacy : reconstruit markdown depuis sections.
    const contentMarkdown = content.sections
      .map((s) => `### ${s.title}\n\n${s.content_html}`)
      .join("\n\n");
    const contentHtml = content.sections
      .map((s) => `<h3>${s.title}</h3>\n${s.content_html}`)
      .join("\n");
    const fullHtml = `<div class="chapter-intro"><p>${content.introduction}</p></div>\n${contentHtml}\n<div class="chapter-summary"><h3>Résumé</h3><p>${content.summary}</p></div>`;

    const { error: updateErr } = await supabase
      .from("elearning_chapters")
      .update({
        content_markdown: contentMarkdown,
        content_html: fullHtml,
        is_enriched: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.chapter_id)
      .eq("course_id", params.courseId);

    if (updateErr) {
      return NextResponse.json(
        { error: sanitizeDbError(updateErr, "updating chapter content") },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      chapter: {
        id: body.chapter_id,
        title: chapter.title,
        order_index: chapter.order_index,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "generating chapter content") },
      { status: 500 },
    );
  }
}
