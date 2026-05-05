import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function getClientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

// GET: validate token and return questionnaire info + questions
export async function GET(request: NextRequest) {
  // Rate limit : protège contre l'énumération de tokens
  const { allowed, resetAt } = checkRateLimit(`questionnaire-get:${getClientIp(request)}`, { limit: 30, windowSeconds: 60 });
  if (!allowed) return rateLimitResponse(resetAt);

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

  // Load questionnaire, questions, learner, session (avec program/training pour expansion balise)
  const [{ data: questionnaire }, { data: questions }, { data: learner }, { data: session }] = await Promise.all([
    supabase.from("questionnaires").select("id, title, description").eq("id", tokenData.questionnaire_id).single(),
    supabase.from("questions").select("id, questionnaire_id, text, type, options, is_required, order_index").eq("questionnaire_id", tokenData.questionnaire_id).order("order_index"),
    supabase.from("learners").select("first_name, last_name").eq("id", tokenData.learner_id).single(),
    supabase.from("sessions").select("title, program:programs(objectives), training:trainings(objectives)").eq("id", tokenData.session_id).single(),
  ]);

  // Expanse les balises program_objectives → 1 rating par objectif du programme.
  // Sans cette étape côté serveur, les questionnaires distribués via lien
  // public/QR avec balise resteraient bloqués au submit (validation requise
  // sur une question impossible à remplir).
  let finalQuestions = questions || [];
  if (finalQuestions.some((q) => q.type === "program_objectives")) {
    const { expandObjectivesQuestions } = await import("@/lib/expand-objectives-question");
    finalQuestions = expandObjectivesQuestions(
      finalQuestions as never,
      session as never
    ) as never;
  }

  return NextResponse.json({
    valid: true,
    used: false,
    expired: false,
    questionnaire_title: questionnaire?.title || "Questionnaire",
    session_title: (session as { title?: string } | null)?.title || "",
    learner_name: learner ? `${learner.first_name} ${learner.last_name}` : "",
    questions: finalQuestions,
  });
}

// POST: submit responses
export async function POST(request: NextRequest) {
  // Rate limit : protège contre le spam de soumissions
  const { allowed, resetAt } = checkRateLimit(`questionnaire-submit:${getClientIp(request)}`, { limit: 10, windowSeconds: 60 });
  if (!allowed) return rateLimitResponse(resetAt);

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

    // Reconstruit le snapshot des objectifs côté serveur (autorité). Le client
    // envoie ses réponses keyed par les virtual IDs (`<parent>::obj_<i>`),
    // mais on persiste aussi le mapping parent_id → objectifs au moment T.
    const { data: rawQuestions } = await supabase
      .from("questions")
      .select("id, questionnaire_id, text, type, options, is_required, order_index")
      .eq("questionnaire_id", tokenData.questionnaire_id);

    let responsesPayload: unknown = responses;
    if ((rawQuestions ?? []).some((q) => q.type === "program_objectives")) {
      const { data: sessionData } = await supabase
        .from("sessions")
        .select("program:programs(objectives), training:trainings(objectives)")
        .eq("id", tokenData.session_id)
        .maybeSingle();
      const { expandObjectivesQuestions, buildResponsesPayload } = await import("@/lib/expand-objectives-question");
      const expanded = expandObjectivesQuestions(rawQuestions as never, sessionData as never);
      responsesPayload = buildResponsesPayload(responses as Record<string, string | number>, expanded);
    }

    // Insert response
    const { data: response, error: respErr } = await supabase
      .from("questionnaire_responses")
      .insert({
        questionnaire_id: tokenData.questionnaire_id,
        session_id: tokenData.session_id,
        learner_id: tokenData.learner_id,
        responses: responsesPayload,
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
