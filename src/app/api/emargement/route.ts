import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeDbError } from "@/lib/api-error";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

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
  // Rate limit : route publique, anti brute-force sur tokens
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { allowed, resetAt } = checkRateLimit(`emargement-validate:${ip}`, { limit: 60, windowSeconds: 60 });
  if (!allowed) return rateLimitResponse(resetAt);

  try {
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

  // Fetch time slot info if token is slot-aware
  let timeSlot: { id: string; title: string | null; start_time: string; end_time: string } | null = null;
  if (tokenData.time_slot_id) {
    const { data: slot } = await supabase
      .from("formation_time_slots")
      .select("id, title, start_time, end_time")
      .eq("id", tokenData.time_slot_id)
      .single();
    timeSlot = slot || null;
  }

  // Fetch existing signatures for this session (slot-aware)
  let sigQuery = supabase
    .from("signatures")
    .select("signer_id, signer_type")
    .eq("session_id", tokenData.session_id);

  if (tokenData.time_slot_id) {
    sigQuery = sigQuery.eq("time_slot_id", tokenData.time_slot_id);
  }

  const { data: existingSignatures } = await sigQuery;

  const signedLearnerIds = (existingSignatures || [])
    .filter((s: { signer_type: string }) => s.signer_type === "learner")
    .map((s: { signer_id: string }) => s.signer_id);

  const signedTrainerIds = (existingSignatures || [])
    .filter((s: { signer_type: string }) => s.signer_type === "trainer")
    .map((s: { signer_id: string }) => s.signer_id);

  // Handle trainer individual tokens
  if (tokenData.signer_type === "trainer" && tokenData.trainer_id) {
    const { data: trainer } = await supabase
      .from("trainers")
      .select("id, first_name, last_name")
      .eq("id", tokenData.trainer_id)
      .single();

    return NextResponse.json({
      token_type: "individual",
      signer_type: "trainer",
      session: {
        id: session.id,
        title: session.title,
        start_date: session.start_date,
        end_date: session.end_date,
        location: session.location,
        mode: session.mode,
        training_title: trainingTitle,
      },
      time_slot: timeSlot,
      trainer: trainer
        ? {
            id: trainer.id,
            first_name: trainer.first_name,
            last_name: trainer.last_name,
            already_signed: signedTrainerIds.includes(trainer.id),
          }
        : null,
    });
  }

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
      signer_type: "learner",
      session: {
        id: session.id,
        title: session.title,
        start_date: session.start_date,
        end_date: session.end_date,
        location: session.location,
        mode: session.mode,
        training_title: trainingTitle,
      },
      time_slot: timeSlot,
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
      signer_type: tokenData.signer_type || "learner",
      session: {
        id: session.id,
        title: session.title,
        start_date: session.start_date,
        end_date: session.end_date,
        location: session.location,
        mode: session.mode,
        training_title: trainingTitle,
      },
      time_slot: timeSlot,
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
  } catch (err) {
    console.error("[emargement GET]", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

// POST: Generate signing tokens (admin/trainer only)
export async function POST(request: NextRequest) {
  try {
  const auth = await requireRole(["super_admin", "admin", "trainer"]);
  if (auth.error) return auth.error;

  const { session_id, type, time_slot_id } = await request.json();

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
    let existingQuery = supabase
      .from("signing_tokens")
      .select("*")
      .eq("session_id", session_id)
      .eq("token_type", "session")
      .gt("expires_at", new Date().toISOString());

    if (time_slot_id) {
      existingQuery = existingQuery.eq("time_slot_id", time_slot_id);
    } else {
      existingQuery = existingQuery.is("time_slot_id", null);
    }

    const { data: existing } = await existingQuery.single();

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
        time_slot_id: time_slot_id || null,
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

      // Check if non-expired, unused token already exists for this enrollment + slot
      let existingIndivQuery = supabase
        .from("signing_tokens")
        .select("*")
        .eq("enrollment_id", enrollment.id)
        .eq("token_type", "individual")
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString());

      if (time_slot_id) {
        existingIndivQuery = existingIndivQuery.eq("time_slot_id", time_slot_id);
      } else {
        existingIndivQuery = existingIndivQuery.is("time_slot_id", null);
      }

      const { data: existing } = await existingIndivQuery.maybeSingle();

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
          time_slot_id: time_slot_id || null,
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
  } catch (err) {
    console.error("[emargement POST]", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
