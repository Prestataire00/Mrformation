import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { enqueueEmail } from "@/lib/services/email-queue";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * POST /api/questionnaires/auto-send
 *
 * Vérifie les sessions terminées (end_date < today) qui ont des questionnaires
 * avec auto_send_on_completion = true, et envoie les emails aux apprenants
 * qui n'ont pas encore répondu.
 *
 * Peut être appelé par un cron quotidien ou manuellement.
 */
export async function POST(request: NextRequest) {
  // Auth via CRON_SECRET ou admin session
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Allow cron or check for admin session
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    // Try session auth
    const { createClient: createServerClient } = await import("@/lib/supabase/server");
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (!profile || !["super_admin", "admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const supabase = createServiceClient();
  const today = new Date().toISOString().split("T")[0];

  try {
    // 1. Find questionnaire_sessions with auto_send_on_completion = true
    const { data: autoSendLinks } = await supabase
      .from("questionnaire_sessions")
      .select("questionnaire_id, session_id, session:sessions(id, title, end_date, entity_id)")
      .eq("auto_send_on_completion", true);

    if (!autoSendLinks || autoSendLinks.length === 0) {
      return NextResponse.json({ message: "Aucun questionnaire en envoi auto", sent: 0 });
    }

    let totalSent = 0;
    const results: { session: string; questionnaire_id: string; sent: number }[] = [];

    for (const link of autoSendLinks) {
      const session = link.session as any;
      if (!session?.end_date || !session?.entity_id) continue;

      // Check if session ended (end_date <= today)
      if (session.end_date > today) continue;

      // Get the questionnaire
      const { data: questionnaire } = await supabase
        .from("questionnaires")
        .select("id, title, is_active")
        .eq("id", link.questionnaire_id)
        .eq("is_active", true)
        .single();

      if (!questionnaire) continue;

      // Get enrolled learners with email
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("learner_id, learner:learners!enrollments_learner_id_fkey(id, first_name, last_name, email)")
        .eq("session_id", session.id)
        .in("status", ["registered", "confirmed", "completed"]);

      if (!enrollments || enrollments.length === 0) continue;

      // Get existing responses to avoid re-sending
      const { data: existingResponses } = await supabase
        .from("questionnaire_responses")
        .select("learner_id")
        .eq("questionnaire_id", questionnaire.id)
        .eq("session_id", session.id);

      const respondedIds = new Set((existingResponses ?? []).map((r: any) => r.learner_id));

      // Check if we already sent emails for this combo (anti-duplicate via email_history)
      const { data: sentEmails } = await supabase
        .from("email_history")
        .select("recipient_id")
        .eq("session_id", session.id)
        .ilike("subject", `%${questionnaire.title}%`)
        .eq("status", "sent");

      const alreadySentIds = new Set((sentEmails ?? []).map((e: any) => e.recipient_id));

      let sent = 0;

      for (const enrollment of enrollments) {
        const learner = enrollment.learner as any;
        if (!learner?.email) continue;
        if (respondedIds.has(learner.id)) continue; // Already answered
        if (alreadySentIds.has(learner.id)) continue; // Already sent

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://mrformationcrm.netlify.app";
        const link_url = `${baseUrl}/learner/questionnaires/${questionnaire.id}?session_id=${session.id}`;

        const emailBody = `Bonjour ${learner.first_name},\n\nLa formation "${session.title}" est terminée. Nous vous invitons à remplir le questionnaire de satisfaction :\n\n${link_url}\n\nMerci pour vos retours,\nL'équipe formation`;

        await enqueueEmail(supabase, {
          to: learner.email,
          subject: `Questionnaire — ${questionnaire.title}`,
          body: emailBody,
          entity_id: session.entity_id,
          session_id: session.id,
          recipient_type: "learner",
          recipient_id: learner.id,
        });
        sent++;
      }

      if (sent > 0) {
        results.push({ session: session.title, questionnaire_id: questionnaire.id, sent });
        totalSent += sent;
      }
    }

    // Disable auto-send for processed sessions to avoid re-sending
    // (We don't disable because the anti-duplicate check handles it)

    return NextResponse.json({
      success: true,
      totalSent,
      results,
      executedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[questionnaires/auto-send] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
