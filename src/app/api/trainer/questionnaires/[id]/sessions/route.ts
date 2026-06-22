import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";
import { resolveTrainerSessionIds, isTrainerAssignedToSession } from "@/lib/auth/trainer-session-access";

const NIL = "00000000-0000-0000-0000-000000000000";

/** GET — sessions du formateur + `linked` pour ce questionnaire. */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const sessionIds = await resolveTrainerSessionIds(supabase, user.id);
    const { data: sessions, error: sErr } = await supabase
      .from("sessions")
      .select("id, title, start_date, end_date, training:trainings(title)")
      .in("id", sessionIds.length ? sessionIds : [NIL])
      .order("start_date", { ascending: false });
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

    const { data: links } = await supabase
      .from("questionnaire_sessions")
      .select("session_id")
      .eq("questionnaire_id", params.id);
    const linked = new Set(((links as Array<{ session_id: string }> | null) ?? []).map((l) => l.session_id));

    const data = ((sessions as Array<{ id: string }> | null) ?? []).map((s) => ({ ...s, linked: linked.has(s.id) }));
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/questionnaires/[id]/sessions GET") }, { status: 500 });
  }
}

/** POST — lie le questionnaire à une session (idempotent). */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const body = (await request.json()) as { sessionId?: string };
    if (!body.sessionId) return NextResponse.json({ error: "sessionId requis" }, { status: 400 });

    const assigned = await isTrainerAssignedToSession(supabase, user.id, body.sessionId);
    if (!assigned) return NextResponse.json({ error: "Vous n'êtes pas assigné à cette session" }, { status: 403 });

    const { error } = await supabase
      .from("questionnaire_sessions")
      .upsert(
        { questionnaire_id: params.id, session_id: body.sessionId },
        { onConflict: "questionnaire_id,session_id", ignoreDuplicates: true },
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/questionnaires/[id]/sessions POST") }, { status: 500 });
  }
}
