import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@supabase/supabase-js";

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const { questionnaire_id, learner_id, session_id, answers, fill_mode, admin_notes } = await request.json();

    if (!questionnaire_id || !learner_id || !session_id || !answers) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    // Verify enrollment belongs to this entity
    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("id, session_id")
      .eq("learner_id", learner_id)
      .eq("session_id", session_id)
      .maybeSingle();

    if (!enrollment) {
      return NextResponse.json({ error: "Apprenant non inscrit à cette formation" }, { status: 403 });
    }

    const { data: session } = await supabase
      .from("sessions")
      .select("entity_id")
      .eq("id", session_id)
      .single();

    if (!session || session.entity_id !== auth.profile.entity_id) {
      return NextResponse.json({ error: "Apprenant non autorisé" }, { status: 403 });
    }

    // Check existing response
    const { data: existing } = await supabase
      .from("questionnaire_responses")
      .select("id, fill_mode")
      .eq("questionnaire_id", questionnaire_id)
      .eq("learner_id", learner_id)
      .eq("session_id", session_id)
      .maybeSingle();

    if (existing) {
      if (existing.fill_mode === "learner") {
        return NextResponse.json(
          { error: "L'apprenant a déjà répondu. Impossible d'écraser sa réponse." },
          { status: 409 }
        );
      }

      // Update existing admin-filled response
      const { error: updateErr } = await supabase
        .from("questionnaire_responses")
        .update({
          answers,
          filled_by_admin: auth.profile.id,
          filled_by_admin_at: new Date().toISOString(),
          fill_mode: fill_mode || "admin_for_learner",
          admin_notes: admin_notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (updateErr) throw updateErr;

      return NextResponse.json({ success: true, action: "updated", response_id: existing.id });
    }

    // Insert new response
    const { data: inserted, error: insertErr } = await supabase
      .from("questionnaire_responses")
      .insert({
        questionnaire_id,
        learner_id,
        session_id,
        answers,
        filled_by_admin: auth.profile.id,
        filled_by_admin_at: new Date().toISOString(),
        fill_mode: fill_mode || "admin_for_learner",
        admin_notes: admin_notes || null,
        submitted_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertErr) throw insertErr;

    return NextResponse.json({ success: true, action: "created", response_id: inserted.id });
  } catch (err) {
    console.error("[fill-for-learner]", err);
    return NextResponse.json({ error: "Erreur lors de l'enregistrement" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const questionnaire_id = searchParams.get("questionnaire_id");
  const learner_id = searchParams.get("learner_id");
  const session_id = searchParams.get("session_id");

  if (!questionnaire_id || !learner_id || !session_id) {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  const { data } = await supabase
    .from("questionnaire_responses")
    .select("id, answers, fill_mode, filled_by_admin, filled_by_admin_at, admin_notes, submitted_at")
    .eq("questionnaire_id", questionnaire_id)
    .eq("learner_id", learner_id)
    .eq("session_id", session_id)
    .maybeSingle();

  return NextResponse.json({ data: data ?? null });
}
