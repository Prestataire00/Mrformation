import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";
import {
  resolveTrainerSessionIds,
  isTrainerAssignedToSession,
} from "@/lib/auth/trainer-session-access";
import { getOwnedCourse } from "@/lib/services/trainer-course-sharing";

const NIL = "00000000-0000-0000-0000-000000000000";

/** GET — mes sessions assignées + `linked` pour ce support. */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const course = await getOwnedCourse(supabase, user.id, params.id);
    if (!course) {
      return NextResponse.json({ error: "Support introuvable ou non autorisé" }, { status: 404 });
    }

    const sessionIds = await resolveTrainerSessionIds(supabase, user.id);
    const { data: sessions, error: sErr } = await supabase
      .from("sessions")
      .select("id, title, start_date, end_date, training:trainings(title)")
      .in("id", sessionIds.length ? sessionIds : [NIL])
      .order("start_date", { ascending: false });
    if (sErr) {
      return NextResponse.json({ error: sErr.message }, { status: 500 });
    }

    const { data: links } = await supabase
      .from("trainer_course_sessions")
      .select("session_id")
      .eq("trainer_course_id", params.id);
    const linked = new Set(((links as Array<{ session_id: string }> | null) ?? []).map((l) => l.session_id));

    const data = ((sessions as Array<{ id: string }> | null) ?? []).map((s) => ({
      ...s,
      linked: linked.has(s.id),
    }));
    return NextResponse.json({ data, published: course.status === "published" });
  } catch (e) {
    return NextResponse.json(
      { error: sanitizeError(e, "trainer/courses/[id]/sessions GET") },
      { status: 500 },
    );
  }
}

/** POST — lie le support à une session (idempotent). */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = (await request.json()) as { sessionId?: string };
    if (!body.sessionId) {
      return NextResponse.json({ error: "sessionId requis" }, { status: 400 });
    }

    const course = await getOwnedCourse(supabase, user.id, params.id);
    if (!course) {
      return NextResponse.json({ error: "Support introuvable ou non autorisé" }, { status: 404 });
    }
    if (course.status !== "published") {
      return NextResponse.json(
        { error: "Publiez le support avant de le partager." },
        { status: 400 },
      );
    }

    const assigned = await isTrainerAssignedToSession(supabase, user.id, body.sessionId);
    if (!assigned) {
      return NextResponse.json({ error: "Vous n'êtes pas assigné à cette session" }, { status: 403 });
    }

    // `trainer_course_sessions.entity_id` est NOT NULL, mais `trainer_courses.entity_id`
    // peut être null (anciens supports). On retombe sur l'entité de la session (toujours
    // renseignée, et même entité que le formateur — mono-entité).
    let entityId = course.entity_id;
    if (!entityId) {
      const { data: sess } = await supabase
        .from("sessions")
        .select("entity_id")
        .eq("id", body.sessionId)
        .maybeSingle();
      entityId = (sess as { entity_id: string } | null)?.entity_id ?? null;
    }
    if (!entityId) {
      return NextResponse.json({ error: "Entité introuvable pour ce partage" }, { status: 400 });
    }

    const { error } = await supabase
      .from("trainer_course_sessions")
      .upsert(
        { trainer_course_id: params.id, session_id: body.sessionId, entity_id: entityId },
        { onConflict: "trainer_course_id,session_id", ignoreDuplicates: true },
      );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: sanitizeError(e, "trainer/courses/[id]/sessions POST") },
      { status: 500 },
    );
  }
}
