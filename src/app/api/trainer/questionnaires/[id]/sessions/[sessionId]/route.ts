import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";
import { isTrainerAssignedToSession } from "@/lib/auth/trainer-session-access";

/** DELETE — délie le questionnaire de la session. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; sessionId: string } },
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const assigned = await isTrainerAssignedToSession(supabase, user.id, params.sessionId);
    if (!assigned) return NextResponse.json({ error: "Vous n'êtes pas assigné à cette session" }, { status: 403 });

    const { error } = await supabase
      .from("questionnaire_sessions")
      .delete()
      .eq("questionnaire_id", params.id)
      .eq("session_id", params.sessionId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/questionnaires/[id]/sessions/[sessionId] DELETE") }, { status: 500 });
  }
}
