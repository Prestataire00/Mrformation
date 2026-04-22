import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// GET: validate token and return questionnaire info + questions
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ valid: false });

  const supabase = getServiceSupabase();

  const { data: tokenData } = await supabase
    .from("questionnaire_tokens")
    .select("id, session_id, questionnaire_id, learner_id, used_at, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!tokenData) return NextResponse.json({ valid: false, used: false, expired: false });

  const isUsed = !!tokenData.used_at;
  const isExpired = new Date(tokenData.expires_at) < new Date();

  if (isUsed || isExpired) {
    return NextResponse.json({ valid: false, used: isUsed, expired: isExpired });
  }

  // Load questionnaire, questions, learner, session
  const [{ data: questionnaire }, { data: questions }, { data: learner }, { data: session }] = await Promise.all([
    supabase.from("questionnaires").select("id, title, description").eq("id", tokenData.questionnaire_id).single(),
    supabase.from("questions").select("id, text, type, options, is_required, order_index").eq("questionnaire_id", tokenData.questionnaire_id).order("order_index"),
    supabase.from("learners").select("first_name, last_name").eq("id", tokenData.learner_id).single(),
    supabase.from("sessions").select("title").eq("id", tokenData.session_id).single(),
  ]);

  return NextResponse.json({
    valid: true,
    used: false,
    expired: false,
    questionnaire_title: questionnaire?.title || "Questionnaire",
    session_title: session?.title || "",
    learner_name: learner ? `${learner.first_name} ${learner.last_name}` : "",
    questions: questions || [],
  });
}

// POST: submit responses
export async function POST(request: NextRequest) {
  try {
    const { token, responses } = await request.json();

    if (!token || !responses) {
      return NextResponse.json({ error: "token et responses requis" }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    const { data: tokenData } = await supabase
      .from("questionnaire_tokens")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (!tokenData) return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
    if (tokenData.used_at) return NextResponse.json({ error: "Déjà répondu" }, { status: 410 });
    if (new Date(tokenData.expires_at) < new Date()) return NextResponse.json({ error: "Lien expiré" }, { status: 410 });

    // Insert response
    const { data: response, error: respErr } = await supabase
      .from("questionnaire_responses")
      .insert({
        questionnaire_id: tokenData.questionnaire_id,
        session_id: tokenData.session_id,
        learner_id: tokenData.learner_id,
        responses,
        submitted_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (respErr) {
      console.error("[public-submit] insert failed:", respErr);
      return NextResponse.json({ error: "Erreur d'enregistrement" }, { status: 500 });
    }

    // Mark token as used
    await supabase
      .from("questionnaire_tokens")
      .update({ used_at: new Date().toISOString(), response_id: response.id })
      .eq("id", tokenData.id);

    return NextResponse.json({ ok: true, response_id: response.id });
  } catch (err) {
    console.error("[public-submit] error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
