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

// GET: Retrieve existing tokens for a session, grouped by slot
export async function GET(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin", "trainer"]);
  if (auth.error) return auth.error;

  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id requis" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Fetch time slots for this session
  const { data: slots } = await supabase
    .from("formation_time_slots")
    .select("id, title, start_time, end_time, slot_order")
    .eq("session_id", sessionId)
    .order("slot_order", { ascending: true });

  if (!slots || slots.length === 0) {
    return NextResponse.json({ slots: [], tokens: [] });
  }

  // Fetch existing non-expired tokens for this session with time_slot_id
  const { data: tokens } = await supabase
    .from("signing_tokens")
    .select("*")
    .eq("session_id", sessionId)
    .not("time_slot_id", "is", null)
    .gt("expires_at", new Date().toISOString());

  // Fetch learner and trainer info for tokens
  const learnerIds = [...new Set((tokens || []).filter(t => t.learner_id).map(t => t.learner_id))];
  const trainerIds = [...new Set((tokens || []).filter(t => t.trainer_id).map(t => t.trainer_id))];

  const [{ data: learners }, { data: trainers }] = await Promise.all([
    learnerIds.length > 0
      ? supabase.from("learners").select("id, first_name, last_name, email").in("id", learnerIds)
      : { data: [] },
    trainerIds.length > 0
      ? supabase.from("trainers").select("id, first_name, last_name, email").in("id", trainerIds)
      : { data: [] },
  ]);

  const learnerMap = new Map((learners || []).map(l => [l.id, l]));
  const trainerMap = new Map((trainers || []).map(t => [t.id, t]));

  // Group tokens by slot
  const tokensBySlot = slots.map(slot => ({
    slot,
    tokens: (tokens || [])
      .filter(t => t.time_slot_id === slot.id)
      .map(t => ({
        ...t,
        person: t.signer_type === "trainer"
          ? trainerMap.get(t.trainer_id) || null
          : learnerMap.get(t.learner_id) || null,
      })),
  }));

  return NextResponse.json({ slots: tokensBySlot });
}

