import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { sendVisioLinkToLearners } from "@/lib/services/sessions";

const Params = z.object({ id: z.string().uuid() });

/**
 * POST /api/sessions/[id]/send-visio-link
 *
 * Déclenché par le bouton « Envoyer » du composant ResumeVisioLink (Tâche 14).
 * Auth : admin / super_admin / trainer (cohérent avec les autres routes
 * d'écriture sur les sessions du module Formation).
 *
 * Délègue à src/lib/services/sessions.ts:sendVisioLinkToLearners qui
 * gère la logique métier (check entity_id, itération enrollments, enqueue).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(["admin", "super_admin", "trainer"]);
  if (auth.error) return auth.error;

  const parsed = Params.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "session_id invalide" }, { status: 400 });
  }

  const result = await sendVisioLinkToLearners(
    auth.supabase,
    parsed.data.id,
    auth.profile.entity_id,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }
  return NextResponse.json({
    success: true,
    enqueued: result.enqueued,
    skipped: result.skipped,
  });
}
