import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";
import { requireElearningCourse } from "@/lib/auth/elearning-access";

export const maxDuration = 10;

/**
 * GET /api/elearning/[courseId]/source-url
 *
 * Generates a short-lived signed URL for the course's source file stored in Supabase Storage.
 * Needed because the elearning-documents bucket is private (public URLs return 404).
 * Learners are allowed because they need to access the course source document.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const access = await requireElearningCourse(params.courseId, ["admin", "super_admin", "learner"]);
    if (!access.ok) return access.error;
    const { supabase, course: guardCourse } = access;

    const sourceFileUrl = guardCourse.source_file_url as string | null | undefined;
    if (!sourceFileUrl) {
      return NextResponse.json({ error: "Aucun fichier source" }, { status: 404 });
    }

    // Extract storage path from public URL:
    // https://{project}.supabase.co/storage/v1/object/public/elearning-documents/elearning/...
    // → elearning-documents/elearning/...
    const url = sourceFileUrl;
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
    return NextResponse.json({ error: sanitizeError(error, "generating source file URL") }, { status: 500 });
  }
}
