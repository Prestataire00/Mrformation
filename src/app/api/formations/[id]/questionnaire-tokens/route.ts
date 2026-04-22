import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";

interface RouteContext { params: { id: string } }

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(["super_admin", "admin", "trainer"]);
  if (auth.error) return auth.error;

  const sessionId = context.params.id;
  const { questionnaire_id } = await request.json();

  if (!questionnaire_id) {
    return NextResponse.json({ error: "questionnaire_id requis" }, { status: 400 });
  }

  // Verify session belongs to entity
  const { data: session } = await auth.supabase
    .from("sessions")
    .select("id, entity_id")
    .eq("id", sessionId)
    .eq("entity_id", auth.profile.entity_id)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
  }

  // Fetch enrolled learners
  const { data: enrollments } = await auth.supabase
    .from("enrollments")
    .select("learner_id, learner:learners(id, first_name, last_name, email)")
    .eq("session_id", sessionId)
    .in("status", ["registered", "confirmed", "completed"]);

  const tokens = [];
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  for (const enr of enrollments || []) {
    const learner = Array.isArray(enr.learner) ? enr.learner[0] : enr.learner;
    if (!learner) continue;

    // Check existing token (used or not)
    const { data: existing } = await auth.supabase
      .from("questionnaire_tokens")
      .select("*")
      .eq("session_id", sessionId)
      .eq("questionnaire_id", questionnaire_id)
      .eq("learner_id", learner.id)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .maybeSingle();

    if (existing) {
      tokens.push({ ...existing, learner });
      continue;
    }

    const { data: newToken, error } = await auth.supabase
      .from("questionnaire_tokens")
      .insert({
        session_id: sessionId,
        questionnaire_id,
        learner_id: learner.id,
        entity_id: auth.profile.entity_id,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        const { data: raceToken } = await auth.supabase
          .from("questionnaire_tokens")
          .select("*")
          .eq("session_id", sessionId)
          .eq("questionnaire_id", questionnaire_id)
          .eq("learner_id", learner.id)
          .maybeSingle();
        if (raceToken) tokens.push({ ...raceToken, learner });
      } else {
        console.error("[questionnaire-tokens] insert failed", error.message);
      }
      continue;
    }

    if (newToken) tokens.push({ ...newToken, learner });
  }

  return NextResponse.json({ tokens, total: tokens.length });
}
