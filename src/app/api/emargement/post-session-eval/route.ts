import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// POST: Send auto-evaluation questionnaire to all enrolled learners
export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin", "trainer"]);
  if (auth.error) return auth.error;

  try {
    const { session_id } = await request.json();

    if (!session_id) {
      return NextResponse.json({ error: "session_id requis" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 1. Check if session has an auto_eval_post assignment
    const { data: evalAssignment } = await supabase
      .from("formation_evaluation_assignments")
      .select("id, questionnaire_id, questionnaire:questionnaires(id, title)")
      .eq("session_id", session_id)
      .eq("evaluation_type", "auto_eval_post")
      .is("learner_id", null) // Global assignment (all learners)
      .maybeSingle();

    if (!evalAssignment) {
      return NextResponse.json(
        { error: "Aucun questionnaire d'auto-évaluation post-formation assigné à cette session" },
        { status: 404 }
      );
    }

    const questionnaire = Array.isArray(evalAssignment.questionnaire)
      ? evalAssignment.questionnaire[0]
      : evalAssignment.questionnaire;

    if (!questionnaire) {
      return NextResponse.json(
        { error: "Questionnaire introuvable" },
        { status: 404 }
      );
    }

    // 2. Get session info
    const { data: session } = await supabase
      .from("sessions")
      .select("id, title, training:trainings(title)")
      .eq("id", session_id)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    }

    const training = Array.isArray(session.training)
      ? session.training[0]
      : session.training;

    // 3. Get enrolled learners with emails
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("learner_id, learner:learners(id, first_name, last_name, email)")
      .eq("session_id", session_id)
      .in("status", ["registered", "confirmed"]);

    if (!enrollments || enrollments.length === 0) {
      return NextResponse.json({ sent: 0, message: "Aucun apprenant inscrit" });
    }

    // 4. Check which learners have already responded
    const { data: existingResponses } = await supabase
      .from("questionnaire_responses")
      .select("learner_id")
      .eq("questionnaire_id", questionnaire.id)
      .eq("session_id", session_id);

    const respondedLearnerIds = new Set(
      (existingResponses || []).map((r: { learner_id: string }) => r.learner_id)
    );

    // 5. Send emails to learners who haven't responded
    let sent = 0;
    const baseUrl = request.headers.get("origin") || request.nextUrl.origin;

    for (const enrollment of enrollments) {
      const learner = Array.isArray(enrollment.learner)
        ? enrollment.learner[0]
        : enrollment.learner;

      if (!learner?.email || respondedLearnerIds.has(learner.id)) continue;

      // Build questionnaire link
      // The learner fills the questionnaire from their portal
      const link = `${baseUrl}/learner/questionnaires/${questionnaire.id}?session_id=${session_id}`;

      try {
        await fetch(`${baseUrl}/api/emails/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: learner.email,
            subject: `Auto-évaluation — ${training?.title || session.title}`,
            body: `Bonjour ${learner.first_name} ${learner.last_name},\n\nVotre formation "${training?.title || session.title}" est terminée.\n\nNous vous invitons à remplir le questionnaire d'auto-évaluation post-formation en cliquant sur le lien ci-dessous :\n\n${link}\n\nCe questionnaire est obligatoire et ne prend que quelques minutes.\n\nMerci pour votre participation.\n\nCordialement,\nL'équipe de formation`,
            session_id,
            recipient_type: "learner",
            recipient_id: learner.id,
          }),
        });
        sent++;
      } catch {
        // Continue with next learner
      }
    }

    return NextResponse.json({
      sent,
      total: enrollments.length,
      already_responded: respondedLearnerIds.size,
      message: `${sent} email(s) envoyé(s)`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "post-session-eval") },
      { status: 500 }
    );
  }
}
