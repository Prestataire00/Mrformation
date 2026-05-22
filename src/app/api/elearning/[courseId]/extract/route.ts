import { NextRequest, NextResponse } from "next/server";
import { extractText } from "@/lib/services/doc-extraction";
import { sanitizeError } from "@/lib/api-error";
import { requireElearningCourse } from "@/lib/auth/elearning-access";

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  const access = await requireElearningCourse(params.courseId, ["admin", "super_admin"]);
  if (!access.ok) return access.error;
  // supabase is captured outside try so the catch block can update DB on error
  const { supabase, course: guardCourse } = access;

  try {
    // Le garde a déjà chargé le cours (entity_id vérifiée) — pas de seconde requête.
    const sourceFileUrl = guardCourse.source_file_url as string | null | undefined;
    const sourceFileType = guardCourse.source_file_type as string | null | undefined;

    if (!sourceFileUrl) {
      return NextResponse.json({ error: "Aucun fichier source" }, { status: 400 });
    }

    // Update status
    await supabase
      .from("elearning_courses")
      .update({ generation_status: "extracting", updated_at: new Date().toISOString() })
      .eq("id", params.courseId);

    // Download file from Supabase Storage
    const filePath = sourceFileUrl.replace(/^.*\/storage\/v1\/object\/public\//, "");
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
    const { text, metadata } = await extractText(buffer, sourceFileType || "pdf");

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
    const message = sanitizeError(error, "extracting text from document");
    // Update course with error
    try {
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
