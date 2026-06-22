import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";

/**
 * GET /api/learner/supports/[courseId]/file-url?path=elearning-documents/...
 *
 * URL signée (1h) pour un fichier d'un support formateur, SI :
 *  - l'apprenant (learners.profile_id = auth.uid()) est inscrit (enrollments)
 *    à une session liée au support (trainer_course_sessions), ET
 *  - le support est publié.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { courseId: string } },
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const filePath = request.nextUrl.searchParams.get("path");
    if (!filePath) {
      return NextResponse.json({ error: "Paramètre 'path' manquant" }, { status: 400 });
    }

    // Support publié ?
    const { data: course } = await supabase
      .from("trainer_courses")
      .select("id, status, files")
      .eq("id", params.courseId)
      .maybeSingle();
    if (!course || (course as { status: string }).status !== "published") {
      return NextResponse.json({ error: "Support indisponible" }, { status: 404 });
    }

    // Le path demandé DOIT appartenir aux fichiers de CE support — sinon un apprenant
    // pourrait signer n'importe quel fichier du bucket privé (CV formateurs, autres
    // tenants…). L'égalité stricte ferme aussi le path traversal.
    const courseFiles = ((course as { files?: Array<{ path?: string }> }).files ?? []);
    if (!courseFiles.some((f) => f.path === filePath)) {
      return NextResponse.json({ error: "Fichier non autorisé" }, { status: 403 });
    }

    // Sessions de l'apprenant
    const { data: learners } = await supabase
      .from("learners")
      .select("id")
      .eq("profile_id", user.id);
    const learnerIds = ((learners as Array<{ id: string }> | null) ?? []).map((l) => l.id);
    if (learnerIds.length === 0) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const { data: enr } = await supabase
      .from("enrollments")
      .select("session_id")
      .in("learner_id", learnerIds);
    const sessionIds = ((enr as Array<{ session_id: string }> | null) ?? []).map((e) => e.session_id);
    if (sessionIds.length === 0) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    // Lien support ↔ une de mes sessions ?
    const { data: link } = await supabase
      .from("trainer_course_sessions")
      .select("id")
      .eq("trainer_course_id", params.courseId)
      .in("session_id", sessionIds)
      .limit(1);
    if (!link || (link as Array<unknown>).length === 0) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const { data, error } = await supabase.storage
      .from("elearning-documents")
      .createSignedUrl(filePath, 3600);
    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: "Impossible de générer le lien" }, { status: 500 });
    }
    return NextResponse.json({ url: data.signedUrl });
  } catch (e) {
    return NextResponse.json(
      { error: sanitizeError(e, "learner/supports/[courseId]/file-url GET") },
      { status: 500 },
    );
  }
}
