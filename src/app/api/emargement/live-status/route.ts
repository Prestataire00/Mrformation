import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/require-role";

/**
 * GET /api/emargement/live-status?session_id=...
 *
 * Endpoint utilisé par la page "Mode présentation" pour afficher en temps
 * réel l'état des signatures pour chaque créneau d'une session.
 *
 * Retourne pour chaque créneau :
 *   - le token session (1 seul QR à projeter)
 *   - la liste des apprenants avec statut signé/non signé
 *   - même chose pour les formateurs
 *
 * Polling régulier (3-5 sec) permet au formateur de voir les présences
 * en temps réel pendant que les apprenants scannent et signent.
 */

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

interface PersonStatus {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  signed: boolean;
  signed_at?: string;
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin", "trainer"]);
  if (auth.error) return auth.error;

  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id requis" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 1. Slots de la session
  const { data: slots } = await supabase
    .from("formation_time_slots")
    .select("id, title, start_time, end_time, slot_order")
    .eq("session_id", sessionId)
    .order("slot_order", { ascending: true });

  if (!slots || slots.length === 0) {
    return NextResponse.json({ slots: [] });
  }

  // 2. Apprenants enrolled
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("learner:learners(id, first_name, last_name, email)")
    .eq("session_id", sessionId)
    .in("status", ["registered", "confirmed"]);

  const learners: PersonStatus[] = ((enrollments ?? []) as unknown as Array<{ learner: { id: string; first_name: string; last_name: string; email: string | null } | null }>)
    .filter((e) => e.learner)
    .map((e) => ({
      id: e.learner!.id,
      first_name: e.learner!.first_name,
      last_name: e.learner!.last_name,
      email: e.learner!.email,
      signed: false,
    }));

  // 3. Formateurs
  const { data: formationTrainers } = await supabase
    .from("formation_trainers")
    .select("trainer:trainers(id, first_name, last_name, email)")
    .eq("session_id", sessionId);

  const trainers: PersonStatus[] = ((formationTrainers ?? []) as unknown as Array<{ trainer: { id: string; first_name: string; last_name: string; email: string | null } | null }>)
    .filter((ft) => ft.trainer)
    .map((ft) => ({
      id: ft.trainer!.id,
      first_name: ft.trainer!.first_name,
      last_name: ft.trainer!.last_name,
      email: ft.trainer!.email,
      signed: false,
    }));

  // 4. Pour chaque slot : token session + signatures
  const slotIds = slots.map((s) => s.id);

  const [{ data: sessionTokens }, { data: signatures }] = await Promise.all([
    supabase
      .from("signing_tokens")
      .select("time_slot_id, token, expires_at")
      .eq("session_id", sessionId)
      .eq("token_type", "session")
      .is("learner_id", null)
      .is("trainer_id", null)
      .in("time_slot_id", slotIds)
      .gt("expires_at", new Date().toISOString()),
    supabase
      .from("signatures")
      .select("time_slot_id, signer_id, signer_type, signed_at")
      .eq("session_id", sessionId)
      .in("time_slot_id", slotIds),
  ]);

  // Index : slot_id → token
  const tokenBySlot = new Map(
    (sessionTokens ?? []).map((t) => [t.time_slot_id, { token: t.token, expires_at: t.expires_at }])
  );

  // Index : (slot_id, signer_id, signer_type) → signed_at
  const signatureKey = (slotId: string, signerId: string, type: string) => `${slotId}|${signerId}|${type}`;
  const signatureIndex = new Map(
    (signatures ?? []).map((s) => [signatureKey(s.time_slot_id, s.signer_id, s.signer_type), s.signed_at])
  );

  // Compose la réponse : pour chaque slot, attach learners + trainers avec statut
  const slotsWithStatus = slots.map((slot) => {
    const slotLearners = learners.map((l) => {
      const signedAt = signatureIndex.get(signatureKey(slot.id, l.id, "learner"));
      return { ...l, signed: !!signedAt, signed_at: signedAt };
    });
    const slotTrainers = trainers.map((t) => {
      const signedAt = signatureIndex.get(signatureKey(slot.id, t.id, "trainer"));
      return { ...t, signed: !!signedAt, signed_at: signedAt };
    });

    return {
      slot,
      session_token: tokenBySlot.get(slot.id) ?? null,
      learners: slotLearners,
      trainers: slotTrainers,
      stats: {
        learners_total: slotLearners.length,
        learners_signed: slotLearners.filter((l) => l.signed).length,
        trainers_total: slotTrainers.length,
        trainers_signed: slotTrainers.filter((t) => t.signed).length,
      },
    };
  });

  return NextResponse.json({
    slots: slotsWithStatus,
    cache_busted_at: new Date().toISOString(),
  });
}
