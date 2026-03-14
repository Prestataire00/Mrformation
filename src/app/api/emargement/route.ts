import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeDbError } from "@/lib/api-error";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// GET: Validate a token (public, no auth required)
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Token manquant" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Fetch token
  const { data: tokenData, error: tokenError } = await supabase
    .from("signing_tokens")
    .select("*")
    .eq("token", token)
    .single();

  if (tokenError || !tokenData) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }

  // Check expiration
  if (new Date(tokenData.expires_at) < new Date()) {
    return NextResponse.json({ error: "Ce lien a expiré" }, { status: 410 });
  }

  // For individual tokens, check if already used
  if (tokenData.token_type === "individual" && tokenData.used_at) {
    return NextResponse.json({ error: "Ce lien a déjà été utilisé" }, { status: 410 });
  }

  // Fetch session info
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, title, start_date, end_date, location, mode, status, trainer_id, training_id"
    )
    .eq("id", tokenData.session_id)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
  }

  // Fetch training title
  let trainingTitle: string | null = null;
  if (session.training_id) {
    const { data: training } = await supabase
      .from("trainings")
      .select("title")
      .eq("id", session.training_id)
      .single();
    trainingTitle = training?.title || null;
  }

  // Fetch existing signatures for this session
  const { data: existingSignatures } = await supabase
    .from("signatures")
    .select("signer_id, signer_type")
    .eq("session_id", tokenData.session_id);

  const signedLearnerIds = (existingSignatures || [])
    .filter((s: { signer_type: string }) => s.signer_type === "learner")
    .map((s: { signer_id: string }) => s.signer_id);

  if (tokenData.token_type === "session") {
    // For session tokens, return the list of enrolled learners
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("id, learner_id, status, learner:learners(id, first_name, last_name)")
      .eq("session_id", tokenData.session_id)
      .in("status", ["registered", "confirmed"]);

    const learners = (enrollments || [])
      .filter((e: { learner: unknown }) => e.learner)
      .map((e: { learner: { id: string; first_name: string; last_name: string } | { id: string; first_name: string; last_name: string }[] }) => {
        const l = Array.isArray(e.learner) ? e.learner[0] : e.learner;
        return {
          id: l.id,
          first_name: l.first_name,
          last_name: l.last_name,
          already_signed: signedLearnerIds.includes(l.id),
        };
      });

    return NextResponse.json({
      token_type: "session",
      session: {
        id: session.id,
        title: session.title,
        start_date: session.start_date,
        end_date: session.end_date,
        location: session.location,
        mode: session.mode,
        training_title: trainingTitle,
      },
      learners,
    });
  } else {
    // Individual token — return the specific learner info
    const { data: learner } = await supabase
      .from("learners")
      .select("id, first_name, last_name")
      .eq("id", tokenData.learner_id)
      .single();

    return NextResponse.json({
      token_type: "individual",
      session: {
        id: session.id,
        title: session.title,
        start_date: session.start_date,
        end_date: session.end_date,
        location: session.location,
        mode: session.mode,
        training_title: trainingTitle,
      },
      learner: learner
        ? {
            id: learner.id,
            first_name: learner.first_name,
            last_name: learner.last_name,
            already_signed: signedLearnerIds.includes(learner.id),
          }
        : null,
    });
  }
}

// POST: Generate signing tokens (admin/trainer only)
export async function POST(request: NextRequest) {
  const auth = await requireRole(["admin", "trainer"]);
  if (auth.error) return auth.error;

  const { session_id, type } = await request.json();

  if (!session_id || !type || !["session", "individual"].includes(type)) {
    return NextResponse.json(
      { error: "session_id et type ('session' | 'individual') requis" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h

  if (type === "session") {
    // Check if a non-expired session token already exists
    const { data: existing } = await supabase
      .from("signing_tokens")
      .select("*")
      .eq("session_id", session_id)
      .eq("token_type", "session")
      .gt("expires_at", new Date().toISOString())
      .single();

    if (existing) {
      return NextResponse.json({ tokens: [existing] });
    }

    // Create a new session token
    const { data: newToken, error } = await supabase
      .from("signing_tokens")
      .insert({
        session_id,
        entity_id: auth.profile.entity_id,
        token_type: "session",
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: sanitizeDbError(error, "emargement POST token") }, { status: 500 });
    }

    return NextResponse.json({ tokens: [newToken] });
  } else {
    // Individual: one token per active enrollment
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("id, learner_id, learner:learners(id, first_name, last_name, email)")
      .eq("session_id", session_id)
      .in("status", ["registered", "confirmed"]);

    if (!enrollments || enrollments.length === 0) {
      return NextResponse.json({ tokens: [], message: "Aucun apprenant inscrit" });
    }

    const tokens = [];

    for (const enrollment of enrollments) {
      const learner = Array.isArray(enrollment.learner)
        ? enrollment.learner[0]
        : enrollment.learner;
      if (!learner) continue;

      // Check if non-expired, unused token already exists for this enrollment
      const { data: existing } = await supabase
        .from("signing_tokens")
        .select("*")
        .eq("enrollment_id", enrollment.id)
        .eq("token_type", "individual")
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (existing) {
        tokens.push({ ...existing, learner });
        continue;
      }

      const { data: newToken, error } = await supabase
        .from("signing_tokens")
        .insert({
          session_id,
          enrollment_id: enrollment.id,
          learner_id: learner.id,
          entity_id: auth.profile.entity_id,
          token_type: "individual",
          expires_at: expiresAt,
        })
        .select()
        .single();

      if (!error && newToken) {
        tokens.push({ ...newToken, learner });
      }
    }

    return NextResponse.json({ tokens });
  }
}
