/**
 * POST /api/elearning/[courseId]/generate/outline
 *
 * Étape 1 du pipeline split (fix 504 Netlify timeout).
 *
 * Lit le texte extrait du cours, appelle OpenAI pour générer un outline
 * (titres + summaries + key_concepts), insère N chapitres placeholder
 * dans `elearning_chapters` (content_markdown vide, à remplir par
 * /generate/chapter ensuite), et marque generation_status = "generating".
 *
 * Body attendu : rien. Tout vient du cours.
 * Réponse : { ok: true, chapter_ids: string[] }
 *
 * Durée typique : 3-8s (un seul appel OpenAI court).
 */

import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { verifyCronAuth } from "@/lib/cron-auth";
import { requireElearningCourse } from "@/lib/auth/elearning-access";
import { generateCourseOutline } from "@/lib/services/openai";

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
    // Charge le cours via service direct (verifyCronAuth bypass possible).
    // On utilise le supabase server client classique pour rester cohérent.
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = createClient();

    const { data: course, error: courseError } = await supabase
      .from("elearning_courses")
      .select("id, title, objectives, extracted_text, num_chapters")
      .eq("id", params.courseId)
      .single();

    if (courseError || !course) {
      return NextResponse.json({ error: "Cours non trouvé" }, { status: 404 });
    }
    if (!course.extracted_text) {
      return NextResponse.json(
        { error: "Texte non extrait. Lancez d'abord l'extraction." },
        { status: 400 },
      );
    }

    const maxChapters = Math.min(Math.max(course.num_chapters || 5, 2), 12);

    // 1. Génère l'outline OpenAI.
    const outline = await generateCourseOutline(course.extracted_text, maxChapters);

    // 2. Insère les chapitres placeholder + met à jour le cours.
    const placeholders = outline.chapters.map((ch, i) => ({
      course_id: params.courseId,
      title: ch.title,
      summary: ch.summary,
      key_concepts: ch.key_concepts,
      order_index: i,
      estimated_duration_minutes: ch.estimated_duration_minutes ?? 15,
      content_markdown: "",
      is_enriched: false,
    }));

    // Supprime les anciens chapitres (re-génération possible)
    await supabase.from("elearning_chapters").delete().eq("course_id", params.courseId);

    const { data: insertedChapters, error: chErr } = await supabase
      .from("elearning_chapters")
      .insert(placeholders)
      .select("id, order_index");

    if (chErr) {
      return NextResponse.json(
        { error: sanitizeDbError(chErr, "inserting chapters") },
        { status: 500 },
      );
    }

    // 3. Met à jour le cours avec metadata + status.
    await supabase
      .from("elearning_courses")
      .update({
        title: course.title,
        objectives: outline.objectives ?? course.objectives,
        generation_status: "generating",
        generation_log: [
          { step: "outline", timestamp: new Date().toISOString(), message: `${outline.chapters.length} chapitres planifiés` },
        ],
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.courseId);

    return NextResponse.json({
      ok: true,
      chapter_ids: (insertedChapters ?? [])
        .sort((a, b) => (a.order_index as number) - (b.order_index as number))
        .map((c) => c.id as string),
      objectives: outline.objectives,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "generating outline") },
      { status: 500 },
    );
  }
}
