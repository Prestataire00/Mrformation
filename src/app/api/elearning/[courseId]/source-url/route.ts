import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 10;

/**
 * GET /api/elearning/[courseId]/source-url
 *
 * Generates a short-lived signed URL for the course's source file stored in Supabase Storage.
 * Needed because the elearning-documents bucket is private (public URLs return 404).
 */
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

    const { data: course } = await supabase
      .from("elearning_courses")
      .select("id, source_file_url")
      .eq("id", params.courseId)
      .single();

    if (!course?.source_file_url) {
      return NextResponse.json({ error: "Aucun fichier source" }, { status: 404 });
    }

    // Extract storage path from public URL:
    // https://{project}.supabase.co/storage/v1/object/public/elearning-documents/elearning/...
    // → elearning-documents/elearning/...
    const url = course.source_file_url;
    const marker = "/storage/v1/object/public/";
    const markerIndex = url.indexOf(marker);

    if (markerIndex === -1) {
      // URL is not a Supabase storage URL — redirect directly
      return NextResponse.redirect(url);
    }

    const fullPath = url.substring(markerIndex + marker.length);
    // fullPath = "elearning-documents/elearning/..."
    const slashIndex = fullPath.indexOf("/");
    if (slashIndex === -1) {
      return NextResponse.json({ error: "Chemin de fichier invalide" }, { status: 400 });
    }

    const bucket = fullPath.substring(0, slashIndex);         // "elearning-documents"
    const filePath = fullPath.substring(slashIndex + 1);     // "elearning/..."

    const { data: signedData, error: signError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    if (signError || !signedData?.signedUrl) {
      console.error("[source-url] Signed URL error:", signError);
      return NextResponse.json(
        { error: `Impossible de générer le lien : ${signError?.message}` },
        { status: 502 }
      );
    }

    return NextResponse.redirect(signedData.signedUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
