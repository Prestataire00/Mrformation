import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeDbError } from "@/lib/api-error";
import { resolveActiveEntityId } from "@/lib/crm/active-entity";

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

  // Ownership check : refuser cross-entity (pattern Volet A — résout obs A.2
  // documentée dans docs/audits/2026-05-26-emargement-entity-id-audit.md).
  // Sans ce check, un admin entité A pouvait lire les tokens et learner_ids
  // d'une session entité B (info disclosure cross-entity, lecture seule).
  const { data: sessionCheck, error: sessionCheckError } = await supabase
    .from("sessions")
    .select("entity_id")
    .eq("id", sessionId)
    .single();

  if (sessionCheckError || !sessionCheck) {
    return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
  }

  const activeEntityId = resolveActiveEntityId(auth.profile);
  if (sessionCheck.entity_id !== activeEntityId) {
    return NextResponse.json(
      { error: "Accès non autorisé à cette session" },
      { status: 403 },
    );
  }

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

  try {
    return await handlePostIndividual(request, auth as Exclude<typeof auth, { error: NextResponse }>);
  } catch (err) {
    console.error("[emargement/slots] Unhandled POST error:", err);
    const message = err instanceof Error ? err.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handlePostIndividual(
  request: NextRequest,
  auth: { error: null; user: { id: string }; profile: { id: string; role: string; entity_id: string } },
) {
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

  // SÉCURITÉ : vérifier que la session appartient à l'entité du demandeur.
  // La route utilise service_role (bypass RLS) → validation obligatoire côté app.
  const { data: sessionCheck, error: sessionCheckError } = await supabase
    .from("sessions")
    .select("id, entity_id")
    .eq("id", session_id)
    .single();

  if (sessionCheckError || !sessionCheck) {
    return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
  }

  const activeEntityId = resolveActiveEntityId(auth.profile);
  if (sessionCheck.entity_id !== activeEntityId) {
    return NextResponse.json(
      { error: "Accès non autorisé à cette session" },
      { status: 403 }
    );
  }

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
    .select("id, learner_id, client_id, status, learner:learners(id, first_name, last_name, email)")
    .eq("session_id", session_id)
    .neq("status", "cancelled");

  if (enrollErr) {
    console.error("[emargement/slots] enrollments query error:", enrollErr);
  }

  // Story 3.4 — Build learner_id → client_id map for tagging individual tokens.
  // Single pass over enrollments already fetched: no extra Supabase query needed (no N+1).
  const learnerToClientMap = new Map<string, string | null>(
    (enrollments || [])
      .filter((e): e is typeof e & { learner_id: string } => !!e.learner_id)
      .map((e) => [e.learner_id, (e.client_id as string | null) ?? null])
  );

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

  // Préparer la liste des personnes (learners + trainers)
  const validEnrollments = (enrollments || []).map((e) => {
    const learner = Array.isArray(e.learner) ? e.learner[0] : e.learner;
    return { enrollment: e, learner };
  }).filter((e) => !!e.learner);

  const validTrainers = formationTrainers.map((ft) => {
    const trainer = Array.isArray(ft.trainer) ? ft.trainer[0] : ft.trainer;
    return { ft, trainer };
  }).filter((t) => !!t.trainer);

  const personCount = validEnrollments.length + validTrainers.length;

  console.log("[emargement/slots] POST individual", {
    session_id,
    slots_count: slots.length,
    enrollments_count: enrollments?.length ?? 0,
    valid_enrollments: validEnrollments.length,
    enrollment_statuses: (enrollments ?? []).map((e) => e.status),
    trainers_count: formationTrainers.length,
    valid_trainers: validTrainers.length,
    total_iterations: slots.length * personCount,
  });

  // 4. Generate tokens — batch par slot pour éviter les timeouts Netlify.
  // Au lieu de 1 SELECT + 1 INSERT par personne (séquentiel), on charge
  // tous les tokens existants d'un slot en 1 query, puis on batch-insert
  // les tokens manquants en 1 query.
  const allTokens: Record<string, { slot: typeof slots[0]; learner_tokens: unknown[]; trainer_tokens: unknown[] }> = {};
  const insertErrors: { type: "learner" | "trainer"; phase: string; code: string | undefined; message: string; details?: string; hint?: string }[] = [];
  const profileEntityId = auth.profile.entity_id;
  let firstIterationTrace: { existing_data: boolean; existing_error: string | null; insert_data: boolean; insert_error: string | null } | null = null;

  for (const slot of slots) {
    const learnerTokens: unknown[] = [];
    const trainerTokens: unknown[] = [];

    // ── Batch-fetch tous les tokens existants pour ce slot ──
    const { data: existingTokens, error: existingErr } = await supabase
      .from("signing_tokens")
      .select("*")
      .eq("session_id", session_id)
      .eq("time_slot_id", slot.id)
      .is("used_at", null);

    if (existingErr) {
      insertErrors.push({ type: "learner", phase: "batch-existing-select", code: existingErr.code, message: existingErr.message });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingByKey = new Map<string, Record<string, any>>();
    for (const tok of (existingTokens || [])) {
      const key = tok.signer_type === "trainer"
        ? `trainer:${tok.trainer_id}`
        : `learner:${tok.learner_id}`;
      // Garder le plus récent (les tokens sont non-triés ici, on prend le premier trouvé)
      if (!existingByKey.has(key)) {
        existingByKey.set(key, tok);
      }
    }

    // ── Learner tokens : réutiliser ou préparer les inserts ──
    const learnerInserts: {
      session_id: string; time_slot_id: string; enrollment_id: string;
      learner_id: string; client_id: string | null; entity_id: string;
      token_type: string; signer_type: string; expires_at: string;
    }[] = [];
    // Mapping pour rattacher les résultats du batch-insert aux learners
    const learnerInsertMeta: { enrollment: typeof validEnrollments[0]["enrollment"]; learner: NonNullable<typeof validEnrollments[0]["learner"]> }[] = [];

    for (const { enrollment, learner } of validEnrollments) {
      const existing = existingByKey.get(`learner:${learner!.id}`);

      if (!firstIterationTrace) {
        firstIterationTrace = {
          existing_data: !!existing,
          existing_error: existingErr?.message ?? null,
          insert_data: false,
          insert_error: existing ? "n/a (reuse/refresh)" : null,
        };
      }

      if (existing) {
        const isStillValid = new Date(existing.expires_at) > new Date();
        if (isStillValid) {
          learnerTokens.push({ ...existing, person: learner });
        } else {
          // Refresh expiré → UPDATE in-place
          const refreshResult = await supabase
            .from("signing_tokens")
            .update({ expires_at: expiresAt })
            .eq("id", existing.id)
            .select();
          const refreshed = refreshResult.data?.[0];
          if (refreshed) {
            learnerTokens.push({ ...refreshed, person: learner });
          } else {
            insertErrors.push({ type: "learner", phase: "refresh", code: refreshResult.error?.code, message: refreshResult.error?.message ?? "refresh failed" });
          }
        }
        continue;
      }

      // Pas de token existant → préparer pour batch insert
      learnerInserts.push({
        session_id,
        time_slot_id: slot.id,
        enrollment_id: enrollment.id,
        learner_id: learner!.id,
        client_id: learnerToClientMap.get(learner!.id) ?? null,
        entity_id: auth.profile.entity_id,
        token_type: "individual",
        signer_type: "learner",
        expires_at: expiresAt,
      });
      learnerInsertMeta.push({ enrollment, learner: learner! });
    }

    // Batch insert des learner tokens manquants
    if (learnerInserts.length > 0) {
      const { data: inserted, error: batchErr } = await supabase
        .from("signing_tokens")
        .insert(learnerInserts)
        .select();

      if (batchErr) {
        console.error("[emargement/slots] Batch learner insert failed", { code: batchErr.code, message: batchErr.message, slotId: slot.id, count: learnerInserts.length });
        insertErrors.push({ type: "learner", phase: "batch-insert", code: batchErr.code, message: batchErr.message, details: (batchErr as { details?: string }).details, hint: (batchErr as { hint?: string }).hint });

        // Fallback : insert un par un pour les cas de contrainte unique
        for (let i = 0; i < learnerInserts.length; i++) {
          const { data: single, error: singleErr } = await supabase
            .from("signing_tokens")
            .insert(learnerInserts[i])
            .select();
          if (singleErr) {
            insertErrors.push({ type: "learner", phase: "fallback-insert", code: singleErr.code, message: singleErr.message });
          } else if (single?.[0]) {
            learnerTokens.push({ ...single[0], person: learnerInsertMeta[i].learner });
          }
        }
      } else if (inserted) {
        for (let i = 0; i < inserted.length; i++) {
          const meta = learnerInsertMeta[i];
          learnerTokens.push({ ...inserted[i], person: meta?.learner });
        }
      }

      if (!firstIterationTrace) {
        firstIterationTrace = {
          existing_data: false,
          existing_error: existingErr?.message ?? null,
          insert_data: learnerTokens.length > 0,
          insert_error: null,
        };
      }
    }

    // ── Trainer tokens : même logique batch ──
    const trainerInserts: {
      session_id: string; time_slot_id: string; trainer_id: string;
      entity_id: string; token_type: string; signer_type: string; expires_at: string;
    }[] = [];
    const trainerInsertMeta: { trainer: NonNullable<typeof validTrainers[0]["trainer"]> }[] = [];

    for (const { trainer } of validTrainers) {
      const existing = existingByKey.get(`trainer:${trainer!.id}`);

      if (existing) {
        const isStillValid = new Date(existing.expires_at) > new Date();
        if (isStillValid) {
          trainerTokens.push({ ...existing, person: trainer });
        } else {
          const refreshResult = await supabase
            .from("signing_tokens")
            .update({ expires_at: expiresAt })
            .eq("id", existing.id)
            .select();
          const refreshed = refreshResult.data?.[0];
          if (refreshed) {
            trainerTokens.push({ ...refreshed, person: trainer });
          } else {
            insertErrors.push({ type: "trainer", phase: "refresh", code: refreshResult.error?.code, message: refreshResult.error?.message ?? "refresh failed" });
          }
        }
        continue;
      }

      trainerInserts.push({
        session_id,
        time_slot_id: slot.id,
        trainer_id: trainer!.id,
        entity_id: auth.profile.entity_id,
        token_type: "individual",
        signer_type: "trainer",
        expires_at: expiresAt,
      });
      trainerInsertMeta.push({ trainer: trainer! });
    }

    // Batch insert des trainer tokens manquants
    if (trainerInserts.length > 0) {
      const { data: inserted, error: batchErr } = await supabase
        .from("signing_tokens")
        .insert(trainerInserts)
        .select();

      if (batchErr) {
        console.error("[emargement/slots] Batch trainer insert failed", { code: batchErr.code, message: batchErr.message, slotId: slot.id });
        insertErrors.push({ type: "trainer", phase: "batch-insert", code: batchErr.code, message: batchErr.message });

        for (let i = 0; i < trainerInserts.length; i++) {
          const { data: single, error: singleErr } = await supabase
            .from("signing_tokens")
            .insert(trainerInserts[i])
            .select();
          if (singleErr) {
            insertErrors.push({ type: "trainer", phase: "fallback-insert", code: singleErr.code, message: singleErr.message });
          } else if (single?.[0]) {
            trainerTokens.push({ ...single[0], person: trainerInsertMeta[i].trainer });
          }
        }
      } else if (inserted) {
        for (let i = 0; i < inserted.length; i++) {
          const meta = trainerInsertMeta[i];
          trainerTokens.push({ ...inserted[i], person: meta?.trainer });
        }
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
      enrollments_with_learner: validEnrollments.length,
      trainers_count: formationTrainers.length,
      trainers_with_data: validTrainers.length,
      enrollments_error: enrollErr?.message ?? null,
      profile_entity_id: profileEntityId ?? "MISSING",
      insert_errors: insertErrors.slice(0, 5),
      first_iteration_trace: firstIterationTrace,
    },
  });
}
