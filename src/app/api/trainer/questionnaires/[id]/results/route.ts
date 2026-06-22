import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";
import { resolveTrainerSessionIds } from "@/lib/auth/trainer-session-access";

/**
 * GET /api/trainer/questionnaires/[id]/results
 *
 * Réponses au questionnaire pour les sessions du formateur (isolation par
 * `resolveTrainerSessionIds`). Retourne les questions + réponses brutes ; le
 * calcul d'agrégats est fait côté page (rating → moyenne, etc.).
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const sessionIds = await resolveTrainerSessionIds(supabase, user.id);
    if (sessionIds.length === 0) return NextResponse.json({ data: { questions: [], responses: [] } });

    const { data: questions } = await supabase
      .from("questions")
      .select("id, text, type, options, order_index")
      .eq("questionnaire_id", params.id)
      .order("order_index", { ascending: true });

    const { data: responses } = await supabase
      .from("questionnaire_responses")
      .select("id, session_id, responses, submitted_at")
      .eq("questionnaire_id", params.id)
      .in("session_id", sessionIds);

    return NextResponse.json({
      data: { questions: questions ?? [], responses: responses ?? [] },
    });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/questionnaires/[id]/results GET") }, { status: 500 });
  }
}
