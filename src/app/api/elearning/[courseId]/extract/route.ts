import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { extractText } from "@/lib/services/doc-extraction";

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    // Get course
    const { data: course, error: courseError } = await supabase
      .from("elearning_courses")
      .select("id, source_file_url, source_file_type")
      .eq("id", params.courseId)
      .single();

    if (courseError || !course) {
      return NextResponse.json({ error: "Cours non trouvé" }, { status: 404 });
    }

    if (!course.source_file_url) {
      return NextResponse.json({ error: "Aucun fichier source" }, { status: 400 });
    }

    // Update status
    await supabase
      .from("elearning_courses")
      .update({ generation_status: "extracting", updated_at: new Date().toISOString() })
      .eq("id", params.courseId);

    // Download file from Supabase Storage
    const filePath = course.source_file_url.replace(/^.*\/storage\/v1\/object\/public\//, "");
    const bucketAndPath = filePath.split("/");
    const bucket = bucketAndPath[0];
    const path = bucketAndPath.slice(1).join("/");

    const { data: fileData, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(path);

    if (downloadError || !fileData) {
      await supabase
        .from("elearning_courses")
        .update({ generation_status: "failed", generation_error: "Erreur téléchargement fichier" })
        .eq("id", params.courseId);
      return NextResponse.json({ error: "Erreur téléchargement fichier" }, { status: 500 });
    }

    // Extract text
    const buffer = Buffer.from(await fileData.arrayBuffer());
    const { text, metadata } = await extractText(buffer, course.source_file_type || "pdf");

    if (!text || text.trim().length < 100) {
      await supabase
        .from("elearning_courses")
        .update({ generation_status: "failed", generation_error: "Texte extrait trop court ou vide" })
        .eq("id", params.courseId);
      return NextResponse.json({ error: "Texte extrait trop court" }, { status: 400 });
    }

    // Truncate to 200k chars max
    const truncatedText = text.substring(0, 200000);

    // Save extracted text
    await supabase
      .from("elearning_courses")
      .update({
        extracted_text: truncatedText,
        generation_status: "pending",
        generation_log: [
          { step: "extraction", timestamp: new Date().toISOString(), message: `${truncatedText.length} caractères extraits` },
        ],
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.courseId);

    return NextResponse.json({
      data: {
        text_length: truncatedText.length,
        word_count: truncatedText.split(/\s+/).length,
        preview: truncatedText.substring(0, 500),
        metadata,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur interne";
    // Update course with error
    try {
      const supabase = createClient();
      await supabase
        .from("elearning_courses")
        .update({ generation_status: "failed", generation_error: message })
        .eq("id", params.courseId);
    } catch (_) {
      // ignore
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
