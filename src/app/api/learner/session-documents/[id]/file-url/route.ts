import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";

/**
 * GET /api/learner/session-documents/[id]/file-url
 *
 * URL signée (1h) pour un document de session formateur, SI :
 *  - le document est `scope='session'` et `visible_to_learners`, ET
 *  - l'apprenant (`learners.profile_id = auth.uid()`) est inscrit (`enrollments`)
 *    à la session du document.
 *
 * Sécurité : on signe le `file_path` STOCKÉ de la ligne (pas de param `path`),
 * donc aucun IDOR possible sur le bucket privé partagé `elearning-documents`.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { data: doc } = await supabase
      .from("trainer_documents")
      .select("id, file_path, scope, visible_to_learners, session_id")
      .eq("id", params.id)
      .maybeSingle();
    const d = doc as
      | { file_path: string; scope: string; visible_to_learners: boolean; session_id: string | null }
      | null;
    if (!d || d.scope !== "session" || !d.visible_to_learners || !d.session_id) {
      return NextResponse.json({ error: "Document indisponible" }, { status: 404 });
    }

    // L'apprenant doit être inscrit à la session du document.
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
      .select("id")
      .eq("session_id", d.session_id)
      .in("learner_id", learnerIds)
      .limit(1);
    if (!enr || (enr as Array<unknown>).length === 0) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    // Dual-bucket (cf. route formateur) : elearning-documents puis documents (legacy).
    const trySign = async (bucket: string) => {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(d.file_path, 3600);
      return error || !data?.signedUrl ? null : data.signedUrl;
    };
    const signedUrl = (await trySign("elearning-documents")) ?? (await trySign("documents"));
    if (!signedUrl) {
      return NextResponse.json({ error: "Impossible de générer le lien" }, { status: 500 });
    }
    return NextResponse.json({ url: signedUrl });
  } catch (e) {
    return NextResponse.json(
      { error: sanitizeError(e, "learner/session-documents/[id]/file-url GET") },
      { status: 500 },
    );
  }
}