// POST: Generate individual tokens per slot per person
export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin", "trainer"]);
  if (auth.error) return auth.error;

  // mode "individual" (default, comportement existant) → 1 token par learner × slot
  // mode "session" → 1 SEUL token par slot (sans learner_id), apprenant choisit son nom au scan
  const {
    session_id,
    slot_ids,
    include_trainers = true,
    mode = "individual",
  } = await request.json();

  if (!session_id) {
    return NextResponse.json({ error: "session_id requis" }, { status: 400 });
  }
  if (mode !== "individual" && mode !== "session") {
    return NextResponse.json({ error: "mode invalide (individual ou session)" }, { status: 400 });
  }

  const supabase = createServiceClient();
  // TTL 30 jours : couvre la durée max d'une formation (5j) + marge admin
  // (préparation 1-2 semaines avant). UUID v4 = 2^122 entropie → brute-force
  // impossible, pas de risque sécurité à étendre. Évite les "lien expiré"
  // quand l'admin génère les QR la veille de la formation.
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 jours

  // 1. Fetch time slots
  let slotsQuery = supabase
    .from("formation_time_slots")
    .select("id, title, start_time, end_time, slot_order")
    .eq("session_id", session_id)
    .order("slot_order", { ascending: true });

  if (slot_ids && slot_ids.length > 0) {
    slotsQuery = slotsQuery.in("id", slot_ids);
  }

  const { data: slots, error: slotsError } = await slotsQuery;
  if (slotsError || !slots || slots.length === 0) {
    return NextResponse.json(
      { error: "Aucun créneau trouvé pour cette session" },
      { status: 404 }
    );
  }

  // ── MODE SESSION : 1 seul token par slot (pas de learner_id) ──
  if (mode === "session") {
    const sessionTokens: Array<{ slot: typeof slots[0]; token: string; expires_at: string }> = [];

    for (const slot of slots) {
      // Cherche un token session non-expiré pour ce slot
      const { data: existing } = await supabase
        .from("signing_tokens")
        .select("token, expires_at")
        .eq("session_id", session_id)
        .eq("time_slot_id", slot.id)
        .eq("token_type", "session")
        .is("learner_id", null)
        .is("trainer_id", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        sessionTokens.push({ slot, token: existing.token, expires_at: existing.expires_at });
        continue;
      }

      // Sinon créer un nouveau token session
      const { data: newTok, error } = await supabase
        .from("signing_tokens")
        .insert({
          session_id,
          time_slot_id: slot.id,
          entity_id: auth.profile.entity_id,
          token_type: "session",
          signer_type: "learner",
          expires_at: expiresAt,
        })
        .select("token, expires_at")
        .single();

      if (error || !newTok) {
        console.error("[emargement/slots] Session token insert failed", { code: error?.code, slotId: slot.id });
        continue;
      }
      sessionTokens.push({ slot, token: newTok.token, expires_at: newTok.expires_at });
    }

    return NextResponse.json({ mode: "session", session_tokens: sessionTokens });
  }

  // ── MODE INDIVIDUAL (existant ci-dessous) ──

  // 2. Fetch enrolled learners
  // On accepte tous les statuts SAUF cancelled : un apprenant qui a déjà
  // attendu/complété la formation peut quand même avoir besoin d'émargement
  // pour des créneaux passés (ex: admin re-génère QR a posteriori).
  const { data: enrollments, error: enrollErr } = await supabase
    .from("enrollments")
    .select("id, learner_id, status, learner:learners(id, first_name, last_name, email)")
    .eq("session_id", session_id)
    .neq("status", "cancelled");

  if (enrollErr) {
    console.error("[emargement/slots] enrollments query error:", enrollErr);
  }

  // 3. Fetch trainers if requested
  let formationTrainers: { trainer_id: string; trainer: { id: string; first_name: string; last_name: string; email: string | null } | { id: string; first_name: string; last_name: string; email: string | null }[] | null }[] = [];
  if (include_trainers) {
    const { data: ft, error: ftErr } = await supabase
      .from("formation_trainers")
      .select("trainer_id, trainer:trainers(id, first_name, last_name, email)")
      .eq("session_id", session_id);
    if (ftErr) {
      console.error("[emargement/slots] formation_trainers query error:", ftErr);
    }
    formationTrainers = (ft || []) as typeof formationTrainers;
  }

  console.log("[emargement/slots] POST individual", {
    session_id,
    slots_count: slots.length,
    enrollments_count: enrollments?.length ?? 0,
    enrollment_statuses: (enrollments ?? []).map((e) => e.status),
    trainers_count: formationTrainers.length,
  });

  // 4. Generate tokens for each slot x each person
  const allTokens: Record<string, { slot: typeof slots[0]; learner_tokens: unknown[]; trainer_tokens: unknown[] }> = {};
  const insertErrors: { type: "learner" | "trainer"; code: string | undefined; message: string; details?: string; hint?: string }[] = [];
  const profileEntityId = auth.profile.entity_id;

  for (const slot of slots) {
    const learnerTokens = [];
    const trainerTokens = [];

    // Learner tokens
    for (const enrollment of (enrollments || [])) {
      const learner = Array.isArray(enrollment.learner)
        ? enrollment.learner[0]
        : enrollment.learner;
      if (!learner) continue;

      // Check if ANY token exists for this (session, slot, learner)
      // including used ones — prevents duplicate creation
      const { data: existing } = await supabase
        .from("signing_tokens")
        .select("*")
        .eq("session_id", session_id)
        .eq("time_slot_id", slot.id)
        .eq("learner_id", learner.id)
        .eq("signer_type", "learner")
        .eq("token_type", "individual")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: true })
        .maybeSingle();

      if (existing) {
        learnerTokens.push({ ...existing, person: learner });
        continue;
      }

      const { data: newToken, error } = await supabase
        .from("signing_tokens")
        .insert({
          session_id,
          time_slot_id: slot.id,
          enrollment_id: enrollment.id,
          learner_id: learner.id,
          entity_id: auth.profile.entity_id,
          token_type: "individual",
          signer_type: "learner",
          expires_at: expiresAt,
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          // Race condition: re-fetch the existing token
          const { data: raceToken } = await supabase
            .from("signing_tokens").select("*")
            .eq("session_id", session_id).eq("time_slot_id", slot.id)
            .eq("learner_id", learner.id).eq("signer_type", "learner")
            .gt("expires_at", new Date().toISOString())
            .order("created_at", { ascending: true }).maybeSingle();
          if (raceToken) learnerTokens.push({ ...raceToken, person: learner });
        } else {
          console.error("[emargement/slots] Learner token insert failed", { code: error.code, message: error.message, slotId: slot.id, learnerId: learner.id });
          insertErrors.push({ type: "learner", code: error.code, message: error.message, details: (error as { details?: string }).details, hint: (error as { hint?: string }).hint });
        }
      } else if (newToken) {
        learnerTokens.push({ ...newToken, person: learner });
      }
    }

    // Trainer tokens
    for (const ft of formationTrainers) {
      const trainer = Array.isArray(ft.trainer) ? ft.trainer[0] : ft.trainer;
      if (!trainer) continue;

      const { data: existing } = await supabase
        .from("signing_tokens")
        .select("*")
        .eq("session_id", session_id)
        .eq("time_slot_id", slot.id)
        .eq("trainer_id", trainer.id)
        .eq("signer_type", "trainer")
        .eq("token_type", "individual")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: true })
        .maybeSingle();

      if (existing) {
        trainerTokens.push({ ...existing, person: trainer });
        continue;
      }

      const { data: newToken, error } = await supabase
        .from("signing_tokens")
        .insert({
          session_id,
          time_slot_id: slot.id,
          trainer_id: trainer.id,
          entity_id: auth.profile.entity_id,
          token_type: "individual",
          signer_type: "trainer",
          expires_at: expiresAt,
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          const { data: raceToken } = await supabase
            .from("signing_tokens").select("*")
            .eq("session_id", session_id).eq("time_slot_id", slot.id)
            .eq("trainer_id", trainer.id).eq("signer_type", "trainer")
            .gt("expires_at", new Date().toISOString())
            .order("created_at", { ascending: true }).maybeSingle();
          if (raceToken) trainerTokens.push({ ...raceToken, person: trainer });
        } else {
          console.error("[emargement/slots] Trainer token insert failed", { code: error.code, message: error.message, slotId: slot.id, trainerId: trainer.id });
          insertErrors.push({ type: "trainer", code: error.code, message: error.message, details: (error as { details?: string }).details, hint: (error as { hint?: string }).hint });
        }
      } else if (newToken) {
        trainerTokens.push({ ...newToken, person: trainer });
      }
    }

    allTokens[slot.id] = {
      slot,
      learner_tokens: learnerTokens,
      trainer_tokens: trainerTokens,
    };
  }

  return NextResponse.json({
    slots: Object.values(allTokens),
    total_tokens: Object.values(allTokens).reduce(
      (sum, s) => sum + s.learner_tokens.length + s.trainer_tokens.length,
      0
    ),
    debug: {
      session_id,
      slots_count: slots.length,
      enrollments_count: enrollments?.length ?? 0,
      enrollment_statuses: (enrollments ?? []).map((e) => e.status),
      enrollments_with_learner: (enrollments ?? []).filter((e) => e.learner).length,
      trainers_count: formationTrainers.length,
      trainers_with_data: formationTrainers.filter((ft) => ft.trainer).length,
      enrollments_error: enrollErr?.message ?? null,
      profile_entity_id: profileEntityId ?? "MISSING",
      insert_errors: insertErrors.slice(0, 5),
    },
  });
}
