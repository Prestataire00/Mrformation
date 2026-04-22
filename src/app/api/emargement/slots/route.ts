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

  const { session_id, slot_ids, include_trainers = true } = await request.json();

  if (!session_id) {
    return NextResponse.json({ error: "session_id requis" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48h

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

  // 2. Fetch enrolled learners
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("id, learner_id, learner:learners(id, first_name, last_name, email)")
    .eq("session_id", session_id)
    .in("status", ["registered", "confirmed"]);

  // 3. Fetch trainers if requested
  let formationTrainers: { trainer_id: string; trainer: { id: string; first_name: string; last_name: string; email: string | null } | { id: string; first_name: string; last_name: string; email: string | null }[] | null }[] = [];
  if (include_trainers) {
    const { data: ft } = await supabase
      .from("formation_trainers")
      .select("trainer_id, trainer:trainers(id, first_name, last_name, email)")
      .eq("session_id", session_id);
    formationTrainers = (ft || []) as typeof formationTrainers;
  }

  // 4. Generate tokens for each slot x each person
  const allTokens: Record<string, { slot: typeof slots[0]; learner_tokens: unknown[]; trainer_tokens: unknown[] }> = {};

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

      if (!error && newToken) {
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

      if (!error && newToken) {
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
  });
}
